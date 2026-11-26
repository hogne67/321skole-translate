import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { manageLegacyTeacherFlag } from "@/lib/security/legacyTeacherFlag.server";

export const runtime = "nodejs";
type Context = { params: Promise<{ uid: string }> };

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function readReason(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 ||
    !("reason" in input) || typeof input.reason !== "string") return null;
  const reason = input.reason.trim();
  return reason && reason.length <= 300 ? reason : null;
}

async function handle(req: Request, { params }: Context, write: boolean) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  try {
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(token, true);
    const { uid } = await params;
    if (!uid || uid.length > 128 || uid === "." || uid === ".." || /[/\s]/.test(uid)) {
      return json({ error: "invalid_user" }, 400);
    }

    const reason = write ? readReason(await req.json().catch(() => null)) : undefined;
    if (reason === null) return json({ error: "invalid_reason" }, 400);
    const { status, body } = await manageLegacyTeacherFlag(db, actor, uid, reason);
    return json(body, status);
  } catch (error) {
    return json({ error: "legacy_teacher_flag_failed" }, accountErrorStatus(error) ?? 500);
  }
}

export function GET(req: Request, context: Context) {
  return handle(req, context, false);
}

export function POST(req: Request, context: Context) {
  return handle(req, context, true);
}
