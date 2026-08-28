import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { getSchoolMember, schoolInviteDocRef } from "@/lib/schools/server";
import type { SchoolInviteDoc } from "@/lib/schools/types";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const schoolId = readString(body.schoolId);
    const inviteId = readString(body.inviteId);

    if (!schoolId) return json({ ok: false, error: "Missing schoolId" }, 400);
    if (!inviteId) return json({ ok: false, error: "Missing inviteId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);

    const adminMember = await getSchoolMember(schoolId, uid);

    if (!isActiveSchoolAdminMember(adminMember)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const inviteRef = schoolInviteDocRef(inviteId);
    const result = await db.runTransaction(async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteRef);

      if (!inviteSnapshot.exists) {
        return { ok: false, reason: "invite_not_found" as const };
      }

      const invite = inviteSnapshot.data() as SchoolInviteDoc;

      if (invite.schoolId !== schoolId) {
        return { ok: false, reason: "invite_not_found" as const };
      }

      if (invite.status !== "pending") {
        return { ok: false, reason: "invite_not_pending" as const };
      }

      const now = FieldValue.serverTimestamp();

      transaction.update(inviteRef, {
        status: "revoked",
        revokedAt: now,
        revokedByUid: uid,
        inviteToken: null,
        inviteTokenHash: null,
        updatedAt: now,
      });

      return { ok: true };
    });

    return json(result, result.ok ? 200 : 400);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to revoke school invite" }, 500);
  }
}
