// app/api/unpublish/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function bool(v: any) {
  return v === true;
}

export async function POST(req: Request) {
  const { auth, db } = getAdmin();

  // --- Auth ---
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // --- Input ---
  const body = await req.json().catch(() => ({}));
  const id = (body?.id || body?.lessonId) as string | undefined;         // published id (or legacy id)
  const draftId = (body?.draftId || body?.draftLessonId) as string | undefined; // draft id (recommended)
  if (!id) return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // --- Load user profile (for admin check + audit info) ---
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const profile: any = userSnap.exists ? userSnap.data() : {};
  const roles = profile?.roles || {};
  const isAdmin = bool(roles?.admin);

  // --- Decide which id to use for draft lookup ---
  const draftLookupId = draftId || id;

  // --- Load draft (lessons/{draftLookupId} primary, texts/{draftLookupId} fallback) ---
  const draftRefA = db.doc(`lessons/${draftLookupId}`);
  const draftSnapA = await draftRefA.get();

  const draftRefB = db.doc(`texts/${draftLookupId}`);
  const draftSnapB = draftSnapA.exists ? null : await draftRefB.get();

  const draftSnap = draftSnapA.exists ? draftSnapA : draftSnapB;
  const draftPath = draftSnapA.exists ? `lessons/${draftLookupId}` : draftSnapB?.exists ? `texts/${draftLookupId}` : null;

  if (!draftSnap || !draftSnap.exists) {
    await db.collection("auditEvents").add({
      type: "UNPUBLISH_BLOCKED",
      uid,
      lessonId: draftLookupId,
      ts: now,
      meta: { reason: "DRAFT_NOT_FOUND", draftId: draftLookupId, publishedId: id },
    });
    return NextResponse.json({ error: "Draft not found in lessons/ or texts/" }, { status: 404 });
  }

  const draft: any = draftSnap.data() || {};
  const ownerId = draft.ownerId;

  // --- Authorization: owner OR admin ---
  if (!isAdmin && ownerId !== uid) {
    await db.collection("auditEvents").add({
      type: "UNPUBLISH_BLOCKED",
      uid,
      lessonId: draftLookupId,
      ts: now,
      meta: { reason: "NOT_OWNER", draftPath, ownerId, draftId: draftLookupId, publishedId: id },
    });
    return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
  }

  const effectiveOwnerId = ownerId || uid;

  // --- Update published doc (use *id* as published doc id) ---
  const pubRef = db.doc(`published_lessons/${id}`);
  await pubRef.set(
    {
      ownerId: effectiveOwnerId,
      lessonId: draftLookupId, // keep a reference to draft id
      isActive: false,
      updatedAt: now,
      unpublishedAt: now,
      unpublishedBy: { uid, isAdmin },
    },
    { merge: true }
  );

  // --- Audit ---
  await db.collection("auditEvents").add({
    type: "UNPUBLISH_SUCCESS",
    uid,
    lessonId: draftLookupId,
    publishedLessonId: id,
    ts: now,
    meta: { draftPath, isAdminUnpublish: isAdmin, effectiveOwnerId, draftId: draftLookupId, publishedId: id },
  });

  return NextResponse.json({ ok: true, publishedId: id, draftId: draftLookupId });
}
