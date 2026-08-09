import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const STATUSES = new Set(["new", "in_progress", "done", "closed"]);

type AdminProfile = {
  role?: unknown;
  roles?: unknown;
  disabled?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isAdminProfile(profile: AdminProfile | null): boolean {
  if (!profile || profile.disabled === true) return false;
  const roles = isRecord(profile.roles) ? profile.roles : {};
  return profile.role === "admin" || roles.admin === true;
}

async function readAdminUid(req: Request): Promise<string> {
  const token = bearerToken(req);
  if (!token) throw new Error("Missing Authorization Bearer token");

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  if (!uid) throw new Error("Unauthorized");

  const snap = await db.collection("users").doc(uid).get();
  const profile = snap.exists ? ((snap.data() ?? {}) as AdminProfile) : null;
  if (!isAdminProfile(profile)) throw new Error("No access (admin required)");

  return uid;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) {
  try {
    const adminUid = await readAdminUid(req);
    const { ticketId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";

    if (!STATUSES.has(status)) return json({ error: "Invalid status" }, 400);

    const { db } = getAdmin();
    await db.collection("supportTickets").doc(ticketId).set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        handledBy: adminUid,
        handledAt: status === "done" || status === "closed" ? FieldValue.serverTimestamp() : null,
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update support ticket";
    const status = message.includes("No access") ? 403 : message.includes("Authorization") ? 401 : 500;
    return json({ error: message }, status);
  }
}
