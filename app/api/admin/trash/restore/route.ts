// app/api/admin/trash/restore/route.ts
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
    await lessonRef.update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      "trash.restoredBy": uid,
      "trash.restoredAt": FieldValue.serverTimestamp(),
    });

    return json({ ok: true, id }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Restore failed" }, 500);
  }
}