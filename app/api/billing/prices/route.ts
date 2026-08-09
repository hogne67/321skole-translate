import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import {
  getBillingMarketFromHost,
  getPriceConfigsForRole,
  type BillingMarket,
  type BillingRole,
} from "@/lib/billing/config";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const USER_COLLECTION = "users";

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function requestHost(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-host") || req.headers.get("host");
}

function isBillingMarket(value: unknown): value is BillingMarket {
  return value === "no" || value === "br" || value === "uk";
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

async function readRole(uid: string): Promise<BillingRole> {
  const db = getFirestore(getAdminApp());
  const userSnap = await db.collection(USER_COLLECTION).doc(uid).get();

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

  return role;
}

export async function GET(req: NextRequest) {
  try {
    const requestedMarket = req.nextUrl.searchParams.get("market");
    const market = isBillingMarket(requestedMarket)
      ? requestedMarket
      : getBillingMarketFromHost(requestHost(req));
    const { uid } = await verifyUser(req);
    const role = await readRole(uid);
    const stripe = getStripe();

    const prices = await Promise.all(
      getPriceConfigsForRole(role, market).map(async (config) => {
        const price = await stripe.prices.retrieve(config.priceId);

        return {
          plan: config.plan,
          priceId: config.priceId,
          currency: price.currency,
          unitAmount: price.unit_amount,
          interval: price.recurring?.interval ?? null,
          active: price.active,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      market,
      role,
      prices,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load billing prices";

    console.error("billing prices failed:", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
