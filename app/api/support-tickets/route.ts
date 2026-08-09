import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const CATEGORY_IDS = new Set([
  "payment",
  "login",
  "content",
  "privacy",
  "bug",
  "other",
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function readString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function categoryId(value: unknown): string {
  const raw = readString(value, 40);
  return CATEGORY_IDS.has(raw) ? raw : "other";
}

export async function POST(req: Request) {
  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = readString(body.message, 4000);
    if (message.length < 5) return json({ error: "Message is required" }, 400);

    const userSnap = await db.collection("users").doc(uid).get();
    const profile = userSnap.data() ?? {};
    const now = FieldValue.serverTimestamp();
    const ticketRef = db.collection("supportTickets").doc();

    await ticketRef.set({
      uid,
      status: "new",
      source: "in_app_help_button",
      category: categoryId(body.category),
      message,
      name:
        readString(body.name, 160) ||
        readString(profile.displayName, 160) ||
        readString(decoded.name, 160),
      contact:
        readString(body.contact, 220) ||
        readString(profile.email, 220) ||
        readString(decoded.email, 220),
      role: readString(profile.role, 40),
      plan: readString(profile.plan, 40),
      schoolId: readString(profile.schoolId, 120),
      schoolRole: readString(profile.schoolRole, 80),
      locale: readString(body.locale, 20),
      page: readString(body.page, 500),
      userAgent: readString(req.headers.get("user-agent"), 500),
      isAnonymous: decoded.firebase?.sign_in_provider === "anonymous",
      createdAt: now,
      updatedAt: now,
    });

    return json({ ok: true, id: ticketRef.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send support ticket";
    console.error("support ticket failed:", error);
    return json({ error: message }, 500);
  }
}
