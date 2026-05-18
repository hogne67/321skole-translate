import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

type CurrentRole = "teacher" | "parent" | "student" | "other";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function readString(v: unknown, maxLength: number): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function readLanguages(v: unknown): string[] {
  const values = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(",")
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => readString(item, 40))
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function readCurrentRole(v: unknown): CurrentRole {
  if (v === "teacher" || v === "parent" || v === "student" || v === "other") return v;
  return "other";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = readString(body.email, 160) || readString(decoded.email, 160);
    const name = readString(body.name, 120);
    const city = readString(body.city, 80);
    const country = readString(body.country, 80);
    const languages = readLanguages(body.languages);
    const currentRole = readCurrentRole(body.currentRole);

    if (!name) return json({ error: "Name is required" }, 400);
    if (!email) return json({ error: "Email is required" }, 400);
    if (!city) return json({ error: "City/place is required" }, 400);
    if (!country) return json({ error: "Country is required" }, 400);
    if (languages.length === 0) return json({ error: "At least one language is required" }, 400);

    const userRef = db.collection("users").doc(uid);
    const applicationRef = db.collection("partnerApplications").doc();

    await db.runTransaction(async (tx) => {
      tx.set(applicationRef, {
        uid,
        email,
        name,
        city,
        country,
        languages,
        currentRole,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        userRef,
        {
          email,
          displayName: name,
          partnerStatus: "pending",
          partnerAccess: false,
          partnerLevel: "none",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return json({ ok: true, id: applicationRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Partner application failed" }, 500);
  }
}
