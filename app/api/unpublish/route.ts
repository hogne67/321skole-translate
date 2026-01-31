// app/api/unpublish/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function bool(v: any) {
  return v === true;
}

export async function POST(req: Request) {
  try {
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
    } catch (e: any) {
      console.error("unpublish: verifyIdToken failed", e?.message || e);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const publishedId = (body?.id || body?.lessonId) as string | undefined; // published doc id (legacy: same as draft)
    const draftId = (body?.draftId || body?.draftLessonId) as string | undefined; // preferred
    if (!publishedId) {
      return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });
    }

    const draftLookupId = draftId || publishedId;
    const now = FieldValue.serverTimestamp();

    // --- Load user profile (admin check) ---
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const profile: any = userSnap.exists ? userSnap.data() : {};
    const roles = profile?.roles || {};
    const isAdmin = bool(roles?.admin);

    // --- Load draft (lessons/{draftLookupId} primary, texts/{draftLookupId} fallback) ---
    const draftRefA = db.doc(`lessons/${draftLookupId}`);
    const draftSnapA = await draftRefA.get();

    const draftRefB = db.doc(`texts/${draftLookupId}`);
    const draftSnapB = draftSnapA.exists ? null : await draftRefB.get();

    const draftSnap = draftSnapA.exists ? draftSnapA : draftSnapB;
    const draftPath = draftSnapA.exists
      ? `lessons/${draftLookupId}`
      : draftSnapB?.exists
      ? `texts/${draftLookupId}`
      : null;

    // If draft is missing, we still allow unpublish of the published doc
    // (useful if draft was deleted/archived).
    let ownerId: string | null = null;
    if (draftSnap?.exists) {
      const draft: any = draftSnap.data() || {};
      ownerId = draft?.ownerId || null;

      if (!isAdmin && ownerId && ownerId !== uid) {
        await db.collection("auditEvents").add({
          type: "UNPUBLISH_BLOCKED",
          uid,
          lessonId: draftLookupId,
          ts: now,
          meta: { reason: "NOT_OWNER", draftPath, ownerId, draftId: draftLookupId, publishedId },
        });

        return NextResponse.json({ error: "Not owner of draft" }, { status: 403 });
      }
    }

    const effectiveOwnerId = ownerId || uid;

    // --- Update published doc ---
    const pubRef = db.doc(`published_lessons/${publishedId}`);
    await pubRef.set(
      {
        ownerId: effectiveOwnerId,
        lessonId: draftLookupId,
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
      publishedLessonId: publishedId,
      ts: now,
      meta: {
        draftPath,
        isAdminUnpublish: isAdmin,
        effectiveOwnerId,
        draftId: draftLookupId,
        publishedId: publishedId,
        draftMissing: !draftSnap?.exists,
      },
    });

    return NextResponse.json({ ok: true, publishedId: publishedId, draftId: draftLookupId });
  } catch (e: any) {
    // ✅ Always return a helpful error (so client sees reason, not just 500)
    console.error("unpublish: fatal", e?.stack || e?.message || e);
    return NextResponse.json(
      { error: e?.message || "Unpublish failed (server error)" },
      { status: 500 }
    );
  }
}
