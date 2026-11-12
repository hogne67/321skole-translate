import { accountErrorStatus } from "@/lib/security/accountAccess.server";
// app/api/unpublish/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { assertPublishedBinding, PublicationAccessError } from "@/lib/security/publicationAccess.server";

function bool(v: unknown) {
  return v === true;
}

function toErrorString(err: unknown): string {
  if (!err) return "Unpublish failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Unpublish failed";
  }
  return "Unpublish failed";
}

export async function POST(req: Request) {
  try {
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
    } catch (err: unknown) {
      console.error("unpublish: verifyIdToken failed", toErrorString(err));
      return NextResponse.json({ error: "Invalid token" }, { status: (accountErrorStatus(err) ?? 401) });
    }

    // --- Input ---
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const publishedIdRaw = body.id ?? body.lessonId;
    const draftIdRaw = body.draftId ?? body.draftLessonId;

    const publishedId = typeof publishedIdRaw === "string" ? publishedIdRaw : undefined; // published doc id
    const draftId = typeof draftIdRaw === "string" ? draftIdRaw : undefined; // preferred

    if (!publishedId) {
      return NextResponse.json({ error: "Missing id/lessonId" }, { status: 400 });
    }

    let draftLookupId = draftId || publishedId;
    const now = FieldValue.serverTimestamp();

    // --- Load user profile (admin check) ---
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const profile = ((userSnap.exists ? userSnap.data() : {}) ?? {}) as Record<string, unknown>;
    const roles = (profile.roles ?? {}) as Record<string, unknown>;
    const isAdmin = bool(roles.admin) || profile.role === "admin";
    const pubRef = db.doc(`published_lessons/${publishedId}`);
    const pubSnap = await pubRef.get();
    if (!pubSnap.exists) return NextResponse.json({ error: "Published copy not found" }, { status: 404 });
    const published = pubSnap.data()!;
    if (!isAdmin && published.ownerId !== uid) return NextResponse.json({ error: "Not owner of published copy" }, { status: 403 });
    if (typeof published.lessonId === "string" && published.lessonId) {
      if (draftId && draftId !== published.lessonId) return NextResponse.json({ error: "Draft binding mismatch" }, { status: 403 });
      draftLookupId = published.lessonId;
    }

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
    let ownerId: string | null = null;

    if (draftSnap?.exists) {
      const draft = ((draftSnap.data() ?? {}) as Record<string, unknown>) || {};
      const owner = draft.ownerId;
      ownerId = typeof owner === "string" ? owner : null;

      if (!isAdmin && ownerId !== uid) {
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

    const effectiveOwnerId = published.ownerId ?? null;

    // --- Update published doc ---
    await db.runTransaction(async tx => {
      const current = await tx.get(pubRef);
      const draft = draftSnap?.exists ? await tx.get(draftSnap.ref) : null;
      if (!current.exists || !current.updateTime?.isEqual(pubSnap.updateTime!)) throw new PublicationAccessError("Published copy changed; try again", 409);
      if (!isAdmin && current.get("ownerId") !== uid) throw new PublicationAccessError();
      if (draft?.exists) assertPublishedBinding(current.data(), draft.get("ownerId"), draftLookupId);
      tx.update(pubRef, {
        isActive: false,
        status: "draft",
        updatedAt: now,
        unpublishedAt: now,
        unpublishedBy: { uid, isAdmin },
      });

      if (draft?.exists && (!draft.get("activePublishedId") || draft.get("activePublishedId") === publishedId)) {
        tx.set(draft.ref, {
          status: "draft",
          activePublishedId: null,
          publish: {
            state: "draft",
          },
          updatedAt: now,
        }, { merge: true });
      }
    });

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
        publishedId,
        draftMissing: !draftSnap?.exists,
      },
    });

    return NextResponse.json({ ok: true, publishedId, draftId: draftLookupId });
  } catch (err: unknown) {
    console.error("unpublish: fatal", err instanceof Error ? err.stack || err.message : String(err));
    return NextResponse.json(
      { error: toErrorString(err) },
      { status: err instanceof PublicationAccessError ? err.status : (accountErrorStatus(err) ?? 500) }
    );
  }
}
