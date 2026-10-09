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
