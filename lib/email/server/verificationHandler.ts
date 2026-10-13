import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "../../firebaseAdmin";
import { sendAccountVerificationEmail, VerificationEmailError } from "./sendVerificationEmail";

type Dependencies = {
  verifyToken: (token: string) => Promise<{ uid: string; anonymous: boolean }>;
  send: typeof sendAccountVerificationEmail;
};

export async function handleVerificationEmail(req: Request, parentOnly = false, dependencies?: Dependencies) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const deps = dependencies ?? {
    verifyToken: async (value: string) => {
      const decoded = await getAdmin().auth.verifyIdToken(value, true);
      return { uid: decoded.uid, anonymous: decoded.firebase.sign_in_provider === "anonymous" };
    },
    send: sendAccountVerificationEmail,
  };
  let uid: string;
  try {
    const decoded = await deps.verifyToken(token);
    if (decoded.anonymous) throw new Error("Anonymous");
    uid = decoded.uid;
  } catch { return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }); }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => key !== "locale")
    || ("locale" in body && (typeof body.locale !== "string" || !["nb", "en", "pt"].includes(body.locale)))) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  try {
    const locale = "locale" in body ? String(body.locale) : "nb";
    return NextResponse.json(await deps.send({ uid, locale, parentOnly }));
  } catch (error) {
    const status = error instanceof VerificationEmailError ? error.status : 500;
    const reason = error instanceof VerificationEmailError ? error.reason : "send_failed";
    return NextResponse.json({ ok: false, error: reason }, {
      status, headers: status === 429 ? { "Retry-After": "60" } : {},
    });
  }
}
