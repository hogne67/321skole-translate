// app/api/billing/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
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

function requestOrigin(req: NextRequest): string {
  const host = requestHost(req);
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function accountBillingUrl(req: NextRequest): string {
  const origin = requestOrigin(req);
  const referer = req.headers.get("referer");

  if (referer) {
    try {
      const url = new URL(referer);
      const firstSegment = url.pathname.split("/").filter(Boolean)[0];

      if (firstSegment === "nb" || firstSegment === "en" || firstSegment === "pt") {
        return `${origin}/${firstSegment}/account/billing`;
      }
    } catch {
      // Fall through to the non-localized fallback.
    }
  }

  return `${origin}/account/billing`;
}

async function verifyUser(req: NextRequest): Promise<{ uid: string }> {
  const token = readBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
  return { uid: decoded.uid };
}

async function readCustomerId(uid: string): Promise<string | null> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection(USER_COLLECTION).doc(uid).get();

  if (!snap.exists) {
    throw new Error("User profile not found");
  }

  const data = snap.data() as Record<string, unknown> | undefined;
  if (!data) {
    throw new Error("User profile data not found");
  }

  const billing =
    data.billing && typeof data.billing === "object"
      ? (data.billing as Record<string, unknown>)
      : null;

  const customerId =
    billing && typeof billing.customerId === "string"
      ? billing.customerId
      : null;

  return customerId;
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyUser(req);
    const customerId = await readCustomerId(uid);

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this user" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: accountBillingUrl(req),
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portal creation failed";

    console.error("billing portal failed:", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
