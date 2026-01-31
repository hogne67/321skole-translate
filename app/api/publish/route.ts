// app/api/publish/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
export const runtime = "nodejs";


type Visibility = "public" | "unlisted" | "private";

function pickVisibility(v: any): Visibility {
  return v === "unlisted" || v === "private" || v === "public" ? v : "public";
}

function bool(v: any) {
  return v === true;
}

export async function POST(req: Request) {
  const { auth, db } = getAdmin();

  // --- Auth ---
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json(
      { error: "Missing Authorization Bearer token" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Input ---
  const body = await req.json().catch(() => ({}));
  const id = (body?.id || body?.lessonId) as string | undefined;
  const visibility = pickVisibility(body?.visibility);

  if (!id) return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // --- Load user profile ---
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return NextResponse.json(
      { error: `Missing user profile (users/${uid})` },
      { status: 400 }
    );
  }

  const profile: any = userSnap.data() || {};

  const roles = profile?.roles || {};
  const caps = profile?.caps || {};

  const isAdmin = bool(roles?.admin);
  const isApprovedTeacher = profile?.teacherStatus === "approved";

  // MVP/Policy:
  // - Admin kan alltid publisere
  // - "Approved teacher" kan publisere (uavhengig av caps.publish)
  // - caps.publish beholdes som "feature flag" (valgfritt), men er ikke nødvendig her
  const canPublish = isAdmin || isApprovedTeacher || bool(caps?.publish);

  // Optional attestation (NOT required in MVP)
  const att = profile?.publisherAttestation;

  // --- Authorization rules ---
  if (!canPublish) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: {
        reason: "NOT_ALLOWED_TO_PUBLISH",
        rolesAdmin: !!roles?.admin,
        teacherStatus: profile?.teacherStatus ?? null,
        capsPublish: !!caps?.publish,
      },
    });

    return NextResponse.json(
      {
        error:
          "Publishing not allowed (requires teacherStatus=approved, caps.publish=true, or admin). " +
          `teacherStatus=${String(profile?.teacherStatus)} roles.admin=${String(
            !!roles?.admin
          )} caps.publish=${String(!!caps?.publish)}`,
      },
      { status: 403 }
    );
  }

  // --- Load draft ---
  // Primary: lessons/{id}. Fallback: texts/{id}
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
    return NextResponse.json(
      { error: "Draft not found in lessons/ or texts/" },
      { status: 404 }
    );
  }

  const draft: any = draftSnap.data() || {};
  const ownerId = draft.ownerId;

  // MVP: Ikke-admin kan kun publisere egne utkast
  if (!isAdmin && ownerId !== uid) {
    await db.collection("auditEvents").add({
      type: "PUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: { reason: "NOT_OWNER", draftPath, ownerId },
    });
    return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
  }

  // Hvis admin publiserer andres draft: "effectiveOwnerId" settes til draft.ownerId
  const effectiveOwnerId = ownerId || uid;

  // --- Build published doc (signed snapshot) ---
  const publishedRef = db.doc(`published_lessons/${id}`);

  const signedBy = {
    uid,
    nameSnapshot: profile.displayName ?? "",
    emailSnapshot: profile.email ?? "",
    orgSnapshot: profile.org ?? {},
    attestationVersion: typeof att?.version === "number" ? att.version : null,
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
