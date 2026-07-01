import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { hasAdminAccess } from "@/lib/courses/academyAccess";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function readBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dateIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    }
  }

  return null;
}

async function requireAdmin(req: NextRequest) {
  const token = readBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const profileSnap = await db.collection("users").doc(decoded.uid).get();
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};

  if (decoded.admin !== true && !hasAdminAccess(profile)) {
    return { error: json({ error: "Admin access required" }, 403) };
  }

  return { db, uid: decoded.uid };
}

function serializeOrder(id: string, data: FirebaseFirestore.DocumentData) {
  const payout = isRecord(data.payout) ? data.payout : {};
  const payoutRelease = isRecord(data.payoutRelease) ? data.payoutRelease : {};

  return {
    id,
    courseId: safeString(data.courseId),
    courseTitle: safeString(data.courseTitle),
    ownerUid: safeString(data.ownerUid),
    buyerUid: safeString(data.buyerUid),
    buyerEmail: safeString(data.buyerEmail),
    status: safeString(data.status),
    payoutStatus: safeString(data.payoutStatus),
    payoutTransferMode: safeString(data.payoutTransferMode),
    currency: safeString(data.currency) || "NOK",
    grossAmountOre: safeNumber(payout.grossAmountOre),
    instructorAmountOre: safeNumber(payout.instructorAmountOre),
    applicationFeeAmountOre: safeNumber(payout.applicationFeeAmountOre),
    firstReleaseAmountOre: safeNumber(payoutRelease.firstReleaseAmountOre),
    holdbackAmountOre: safeNumber(payoutRelease.holdbackAmountOre),
    complaintWindowHours: safeNumber(payoutRelease.complaintWindowHours),
    adminNote: safeString(data.adminNote),
    stripeCheckoutSessionId: safeString(data.stripeCheckoutSessionId),
    stripePaymentIntentId: safeString(data.stripePaymentIntentId),
    createdAt: dateIso(data.createdAt),
    paidAt: dateIso(data.paidAt),
    updatedAt: dateIso(data.updatedAt),
    payoutUpdatedAt: dateIso(data.payoutUpdatedAt),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireAdmin(req);
    if ("error" in access) return access.error;

    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") || 50);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitParam) ? limitParam : 50));

    const snap = await access.db
      .collection("courseOrders")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return json({ orders: snap.docs.map((doc) => serializeOrder(doc.id, doc.data())) }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load academy orders";
    return json({ error: message }, 500);
  }
}
