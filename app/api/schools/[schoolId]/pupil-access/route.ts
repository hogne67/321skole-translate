import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessSchoolAdmin, isActiveSchoolAdminMember } from "@/lib/schools/access";
import type { SchoolMemberDoc } from "@/lib/schools/types";
import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { parsePupilAccountProviders } from "@/lib/security/schoolPupilProviders";

export const runtime = "nodejs";

type Context = { params: Promise<{ schoolId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: Context) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { schoolId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(schoolId)) return json({ error: "invalidRequest" }, 400);
  const body = await request.json().catch(() => null);
  const allowPupilCodeAccess: unknown = body?.allowPupilCodeAccess;
  const requestedProviders: unknown = body?.pupilAccountProviders;
  const providers = requestedProviders === undefined ? undefined : parsePupilAccountProviders(requestedProviders);
  if (typeof allowPupilCodeAccess !== "boolean" || providers === null) {
    return json({ error: "invalidRequest" }, 400);
  }
  const settings = {
    allowPupilCodeAccess,
    ...(providers ? { pupilAccountProviders: providers } : {}),
  };

  try {
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(token, true);
    if (actor.firebase?.sign_in_provider === "anonymous") return json({ error: "forbidden" }, 403);
    const schoolRef = db.collection("schools").doc(schoolId);
    const result = await db.runTransaction(async tx => {
      const [profile, membership, school] = await tx.getAll(
        db.collection("users").doc(actor.uid), schoolRef.collection("members").doc(actor.uid), schoolRef,
      );
      const currentProfile = profile.data();
      const assignment = membership.data() as SchoolMemberDoc | undefined;
      assertActiveProfile(currentProfile, actor);
      if (currentProfile?.schoolId !== schoolId || !canAccessSchoolAdmin(currentProfile)
        || assignment?.uid !== actor.uid || (assignment.schoolId !== undefined && assignment.schoolId !== schoolId)
        || !isActiveSchoolAdminMember(assignment)) {
        return "forbidden";
      }
      if (!school.exists) return "schoolUnavailable";
      const providersChanged = providers && JSON.stringify(school.get("pupilAccountProviders")) !== JSON.stringify(providers);
      if (school.get("allowPupilCodeAccess") !== allowPupilCodeAccess || providersChanged) {
        tx.update(schoolRef, { ...settings, updatedAt: FieldValue.serverTimestamp() });
      }
      return "saved";
    });
    if (result === "forbidden") return json({ error: result }, 403);
    if (result === "schoolUnavailable") return json({ error: result }, 404);
    return json({ ok: true, ...settings });
  } catch (error) {
    const status = accountErrorStatus(error) ?? 503;
    return json({ error: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "unavailable" }, status);
  }
}
