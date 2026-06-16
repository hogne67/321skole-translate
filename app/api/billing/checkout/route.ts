// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import {
  getBillingMarketFromHost,
  getAllowedPlansForRole,
  getCheckoutPriceId,
  isBillingPlan,
  type BillingMarket,
  type BillingRole,
} from "@/lib/billing/config";

export const runtime = "nodejs";

const USER_COLLECTION = "users";

type CheckoutBody = {
  plan?: string;
};

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function requestHost(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-host") || req.headers.get("host");
}

function requestOrigin(req: NextRequest): string {
  const host = requestHost(req);
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function accountBillingUrl(req: NextRequest, query: string): string {
  const origin = requestOrigin(req);
  const referer = req.headers.get("referer");

  if (referer) {
    try {
      const url = new URL(referer);
      const firstSegment = url.pathname.split("/").filter(Boolean)[0];

      if (firstSegment === "nb" || firstSegment === "en" || firstSegment === "pt") {
        return `${origin}/${firstSegment}/account/billing${query}`;
      }
    } catch {
      // Fall through to the non-localized fallback.
    }
  }

  return `${origin}/account/billing${query}`;
}

function resolveBillingRoleFromUserData(data: Record<string, unknown>): BillingRole | null {
  const topRole = data.role;
  if (topRole === "student" || topRole === "teacher" || topRole === "parent") {
    return topRole;
  }

  const mode = data.mode;
  if (mode === "student" || mode === "teacher" || mode === "parent") {
    return mode;
  }

  const org = data.org;
  if (org && typeof org === "object") {
    const orgRole = (org as Record<string, unknown>).role;
    if (orgRole === "student" || orgRole === "teacher" || orgRole === "parent") {
      return orgRole;
    }
  }

  const roles = data.roles;
  if (roles && typeof roles === "object") {
    const roleMap = roles as Record<string, unknown>;
    if (roleMap.teacher === true) return "teacher";
    if (roleMap.parent === true) return "parent";
    if (roleMap.student === true) return "student";
  }

  return null;
}

async function verifyUser(req: NextRequest): Promise<{ uid: string }> {
  const token = readBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
  return { uid: decoded.uid };
}

async function readUser(uid: string): Promise<{
  uid: string;
  role: BillingRole;
  email: string | null;
  stripeCustomerId: string | null;
}> {
  const db = getFirestore(getAdminApp());
  const auth = getAuth(getAdminApp());

  const [userSnap, authUser] = await Promise.all([
    db.collection(USER_COLLECTION).doc(uid).get(),
    auth.getUser(uid),
  ]);

  if (!userSnap.exists) {
    throw new Error("User profile not found");
  }

  const data = userSnap.data() as Record<string, unknown> | undefined;
  if (!data) {
    throw new Error("User profile data not found");
  }

  const role = resolveBillingRoleFromUserData(data);
  if (!role) {
    throw new Error("User role is not eligible for billing");
  }

  const billing =
    data.billing && typeof data.billing === "object"
      ? (data.billing as Record<string, unknown>)
      : null;

  const stripeCustomerId =
    billing && typeof billing.customerId === "string" ? billing.customerId : null;

  return {
    uid,
    role,
    email: authUser.email ?? null,
    stripeCustomerId,
  };
}

async function getOrCreateCustomer(input: {
  uid: string;
  email: string | null;
  existingCustomerId: string | null;
}): Promise<string> {
  const stripe = getStripe();
  const db = getFirestore(getAdminApp());

  if (input.existingCustomerId) {
    return input.existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: input.email ?? undefined,
    metadata: {
      uid: input.uid,
    },
  });

  await db.collection(USER_COLLECTION).doc(input.uid).set(
    {
      billing: {
        provider: "stripe",
        customerId: customer.id,
      },
    },
    { merge: true }
  );

  return customer.id;
}

export async function POST(req: NextRequest) {
  const logContext: {
    uid?: string;
    role?: BillingRole;
    plan?: Exclude<CheckoutBody["plan"], undefined>;
    market?: BillingMarket;
    priceId?: string | null;
  } = {};

  try {
    const market = getBillingMarketFromHost(requestHost(req));
    logContext.market = market;

    const { uid } = await verifyUser(req);
    logContext.uid = uid;
    const body = (await req.json().catch(() => ({}))) as CheckoutBody;

    const requestedPlanRaw = body.plan;
    if (!isBillingPlan(requestedPlanRaw) || requestedPlanRaw === "free") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    logContext.plan = requestedPlanRaw;

    const user = await readUser(uid);
    logContext.role = user.role;
    const allowedPlans = getAllowedPlansForRole(user.role);

    if (!allowedPlans.includes(requestedPlanRaw)) {
      return NextResponse.json(
        { error: "Plan not allowed for this role" },
        { status: 403 }
      );
    }

    const priceId = getCheckoutPriceId(user.role, requestedPlanRaw, market);
    logContext.priceId = priceId;
    if (!priceId) {
      return NextResponse.json({ error: "Missing Stripe priceId" }, { status: 500 });
    }

    const customerId = await getOrCreateCustomer({
      uid: user.uid,
      email: user.email,
      existingCustomerId: user.stripeCustomerId,
    });

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: false,
      success_url: accountBillingUrl(req, "?checkout=success"),
      cancel_url: accountBillingUrl(req, "?checkout=cancel"),
      metadata: {
        uid: user.uid,
        role: user.role,
        plan: requestedPlanRaw,
        market,
      },
      subscription_data: {
        metadata: {
          uid: user.uid,
          role: user.role,
          plan: requestedPlanRaw,
          market,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout creation failed";

    console.error("billing checkout failed:", {
      ...logContext,
      error,
    });

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
