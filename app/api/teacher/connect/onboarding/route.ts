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

function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function localeFromReferer(req: NextRequest): string {
  const referer = req.headers.get("referer");
  if (!referer) return "nb";

  try {
    const url = new URL(referer);
    const first = url.pathname.split("/").filter(Boolean)[0];
    if (first === "nb" || first === "en" || first === "pt") return first;
  } catch {
    // Use fallback below.
  }

  return "nb";
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
  const [profileSnap, authUser] = await Promise.all([
    db.collection("users").doc(uid).get(),
    auth.getUser(uid),
  ]);
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  return { uid, db, profile: profile as Record<string, unknown>, email: authUser.email ?? null };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireTeacher(req);
    if ("error" in access) return access.error;

    const stripe = getStripe();
    let accountId = readAccountId(access.profile);

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: access.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          uid: access.uid,
          product: "321Academy",
        },
      });
      accountId = account.id;

      await access.db.collection("users").doc(access.uid).set(
        {
          academyStripeConnect: {
            accountId,
            chargesEnabled: account.charges_enabled === true,
            payoutsEnabled: account.payouts_enabled === true,
            detailsSubmitted: account.details_submitted === true,
            connected: false,
            requirementsDue: account.requirements?.currently_due ?? [],
            createdAt: new Date(),
            lastSyncedAt: new Date(),
          },
        },
        { merge: true }
      );
    }

    const origin = requestOrigin(req);
    const locale = localeFromReferer(req);
    const returnUrl = `${origin}/${locale}/teacher/courses?connect=return`;
    const refreshUrl = `${origin}/${locale}/teacher/courses?connect=refresh`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return json({ url: link.url, accountId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create onboarding link";
    return json({ error: message }, 500);
  }
}
