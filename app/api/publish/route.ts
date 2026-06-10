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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isTeacherProfile(profile: Record<string, unknown>): boolean {
  const role = String(profile.role ?? "").toLowerCase();
  if (role === "teacher") return true;

  const roles = isRecord(profile.roles) ? (profile.roles as Record<string, unknown>) : null;
  return roles ? bool(roles.teacher) : false;
}

function isAdminProfile(profile: Record<string, unknown>): boolean {
  const role = String(profile.role ?? "").toLowerCase();
  if (role === "admin") return true;

  const roles = isRecord(profile.roles) ? (profile.roles as Record<string, unknown>) : null;
  return roles ? bool(roles.admin) : false;
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
  const draftId = typeof idRaw === "string" ? idRaw : undefined;

  const visibility = pickVisibility(body.visibility);

  if (!draftId) return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // --- Load user profile ---
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: `Missing user profile (users/${uid})` }, { status: 400 });
  }

  const profile = ((userSnap.data() ?? {}) as Record<string, unknown>) || {};
  const caps = isRecord(profile.caps) ? (profile.caps as Record<string, unknown>) : {};
  const canPublishByCaps = bool(caps.publish);

  const isAdmin = isAdminProfile(profile);
  const isTeacher = isTeacherProfile(profile);

  // ✅ Authorization: admin OR teacher OR caps.publish
  const canPublish = isAdmin || isTeacher || canPublishByCaps;

  if (!canPublish) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: draftId,
      ts: now,
      meta: {
        reason: "NOT_ALLOWED_TO_PUBLISH",
        role: profile.role ?? null,
        rolesAdmin: isRecord(profile.roles) ? bool((profile.roles as Record<string, unknown>).admin) : false,
        rolesTeacher: isRecord(profile.roles) ? bool((profile.roles as Record<string, unknown>).teacher) : false,
        capsPublish: canPublishByCaps,
      },
    });

    return NextResponse.json(
      {
        error:
          "Publishing not allowed (requires role=teacher, roles.teacher=true, caps.publish=true, or admin). " +
          `role=${String(profile.role)} admin=${String(isAdmin)} teacher=${String(isTeacher)} caps.publish=${String(
            canPublishByCaps
          )}`,
      },
      { status: 403 }
    );
  }

  // --- Load draft ---
  const draftRefA = db.doc(`lessons/${draftId}`);
  const draftSnapA = await draftRefA.get();

  const draftRefB = db.doc(`texts/${draftId}`);
  const draftSnapB = draftSnapA.exists ? null : await draftRefB.get();

  const draftSnap = draftSnapA.exists ? draftSnapA : draftSnapB;
  const draftPath = draftSnapA.exists
    ? `lessons/${draftId}`
    : draftSnapB?.exists
      ? `texts/${draftId}`
      : null;

  if (!draftSnap || !draftSnap.exists) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: draftId,
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
      lessonId: draftId,
      ts: now,
      meta: { reason: "NOT_OWNER", draftPath, ownerId },
    });
    return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
  }

  const effectiveOwnerId = ownerId || uid;

  // --- Build published doc (signed snapshot) ---
  const publishedRef = db.collection("published_lessons").doc();
  const publishedId = publishedRef.id;

  const att =
    profile.publisherAttestation && typeof profile.publisherAttestation === "object"
      ? (profile.publisherAttestation as Record<string, unknown>)
      : null;

  const signedBy = {
    uid,
    nameSnapshot: typeof profile.displayName === "string" ? profile.displayName : "",
    emailSnapshot: typeof profile.email === "string" ? profile.email : "",
    orgSnapshot:
      profile.org && typeof profile.org === "object" ? (profile.org as Record<string, unknown>) : {},
    attestationVersion: att && typeof att.version === "number" ? att.version : null,
    signedAt: now,
    viaAdmin: isAdmin && effectiveOwnerId !== uid,
  };

  const publishedDoc = {
    ...draft,

    // Correct linkage
    lessonId: draftId,
    publishedId,
    ownerId: effectiveOwnerId,
    isActive: true,

    // Publish metadata
    visibility,
    publishVisibility: visibility,
    showInLibrary: visibility === "public" ? draft.showInLibrary !== false : false,
    publishedAt: now,
    updatedAt: now,

    signedBy,

    moderation: {
      status: "pending",
      checkedAt: now,
      model: "none-yet",
    },
  };

  await publishedRef.set(publishedDoc, { merge: true });

  await db.collection("auditEvents").add({
    type: "PUBLISH_SUCCESS",
    uid,
    lessonId: draftId,
    publishedLessonId: publishedId,
    ts: now,
    meta: { draftPath, visibility, isAdminPublish: isAdmin, effectiveOwnerId },
  });

  return NextResponse.json({
    ok: true,
    publishedLessonId: publishedId,
    publishedId,
    lessonId: draftId,
  });
}
