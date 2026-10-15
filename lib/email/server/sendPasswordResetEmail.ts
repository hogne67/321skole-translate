import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { getAdmin } from "../../firebaseAdmin";
import { getEmailConfiguration } from "../configuration";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "../resend";
import { buildPasswordResetEmail } from "../passwordResetEmail";

type Dependencies = {
  auth: Pick<Auth, "getUserByEmail" | "generatePasswordResetLink">;
  db: Firestore;
  configured: boolean;
  baseUrl: string;
  send: (mail: SendEmailInput) => Promise<SendEmailResult>;
};

function publicOrigin(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "https:" && url.hostname !== "localhost" && !url.hostname.endsWith(".localhost")
      && !/^127\./.test(url.hostname) && !["[::1]", "0.0.0.0"].includes(url.hostname)) return url.origin;
  } catch { /* Use the public site when no usable origin is configured. */ }
  return "https://321school.com";
}

export async function sendPasswordResetEmail(input: { email: string; locale: string; clientKey: string }, dependencies?: Dependencies): Promise<void> {
  const deps = dependencies ?? {
    ...getAdmin(), configured: getEmailConfiguration().configured,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://321school.com", send: sendEmail,
  };
  if (!deps.configured) throw new Error("email_not_configured");
  const email = input.email.trim().toLowerCase();
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const requestRef = deps.db.collection("passwordResetRequests").doc(`email-${hash(email)}`);
  const clientRef = deps.db.collection("passwordResetRequests").doc(`client-${hash(input.clientKey)}`);
  const reserved = await deps.db.runTransaction(async tx => {
    const [request, client] = await Promise.all([tx.get(requestRef), tx.get(clientRef)]);
    const now = Date.now();
    if (now - (request.get("lastAttemptAt")?.toMillis?.() ?? 0) < 60_000) return false;
    const windowStart = client.get("windowStart")?.toMillis?.() ?? 0;
    const count = now - windowStart < 15 * 60_000 ? Number(client.get("count") || 0) : 0;
    if (count >= 30) return false;
    tx.set(requestRef, { lastAttemptAt: Timestamp.fromMillis(now) });
    tx.set(clientRef, { windowStart: Timestamp.fromMillis(count ? windowStart : now), count: count + 1 });
    return true;
  });
  if (!reserved) return;
  let user;
  try { user = await deps.auth.getUserByEmail(email); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return;
    throw error;
  }
  if (user.disabled || !user.email) return;
  const locale = input.locale === "en" || input.locale === "pt" ? input.locale : "nb";
  let result: SendEmailResult;
  try {
    const resetUrl = await deps.auth.generatePasswordResetLink(user.email, {
      url: `${publicOrigin(deps.baseUrl)}/${locale}/login?reset=1`, handleCodeInApp: false,
    });
    result = await deps.send({ to: user.email, ...buildPasswordResetEmail({ locale, resetUrl }) });
  } catch { result = { ok: false, reason: "send_failed" }; }
  // Record delivery for support without storing the reset link, action code or submitted password.
  try {
    await deps.db.collection("emailLogs").add({ type: "password_reset", uid: user.uid, email: user.email,
      locale, provider: "resend", status: result.ok ? "sent" : "failed",
      ...(result.ok ? {} : { error: result.reason }), createdAt: FieldValue.serverTimestamp() });
  } catch { console.error("password_reset_email_log_failed"); }
  if (!result.ok) console.error("password_reset_email_send_failed");
}
