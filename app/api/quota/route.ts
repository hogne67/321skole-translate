// app/api/quota/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type QuotaInfo = {
  feature: string;
  limit: number;
  used: number;
  remaining: number;
  period: string; // YYYY-MM (Europe/Oslo)
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** YYYY-MM in Europe/Oslo */
function currentPeriodOslo(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function limitForFeature(feature: string): number {
  if (feature === "teacher_assign_task") return 15;

  // ✅ NY: producer create lesson (Save draft)
  if (feature === "producer_create_lesson") return 15;

  return 999999;
}

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
};

function readUsed(doc: UsageDoc | null | undefined, feature: string): number {
  const used = doc?.features?.[feature]?.used;
  return safeNumber(used);
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const url = new URL(req.url);
    const feature = safeString(url.searchParams.get("feature"));
    if (!feature) return json({ error: "Missing ?feature=" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);

    const uid = decoded.uid;
    const period = currentPeriodOslo();
    const limit = limitForFeature(feature);

    const ref = db.collection("usage").doc(uid).collection("months").doc(period);
    const snap = await ref.get();
    const data = (snap.exists ? (snap.data() as UsageDoc) : null) ?? null;

    const used = readUsed(data, feature);
    const remaining = Math.max(0, limit - used);

    const out: QuotaInfo = { feature, limit, used, remaining, period };
    return json(out, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Quota GET failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as { feature?: unknown; amount?: unknown };
    const feature = safeString(body.feature);
    const amountRaw = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? Math.floor(amountRaw) : 1;

    if (!feature) return json({ error: "Missing body.feature" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);

    const uid = decoded.uid;
    const period = currentPeriodOslo();
    const limit = limitForFeature(feature);

    const ref = db.collection("usage").doc(uid).collection("months").doc(period);

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.exists ? (snap.data() as UsageDoc) : null) ?? null;

      const usedBefore = readUsed(data, feature);
      const usedAfter = usedBefore + amount;

      if (usedAfter > limit) {
        return {
          ok: false as const,
          info: {
            feature,
            limit,
            used: usedBefore,
            remaining: Math.max(0, limit - usedBefore),
            period,
          } satisfies QuotaInfo,
        };
      }

      const next: UsageDoc = {
        ...(data ?? {}),
        features: {
          ...(data?.features ?? {}),
          [feature]: { used: usedAfter },
        },
        updatedAt: new Date(),
      };

      tx.set(ref, next, { merge: true });

      return {
        ok: true as const,
        info: {
          feature,
          limit,
          used: usedAfter,
          remaining: Math.max(0, limit - usedAfter),
          period,
        } satisfies QuotaInfo,
      };
    });

    if (!out.ok) {
      return json(
        {
          error: "Limit reached",
          quota: out.info,
        },
        429
      );
    }

    return json(out.info, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Quota POST failed" }, 500);
  }
}