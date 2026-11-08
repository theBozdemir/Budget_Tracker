# Containerizing the web app: a learning guide

This guide walks through containerizing the **web version** of Budget Tracker (`web/`) as a Docker
learning exercise. It explains every decision, from choosing the operating system the image starts
from to running and checking the container, but it deliberately **doesn't contain a Dockerfile**.
Writing that yourself is the point.

Each stage has:

- **Goal**: what you're building.
- **Decisions**: the choices to make, with trade-offs.
- **Project facts**: things specific to this repository that will trip you up if you don't know them.
- **Done when**: checks that tell you the stage works.

> Production stays on **Firebase Hosting**. The container is for learning, local development and
> CI. Nothing here changes how the live site is deployed.

---

## 0. Understand what you're containerizing

Before writing anything, be clear about what runs where:

| Part | What it is | Where it runs |
|---|---|---|
| Web app (`web/`) | React + Vite. `npm run build` turns it into plain HTML, JS and CSS files | **Your container** |
| Login, database | Firebase Authentication and Cloud Firestore | Google's servers (or local emulators in stage 4) |
| Security rules + tests | `firebase/firestore.rules` and `firebase/tests/` | Firebase, or the emulator in stage 5 |

So the production container's only job is to **serve static files** over HTTP. No Node.js server runs
in production. Node is only needed to *build* the files.

That shape (build with one toolset, serve with another) is the main lesson of this exercise.

---

## 1. Choose the base operating system

Every image starts `FROM` another image, which brings a minimal Linux userland (package manager, C
library, shell). You'll need **two** of them: one to build and one to serve.

### Decisions

**Linux family for the build stage (needs Node.js):**

| Option | Typical size | C library | Notes |
|---|---|---|---|
| Debian `bookworm` (full) | ~1 GB with Node | glibc | Everything included; slow to pull |
| Debian `bookworm-slim` | ~200 MB with Node | glibc | Good default; most npm packages "just work" |
| Alpine | ~130 MB with Node | **musl** | Smallest, but some packages with native code behave differently on musl |

**Questions to answer yourself:**

- Does anything in `web/package.json` compile native code? (Look for packages that use `node-gyp` or
  ship prebuilt binaries per platform. `esbuild`, which Vite uses, ships platform-specific
  binaries.) If something breaks on Alpine, musl vs glibc is the first suspect.
- Why does the build stage's size matter less than the final stage's?

**Linux family for the serve stage (needs a web server):**

| Option | Notes |
|---|---|
| `nginx` on Alpine | The classic choice for static sites; tiny; config via files |
| `nginx` unprivileged variants | Same, but already set up to run as a non-root user on a port above 1024 |
| Caddy, `httpd` (Apache) | Also fine; different config styles |
| "Distroless" or `scratch` + a static file server binary | Smallest attack surface; harder to debug (no shell) |

### Pin your versions

Use an explicit tag such as `node:22-…`, never `latest`. "Latest" changes underneath you and makes
builds unrepeatable.

### Project facts

- Vite in this project accepts **Node 18, 20 or 22+**. Pick a current **LTS** (Long-Term Support)
  release. The developer machines and the tooling here use **Node 22**.
- The Capacitor CLI (used only for the phone apps) wants Node 22+. You won't run it in this
  container, but staying on 22 keeps one Node version across the project.

### Done when

- You can explain why the final image doesn't contain Node.js.
- You've written down which base image and tag you'll use for each stage, and why.

---

## 2. Build stage: from source code to static files

### Goal

An image stage that installs dependencies and runs the production build.

### Decisions

1. **Working directory.** Pick a clear path inside the image (for example something under `/app`) so
   every later instruction is relative to it.
2. **Layer caching order.** Docker caches each instruction as a layer and reuses it if its inputs
   didn't change. Dependencies change far less often than source code. Think about which files you
   copy *first* so that editing a `.jsx` file doesn't trigger a full `npm` install again.
3. **`npm install` vs `npm ci`.** One respects `package-lock.json` exactly and fails if it's out of
   sync; the other may update it. Which one belongs in a reproducible build?
4. **Dev dependencies.** Vite and the React plugin are listed as `devDependencies`, but you need
   them to *build*. What happens if you install with a "production only" flag in this stage?

### Project facts (important)

- **The build output goes outside `web/`.** `web/vite.config.js` sets `outDir: '../firebase/public'`
  so that Firebase Hosting can deploy it. Inside a container that only contains `web/`, that path
  points *above* your working directory. Choose one approach and understand why it works:
  - Copy enough of the repository that `../firebase/public` exists relative to `web/`, or
  - Override the output folder for the container build only, for example with Vite's `--outDir`
    command-line option, **without** changing `vite.config.js` (Firebase deploys depend on it).
- **There are no build-time environment variables.** The Firebase web config is written directly in
  `web/src/firebase.js` (Firebase web config is public by design; security comes from the Firestore
  rules). You don't need build arguments for it. `web/.env.example` is a leftover and isn't read.
- The build prints a warning that one JavaScript chunk is larger than 500 kB. That's a warning, not
  an error, and doesn't fail the build.

### `.dockerignore`

Before your first build, create a `.dockerignore`. Without it, Docker sends everything in the build
context to the builder, including `node_modules` folders (hundreds of MB), `.git`, the Android and
iOS projects, and possibly secrets such as `.env` files.

Questions to answer:

- Which folders in this repository are large and never needed inside the image? (Look at `web/`,
  `firebase/`, `BudgetTracker/` and the root.)
- Why is copying your local `node_modules` into the image a bad idea even if it seems to work? (Hint:
  your machine runs Windows; the container runs Linux.)

### Done when

- Building only this stage (Docker can stop at a named stage) succeeds.
- The build log shows Vite's `✓ built in …` line.
- Changing one `.jsx` file and rebuilding reuses the cached dependency layer. The build log says
  `CACHED` for it, and the rebuild takes seconds rather than minutes.

---

## 3. Serve stage: a small image that only serves files

### Goal

A second stage that copies **only the built files** from the build stage and serves them with a web
server.

### Decisions

1. **Copy between stages.** Docker can copy files from an earlier stage into a later one. Copy the
   build output folder, nothing else. No source code, no `node_modules`.
2. **Port.** Inside the container, pick a port. Ports below 1024 need root on Linux, which leads to
   the next decision.
3. **Run as non-root.** Containers run as root by default. Decide how your web server runs as an
   unprivileged user, and which port that implies. (Some nginx image variants do this for you.)
4. **Health check.** Docker can periodically check that the container is healthy. What URL would you
   check for a static site, and what tool exists in your chosen image to make the request?

### Project facts (important)

- **This is a single-page app.** Routes like `/households/abc123`, `/profile`, `/invites` and
  `/privacy` aren't real files. The server must answer them with `index.html` and let React pick the
  page. Without this "fallback", refreshing any page except `/` gives a 404. Firebase Hosting does
  this with the `rewrites` section in `firebase/firebase.json`; your web server needs an equivalent.
  - But don't send `index.html` for missing **assets**. A missing `/assets/app-123.js` should be a
    real 404, or the browser receives HTML pretending to be JavaScript.
- **Caching:**
  - Files in `assets/` have a content hash in their names (`index-CbivKA1M.js`), so they can be
    cached for a long time.
  - `index.html` must **not** be cached. `firebase/firebase.json` sends `no-cache` for it.
    Otherwise people keep loading old code after you deploy.
- **Security headers.** `firebase/firebase.json` sends `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` and `Strict-Transport-Security` on every response. Mirror
  them in your server config. (HSTS only means something over HTTPS; think about whether to send it
  from a container serving plain HTTP on localhost.)
- **Compression.** Firebase Hosting compresses responses. The main JS file is ~736 kB raw and ~195 kB
  gzipped. Consider enabling gzip (or brotli) in your web server.

### Done when

- The final image is a small fraction of the build stage's size. Compare them with
  `docker image ls`; aim for tens of MB.
- The final image contains no `node`, no `node_modules` and no source `.jsx` files. Check by opening
  a shell in it (if it has one) or listing its filesystem.
- `docker inspect` shows the configured user isn't root, and the health check reports `healthy`.

---

## 4. Run it and check it against real Firebase

### Goal

Run the container, open the app in a browser, and sign in.

### Decisions

- **Port mapping.** Map a port on your machine to the container's port.
- **Restart policy.** How should the container behave when Docker restarts?

### Project facts (important)

- **Authorized domains.** Firebase Authentication only allows sign-in from domains listed in the
  Firebase Console under **Authentication → Settings → Authorized domains**.
  - `localhost` is on the list by default, so `http://localhost:<port>` works.
  - `127.0.0.1`, your PC's network IP, or a custom hostname are **not** listed, so sign-in fails
    there with `auth/unauthorized-domain` until you add them.
- **This uses your real data.** Pointed at real Firebase, the container reads and writes your live
  household. For experiments, use a test household, or move on to stage 5 and use emulators.
- **Invite and password-reset links** in emails point at the hosted site
  (`budget-tracker-74611.web.app`), not your container. That's expected.

### Done when

- Opening `http://localhost:<port>` shows the login page.
- After signing in, opening a household and pressing **F5** reloads that household page instead of a
  404. This proves the single-page-app fallback works.
- The browser's developer tools (Network tab) show:
  - `index.html` with a no-cache header;
  - `assets/*.js` with a long cache lifetime and gzip/brotli encoding;
  - the security headers.
- Stopping and removing the container leaves nothing behind except the image.

---

## 5. Optional: a fully local stack with Docker Compose and the Firebase emulators

### Goal

Run the web app **and** local Firebase emulators (Auth + Firestore) together with one command, so you
can experiment without touching real data.

### Decisions

1. **Services.** At least two:
   - the web app (your image from stages 2–3, or a dev server; see stage 6);
   - the Firebase emulators.
2. **Emulator image.** The emulators need **Node.js and Java (version 21 or later)**. Either:
   - build your own image from a base OS, installing both. Good practice in choosing packages per
     distribution; or
   - find a maintained community image, and check its tags, update date and what it contains before
     trusting it.
3. **Networking.**
   - Services in the same Compose project reach each other by **service name**. But the web app's
     JavaScript runs **in your browser**, not in the web container.
   - Which address must the app use for the emulators: the service name, or `localhost` with
     published ports? Work this out before writing any config. It's the most important networking
     lesson in this guide.
4. **Binding.** By default the emulators listen only on `127.0.0.1` *inside their container*, which is
   unreachable from outside it. Find the `host` setting for the emulators in `firebase.json`.
5. **Ports to publish.** Firestore (default 8080), Auth (default 9099) and the Emulator UI (default
   4000).
6. **Persistence.** Emulator data disappears when the container stops. The emulators can import and
   export data on startup and exit; a **volume** can keep that data between runs.
7. **Start-up order.** `depends_on` only waits for a container to *start*, not to be *ready*. Look
   into health checks with `condition: service_healthy`.

### Project facts (important)

- **The app doesn't talk to emulators yet.** `web/src/firebase.js` always connects to the real
  project. To use emulators, the app has to call Firebase's `connectAuthEmulator` and
  `connectFirestoreEmulator`, only when a flag says so. For example, a Vite build variable
  (`VITE_…`) set only for local builds. That's a small code change. Make it in its own branch and
  keep it impossible to enable in the production build.
- Use a **demo project ID** (one starting with `demo-`, as the rules tests do) so the emulators never
  try to reach real Google services.
- The emulators load the real security rules from `firebase/firestore.rules`, so the local stack
  behaves like production.

### Done when

- One `docker compose up` starts everything, and `docker compose down` removes it.
- You can create an account and a household in the app. They appear in the Emulator UI and **not**
  in the real Firebase Console.
- Restarting the stack keeps (or deliberately discards) your test data, matching your volume choice.

---

## 6. Optional: a development container with live reload

### Goal

Run `npm run dev` (Vite's dev server) inside a container while you edit files on your PC, with the
browser updating on save.

### Decisions

- **Bind mount** your source into the container so edits are visible without rebuilding.
- **Don't** mount over the container's `node_modules`. Linux needs its own copy, not your Windows
  one. Look up the "anonymous volume for node_modules" pattern.
- **Listen address.** Vite's dev server listens on `localhost` *inside* the container by default.
  Find the Vite option that makes it listen on all interfaces.
- **File watching on Windows.** Changes made on Windows don't always trigger file events inside a
  Linux container (especially without WSL 2). If saving doesn't reload the page, look into Vite's
  "polling" watch option, or keep the project inside WSL 2.

### Done when

- Editing a `.jsx` file on your PC updates the page in the browser within a second or two, without
  rebuilding the image.

---

## 7. Optional: run the security-rules tests in a container

### Goal

Run `npm run test:rules` (in `firebase/`) in a container: the same thing a CI pipeline does.

### Project facts

- The tests need **Node.js and Java 21+** (the Firestore emulator is a Java program), plus the
  packages in `firebase/package.json`.
- The test command starts the emulator itself, runs 39 tests, and exits with code `0` on success.
  A non-zero exit code is how CI knows something failed.
- The emulator downloads its `.jar` file on first run. Think about caching it in a layer or volume so
  every run doesn't download it again.

### Done when

- One `docker run` (or `docker compose run`) prints `# pass 39` / `# fail 0` and exits with code `0`.
- Breaking a rule on purpose makes the container exit with a non-zero code.

---

## Common problems and where to look

| Symptom | Likely cause |
|---|---|
| `COPY` fails with "not found" | The file is outside the build context, or excluded by `.dockerignore` |
| Build output folder is empty or missing in the serve stage | `outDir` points to `../firebase/public` (stage 2) |
| Refreshing `/households/...` gives 404 | No single-page-app fallback (stage 3) |
| JS file returns HTML; "Unexpected token '<'" in the console | The fallback is also catching missing asset files (stage 3) |
| Old version still showing after rebuild | `index.html` cached by the browser (stage 3), or you ran an old image/tag |
| `auth/unauthorized-domain` on sign-in | Opened via an address that's not an authorized domain (stage 4) |
| Web server fails with "permission denied" on port 80 | Running as non-root on a privileged port (stage 3) |
| Emulator unreachable from the browser | Emulator bound to `127.0.0.1` in its container, port not published, or the app uses a service name the browser can't resolve (stage 5) |
| Edits don't reload in the dev container | File watching across Windows ↔ Linux (stage 6) |
| `esbuild`/native module errors after copying files in | Your Windows `node_modules` ended up in the image (stage 2, `.dockerignore`) |

---

## When you're ready

Write your Dockerfile, `.dockerignore`, web server config and (optionally) `compose.yaml`, then ask
for a review. Comparing your version against these "done when" checks is the best way to learn what
each instruction is really doing.
