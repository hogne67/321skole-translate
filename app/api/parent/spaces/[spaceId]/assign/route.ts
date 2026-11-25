import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { AccountAccessError, accountErrorStatus, isGloballyEnabled } from "@/lib/security/accountAccess.server";
import { currentPosterAttachments } from "@/lib/learningPosters/attachmentsPolicy.server";
import { isParentSpaceAvailableForSharing, isParentSpaceKind, PARENT_SPACE_NOT_AVAILABLE_MESSAGE, SpaceNotOpenError } from "@/lib/spaceSharing";
// app/api/parent/spaces/[spaceId]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

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

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function readSourceLesson(
  db: FirebaseFirestore.Firestore,
  sourceId: string,
  uid: string,
  isAdmin: boolean,
  fromLibrary: boolean,
): Promise<{
  data: Record<string, unknown> | null;
  sourceCollection: "lessons" | "published_lessons" | null;
}> {
  if (!fromLibrary) {
    const draft = (await db.collection("lessons").doc(sourceId).get()).data();
    if (draft) {
      return (isAdmin || draft.ownerId === uid) && !draft.deletedAt
        ? { data: draft, sourceCollection: "lessons" }
        : { data: null, sourceCollection: null };
    }
  }

  const publishedSnap = await db
    .collection("published_lessons")
    .doc(sourceId)
    .get();

  const published = publishedSnap.data();
  if (published?.isActive === true && !published.deletedAt &&
    (published.visibility === "public" || published.visibility === "unlisted" || isAdmin || published.ownerId === uid)) {
    return { data: published, sourceCollection: "published_lessons" };
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

    if (!spaceId || spaceId.includes("/")) {
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

    if (!sourceId || sourceId.includes("/")) {
      return NextResponse.json(
        { error: "Missing sourceId." },
        { status: 400 }
      );
    }

    const { auth: adminAuth, db: adminDb } = getAdmin();

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const access = await getSpaceAccess(adminDb, spaceId, uid);
    const role = access.profile?.role;

    if (role !== "parent" && role !== "admin") {
      return NextResponse.json(
        { error: "Only parent can assign to parent spaces." },
        { status: 403 }
      );
    }

    const spaceRef = adminDb.collection("spaces").doc(spaceId);

    if (!access.exists) {
      return NextResponse.json(
        { error: "Space not found." },
        { status: 404 }
      );
    }

    if (role !== "admin" && !access.owner) {
      return NextResponse.json(
        { error: "You do not own this parent space." },
        { status: 403 }
      );
    }

    if (!isParentSpaceKind(access.space?.kind)) {
      return NextResponse.json(
        { error: "This is not a parent space." },
        { status: 400 }
      );
    }

    const source = await readSourceLesson(adminDb, sourceId, uid, role === "admin", normalizedSourceType === "library");

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
      learningPosterAttachments: currentPosterAttachments(lessonData),

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

    await adminDb.runTransaction(async (tx) => {
      const current = await getSpaceAccess(adminDb, spaceId, uid, tx);
      if (current.profile?.role !== role || !isGloballyEnabled(current.profile) || (role !== "admin" && !current.owner)) {
        throw new AccountAccessError("You do not own this parent space.", 403, "auth/forbidden");
      }
      if (!isParentSpaceAvailableForSharing(current.space)) throw new SpaceNotOpenError(PARENT_SPACE_NOT_AVAILABLE_MESSAGE);

      tx.set(targetRef, assignmentDoc, { merge: false });

      tx.set(
        spaceRef,
        {
          activeLessonId: targetRef.id,
          activeLessonTitle: lessonTitle,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

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
      { status: error instanceof SpaceNotOpenError ? 409 : (accountErrorStatus(error) ?? 500) }
    );
  }
}
