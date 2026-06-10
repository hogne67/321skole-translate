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

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) return json({ error: "Missing auth token" }, 401);

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    return json({ ok: true, skipped: "missing-profile" });
  }

  await ref.update({
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  return json({ ok: true });
}
