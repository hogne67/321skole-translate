import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type AdminProfile = {
  role?: unknown;
  roles?: unknown;
  adminLevel?: unknown;
  disabled?: unknown;
};

type SerializedSupportTicket = {
  id: string;
  status?: unknown;
} & Record<string, unknown>;

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

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

async function readAdmin(req: Request): Promise<{ uid: string; profile: AdminProfile | null }> {
  const token = bearerToken(req);
  if (!token) throw new Error("Missing Authorization Bearer token");

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  if (!uid) throw new Error("Unauthorized");

  const snap = await db.collection("users").doc(uid).get();
  const profile = snap.exists ? ((snap.data() ?? {}) as AdminProfile) : null;
  if (!isAdminProfile(profile)) throw new Error("No access (admin required)");

  return { uid, profile };
}

export async function GET(req: Request) {
  try {
    await readAdmin(req);
    const { db } = getAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const collection = db.collection("supportTickets");

    const [ticketsSnap, newSnap, openSnap] = await Promise.all([
      collection.orderBy("createdAt", "desc").limit(200).get(),
      collection.where("status", "==", "new").count().get(),
      collection.where("status", "in", ["new", "in_progress"]).count().get(),
    ]);

    const tickets = ticketsSnap.docs
      .map(
        (doc): SerializedSupportTicket => ({
        id: doc.id,
        ...(serialize(doc.data() ?? {}) as Record<string, unknown>),
        })
      )
      .filter((ticket) => {
        if (!status || status === "all") return true;
        return ticket.status === status;
      })
      .slice(0, 100);

    return json({
      ok: true,
      stats: {
        new: newSnap.data().count,
        open: openSnap.data().count,
      },
      tickets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load support tickets";
    const status = message.includes("No access") ? 403 : message.includes("Authorization") ? 401 : 500;
    return json({ error: message }, status);
  }
}
