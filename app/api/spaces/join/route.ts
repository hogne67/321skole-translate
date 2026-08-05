// app/api/spaces/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import {
  getTeacherActiveStudentUidsAdmin,
  getTeacherMemberLimit,
} from "@/lib/server/teacherStudentSummary";

type JoinBody = {
  code?: string;
  displayName?: string;
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
};

type SpaceMemberFields = {
  role?: unknown;
  archived?: unknown;
  active?: unknown;
  status?: unknown;
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

async function getActiveStudentMembership(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const docId = `${spaceId}_${uid}`;
  const snap = await db.collection("spaceMembers").doc(docId).get();

  if (!snap.exists) return null;

  const data = (snap.data() ?? {}) as SpaceMemberFields;
  const role = safeString(data.role);
  const archived = asBoolean(data.archived);
  const status = safeString(data.status).toLowerCase();

  return role === "student" && !archived && data.active !== false && status !== "removed" ? snap : null;
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
    const alreadyMemberInThisSpace = Boolean(existingMembership);

    if (alreadyMemberInThisSpace && !displayName) {
      return NextResponse.json({
        ok: true,
        spaceId,
        title: safeString((spaceData as SpaceOwnerFields).title) || "Untitled space",
        alreadyMember: true,
      });
    }

    if (!displayName) {
      return NextResponse.json({ error: "Missing displayName." }, { status: 400 });
    }

    if (displayName.length > 80) {
      return NextResponse.json({ error: "Display name is too long." }, { status: 400 });
    }

    if (!alreadyMemberInThisSpace) {
      const teacherSnap = await adminDb.collection("users").doc(teacherUid).get();
      const teacherData = teacherSnap.exists
        ? ((teacherSnap.data() ?? {}) as TeacherProfileFields)
        : null;

      const memberLimit = getTeacherMemberLimit(
        safeString(teacherData?.role),
        safeString(teacherData?.plan)
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

    await membershipRef.set(
      {
        spaceId,
        uid,
        role: "student",
        archived: false,
        active: true,
        status: "active",
        code,
        displayName,
        isAnon: isAnonymous,
        updatedAt: FieldValue.serverTimestamp(),
        ...(alreadyMemberInThisSpace ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      spaceId,
      title: safeString((spaceData as SpaceOwnerFields).title) || "Untitled space",
      alreadyMember: alreadyMemberInThisSpace,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not join space.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
