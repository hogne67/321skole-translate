import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import {
  syncFromCheckoutSession,
  syncFromStripeSubscription,
} from "@/lib/billing/sync";

export const runtime = "nodejs";

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

async function verifyUser(req: NextRequest): Promise<{ uid: string }> {
  const token = readBearerToken(req);
  if (!token) throw new Error("Missing bearer token");

  const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
  return { uid: decoded.uid };
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyUser(req);
    const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.uid !== uid) {
      return NextResponse.json({ error: "Checkout session does not belong to user" }, { status: 403 });
    }

    await syncFromCheckoutSession(session);

    if (session.subscription && typeof session.subscription === "string") {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await syncFromStripeSubscription(subscription, uid);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync checkout";
    console.error("billing checkout sync failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
