import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  const roles = isRecord(data.roles) ? data.roles : {};

  return data.role === "admin" || roles.admin === true;
}

function toJsonSafe(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (isRecord(value) && typeof value.toDate === "function") {
        return [key, value.toDate().toISOString()];
      }

      return [key, value];
    })
  );
}

type PartnerApplicationItem = {
  id: string;
  createdAt?: unknown;
} & Record<string, unknown>;

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const reviewerUid = decoded.uid;

    if (!reviewerUid || !(await isAdminUser(db, reviewerUid))) {
      return json({ error: "No access (admin required)" }, 403);
    }

    const snap = await db
      .collection("partnerApplications")
      .where("status", "==", "pending")
      .limit(100)
      .get();

    const items: PartnerApplicationItem[] = snap.docs
      .map(
        (doc): PartnerApplicationItem => ({
          id: doc.id,
          ...toJsonSafe(doc.data() ?? {}),
        })
      )
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    return json({
      ok: true,
      items,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner applications" }, 500);
  }
}
