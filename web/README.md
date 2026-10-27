# Budget Tracker Web App

Use the app from **any phone or computer** — same Firebase data as the iOS app.

## Setup (one time)

### 1. Add a Web app in Firebase

1. [Firebase Console](https://console.firebase.google.com/project/budget-tracker-74611/settings/general)
2. **Your apps** → **Add app** → **Web** (`</>`)
3. App nickname: `Budget Tracker Web`
4. Copy the `firebaseConfig` values

### 2. Create `.env` file

```bash
cd web
cp .env.example .env
```

Edit `.env` with your Firebase web config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=budget-tracker-74611.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=budget-tracker-74611
VITE_FIREBASE_STORAGE_BUCKET=budget-tracker-74611.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=958755122153
VITE_FIREBASE_APP_ID=...
```

### 3. Enable Firebase Auth for web

In Firebase Console → **Authentication** → **Settings** → **Authorized domains**

Make sure these are listed:
- `localhost` (for local testing)
- Your hosting domain after deploy (e.g. `budget-tracker-74611.web.app`)

## Run locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

## Deploy online (free hosting)

```bash
cd web
npm install
npm run build

cd ../firebase
firebase login
firebase deploy --only hosting
```

Your app will be live at:
**https://budget-tracker-74611.web.app**

Share that link with your wife — she can open it on her iPhone, sign up, and accept invites.

## Add to iPhone Home Screen

1. Open the link in **Safari**
2. Tap **Share** → **Add to Home Screen**
3. Works like an app icon

## Features

- Sign up / sign in
- Multiple private households
- Invite members by email
- Expenses & income with date/time
- Separate household-wide category lists for income vs expenses, customizable by every member
- Filter transactions by income/expense type, category, member, and date range
- Balance, income & expense summary
- Same data as iOS app (shared Firebase)

## iPhone and Android apps (Capacitor)

The same web app is packaged as native iPhone and Android apps with [Capacitor](https://capacitorjs.com).
The native projects live in `web/ios` and `web/android`; their web content is copied from the build in
`firebase/public`, so every web change ships to both apps after a sync.

| Command (run in `web/`) | What it does |
|---|---|
| `npm run cap:sync` | Build the web app and copy it into both native projects |
| `npm run cap:android` | Build, sync and open the project in Android Studio |
| `npm run cap:ios` | Build, sync and open the project in Xcode (Mac only) |
| `npm run cap:assets` | Regenerate app icons and splash screens from `web/assets/` |

### Android (Windows, Mac or Linux)
1. Install [Android Studio](https://developer.android.com/studio).
2. `cd web && npm install && npm run cap:android`
3. In Android Studio, pick an emulator or a connected phone and press **Run**.
4. For Google Play: **Build → Generate Signed App Bundle** and upload the `.aab` in the Play Console.

### iPhone (needs a Mac with Xcode, or a cloud build service such as Codemagic)
1. `cd web && npm install && npm run cap:ios`
2. In Xcode, select the **App** target → **Signing & Capabilities** → choose your Apple Developer team.
3. Pick a simulator or your iPhone and press **Run**.
4. For the App Store: **Product → Archive**, then **Distribute App** to upload to TestFlight.

App ID / bundle ID: `com.budgettracker.app` (set in `web/capacitor.config.json`).
