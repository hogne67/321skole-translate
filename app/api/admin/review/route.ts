// app/api/admin/review/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function bool(v: any) {
  return v === true;
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
  const profile: any = userSnap.exists ? userSnap.data() : {};
  const isAdmin = bool(profile?.roles?.admin);
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  const action = body?.action; // "approve" | "reject"
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const now = FieldValue.serverTimestamp();

  // Load draft
  const draftRef = db.doc(`lessons/${id}`);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const item: any = draftSnap.data() || {};

  if (action === "approve") {
    const title = String(item.title ?? "").trim();
    const sourceText = String(item.sourceText ?? item.text ?? "").trim();
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    if (!sourceText) return NextResponse.json({ error: "Missing sourceText" }, { status: 400 });

    // Write published copy (server – bypass rules)
    await db.doc(`published_lessons/${id}`).set(
      {
        title,
        description: String(item.description ?? "").trim() || "",
        level: String(item.level ?? "").trim() || "",
        language: String(item.language ?? "").trim() || "",
        topic: String(item.topic ?? "").trim() || "",
        topics: Array.isArray(item.topics) ? item.topics : (item.topic ? [item.topic] : []),
        textType: String(item.textType ?? item.texttype ?? "").trim() || "",
        texttype: String(item.texttype ?? item.textType ?? "").trim() || "",
        sourceText,
        tasks: item.tasks ?? [],
        coverImageUrl: item.coverImageUrl ?? "",
        imageUrl: item.imageUrl ?? "",
        ownerId: item.ownerId ?? "",
        lessonId: id,
        isActive: true,
        publish: { state: "published", visibility: "public" },
        moderation: {
          ...(item.moderation || {}),
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

  if (action === "reject") {
    await draftRef.update({
      "publish.state": "rejected",
      status: "draft",
      "publish.reviewedBy": uid,
      "publish.reviewedAt": now,
      updatedAt: now,
    });

    // Deactivate published copy (if exists)
    await db.doc(`published_lessons/${id}`).set(
      { isActive: false, updatedAt: now },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
