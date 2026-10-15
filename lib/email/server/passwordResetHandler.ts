import "server-only";
import { after, NextResponse } from "next/server";
import { getEmailConfiguration } from "../configuration";
import { sendPasswordResetEmail } from "./sendPasswordResetEmail";

type Dependencies = {
  configured: boolean;
  schedule: (task: () => Promise<void>) => void;
  send: typeof sendPasswordResetEmail;
};

export async function handlePasswordReset(req: Request, dependencies?: Dependencies) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["email", "locale"].includes(key))
    || !("email" in body) || typeof body.email !== "string" || body.email.trim().length > 254
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email.trim())
    || ("locale" in body && (typeof body.locale !== "string" || !["nb", "en", "pt"].includes(body.locale)))) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const deps = dependencies ?? { configured: getEmailConfiguration().configured, schedule: after, send: sendPasswordResetEmail };
  if (!deps.configured) return NextResponse.json({ ok: false, error: "email_unavailable" }, { status: 503 });
  const email = body.email.trim();
  const locale = "locale" in body ? String(body.locale) : "nb";
  const clientKey = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared";
  // Identical response and timing for known and unknown accounts. Firebase alone issues the reset code.
  deps.schedule(async () => {
    try { await deps.send({ email, locale, clientKey }); }
    catch { console.error("password_reset_request_failed"); }
  });
  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
