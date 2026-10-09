const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

function getConfig() {
  return functions.config();
}

function isSmtpConfigured(config) {
  return Boolean(config.smtp && config.smtp.user && config.smtp.pass);
}

function createTransport() {
  const config = getConfig().smtp || {};
  return nodemailer.createTransport({
    host: config.host || "smtp.gmail.com",
    port: Number(config.port || 587),
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function mailFrom(config) {
  const smtp = config.smtp || {};
  if (smtp.from) return smtp.from;
  return `"Budget Tracker" <${smtp.user}>`;
}

function appLoginUrl(config) {
  return (config.app && config.app.url) || "https://budget-tracker-74611.web.app/login";
}

async function sendEmail({ to, subject, text }) {
  const config = getConfig();
  if (!isSmtpConfigured(config)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Email is not configured yet. Ask the app owner to set up SMTP in Firebase Functions."
    );
  }

  const transport = createTransport();
  await transport.sendMail({
    from: mailFrom(config),
    to,
    subject,
    text,
  });
}

exports.sendPasswordResetEmailCustom = functions.https.onCall(async (data) => {
  const email = (data.email || "").toLowerCase().trim();
  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "Email is required.");
  }

  const config = getConfig();
  const loginUrl = appLoginUrl(config);

  try {
    const resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: loginUrl,
      handleCodeInApp: false,
    });

    await sendEmail({
      to: email,
      subject: "Reset your Budget Tracker password",
      text: `
Hi,

We received a request to reset your Budget Tracker password.

Reset your password using this link:
${resetLink}

If you did not request this, you can ignore this email.

— Budget Tracker
${loginUrl}
      `.trim(),
    });
  } catch (error) {
    functions.logger.warn("Password reset email skipped", { email, error: error.message });
  }

  return {
    success: true,
    message: "If an account exists for this email, a reset link has been sent.",
  };
});

exports.acceptHouseholdInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  const inviteId = (data.inviteId || "").trim();
  if (!inviteId) {
    throw new functions.https.HttpsError("invalid-argument", "Invite ID is required.");
  }

  const uid = context.auth.uid;
  const email = (context.auth.token.email || "").toLowerCase();
  if (!email) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your account must have an email address."
    );
  }

  const db = admin.firestore();
  const inviteRef = db.collection("invites").doc(inviteId);

  const householdId = await db.runTransaction(async (transaction) => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Invite not found.");
    }

    const invite = inviteSnap.data();
    if (invite.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", "This invite is no longer valid.");
    }
    if (invite.email !== email) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "This invite was sent to a different email address."
      );
    }

    const householdRef = db.collection("households").doc(invite.householdId);
    const householdSnap = await transaction.get(householdRef);
    if (!householdSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Household not found.");
    }

    const household = householdSnap.data();
    const memberIds = household.memberIds || [];
    const pending = household.pendingInviteEmails || [];
    const householdUpdates = {};

    if (!memberIds.includes(uid)) {
      householdUpdates.memberIds = [...memberIds, uid];
    }
    if (pending.includes(email)) {
      householdUpdates.pendingInviteEmails = pending.filter((entry) => entry !== email);
    }

    if (Object.keys(householdUpdates).length > 0) {
      transaction.update(householdRef, householdUpdates);
    }

    transaction.update(inviteRef, {
      status: "accepted",
      acceptedByUid: uid,
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return invite.householdId;
  });

  return { success: true, householdId };
});

exports.sendHouseholdInviteEmail = functions.firestore
  .document("invites/{inviteId}")
  .onCreate(async (snap, context) => {
    const invite = snap.data();
    const config = getConfig();

    if (!isSmtpConfigured(config)) {
      functions.logger.warn(
        "SMTP not configured. Invite saved in Firestore; configure smtp to send emails.",
        { inviteId: context.params.inviteId }
      );
      return null;
    }

    const appUrl = appLoginUrl(config);
    const inviteLink = invite.token
      ? `${appUrl.replace(/\/login$/, "")}/join?token=${encodeURIComponent(invite.token)}`
      : appUrl;

    await sendEmail({
      to: invite.email,
      subject: `You're invited to ${invite.householdName} on Budget Tracker`,
      text: `
Hi,

${invite.invitedByName} invited you to join "${invite.householdName}" on Budget Tracker.

Open this invite link:
${inviteLink}

Sign up or sign in with this email address: ${invite.email}

Only members of this household can see its transactions.

— Budget Tracker
      `.trim(),
    });

    functions.logger.info("Invite email sent", {
      inviteId: context.params.inviteId,
      email: invite.email,
    });

    return null;
  });
