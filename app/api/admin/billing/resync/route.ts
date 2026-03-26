import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import { syncFromStripeSubscription } from "@/lib/billing/sync";

export const runtime = "nodejs";

const USER_COLLECTION = "users";

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

async function verifyAdmin(req: NextRequest): Promise<{ uid: string }> {
  const token = readBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
  const db = getFirestore(getAdminApp());

  const snap = await db.collection(USER_COLLECTION).doc(decoded.uid).get();
  if (!snap.exists) {
    throw new Error("Admin profile not found");
  }

  const data = snap.data() as Record<string, unknown> | undefined;
  const roles =
    data?.roles && typeof data.roles === "object"
      ? (data.roles as Record<string, unknown>)
      : {};

  const isAdmin =
    decoded.admin === true ||
    decoded.role === "admin" ||
    roles.admin === true ||
    data?.role === "admin";

  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return { uid: decoded.uid };
}

async function findUidByCustomerId(customerId: string): Promise<string | null> {
  const db = getFirestore(getAdminApp());

  const snap = await db
    .collection(USER_COLLECTION)
    .where("billing.customerId", "==", customerId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0]?.id ?? null;
}

async function readCustomerIdByUid(uid: string): Promise<string | null> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection(USER_COLLECTION).doc(uid).get();

  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown> | undefined;
  const billing =
    data?.billing && typeof data.billing === "object"
      ? (data.billing as Record<string, unknown>)
      : null;

  return billing && typeof billing.customerId === "string"
    ? billing.customerId
    : null;
}

function pickBestSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  if (!subscriptions.length) return null;

  const statusRank: Record<string, number> = {
    active: 5,
    trialing: 4,
    past_due: 3,
    unpaid: 2,
    incomplete: 1,
    canceled: 0,
    incomplete_expired: 0,
  };

  const sorted = [...subscriptions].sort((a, b) => {
    const rankA = statusRank[a.status] ?? -1;
    const rankB = statusRank[b.status] ?? -1;

    if (rankA !== rankB) return rankB - rankA;

    const createdA = typeof a.created === "number" ? a.created : 0;
    const createdB = typeof b.created === "number" ? b.created : 0;

    return createdB - createdA;
  });

  return sorted[0] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    await verifyAdmin(req);

    const body = (await req.json().catch(() => ({}))) as {
      uid?: string;
      customerId?: string;
    };

    const uidFromBody =
      typeof body.uid === "string" && body.uid.trim() ? body.uid.trim() : null;

    const customerIdFromBody =
      typeof body.customerId === "string" && body.customerId.trim()
        ? body.customerId.trim()
        : null;

    let uid = uidFromBody;
    let customerId = customerIdFromBody;

    if (!uid && !customerId) {
      return NextResponse.json(
        { error: "Missing uid or customerId" },
        { status: 400 }
      );
    }

    if (!customerId && uid) {
      customerId = await readCustomerIdByUid(uid);
    }

    if (!uid && customerId) {
      uid = await findUidByCustomerId(customerId);
    }

    if (!uid) {
      return NextResponse.json(
        { error: "Could not resolve uid" },
        { status: 404 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "Could not resolve customerId" },
        { status: 404 }
      );
    }

    const stripe = getStripe();

    const subscriptionsResponse = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    const subscription = pickBestSubscription(subscriptionsResponse.data);

    if (!subscription) {
      return NextResponse.json(
        {
          error: "No subscriptions found for customer",
          uid,
          customerId,
        },
        { status: 404 }
      );
    }

    await syncFromStripeSubscription(subscription, uid);

    return NextResponse.json({
      ok: true,
      uid,
      customerId,
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0]?.price?.id ?? null,
      metadata: subscription.metadata ?? {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Billing resync failed";

    console.error("[billing resync] failed:", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}