import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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

function readString(v: unknown, maxLength = 1000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function isAdminProfile(data: Record<string, unknown>): boolean {
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

async function requireActivePartner(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const authEmail = readString(decoded.email, 160).toLowerCase();
  if (!uid) return { error: json({ error: "Unauthorized" }, 401) };

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const profileEmail = readString(userData.email, 160).toLowerCase();

  if (isAdminProfile(userData)) {
    return { error: json({ error: "Admin users cannot use partner tools" }, 403) };
  }

  if (authEmail && profileEmail && authEmail !== profileEmail) {
    return { error: json({ error: "Profile email does not match the signed-in account" }, 409) };
  }

  if (userData.partnerAccess !== true || userData.partnerStatus !== "active") {
    return { error: json({ error: "No active partner access" }, 403) };
  }

  return { db };
}

export async function GET(req: Request) {
  try {
    const partner = await requireActivePartner(req);
    if ("error" in partner) return partner.error;

    const snap = await partner.db.collection("partnerProgram").doc("monthlyFocus").get();

    return json({
      ok: true,
      focus: snap.exists ? toJsonSafe(snap.data() ?? {}) : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner focus" }, 500);
  }
}
