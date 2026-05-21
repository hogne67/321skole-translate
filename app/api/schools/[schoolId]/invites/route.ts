import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { getSchoolMember, schoolInvitesCollectionRef } from "@/lib/schools/server";
import type { SchoolInviteDoc } from "@/lib/schools/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schoolId?: string;
  }>;
};

type PublicSchoolInvite = Omit<SchoolInviteDoc, "inviteTokenHash">;

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

function toMillis(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  return 0;
}

function toPublicInvite(invite: SchoolInviteDoc): PublicSchoolInvite {
  const publicInvite: SchoolInviteDoc = { ...invite };
  delete publicInvite.inviteTokenHash;

  return publicInvite;
}

function sortInvites(a: PublicSchoolInvite, b: PublicSchoolInvite): number {
  const byCreatedAt = toMillis(b.createdAt) - toMillis(a.createdAt);

  if (byCreatedAt !== 0) return byCreatedAt;

  return (b.id ?? "").localeCompare(a.id ?? "");
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);

    if (!schoolId) {
      return json({ ok: false, error: "Missing schoolId" }, 400);
    }

    const { auth } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const adminMember = await getSchoolMember(schoolId, uid);

    if (!isActiveSchoolAdminMember(adminMember)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const snapshot = await schoolInvitesCollectionRef()
      .where("schoolId", "==", schoolId)
      .get();
    const invites = snapshot.docs
      .map((doc) =>
        toPublicInvite({
          id: doc.id,
          ...(doc.data() as SchoolInviteDoc),
        })
      )
      .sort(sortInvites);

    return json({
      ok: true,
      schoolId,
      invites,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to load school invites" }, 500);
  }
}
