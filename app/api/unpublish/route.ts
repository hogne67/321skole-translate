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
  const id = (body?.id || body?.lessonId) as string | undefined;
  if (!id) return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // --- Load user profile (for admin check + audit info) ---
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const profile: any = userSnap.exists ? userSnap.data() : {};
  const roles = profile?.roles || {};
  const isAdmin = bool(roles?.admin);

  // --- Load draft (lessons/{id} primary, texts/{id} fallback) ---
  const draftRefA = db.doc(`lessons/${id}`);
  const draftSnapA = await draftRefA.get();

  const draftRefB = db.doc(`texts/${id}`);
  const draftSnapB = draftSnapA.exists ? null : await draftRefB.get();

  const draftSnap = draftSnapA.exists ? draftSnapA : draftSnapB;
  const draftPath = draftSnapA.exists ? `lessons/${id}` : draftSnapB?.exists ? `texts/${id}` : null;

  if (!draftSnap || !draftSnap.exists) {
    await db.collection("auditEvents").add({
      type: "UNPUBLISH_BLOCKED",
      uid,
      lessonId: id,
      ts: now,
      meta: { reason: "DRAFT_NOT_FOUND" },
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
      lessonId: id,
      ts: now,
      meta: { reason: "NOT_OWNER", draftPath, ownerId },
    });
    return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
  }

  const effectiveOwnerId = ownerId || uid;

  // --- Update published doc ---
  const pubRef = db.doc(`published_lessons/${id}`);
  await pubRef.set(
    {
      ownerId: effectiveOwnerId,
      lessonId: id,
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
    lessonId: id,
    publishedLessonId: id,
    ts: now,
    meta: { draftPath, isAdminUnpublish: isAdmin, effectiveOwnerId },
  });

  return NextResponse.json({ ok: true });
}
