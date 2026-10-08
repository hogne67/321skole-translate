import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { evaluatePupilJoin, isActivePupil, joinText, type JoinMember } from "@/lib/spaceJoinPolicy";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { auth, db } = getAdmin();
  let decoded;
  try { decoded = await auth.verifyIdToken(token, true); }
  catch { return json({ error: "unauthorized" }, 401); }
  try {
    const body = await req.json().catch(() => ({}));
    const code = joinText(body.code).toUpperCase();
    const studentCode = joinText(body.studentCode).toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return json({ error: "space_not_found" }, 404);
    if (!/^[A-Z0-9]{4,12}$/.test(studentCode)) return json({ error: "student_code_required" }, 400);
    let spaceRef: FirebaseFirestore.DocumentReference | undefined;
    for (const field of ["code", "joinCode", "join.code"]) {
      const spaces = await db.collection("spaces").where(field, "==", code).limit(1).get();
      if (!spaces.empty) { spaceRef = spaces.docs[0].ref; break; }
    }
    if (!spaceRef) return json({ error: "space_not_found" }, 404);
    const uid = decoded.uid;
    const room = spaceRef;
    const result = await db.runTransaction(async tx => {
      const space = await tx.get(room);
      const data = space.data();
      if (!data || data.archived === true || data.status === "archived") return { error: "room_unavailable" } as const;
      // isOpen was a legacy admission toggle. Valid personal codes admit existing pupils on new devices.
      const membershipRef = db.collection("spaceMembers").doc(`${room.id}_${uid}`);
      const existing = await tx.get(membershipRef);
      const matching = await tx.get(db.collection("spaceMembers").where("studentCodeKey", "==", `${room.id}:${studentCode}`));
      const existingData = existing.exists ? existing.data() as JoinMember : null;
      const decision = evaluatePupilJoin(existingData, matching.docs.map(doc => doc.data() as JoinMember));
      if ("error" in decision) return decision;
      const pupilRecord = await tx.get(db.collection("spaceMembers").doc(`${room.id}_${decision.participantId}`));
      const pupilData = pupilRecord.data();
      // Teacher-created pupil records remain authoritative after their first access is linked.
      const displayName = pupilData?.teacherManaged === true && pupilData.participantId === decision.participantId
        ? joinText(pupilData.displayName) : decision.displayName;
      if (!displayName) return { error: "missing_pupil_name" } as const;
      if (existingData?.status === "revoked") return { error: "access_revoked" } as const;
      const response = {
        ok: true, spaceId: room.id, title: joinText(data.title), participantId: decision.participantId,
        displayName, currentDisplayName: decision.currentDisplayName,
        switchRequired: decision.switchRequired, signedInAccount: decoded.firebase?.sign_in_provider !== "anonymous",
      };
      // Preview is read-only. Switching requires a fresh guest UID after explicit confirmation.
      if (body.confirm !== true || decision.switchRequired) return { ...response, preview: true };
      const origin = matching.docs.find(doc => isActivePupil(doc.data() as JoinMember));
      tx.set(membershipRef, {
        spaceId: room.id, uid, participantId: decision.participantId, role: "student",
        ...(joinText(pupilRecord.data()?.teacherStudentId) ? { teacherStudentId: joinText(pupilRecord.data()?.teacherStudentId) } : {}),
        displayName, studentName: displayName,
        studentCode, studentCodeKey: `${room.id}:${studentCode}`, code,
        archived: false, active: true, status: "active", isAnon: decoded.firebase?.sign_in_provider === "anonymous",
        ...(origin && origin.id !== membershipRef.id ? { linkedFromMemberId: origin.id, linkedByStudentCode: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      }, { merge: true });
      for (const access of matching.docs) {
        if (access.id !== membershipRef.id && isActivePupil(access.data() as JoinMember) && joinText(access.data().uid)) {
          tx.update(access.ref, { displayName, studentName: displayName });
        }
      }
      if (origin && !joinText(origin.data().uid)) tx.set(origin.ref, {
        archived: true, active: false, status: "linked", linkedToMemberId: membershipRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ...response, preview: false };
    });
    if ("error" in result) return json(result, result.error === "identity_conflict" ? 409 : 403);
    if (!result.preview && decoded.firebase?.sign_in_provider !== "anonymous") {
      const profileRef = db.collection("users").doc(uid);
      const profile = await profileRef.get();
      if (!profile.data()?.role || profile.data()?.role === "student") await profileRef.set({
        role: "student", roles: { student: true },
        studentAccessMode: profile.data()?.studentAccessMode === "self_study" ? "self_study" : "space_only",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return json(result);
  } catch { return json({ error: "join_failed" }, 500); }
}
