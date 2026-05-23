import "server-only";

import { FieldValue } from "firebase-admin/firestore";
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

function readString(v: unknown, maxLength = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

async function requireActivePartner(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  if (!uid) return { error: json({ error: "Unauthorized" }, 401) };

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};

  if (userData.partnerAccess !== true || userData.partnerStatus !== "active") {
    return { error: json({ error: "No active partner access" }, 403) };
  }

  return { db, uid };
}

export async function GET(req: Request) {
  try {
    const partner = await requireActivePartner(req);
    if ("error" in partner) return partner.error;

    const { db, uid } = partner;

    const messagesSnap = await db
      .collection("partnerCommunications")
      .where("targetUid", "==", uid)
      .where("visibility", "==", "partner_visible")
      .limit(50)
      .get();

    const messages = messagesSnap.docs
      .map(
        (doc): Record<string, unknown> & { id: string } => ({
          id: doc.id,
          ...toJsonSafe(doc.data() ?? {}),
        })
      )
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    return json({
      ok: true,
      messages,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner messages" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const partner = await requireActivePartner(req);
    if ("error" in partner) return partner.error;

    const { db, uid } = partner;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = readString(body.message, 4000);

    if (!message) return json({ error: "Message is required" }, 400);

    const createdAt = FieldValue.serverTimestamp();
    const communicationRef = db.collection("partnerCommunications").doc();

    await db.runTransaction(async (tx) => {
      tx.set(communicationRef, {
        targetUid: uid,
        type: "partner_reply",
        visibility: "partner_visible",
        message,
        createdBy: uid,
        createdByRole: "partner",
        createdAt,
        updatedAt: createdAt,
      });

      tx.set(db.collection("adminAuditEvents").doc(), {
        type: "partner_reply_added",
        targetUid: uid,
        communicationId: communicationRef.id,
        actorUid: uid,
        createdAt,
      });
    });

    return json({ ok: true, id: communicationRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not send partner reply" }, 500);
  }
}
