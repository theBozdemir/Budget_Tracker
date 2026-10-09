# Better email delivery (avoid spam/junk)

Firebase's default emails (`noreply@...firebaseapp.com`) often land in **Spam/Junk**.

Send emails from **your own address** using SMTP (Gmail or SendGrid). Emails look like they come from you, so they're much less likely to be filtered.

---

## Option A: Gmail (easiest)

### 1. Create a Gmail App Password
1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Turn on **2-Step Verification**
3. Search **App passwords** → create one for "Budget Tracker"

### 2. Configure Firebase Functions
```bash
cd firebase
npx firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="587" \
  smtp.user="tarikbozdemir2602@gmail.com" \
  smtp.pass="YOUR_16_CHAR_APP_PASSWORD" \
  smtp.from="Budget Tracker <tarikbozdemir2602@gmail.com>" \
  app.url="https://budget-tracker-74611.web.app/login"
```

### 3. Deploy functions (requires Blaze plan — usually still $0)
```bash
npx firebase deploy --only functions
```

> **Blaze plan:** Firebase's pay-as-you-go plan. Required for Cloud Functions that send email. Small apps typically stay within the free tier.

---

## Option B: SendGrid (best deliverability)

1. Sign up at [sendgrid.com](https://sendgrid.com) (free tier: 100 emails/day)
2. **Settings → Sender Authentication → Verify a Single Sender** (use your Gmail)
3. Create an API key with **Mail Send** permission

```bash
cd firebase
npx firebase functions:config:set \
  smtp.host="smtp.sendgrid.net" \
  smtp.port="587" \
  smtp.user="apikey" \
  smtp.pass="YOUR_SENDGRID_API_KEY" \
  smtp.from="Budget Tracker <tarikbozdemir2602@gmail.com>" \
  app.url="https://budget-tracker-74611.web.app/login"

npx firebase deploy --only functions
```

---

## What this fixes

| Email type | Before | After |
|------------|--------|-------|
| Password reset | Firebase noreply → often junk | From your Gmail/SendGrid |
| Household invites | Not sent (or junk) | From your Gmail/SendGrid |

---

## Also customize Firebase templates (backup)

If custom SMTP isn't set up yet, improve Firebase's default emails:

1. [Authentication → Templates](https://console.firebase.google.com/project/budget-tracker-74611/authentication/emails)
2. Edit **Password reset**
3. Change subject to: `Reset your Budget Tracker password`
4. Set action URL to: `https://budget-tracker-74611.web.app/login`

---

## Quick tip for users

After the first email arrives in junk, tap **Not Junk** / **Report not spam**. Future emails usually go to the inbox.
