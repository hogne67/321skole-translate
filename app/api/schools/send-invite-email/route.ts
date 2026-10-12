import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { InviteEmailError, sendSchoolInviteEmail } from "@/lib/schools/server/sendInviteEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  let uid: string;
  try {
    const decoded = await getAdmin().auth.verifyIdToken(token, true);
    if (decoded.firebase.sign_in_provider === "anonymous") throw new Error("Anonymous");
    uid = decoded.uid;
  } catch { return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 }); }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["schoolId", "inviteId", "locale"].includes(key))
    || [body.schoolId, body.inviteId].some(id => typeof id !== "string" || !id.trim() || id.length > 200 || id.includes("/"))) {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await sendSchoolInviteEmail({ uid, schoolId: body.schoolId, inviteId: body.inviteId, locale: body.locale });
    return NextResponse.json(result);
  } catch (error) {
    const reason = error instanceof InviteEmailError ? error.reason : "send_failed";
    const status = error instanceof InviteEmailError ? error.status : 500;
    return NextResponse.json({ ok: false, reason }, { status, headers: status === 429 ? { "Retry-After": "60" } : {} });
  }
}
