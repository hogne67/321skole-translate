// app/api/publish/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Visibility = "public" | "unlisted" | "private";

function bool(v: unknown) {
  return v === true;
}

function isVisibility(v: unknown): v is Visibility {
  return v === "public" || v === "unlisted" || v === "private";
}

function pickVisibility(v: unknown): Visibility {
  return isVisibility(v) ? v : "public";
}

export async function POST(req: Request) {
  const { auth, db } = getAdmin();

  // --- Auth ---
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Input ---
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const idRaw = body.id ?? body.lessonId;
  const id = typeof idRaw === "string" ? idRaw : undefined;

  const visibility = pickVisibility(body.visibility);

  if (!id) return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // --- Load user profile ---
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: `Missing user profile (users/${uid})` }, { status: 400 });
  }

  const profile = ((userSnap.data() ?? {}) as Record<string, unknown>) || {};
  const roles = (profile.roles ?? {}) as Record<string, unknown>;
  const caps = (profile.caps ?? {}) as Record<string, unknown>;

  const isAdmin = bool(roles.admin);
  const isApprovedTeacher = profile.teacherStatus === "approved";

  // MVP/Policy:
  // - Admin kan alltid publisere
  // - Approved teacher kan publisere
  // - caps.publish kan fungere som feature flag
  const canPublish = isAdmin || isApprovedTeacher || bool(caps.publish);

  const att =
    profile.publisherAttestation && typeof profile.publisherAttestation === "object"
      ? (profile.publisherAttestation as Record<string, unknown>)
      : null;

  // --- Authorization rules ---
  if (!canPublish) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: {
        reason: "NOT_ALLOWED_TO_PUBLISH",
        rolesAdmin: bool(roles.admin),
        teacherStatus: profile.teacherStatus ?? null,
        capsPublish: bool(caps.publish),
      },
    });

    return NextResponse.json(
      {
        error:
          "Publishing not allowed (requires teacherStatus=approved, caps.publish=true, or admin). " +
          `teacherStatus=${String(profile.teacherStatus)} roles.admin=${String(
            bool(roles.admin)
          )} caps.publish=${String(bool(caps.publish))}`,
      },
      { status: 403 }
    );
  }

  // --- Load draft ---
  const draftRefA = db.doc(`lessons/${id}`);
  const draftSnapA = await draftRefA.get();

  const draftRefB = db.doc(`texts/${id}`);
  const draftSnapB = draftSnapA.exists ? null : await draftRefB.get();

  const draftSnap = draftSnapA.exists ? draftSnapA : draftSnapB;
  const draftPath = draftSnapA.exists
    ? `lessons/${id}`
    : draftSnapB?.exists
      ? `texts/${id}`
      : null;

  if (!draftSnap || !draftSnap.exists) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: { reason: "DRAFT_NOT_FOUND" },
    });

    return NextResponse.json({ error: "Draft not found in lessons/ or texts/" }, { status: 404 });
  }

  const draft = ((draftSnap.data() ?? {}) as Record<string, unknown>) || {};
  const ownerId = typeof draft.ownerId === "string" ? draft.ownerId : null;

  // Ikke-admin kan kun publisere egne utkast
  if (!isAdmin && ownerId && ownerId !== uid) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: { reason: "NOT_OWNER", draftPath, ownerId },
    });
    return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
  }

  const effectiveOwnerId = ownerId || uid;

  // --- Build published doc (signed snapshot) ---
  const publishedRef = db.doc(`published_lessons/${id}`);

  const signedBy = {
    uid,
    nameSnapshot: typeof profile.displayName === "string" ? profile.displayName : "",
    emailSnapshot: typeof profile.email === "string" ? profile.email : "",
    orgSnapshot:
      profile.org && typeof profile.org === "object" ? (profile.org as Record<string, unknown>) : {},
    attestationVersion:
      att && typeof att.version === "number" ? att.version : null,
    signedAt: now,
    viaAdmin: isAdmin && effectiveOwnerId !== uid,
  };

  const publishedDoc = {
    ...draft,

    // Compatibility / library behavior
    lessonId: id,
    ownerId: effectiveOwnerId,
    isActive: true,

    // Publish metadata
    visibility,
    publishedAt: now,
    updatedAt: now,

    signedBy,

    moderation: {
      status: "pending",
      checkedAt: now,
      model: "none-yet",
    },
  };

  // --- Write published + audit ---
  await publishedRef.set(publishedDoc, { merge: true });

  await db.collection("auditEvents").add({
    type: "PUBLISH_SUCCESS",
    uid,
    lessonId: id,
    publishedLessonId: id,
    ts: now,
    meta: { draftPath, visibility, isAdminPublish: isAdmin, effectiveOwnerId },
  });

  return NextResponse.json({
    ok: true,
    publishedLessonId: id,
    publishedId: id, // ✅ alias for klienter som forventer publishedId
  });
}
