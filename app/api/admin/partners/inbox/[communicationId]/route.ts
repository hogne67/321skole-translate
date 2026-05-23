import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    communicationId?: string;
  }>;
};

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

function readString(v: unknown, maxLength = 200): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function readMessage(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 4000) : "";
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  const roles = isRecord(data.roles) ? data.roles : {};

  return data.role === "admin" || roles.admin === true;
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const adminUid = decoded.uid;

    if (!adminUid || !(await isAdminUser(db, adminUid))) {
      return json({ error: "No access (admin required)" }, 403);
    }

    const { communicationId: rawCommunicationId } = await context.params;
    const communicationId = readString(rawCommunicationId);
    if (!communicationId) return json({ error: "Missing communication ID" }, 400);

    const communicationRef = db.collection("partnerCommunications").doc(communicationId);
    const reviewedAt = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      const communicationSnap = await tx.get(communicationRef);
      if (!communicationSnap.exists) throw new Error("Communication not found");

      const communication = communicationSnap.data() ?? {};
      if (communication.type !== "partner_reply") {
        throw new Error("Only partner replies can be marked reviewed");
      }

      tx.set(
        communicationRef,
        {
          reviewedAt,
          reviewedBy: adminUid,
          updatedAt: reviewedAt,
        },
        { merge: true }
      );

      tx.set(db.collection("adminAuditEvents").doc(), {
        type: "partner_reply_reviewed",
        communicationId,
        targetUid: communication.targetUid ?? null,
        partnerId: communication.partnerId ?? null,
        applicationId: communication.applicationId ?? null,
        actorUid: adminUid,
        createdAt: reviewedAt,
      });
    });

    return json({ ok: true, communicationId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not mark reply reviewed" }, 500);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const adminUid = decoded.uid;

    if (!adminUid || !(await isAdminUser(db, adminUid))) {
      return json({ error: "No access (admin required)" }, 403);
    }

    const { communicationId: rawCommunicationId } = await context.params;
    const communicationId = readString(rawCommunicationId);
    if (!communicationId) return json({ error: "Missing communication ID" }, 400);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reply = readMessage(body.message);
    if (!reply) return json({ error: "Message is required" }, 400);

    const originalRef = db.collection("partnerCommunications").doc(communicationId);
    const responseRef = db.collection("partnerCommunications").doc();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      const originalSnap = await tx.get(originalRef);
      if (!originalSnap.exists) throw new Error("Communication not found");

      const original = originalSnap.data() ?? {};
      if (original.type !== "partner_reply") {
        throw new Error("Only partner replies can be answered from inbox");
      }

      tx.set(responseRef, {
        partnerId: original.partnerId ?? null,
        applicationId: original.applicationId ?? null,
        targetUid: original.targetUid ?? null,
        type: "admin_note",
        visibility: "partner_visible",
        message: reply,
        createdBy: adminUid,
        inReplyTo: communicationId,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(
        originalRef,
        {
          reviewedAt: now,
          reviewedBy: adminUid,
          answeredAt: now,
          answeredBy: adminUid,
          answerCommunicationId: responseRef.id,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(db.collection("adminAuditEvents").doc(), {
        type: "partner_reply_answered",
        communicationId,
        responseCommunicationId: responseRef.id,
        targetUid: original.targetUid ?? null,
        partnerId: original.partnerId ?? null,
        applicationId: original.applicationId ?? null,
        actorUid: adminUid,
        createdAt: now,
      });
    });

    return json({ ok: true, communicationId, responseCommunicationId: responseRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not answer partner reply" }, 500);
  }
}
