import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  assertSchoolAssignmentAvailable,
  normalizeAdministratorUid,
  resolveSchoolAdministrator,
  SchoolAdministratorError,
} from "@/lib/schools/administrator";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ schoolId: string }> }) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(token);
    const actorProfile = (await db.collection("users").doc(actor.uid).get()).data();
    if (actorProfile?.disabled === true || actorProfile?.adminLevel !== "superadmin" ||
      !(actorProfile?.role === "admin" || actorProfile?.roles?.admin === true)) {
      return NextResponse.json({ ok: false, error: "Only superadmins can connect school administrators" }, { status: 403 });
    }
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
    const code = (error as { code?: string }).code;
    const status = error instanceof SchoolAdministratorError ? error.status :
      code?.startsWith("auth/") ? 401 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not connect administrator" }, { status });
  }
}
