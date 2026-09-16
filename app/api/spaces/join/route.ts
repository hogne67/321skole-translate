// app/api/spaces/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import {
  getTeacherActiveStudentUidsAdmin,
  getTeacherMemberLimit,
} from "@/lib/server/teacherStudentSummary";
import { getEffectivePlan } from "@/lib/featureAccess";

type JoinBody = {
  code?: string;
  displayName?: string;
  studentCode?: string;
};

type SpaceOwnerFields = {
  ownerId?: unknown;
  teacherId?: unknown;
  createdBy?: unknown;
  createdByUid?: unknown;
  uid?: unknown;
  title?: unknown;
};

type TeacherProfileFields = {
  role?: unknown;
  plan?: unknown;
  billing?: unknown;
  partnerAccess?: unknown;
  partnerStatus?: unknown;
  schoolId?: unknown;
  schoolRole?: unknown;
  schoolStatus?: unknown;
};

type SpaceMemberFields = {
  role?: unknown;
  archived?: unknown;
  active?: unknown;
  status?: unknown;
  uid?: unknown;
  displayName?: unknown;
  participantId?: unknown;
  studentCode?: unknown;
};

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function cleanStudentCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function studentCodeKey(spaceId: string, studentCode: string): string {
  return `${spaceId}:${studentCode}`;
}

function generateStudentCode(length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function getTeacherUidFromSpaceData(data: Record<string, unknown> | null): string | null {
  if (!data) return null;

  const d = data as SpaceOwnerFields;

  return (
    asNonEmptyString(d.ownerId) ||
    asNonEmptyString(d.teacherId) ||
    asNonEmptyString(d.createdByUid) ||
    asNonEmptyString(d.createdBy) ||
    asNonEmptyString(d.uid) ||
    null
  );
}

async function findSpaceByCode(
  db: FirebaseFirestore.Firestore,
  codeRaw: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const code = safeString(codeRaw).toUpperCase();
  if (!code) return null;

  const tries = [
    db.collection("spaces").where("code", "==", code).limit(1),
    db.collection("spaces").where("joinCode", "==", code).limit(1),
    db.collection("spaces").where("join.code", "==", code).limit(1),
  ];

  for (const qy of tries) {
    const snap = await qy.get();
    if (!snap.empty) return snap.docs[0];
  }

  return null;
}

function isActiveStudentMemberData(data: SpaceMemberFields | null | undefined): boolean {
  if (!data) return false;
  const role = safeString(data.role);
  const archived = asBoolean(data.archived);
  const status = safeString(data.status).toLowerCase();

  return role === "student" && !archived && data.active !== false && status !== "removed";
}

async function getActiveStudentMembership(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const docId = `${spaceId}_${uid}`;
  const snap = await db.collection("spaceMembers").doc(docId).get();

  if (!snap.exists) return null;

  const data = (snap.data() ?? {}) as SpaceMemberFields;
  return isActiveStudentMemberData(data) ? snap : null;
}

async function findStudentMembershipByCode(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  studentCode: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  if (!studentCode) return null;

  const snap = await db
    .collection("spaceMembers")
    .where("studentCodeKey", "==", studentCodeKey(spaceId, studentCode))
    .limit(1)
    .get();

  if (snap.empty) return null;
  const first = snap.docs[0];
  const data = (first.data() ?? {}) as SpaceMemberFields;
  return isActiveStudentMemberData(data) ? first : null;
}

async function generateUniqueStudentCode(
  db: FirebaseFirestore.Firestore,
  spaceId: string
): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = generateStudentCode();
    const existing = await findStudentMembershipByCode(db, spaceId, code);
    if (!existing) return code;
  }

  return `${generateStudentCode(5)}${Math.floor(Math.random() * 10)}`;
}

export async function POST(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as JoinBody;
    const code = safeString(body.code).toUpperCase();
    const displayName = cleanName(safeString(body.displayName));
    const studentCode = cleanStudentCode(safeString(body.studentCode));

    if (!code) {
      return NextResponse.json({ error: "Missing code." }, { status: 400 });
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const adminDb = getFirestore(app);

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const isAnonymous = decoded.firebase?.sign_in_provider === "anonymous";

    const spaceDoc = await findSpaceByCode(adminDb, code);
    if (!spaceDoc) {
      return NextResponse.json({ error: "Space not found." }, { status: 404 });
    }

    const spaceId = spaceDoc.id;
    const spaceData = (spaceDoc.data() ?? {}) as Record<string, unknown>;
    const teacherUid = getTeacherUidFromSpaceData(spaceData);

    if (!teacherUid) {
      return NextResponse.json({ error: "Could not resolve space owner." }, { status: 400 });
    }

    const existingMembership = await getActiveStudentMembership(adminDb, spaceId, uid);
    const codeMatchedMembership =
      !existingMembership && studentCode
        ? await findStudentMembershipByCode(adminDb, spaceId, studentCode)
        : null;
    const codeMatchedData = codeMatchedMembership
      ? ((codeMatchedMembership.data() ?? {}) as SpaceMemberFields)
      : null;
    const alreadyMemberInThisSpace = Boolean(existingMembership);
    const linkedExistingParticipant = Boolean(codeMatchedMembership);

    if (alreadyMemberInThisSpace && !displayName) {
      return NextResponse.json({
        ok: true,
        spaceId,
        title: safeString((spaceData as SpaceOwnerFields).title) || "Untitled space",
        alreadyMember: true,
        participantId:
          safeString((existingMembership?.data() as SpaceMemberFields | undefined)?.participantId) || uid,
      });
    }

    if (!displayName && !codeMatchedData?.displayName) {
      return NextResponse.json({ error: "Missing displayName." }, { status: 400 });
    }

    if (displayName.length > 80) {
      return NextResponse.json({ error: "Display name is too long." }, { status: 400 });
    }

    if (!alreadyMemberInThisSpace && !linkedExistingParticipant) {
      const teacherSnap = await adminDb.collection("users").doc(teacherUid).get();
      const teacherData = teacherSnap.exists
        ? ((teacherSnap.data() ?? {}) as TeacherProfileFields)
        : null;
      const teacherEffectivePlan = getEffectivePlan({
        plan: safeString(teacherData?.plan) || "free",
        billing:
          teacherData?.billing && typeof teacherData.billing === "object"
            ? (teacherData.billing as { plan?: string | null; status?: string | null })
            : null,
        partnerAccess: teacherData?.partnerAccess === true,
        partnerStatus:
          typeof teacherData?.partnerStatus === "string" ? teacherData.partnerStatus : null,
        schoolId: typeof teacherData?.schoolId === "string" ? teacherData.schoolId : null,
        schoolRole: typeof teacherData?.schoolRole === "string" ? teacherData.schoolRole : null,
        schoolStatus:
          typeof teacherData?.schoolStatus === "string" ? teacherData.schoolStatus : null,
      });

      const memberLimit = getTeacherMemberLimit(
        safeString(teacherData?.role),
        teacherEffectivePlan
      );

      const activeStudentUids = await getTeacherActiveStudentUidsAdmin(adminDb, teacherUid);
      const alreadyCountedForTeacher = activeStudentUids.has(uid);
      const activeStudentCount = activeStudentUids.size;

      if (!alreadyCountedForTeacher && activeStudentCount >= memberLimit) {
        return NextResponse.json(
          {
            error: "student_limit_reached",
            used: activeStudentCount,
            limit: memberLimit,
            remaining: Math.max(0, memberLimit - activeStudentCount),
          },
          { status: 409 }
        );
      }
    }

    const membershipRef = adminDb.collection("spaceMembers").doc(`${spaceId}_${uid}`);
    const resolvedParticipantId =
      safeString(codeMatchedData?.participantId) ||
      safeString(codeMatchedData?.uid) ||
      uid;
    const resolvedDisplayName = displayName || safeString(codeMatchedData?.displayName);
    const resolvedStudentCode =
      safeString(codeMatchedData?.studentCode) ||
      (existingMembership
        ? safeString((existingMembership.data() as SpaceMemberFields | undefined)?.studentCode)
        : "") ||
      (await generateUniqueStudentCode(adminDb, spaceId));

    await membershipRef.set(
      {
        spaceId,
        uid,
        participantId: resolvedParticipantId,
        role: "student",
        archived: false,
        active: true,
        status: "active",
        code,
        displayName: resolvedDisplayName,
        studentCode: resolvedStudentCode,
        studentCodeKey: studentCodeKey(spaceId, resolvedStudentCode),
        isAnon: isAnonymous,
        ...(codeMatchedMembership && codeMatchedMembership.id !== `${spaceId}_${uid}`
          ? {
              linkedFromMemberId: codeMatchedMembership.id,
              linkedByStudentCode: true,
              linkedAt: FieldValue.serverTimestamp(),
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
        ...(alreadyMemberInThisSpace ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    if (!isAnonymous) {
      const userRef = adminDb.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() : null;
      const existingRole = safeString(userData?.role);
      const existingMode = safeString(userData?.studentAccessMode);

      if (!existingRole || existingRole === "student") {
        await userRef.set(
          {
            role: "student",
            roles: {
              student: true,
            },
            studentAccessMode: existingMode === "self_study" ? "self_study" : "space_only",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      spaceId,
      title: safeString((spaceData as SpaceOwnerFields).title) || "Untitled space",
      alreadyMember: alreadyMemberInThisSpace,
      participantId: resolvedParticipantId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not join space.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
