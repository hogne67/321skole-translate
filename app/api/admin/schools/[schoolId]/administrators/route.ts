import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  assertSchoolAssignmentAvailable,
  canManageSchoolAdministrators,
  normalizeAdministratorUid,
  resolveSchoolAdministrator,
  SchoolAdministratorError,
} from "@/lib/schools/administrator";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ schoolId: string }> };

async function verifySuperadmin(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new SchoolAdministratorError("Unauthorized", 401);
  const { auth, db } = getAdmin();
  const actor = await auth.verifyIdToken(token);
  const actorProfile = (await db.collection("users").doc(actor.uid).get()).data();
  if (!canManageSchoolAdministrators(actorProfile)) {
    throw new SchoolAdministratorError("Only superadmins can connect school administrators", 403);
  }
  return { auth, db, actor };
}

function errorResponse(error: unknown) {
  const code = (error as { code?: string })?.code;
  const status = error instanceof SchoolAdministratorError ? error.status :
    code?.startsWith("auth/") ? 401 : 500;
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not connect administrator" }, { status });
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { auth, db } = await verifySuperadmin(req);
    const { schoolId } = await context.params;
    const schoolRef = db.collection("schools").doc(schoolId);
    if (!(await schoolRef.get()).exists) throw new SchoolAdministratorError("School not found", 404);
    const query = new URL(req.url).searchParams;
    const account = await resolveSchoolAdministrator(auth, {
      adminEmail: query.get("email"), adminUid: query.get("uid") ?? "",
    });
    const [profile, member] = await Promise.all([
      db.collection("users").doc(account.uid).get(),
      schoolRef.collection("members").doc(account.uid).get(),
    ]);
    assertSchoolAssignmentAvailable(profile.data(), schoolId);
    return NextResponse.json({ ok: true, administrator: {
      uid: account.uid, email: account.email ?? null,
      displayName: account.displayName || profile.get("displayName") || null,
      alreadyAdministrator: profile.get("schoolId") === schoolId && profile.get("schoolRole") === "school_admin" &&
        profile.get("schoolStatus") === "active" && member.get("role") === "school_admin" && member.get("status") === "active",
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { auth, db, actor } = await verifySuperadmin(req);
    const { schoolId } = await context.params;
    const body = await req.json();
    const administrator = await resolveSchoolAdministrator(auth, {
      adminEmail: typeof body.adminEmail === "string" ? body.adminEmail : "",
      adminUid: typeof body.adminUid === "string" ? body.adminUid : "",
    });
    const schoolRef = db.collection("schools").doc(schoolId);
    const profileRef = db.collection("users").doc(administrator.uid);
    const memberRef = schoolRef.collection("members").doc(administrator.uid);
    await db.runTransaction(async (transaction) => {
      const [school, profile, member, members] = await Promise.all([
        transaction.get(schoolRef), transaction.get(profileRef), transaction.get(memberRef),
        transaction.get(schoolRef.collection("members")),
      ]);
      if (!school.exists) throw new SchoolAdministratorError("School not found", 404);
      assertSchoolAssignmentAvailable(profile.data(), schoolId);
      const now = FieldValue.serverTimestamp();
      transaction.set(memberRef, {
        uid: administrator.uid, schoolId, email: administrator.email ?? null,
        displayName: administrator.displayName ?? null, role: "school_admin", status: "active",
        updatedAt: now, ...(member.exists ? {} : { createdAt: now, joinedAt: now }),
      }, { merge: true });
      transaction.set(profileRef, {
        schoolId, schoolRole: "school_admin", schoolStatus: "active", updatedAt: now,
      }, { merge: true });
      // Remove only malformed duplicates that identify this same verified account.
      for (const duplicate of members.docs) {
        if (duplicate.id !== administrator.uid && normalizeAdministratorUid(duplicate.id) === administrator.uid &&
          duplicate.get("role") === "school_admin") transaction.delete(duplicate.ref);
      }
      transaction.set(db.collection("adminAuditEvents").doc(), {
        type: "school_administrator_connected", actorUid: actor.uid, schoolId,
        targetUid: administrator.uid, createdAt: now,
      });
    });
    return NextResponse.json({ ok: true, uid: administrator.uid });
  } catch (error) {
    return errorResponse(error);
  }
}
