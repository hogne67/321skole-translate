import "server-only";
import { Timestamp, FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { getAdmin } from "../../firebaseAdmin";
import { getEmailConfiguration } from "../configuration";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "../resend";
import { buildVerificationEmail } from "../verificationEmail";
import type { VerificationEmailResult } from "../verificationResult";

export class VerificationEmailError extends Error {
  constructor(public reason: string, public status = 400) { super(reason); }
}

type Dependencies = {
  auth: Pick<Auth, "getUser" | "generateEmailVerificationLink">;
  db: Firestore;
  configured: boolean;
  baseUrl: string;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
};

export async function sendAccountVerificationEmail(input: { uid: string; locale?: string; parentOnly?: boolean }, dependencies?: Dependencies): Promise<VerificationEmailResult> {
  if (!input.uid) throw new VerificationEmailError("unauthorized", 401);
  const deps = dependencies ?? {
    ...getAdmin(), configured: getEmailConfiguration().configured,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://321school.com", send: sendEmail,
  };
  const user = await deps.auth.getUser(input.uid);
  if (user.disabled || !user.email) throw new VerificationEmailError("unauthorized", 401);
  if (input.parentOnly) {
    const profile = (await deps.db.collection("users").doc(input.uid).get()).data();
    if (profile?.role !== "parent" && profile?.roles?.parent !== true) throw new VerificationEmailError("not_parent", 403);
  }
  if (user.emailVerified) return { ok: true as const, alreadyVerified: true };
  if (!deps.configured) throw new VerificationEmailError("email_not_configured", 503);
  const locale = input.locale === "en" || input.locale === "pt" ? input.locale : "nb";
  const origin = new URL(deps.baseUrl).origin;
  if (!/^https?:\/\//.test(origin)) throw new VerificationEmailError("email_not_configured", 503);
  // Server-only storage: the cooldown applies across tabs and all verification endpoints.
  const ref = deps.db.collection("emailVerificationRequests").doc(input.uid);
  const attemptAt = Timestamp.now();
  const recent = await deps.db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const last = snapshot.get("lastAttemptAt")?.toMillis?.() ?? 0;
    const retryAfterSeconds = Math.ceil((last + 60_000 - Date.now()) / 1000);
    if (retryAfterSeconds > 0) {
      if (snapshot.get("status") === "failed") throw new VerificationEmailError("send_failed", 502);
      // Only confirmed provider acceptance for this address may be described as already sent.
      const delivery = snapshot.get("status") === "sent" && snapshot.get("email") === user.email
        ? "recently_sent" as const : "pending" as const;
      return { ok: true as const, alreadyVerified: false, delivery, retryAfterSeconds };
    }
    tx.set(ref, { lastAttemptAt: attemptAt, email: user.email, status: "sending" }, { merge: true });
    return null;
  });
  if (recent) return recent;
  let result: SendEmailResult;
  try {
    const verifyUrl = await deps.auth.generateEmailVerificationLink(user.email, {
      url: `${origin}/${locale}/login?verified=1`, handleCodeInApp: false,
    });
    const mail = buildVerificationEmail({ locale, displayName: user.displayName || "", verifyUrl });
    result = await deps.send({ to: user.email, ...mail });
  } catch { result = { ok: false, reason: "send_failed" }; }
  try {
    await deps.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      // A delayed response must not overwrite a newer send attempt.
      if (snapshot.get("lastAttemptAt")?.toMillis?.() === attemptAt.toMillis()) {
        tx.set(ref, { status: result.ok ? "sent" : "failed" }, { merge: true });
      }
    });
  } catch { console.error("verification_email_status_update_failed"); }
  // Do not persist the verification link or turn an accepted email into a failed send if logging fails.
  try {
    await deps.db.collection("emailLogs").add({ type: "account_verification", uid: input.uid,
      email: user.email, locale, provider: "resend", status: result.ok ? "sent" : "failed",
      createdAt: FieldValue.serverTimestamp() });
  } catch { console.error("verification_email_log_failed"); }
  if (!result.ok) throw new VerificationEmailError(result.reason, 502);
  return { ok: true as const, alreadyVerified: false, delivery: "sent",
    retryAfterSeconds: Math.max(0, Math.ceil((attemptAt.toMillis() + 60_000 - Date.now()) / 1000)) };
}
