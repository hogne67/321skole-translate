// app/api/admin/review/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function bool(v: unknown): boolean {
  return v === true;
}

type ReviewAction = "approve" | "reject";

function isReviewAction(v: unknown): v is ReviewAction {
  return v === "approve" || v === "reject";
}

export async function POST(req: Request) {
  const { auth, db } = getAdmin();

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  const decoded = await auth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const uid = decoded.uid;

  // Sjekk admin
  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = ((userSnap.exists ? userSnap.data() : {}) ?? {}) as Record<string, unknown>;
  const roles = (profile.roles ?? {}) as Record<string, unknown>;
  const isAdmin = bool(roles.admin);
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  const actionRaw = body.action;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!isReviewAction(actionRaw)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const action: ReviewAction = actionRaw;
  const now = FieldValue.serverTimestamp();

  // Load draft
  const draftRef = db.doc(`lessons/${id}`);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const item = ((draftSnap.data() ?? {}) as Record<string, unknown>) || {};

  if (action === "approve") {
    const title = String(item.title ?? "").trim();
    const sourceText = String((item.sourceText ?? item.text) ?? "").trim();

    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    if (!sourceText) return NextResponse.json({ error: "Missing sourceText" }, { status: 400 });

    const topic = String(item.topic ?? "").trim();
    const topics = Array.isArray(item.topics)
      ? item.topics
      : topic
        ? [topic]
        : [];

    const moderation =
      item.moderation && typeof item.moderation === "object"
        ? (item.moderation as Record<string, unknown>)
        : {};

    // Write published copy (server – bypass rules)
    await db.doc(`published_lessons/${id}`).set(
      {
        title,
        description: String(item.description ?? "").trim() || "",
        level: String(item.level ?? "").trim() || "",
        language: String(item.language ?? "").trim() || "",
        topic,
        topics,
        textType: String((item.textType ?? item.texttype) ?? "").trim() || "",
        texttype: String((item.texttype ?? item.textType) ?? "").trim() || "",
        sourceText,
        tasks: Array.isArray(item.tasks) ? item.tasks : [],
        coverImageUrl: typeof item.coverImageUrl === "string" ? item.coverImageUrl : "",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
        ownerId: typeof item.ownerId === "string" ? item.ownerId : "",
        lessonId: id,
        isActive: true,
        publish: { state: "published", visibility: "public" },
        moderation: {
          ...moderation,
          reviewedBy: uid,
          reviewedAt: now,
        },
        status: "published",
        publishedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    // Mark draft
    await draftRef.update({
      "publish.state": "published",
      status: "published",
      "publish.reviewedBy": uid,
      "publish.reviewedAt": now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true });
  }

  // action === "reject"
  await draftRef.update({
    "publish.state": "rejected",
    status: "draft",
    "publish.reviewedBy": uid,
    "publish.reviewedAt": now,
    updatedAt: now,
  });

  // Deactivate published copy (if exists)
  await db.doc(`published_lessons/${id}`).set({ isActive: false, updatedAt: now }, { merge: true });

  return NextResponse.json({ ok: true });
}
