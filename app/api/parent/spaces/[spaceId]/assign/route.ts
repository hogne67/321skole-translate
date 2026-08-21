// app/api/parent/spaces/[spaceId]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";

type AssignBody = {
  sourceType?: string;
  sourceId?: string;
  title?: string;
  audioReadingEnabled?: boolean;
  audioReadingRequired?: boolean;
};

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function readSourceLesson(
  db: FirebaseFirestore.Firestore,
  sourceId: string
): Promise<{
  data: Record<string, unknown> | null;
  sourceCollection: "lessons" | "published_lessons" | null;
}> {
  const draftSnap = await db.collection("lessons").doc(sourceId).get();

  if (draftSnap.exists) {
    const raw = draftSnap.data();

    return {
      data: isRecord(raw) ? raw : {},
      sourceCollection: "lessons",
    };
  }

  const publishedSnap = await db
    .collection("published_lessons")
    .doc(sourceId)
    .get();

  if (publishedSnap.exists) {
    const raw = publishedSnap.data();

    return {
      data: isRecord(raw) ? raw : {},
      sourceCollection: "published_lessons",
    };
  }

  return {
    data: null,
    sourceCollection: null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;

    if (!spaceId) {
      return NextResponse.json(
        { error: "Missing spaceId." },
        { status: 400 }
      );
    }

    const token = readBearerToken(req);

    if (!token) {
      return NextResponse.json(
        { error: "Missing bearer token." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as AssignBody;

    const sourceType = safeString(body?.sourceType);
    const sourceId = safeString(body?.sourceId);
    const requestedTitle = safeString(body?.title);
    const audioReadingEnabled = body?.audioReadingEnabled === true;
    const audioReadingRequired =
      audioReadingEnabled && body?.audioReadingRequired !== false;

    const normalizedSourceType =
      sourceType === "library" ? "library" : "myContent";

    if (!sourceId) {
      return NextResponse.json(
        { error: "Missing sourceId." },
        { status: 400 }
      );
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const adminDb = getFirestore(app);

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json(
        { error: "User profile not found." },
        { status: 403 }
      );
    }

    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
    const role = safeString(userData.role);

    if (role !== "parent" && role !== "admin") {
      return NextResponse.json(
        { error: "Only parent can assign to parent spaces." },
        { status: 403 }
      );
    }

    const spaceRef = adminDb.collection("spaces").doc(spaceId);
    const spaceSnap = await spaceRef.get();

    if (!spaceSnap.exists) {
      return NextResponse.json(
        { error: "Space not found." },
        { status: 404 }
      );
    }

    const spaceData = (spaceSnap.data() ?? {}) as Record<string, unknown>;
    const ownerId = safeString(spaceData.ownerId);
    const kind = safeString(spaceData.kind);

    if (role !== "admin" && ownerId !== uid) {
      return NextResponse.json(
        { error: "You do not own this parent space." },
        { status: 403 }
      );
    }

    if (kind !== "family" && kind !== "parent_group") {
      return NextResponse.json(
        { error: "This is not a parent space." },
        { status: 400 }
      );
    }

    const source = await readSourceLesson(adminDb, sourceId);

    if (!source.data || !source.sourceCollection) {
      return NextResponse.json(
        { error: "Source lesson not found." },
        { status: 404 }
      );
    }

    const lessonData = source.data;

    const lessonTitle =
      requestedTitle ||
      safeString(lessonData.title) ||
      "Untitled task";

    const targetRef = spaceRef.collection("lessons").doc();

    const assignmentDoc: Record<string, unknown> = {
      ...lessonData,

      title: lessonTitle,

      sourceId,
      sourceType: normalizedSourceType,
      sourceCollection: source.sourceCollection,
      audioReadingEnabled,
      audioReadingRequired,

      assignedByUid: uid,
      assignedByRole: role === "admin" ? "admin" : "parent",

      ownerId: uid,

      archived: false,

      updatedAt: FieldValue.serverTimestamp(),

      copiedFromLessonId: sourceId,
      copiedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    const batch = adminDb.batch();

    batch.set(targetRef, assignmentDoc, { merge: false });

    batch.set(
      spaceRef,
      {
        activeLessonId: targetRef.id,
        activeLessonTitle: lessonTitle,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({
      ok: true,
      spaceId,
      assignmentId: targetRef.id,
      title: lessonTitle,
      sourceCollection: source.sourceCollection,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not assign lesson to parent space.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
