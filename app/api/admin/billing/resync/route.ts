import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import {
  syncFromCheckoutSession,
  syncFromStripeSubscription,
} from "@/lib/billing/sync";

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

function getSubscriptionIdFromSession(session: Stripe.Checkout.Session): string | null {
  if (!session.subscription) return null;
  return typeof session.subscription === "string"
    ? session.subscription
    : session.subscription.id ?? null;
}

function summarizeCheckoutSession(session: Stripe.Checkout.Session) {
  return {
    id: session.id,
    mode: session.mode ?? null,
    status: session.status ?? null,
    paymentStatus: session.payment_status ?? null,
    customerId:
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null,
    subscriptionId: getSubscriptionIdFromSession(session),
    uid: session.metadata?.uid ?? null,
    role: session.metadata?.role ?? null,
    plan: session.metadata?.plan ?? null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    created: session.created ?? null,
  };
}

async function syncFromCheckoutSessionWithSubscription(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  fallbackUid: string | null
) {
  await syncFromCheckoutSession(session);

  const subscriptionId = getSubscriptionIdFromSession(session);
  if (!subscriptionId) {
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncFromStripeSubscription(subscription, fallbackUid ?? session.metadata?.uid ?? null);
  return subscription;
}

export async function POST(req: NextRequest) {
  try {
    await verifyAdmin(req);

    const body = (await req.json().catch(() => ({}))) as {
      uid?: string;
      customerId?: string;
      sessionId?: string;
    };

    const uidFromBody =
      typeof body.uid === "string" && body.uid.trim() ? body.uid.trim() : null;

    const customerIdFromBody =
      typeof body.customerId === "string" && body.customerId.trim()
        ? body.customerId.trim()
        : null;

    const sessionIdFromBody =
      typeof body.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId.trim()
        : null;

    let uid = uidFromBody;
    let customerId = customerIdFromBody;
    const stripe = getStripe();

    if (sessionIdFromBody) {
      const session = await stripe.checkout.sessions.retrieve(sessionIdFromBody);
      const sessionUid = session.metadata?.uid ?? null;
      const sessionCustomerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;

      uid = uid ?? sessionUid;
      customerId = customerId ?? sessionCustomerId;

      if (!uid) {
        return NextResponse.json(
          {
            error: "Could not resolve uid from checkout session",
            session: summarizeCheckoutSession(session),
          },
          { status: 404 }
        );
      }

      const isCompletedSubscriptionSession =
        session.mode === "subscription" &&
        getSubscriptionIdFromSession(session) &&
        (session.status === "complete" || session.payment_status === "paid");

      if (!isCompletedSubscriptionSession) {
        return NextResponse.json(
          {
            error: "Checkout session is not a completed subscription checkout",
            uid,
            customerId,
            session: summarizeCheckoutSession(session),
          },
          { status: 409 }
        );
      }

      const subscription = await syncFromCheckoutSessionWithSubscription(stripe, session, uid);

      return NextResponse.json({
        ok: true,
        source: "checkout_session",
        uid,
        customerId,
        session: summarizeCheckoutSession(session),
        subscriptionId: subscription?.id ?? getSubscriptionIdFromSession(session),
        status: subscription?.status ?? null,
        priceId: subscription?.items.data[0]?.price?.id ?? null,
      });
    }

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

    const subscriptionsResponse = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    const subscription = pickBestSubscription(subscriptionsResponse.data);

    if (!subscription) {
      const sessionsResponse = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 20,
      });

      const checkoutSessions = sessionsResponse.data.map(summarizeCheckoutSession);
      const syncableSession = sessionsResponse.data.find(
        (session) =>
          session.mode === "subscription" &&
          getSubscriptionIdFromSession(session) &&
          (session.status === "complete" || session.payment_status === "paid")
      );

      if (syncableSession) {
        const syncedSubscription = await syncFromCheckoutSessionWithSubscription(
          stripe,
          syncableSession,
          uid
        );

        return NextResponse.json({
          ok: true,
          source: "checkout_session_lookup",
          uid,
          customerId,
          session: summarizeCheckoutSession(syncableSession),
          subscriptionId: syncedSubscription?.id ?? getSubscriptionIdFromSession(syncableSession),
          status: syncedSubscription?.status ?? null,
          priceId: syncedSubscription?.items.data[0]?.price?.id ?? null,
          checkoutSessions,
        });
      }

      return NextResponse.json(
        {
          error: "No subscriptions found for customer",
          uid,
          customerId,
          checkoutSessions,
          hint:
            checkoutSessions.length === 0
              ? "Stripe has no subscription checkout sessions for this customer."
              : "Stripe has checkout sessions for this customer, but none with a completed subscription.",
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
