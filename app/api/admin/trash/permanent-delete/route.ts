// app/api/admin/trash/permanent-delete/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const d = (snap.data() ?? {}) as Record<string, unknown>;

  if (typeof d.role === "string" && d.role === "admin") return true;

  const roles = d.roles;
  if (isRecord(roles) && roles.admin === true) return true;

  return false;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const admin = await isAdminUser(db, uid);
    if (!admin) return json({ error: "No access (admin required)" }, 403);

    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return json({ error: "Missing body.id" }, 400);

    const lessonRef = db.collection("lessons").doc(id);
    const pubRef = db.collection("published_lessons").doc(id);

    // (valgfritt) sikkerhet: kun tillat permanent delete hvis deletedAt != null
    const lessonSnap = await lessonRef.get();
    if (!lessonSnap.exists) return json({ error: "Lesson not found" }, 404);

    const d = (lessonSnap.data() ?? {}) as Record<string, unknown>;
    if (d.deletedAt == null) {
      return json({ error: "Refusing permanent delete: lesson is not in trash (deletedAt is null)" }, 400);
    }

    // Logg “tombstone” først (valgfritt, men nyttig)
    // Du kan senere ha en egen collection for auditEvents.
    await db.collection("auditEvents").add({
      type: "admin_permanent_delete_lesson",
      actorUid: uid,
      lessonId: id,
      at: FieldValue.serverTimestamp(),
    });

    // Best effort: remove published snapshot
    try {
      await pubRef.delete();
    } catch {
      // ignore
    }

    // Hard delete draft
    await lessonRef.delete();

    return json({ ok: true, id }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Permanent delete failed" }, 500);
  }
}