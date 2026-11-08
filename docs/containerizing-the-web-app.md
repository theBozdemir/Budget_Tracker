# Container setup: web app

A short checklist for running the Budget Tracker web app in Docker. You write the files yourself; each
step says what they must do. Production stays on Firebase Hosting; this is for learning and local use.

**Result:** a small image that serves the built app on `http://localhost:8080`, signing in to the real
Firebase project.

---

## 1. Requirements

- [ ] Docker Desktop installed and running (on Windows, use the **WSL 2** backend).
- [ ] Check it works:

```powershell
docker --version
docker run --rm hello-world
```

### Running Docker in a Linux VM instead of Docker Desktop

Use these steps instead of the Windows ones above, and run all later commands **inside the VM** (bash).

- [ ] Install Docker Engine in the VM (Ubuntu/Debian: follow docs.docker.com → *Install Docker Engine*),
      then let your user run Docker without `sudo` and log out and back in:

```bash
sudo usermod -aG docker $USER
docker run --rm hello-world
```

- [ ] **Clone the repo inside the VM.** Don't build from a Windows shared folder (slow, and it causes
      permission and file-watching issues). The repo is private, so sign in with a GitHub token or
      SSH key when cloning:

```bash
git clone https://github.com/theBozdemir/Budget_Tracker.git
cd Budget_Tracker/web
```

- [ ] **Reach the app from Windows as `localhost`.** The container listens inside the VM, and Firebase
      only allows sign-in from authorized domains (`localhost` is; the VM's IP isn't). Forward the
      VM's port 8080 to Windows, using either:
  - an **SSH tunnel** (any VM): on Windows run `ssh -L 8080:localhost:8080 youruser@<VM-IP>` and keep
    it open; or
  - **VirtualBox port forwarding** (NAT network): VM Settings → Network → Advanced → Port Forwarding,
    host port `8080` → guest port `8080`.

  Then open **http://localhost:8080** in your Windows browser. (Alternative: add the VM's IP or a
  hostname under Firebase Console → Authentication → Settings → Authorized domains. Less reliable if
  the IP changes.)

---

## 2. Choose base images

| Stage | Purpose | Use |
|---|---|---|
| Build | Install packages and run `vite build` | `node:22` on **Debian slim** (e.g. `node:22-bookworm-slim`) |
| Serve | Serve the built files | **nginx** on Alpine, preferably an *unprivileged* variant |

- Pin exact tags, never `latest`.
- The final image needs **no Node.js**: only the built files and nginx.

---

## 3. Create the files

All paths are relative to the repository root.

### `web/.dockerignore`
- [ ] Exclude `node_modules`, `dist`, `android`, `ios`, `.env*` and `*.log`.

### `web/nginx.conf`
- [ ] Listen on port **8080**.
- [ ] Serve files from the folder you copy the build into.
- [ ] **Page refresh fallback:** unknown paths return `/index.html` (so `/households/abc` works after F5).
- [ ] But `/assets/*` files that don't exist return a real **404**.
- [ ] `index.html`: `Cache-Control: no-cache`.
- [ ] `/assets/*`: cache for a long time (`max-age=31536000, immutable`).
- [ ] Turn on gzip for JS, CSS and HTML.
- [ ] Add the security headers from `firebase/firebase.json` (skip HSTS on plain HTTP).

### `web/Dockerfile` (multi-stage)
**Build stage**
- [ ] Set a working directory.
- [ ] Copy `package.json` + `package-lock.json` **first**, then run `npm ci` (so the install is cached).
- [ ] Copy the rest of `web/`.
- [ ] Build with the output **inside** the container's working directory:
      `npx vite build --outDir dist --emptyOutDir`.
      (The normal config writes to `../firebase/public`, outside `web/`. Don't change `vite.config.js`.)

**Serve stage**
- [ ] Start from the nginx image.
- [ ] Copy your `nginx.conf` into nginx's config folder.
- [ ] Copy **only** `dist/` from the build stage into the web root.
- [ ] Run as a non-root user, and `EXPOSE 8080`.
- [ ] Add a `HEALTHCHECK` that requests `/` (e.g. with `wget -q --spider`).

---

## 4. Build

Commands below are for Windows PowerShell; in a VM run the same `docker` commands from `Budget_Tracker/web`.

```powershell
cd C:\Users\tbozdemir\IdeaProjects\Budget_Tracker\web
docker build -t budget-tracker-web:dev .
docker image ls budget-tracker-web
```

- [ ] The build log shows `✓ built in …`. A warning about a chunk over 500 kB is fine.
- [ ] The image is roughly **tens of MB**, not hundreds.

---

## 5. Run

```powershell
docker run -d --name budget-web -p 8080:8080 budget-tracker-web:dev
docker ps
```

- [ ] `docker ps` shows the container as **(healthy)** after a few seconds.
- [ ] Open **http://localhost:8080** (use `localhost`, not `127.0.0.1`: Firebase only allows sign-in
      from authorized domains, and `localhost` is authorized by default).

---

## 6. Verify

- [ ] You can sign in and see your households. This is your **real data**, so use a test household for experiments.
- [ ] Open a household and press **F5**: the page reloads instead of showing a 404.
- [ ] Browser DevTools → **Network**:
  - [ ] `index.html` has `Cache-Control: no-cache`.
  - [ ] `assets/*.js` are gzip-compressed and long-cached.
  - [ ] The security headers are present.
- [ ] `docker exec budget-web node -v` fails (there's no Node in the final image).
- [ ] `docker exec budget-web whoami` is **not** `root`.

---

## 7. Update and clean up

```powershell
# after changing code: rebuild and replace the container
docker build -t budget-tracker-web:dev .
docker rm -f budget-web
docker run -d --name budget-web -p 8080:8080 budget-tracker-web:dev

# remove everything
docker rm -f budget-web
docker rmi budget-tracker-web:dev
```

- [ ] After editing one `.jsx` file, the rebuild shows `CACHED` for the `npm ci` step.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Serve stage can't find the build output | Build with `--outDir dist` (step 3) |
| F5 on a page gives 404 | Add the `index.html` fallback in `nginx.conf` |
| "Unexpected token '<'" in the console | The fallback is also catching `/assets/*`; make missing assets 404 |
| `auth/unauthorized-domain` | Open via `http://localhost:8080`, or add the host in Firebase Console → Authentication → Settings → Authorized domains |
| Docker in a VM: page doesn't open from Windows | Forward port 8080 (SSH tunnel or VirtualBox port forwarding), see step 1 |
| `permission denied ... docker.sock` in the VM | Add your user to the `docker` group and log in again (step 1) |
| nginx: permission denied on port 80 | Non-root can't use ports below 1024; listen on 8080 |
| Old version still showing | Rebuild the image, recreate the container, hard-refresh (Ctrl+F5) |
| `esbuild` / platform errors during build | Your Windows `node_modules` got copied in; check `.dockerignore` |

---

## Next steps (optional)

1. **Docker Compose:** a `compose.yaml` so the app runs with `docker compose up`.
2. **Local Firebase emulators:** add an emulator service (needs Node + Java 21) and a small app change
   to connect to it, so you never touch real data.
3. **Rules tests in a container:** run `npm run test:rules` from `firebase/` in a Node + Java image;
   success = `# pass 39`, exit code 0.
