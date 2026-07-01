import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { hasAdminAccess } from "@/lib/courses/academyAccess";

export const runtime = "nodejs";

type AdminOrderAction =
  | "hold"
  | "mark_disputed"
  | "mark_refund_pending"
  | "mark_refunded"
  | "mark_partially_released"
  | "mark_released";

const ACTION_LABELS: Record<AdminOrderAction, string> = {
  hold: "Hold payout",
  mark_disputed: "Mark disputed",
  mark_refund_pending: "Mark refund pending",
  mark_refunded: "Mark refunded",
  mark_partially_released: "Mark partially released",
  mark_released: "Mark released",
};

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

function normalizeAction(value: unknown): AdminOrderAction | "" {
  if (
    value === "hold" ||
    value === "mark_disputed" ||
    value === "mark_refund_pending" ||
    value === "mark_refunded" ||
    value === "mark_partially_released" ||
    value === "mark_released"
  ) {
    return value;
  }

  return "";
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

function patchForAction(
  action: AdminOrderAction,
  order: FirebaseFirestore.DocumentData,
  adminUid: string,
  note: string,
  now: Date
) {
  const payout = isRecord(order.payout) ? order.payout : {};
  const payoutRelease = isRecord(order.payoutRelease) ? order.payoutRelease : {};
  const instructorAmountOre = safeNumber(payout.instructorAmountOre);
  const firstReleaseAmountOre =
    safeNumber(payoutRelease.firstReleaseAmountOre) || Math.round(instructorAmountOre * 0.75);

  const base = {
    adminNote: note,
    payoutUpdatedAt: now,
    payoutUpdatedByUid: adminUid,
    updatedAt: now,
  };

  if (action === "hold") {
    return {
      ...base,
      payoutStatus: "held",
      status: order.status === "refunded" ? "paid_held" : order.status || "paid_held",
      payoutHoldReason: note,
    };
  }

  if (action === "mark_disputed") {
    return {
      ...base,
      payoutStatus: "disputed",
      payoutDisputedAt: now,
      payoutDisputeReason: note,
    };
  }

  if (action === "mark_refund_pending") {
    return {
      ...base,
      status: "refund_pending",
      payoutStatus: "refund_pending",
      refundPendingAt: now,
      refundReason: note,
    };
  }

  if (action === "mark_refunded") {
    return {
      ...base,
      status: "refunded",
      payoutStatus: "refunded",
      refundedAt: now,
      refundReason: note,
    };
  }

  if (action === "mark_partially_released") {
    return {
      ...base,
      payoutStatus: "partially_released",
      firstReleasedAt: now,
      firstReleasedByUid: adminUid,
      firstReleasedAmountOre: firstReleaseAmountOre,
      payoutReleasedOre: firstReleaseAmountOre,
    };
  }

  return {
    ...base,
    payoutStatus: "released",
    releasedAt: now,
    releasedByUid: adminUid,
    payoutReleasedOre: instructorAmountOre,
  };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ orderId: string }> }
) {
  try {
    const access = await requireAdmin(req);
    if ("error" in access) return access.error;

    const { orderId } = await ctx.params;
    if (!orderId) return json({ error: "Missing orderId" }, 400);

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
    };
    const action = normalizeAction(body.action);
    if (!action) return json({ error: "Invalid order action" }, 400);

    const note = safeString(body.note).slice(0, 1000);
    const orderRef = access.db.collection("courseOrders").doc(orderId);
    const eventRef = orderRef.collection("events").doc();
    const now = new Date();

    await access.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("Order not found");

      const order = orderSnap.data() ?? {};
      const patch = patchForAction(action, order, access.uid, note, now);

      tx.set(orderRef, patch, { merge: true });
      tx.set(eventRef, {
        action,
        label: ACTION_LABELS[action],
        note,
        createdAt: now,
        createdByUid: access.uid,
        previousStatus: safeString(order.status),
        previousPayoutStatus: safeString(order.payoutStatus),
      });
    });

    return json({ ok: true, orderId, action }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update academy order";
    return json({ error: message }, 500);
  }
}
