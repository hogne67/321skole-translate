import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function readBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;

  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
}

function readAccountId(profile: Record<string, unknown>): string {
  const connect = isRecord(profile.academyStripeConnect) ? profile.academyStripeConnect : null;
  return typeof connect?.accountId === "string" ? connect.accountId : "";
}

async function requireTeacher(req: NextRequest) {
  const token = readBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  return { uid, db, profile: profile as Record<string, unknown> };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireTeacher(req);
    if ("error" in access) return access.error;

    const accountId = readAccountId(access.profile);
    if (!accountId) {
      return json({
        connected: false,
        accountId: "",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    const requirementsDue = account.requirements?.currently_due ?? [];
    const connected =
      account.details_submitted === true &&
      account.charges_enabled === true &&
      account.payouts_enabled === true;

    await access.db.collection("users").doc(access.uid).set(
      {
        academyStripeConnect: {
          accountId,
          chargesEnabled: account.charges_enabled === true,
          payoutsEnabled: account.payouts_enabled === true,
          detailsSubmitted: account.details_submitted === true,
          connected,
          requirementsDue,
          lastSyncedAt: new Date(),
        },
      },
      { merge: true }
    );

    return json({
      connected,
      accountId,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      requirementsDue,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Connect status";
    return json({ error: message }, 500);
  }
}
