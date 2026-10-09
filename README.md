# Budget Tracker (iOS)

Shared household budget app built with **SwiftUI** and **Firebase**.

## Features

- Create multiple private households (family, roommates, etc.)
- Invite members by email — any member can invite others
- Group isolation — transactions in one household are hidden from other groups
- Add **expenses** and **income** with full **date & time**
- Shared transaction list and balance summary per household
- Accept pending invites after signing up with the invited email

---

## Step 1: Install Xcode (required)

You need **Xcode** to run this app. Command-line Swift alone is not enough for iOS.

1. Open the **Mac App Store**
2. Search for **Xcode**
3. Install it (free, ~12 GB)
4. Open Xcode once and accept the license agreement
5. Install iOS Simulator components when prompted

After install, verify in Terminal:

```bash
xcodebuild -version
```

---

## Step 2: Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project (e.g. `budget-tracker`)
3. Add an **iOS app** with bundle ID: `com.budgettracker.app`
4. Download `GoogleService-Info.plist`
5. Copy it into `BudgetTracker/` (same folder as `BudgetTrackerApp.swift`)

### Enable Firebase services

In Firebase Console:

- **Authentication** → Sign-in method → enable **Email/Password**
- **Firestore Database** → Create database (production mode is fine; we deploy rules below)

### Deploy Firestore security rules

```bash
cd firebase
npm install -g firebase-tools   # if you don't have it
firebase login
firebase use --add              # select your project
firebase deploy --only firestore:rules
```

### Email invites (optional but recommended)

Invites are saved in Firestore immediately. To **send actual emails**, deploy the Cloud Function:

```bash
cd firebase/functions
npm install
cd ..
firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="587" \
  smtp.user="your-email@gmail.com" \
  smtp.pass="your-app-password" \
  app.url="budgettracker://invite"
firebase deploy --only functions
```

> For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

Without SMTP configured, invites still work — the invited person signs up with that email and accepts the invite in the **Invites** tab.

---

## Step 3: Open and run the app

1. Open `BudgetTracker.xcodeproj` in Xcode
2. Wait for Swift Package Manager to download Firebase (first open may take a few minutes)
3. Select a simulator (e.g. **iPhone 16**) or your physical iPhone
4. Press **Run** (▶) or `Cmd + R`

### First run checklist

- [ ] `GoogleService-Info.plist` is in the `BudgetTracker` folder
- [ ] Firebase Auth (Email/Password) is enabled
- [ ] Firestore rules are deployed
- [ ] In Xcode: **Signing & Capabilities** → select your Apple ID team (for device testing)

---

## How invites work

1. You create a household (e.g. "Our Family")
2. Tap **Invite by Email** and enter your wife's email
3. A pending invite is stored in Firestore
4. Cloud Function sends an email (if configured)
5. She downloads the app, creates an account with **that same email**
6. She opens the **Invites** tab and taps **Accept Invite**
7. She now sees only that household's transactions

Each household is fully separate. Roommates in "Apartment 402" never see "Our Family" data.

---

## Project structure

```
BudgetTracker/
├── BudgetTrackerApp.swift      # App entry + Firebase init
├── Models/                     # Household, Transaction, Invite
├── Services/                   # Auth, households, transactions
├── Views/                      # SwiftUI screens
├── Utilities/
└── GoogleService-Info.plist    # You add this from Firebase

firebase/
├── firestore.rules             # Group privacy enforcement
└── functions/                  # Email invite sender
```

---

## Firestore indexes

If Firestore asks for composite indexes when you run queries, create them from the link in the Xcode console error, or add these in Firebase Console → Firestore → Indexes:

- `households`: `memberIds` (array) + `createdAt`
- `transactions`: `householdId` + `timestamp` (desc)
- `invites`: `householdId` + `status` + `createdAt`
- `invites`: `email` + `status`

---

## App Store (later)

- Apple Developer Program ($99/year) is only needed to publish or test on a device long-term
- Free Apple ID works for local simulator and limited device testing

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Firebase not configured" | Add `GoogleService-Info.plist` to the project |
| Build fails on packages | File → Packages → Reset Package Caches |
| Permission denied in Firestore | Deploy `firestore.rules` |
| Invites not showing | Invitee must sign up with the exact invited email |
| No email received | Configure SMTP in Cloud Functions, or use Invites tab manually |
