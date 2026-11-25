import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import "server-only";
import { randomInt } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { activeTeacherSchoolId } from "@/lib/teacherSpaceArea";
import { canCreateSchoolSpace } from "@/lib/schools/teacherSpaceAccess";

export const runtime = "nodejs";
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { auth, db } = getAdmin();
  let decoded: DecodedIdToken;
  try { decoded = await auth.verifyIdToken(token, true); }
  catch (accountError) { return json({ error: "Unauthorized" }, (accountErrorStatus(accountError) ?? 401)); }
  const { uid } = decoded;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120
    || (body.isOpen !== undefined && typeof body.isOpen !== "boolean")
    || (body.area !== undefined && body.area !== "private" && body.area !== "school")
    || (body.schoolId != null && (typeof body.schoolId !== "string" || !body.schoolId || body.schoolId.includes("/")))) return json({ error: "Invalid request" }, 400);
  try {
    const profileRef = db.doc(`users/${uid}`);
    for (let attempt = 0; attempt < 10; attempt++) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
      const spaceRef = db.collection("spaces").doc();
      const claimRef = db.doc(`spaceJoinCodes/${code}`);
      const result = await db.runTransaction(async tx => {
        const profile = await tx.get(profileRef);
        const data = profile.data();
        assertActiveProfile(data, decoded);
        if (!(data?.role === "teacher" || data?.role === "admin" || data?.roles?.admin === true)) return "forbidden";
        // A school account cannot opt out of school controls by omitting schoolId.
        const activeSchool = data?.schoolStatus === "active";
        const profileSchoolId = activeTeacherSchoolId(data);
        if (activeSchool && !profileSchoolId) return "forbidden";
        const schoolId = activeSchool ? profileSchoolId : body.schoolId ?? null;
        if (body.area === "private" && schoolId !== null) return "forbidden";
        if (body.area === "school" && (!profileSchoolId || body.schoolId !== profileSchoolId)) return "forbidden";
        if (body.schoolId != null && body.schoolId !== schoolId) return "forbidden";
        if (schoolId != null) {
          if (schoolId !== data?.schoolId || data?.schoolStatus !== "active") return "forbidden";
          // Read the authoritative school and assignment in this transaction;
          // a stale profile alone must never confer school affiliation.
          const [school, member] = await Promise.all([
            tx.get(db.doc(`schools/${schoolId}`)),
            tx.get(db.doc(`schools/${schoolId}/members/${uid}`)),
          ]);
          if (!canCreateSchoolSpace(schoolId, uid, data?.schoolRole, school.data(), member.data())) return "forbidden";
        }
        const [claim, legacy, current] = await Promise.all([
          tx.get(claimRef), tx.get(db.collection("spaces").where("code", "==", code).select().limit(1)),
          tx.get(db.collection("spaces").where("joinCode", "==", code).select().limit(1)),
        ]);
        if (claim.exists || !legacy.empty || !current.empty) return "collision";
        const now = FieldValue.serverTimestamp();
        tx.create(claimRef, { spaceId: spaceRef.id });
        tx.create(spaceRef, { ownerId: uid, ownerUid: uid, createdBy: uid, code, joinCode: code,
          title: body.title.trim(), isOpen: body.isOpen !== false, allowRoomCodeOnly: false, schoolId,
          activeLessonId: null, activeLessonTitle: null, activeLessonUpdatedAt: null,
          activeGoalId: null, activeGoalTitle: null, createdAt: now, updatedAt: now });
        return "created";
      });
      if (result === "forbidden") return json({ error: "Forbidden" }, 403);
      if (result === "created") return json({ spaceId: spaceRef.id, code });
    }
    return json({ error: "Could not allocate room code" }, 503);
  } catch (error) {
    const status = accountErrorStatus(error);
    return json({ error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Could not create Space" }, status ?? 503);
  }
}
