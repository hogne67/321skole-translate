// app/api/quota/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getQuotaBucket,
  getBucketLimit,
  getEffectivePlan,
  type AppRole,
  type PlanKey,
  type FeatureKey,
  type QuotaBucket,
  type BillingSnapshot,
} from "@/lib/featureAccess";

type QuotaInfo = {
  feature: string;
  bucket: QuotaBucket;
  role: AppRole;
  plan: PlanKey;
  limit: number;
  used: number;
  remaining: number;
  period: string; // YYYY-MM (Europe/Oslo)
};

type UsageDoc = Partial<Record<QuotaBucket, number>> & {
  updatedAt?: unknown;
};

type UserProfileDoc = {
  role?: unknown;
  plan?: unknown;
  mode?: unknown;
  roles?: unknown;
  org?: unknown;
  billing?: unknown;
  partnerAccess?: unknown;
  partnerStatus?: unknown;
  schoolId?: unknown;
  schoolRole?: unknown;
  schoolStatus?: unknown;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isAppRole(v: unknown): v is AppRole {
  return (
    v === "teacher" ||
    v === "student" ||
    v === "parent" ||
    v === "creator" ||
    v === "admin" ||
    v === "anonymous"
  );
}

function isPlanKey(v: unknown): v is PlanKey {
  return v === "free" || v === "basic" || v === "plus" || v === "pro";
}

function isFeatureKey(v: unknown): v is FeatureKey {
  return (
    v === "producer_create_lesson" ||
    v === "producer_create_reading_test" ||
    v === "producer_create_quiz" ||
    v === "producer_create_writing_task" ||
    v === "producer_create_math_worksheet" ||
    v === "teacher_assign_task" ||
    v === "ai_feedback" ||
    v === "ai_generate_text" ||
    v === "ai_generate_reading_test" ||
    v === "ai_image_generate" ||
    v === "image_download" ||
    v === "pdf_download" ||
    v === "space_members" ||
    v === "premium_app_access"
  );
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

function readUsed(doc: UsageDoc | null | undefined, bucket: QuotaBucket): number {
  return safeNumber(doc?.[bucket]);
}

function pickRoleFromRolesObject(roles: unknown): AppRole | null {
  if (!isRecord(roles)) return null;

  if (roles.admin === true) return "admin";
  if (roles.teacher === true) return "teacher";
  if (roles.creator === true) return "creator";
  if (roles.parent === true) return "parent";
  if (roles.student === true) return "student";

  return null;
}

function resolveRoleFromUserData(data: Record<string, unknown>): AppRole {
  if (isAppRole(data.role)) return data.role;
  if (isAppRole(data.mode)) return data.mode;

  const roleFromRoles = pickRoleFromRolesObject(data.roles);
  if (roleFromRoles) return roleFromRoles;

  if (isRecord(data.org) && isAppRole(data.org.role)) {
    return data.org.role;
  }

  return "anonymous";
}

function readBillingSnapshot(value: unknown): BillingSnapshot | null {
  if (!isRecord(value)) return null;

  return {
    plan: typeof value.plan === "string" ? value.plan : null,
    status: typeof value.status === "string" ? value.status : null,
  };
}

async function resolveRoleAndPlan(uid: string, decoded: Record<string, unknown>) {
  const { db } = getAdmin();

  let role: AppRole = "anonymous";
  let topLevelPlan: PlanKey = "free";
  let billing: BillingSnapshot | null = null;
  let partnerAccess = decoded.partnerAccess === true;
  let partnerStatus = safeString(decoded.partnerStatus);
  let schoolId = safeString(decoded.schoolId);
  let schoolRole = safeString(decoded.schoolRole);
  let schoolStatus = safeString(decoded.schoolStatus);

  if (isAppRole(decoded.role)) {
    role = decoded.role;
  } else if (isAppRole(decoded.mode)) {
    role = decoded.mode;
  } else {
    const claimRoles = pickRoleFromRolesObject(decoded.roles);
    if (claimRoles) role = claimRoles;
  }

  if (isPlanKey(decoded.plan)) {
    topLevelPlan = decoded.plan;
  }

  billing = readBillingSnapshot(decoded.billing);

  try {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = (userSnap.data() as UserProfileDoc) ?? {};
      const userRecord = userData as Record<string, unknown>;

      role = resolveRoleFromUserData(userRecord) || role;

      if (isPlanKey(userData.plan)) {
        topLevelPlan = userData.plan;
      }

      const userBilling = readBillingSnapshot(userData.billing);
      if (userBilling) {
        billing = userBilling;
      }

      partnerAccess = userData.partnerAccess === true;
      partnerStatus = safeString(userData.partnerStatus);
      schoolId = safeString(userData.schoolId);
      schoolRole = safeString(userData.schoolRole);
      schoolStatus = safeString(userData.schoolStatus);
    }
  } catch {
    // keep fallbacks
  }

  const plan = getEffectivePlan({
    plan: topLevelPlan,
    billing,
    partnerAccess,
    partnerStatus,
    schoolId,
    schoolRole,
    schoolStatus,
  });

  return { role, plan, billing };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const url = new URL(req.url);
    const featureRaw = safeString(url.searchParams.get("feature"));
    if (!featureRaw) return json({ error: "Missing ?feature=" }, 400);
    if (!isFeatureKey(featureRaw)) {
      return json({ error: `Unknown feature: ${featureRaw}` }, 400);
    }

    const feature: FeatureKey = featureRaw;
    const bucket = getQuotaBucket(feature);

    const { auth, db } = getAdmin();
    const decoded = (await auth.verifyIdToken(token)) as Record<string, unknown>;

    const uid = safeString(decoded.uid);
    if (!uid) return json({ error: "Invalid token uid" }, 401);

    const { role, plan } = await resolveRoleAndPlan(uid, decoded);
    const period = currentPeriodOslo();
    const limit = getBucketLimit(role, plan, bucket);

    const ref = db.collection("users").doc(uid).collection("usage").doc(period);
    const snap = await ref.get();
    const data = (snap.exists ? (snap.data() as UsageDoc) : null) ?? null;

    const used = readUsed(data, bucket);
    const remaining = Math.max(0, limit - used);

    const out: QuotaInfo = {
      feature,
      bucket,
      role,
      plan,
      limit,
      used,
      remaining,
      period,
    };

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

    const body = (await req.json().catch(() => ({}))) as {
      feature?: unknown;
      amount?: unknown;
    };

    const featureRaw = safeString(body.feature);
    if (!featureRaw) return json({ error: "Missing body.feature" }, 400);
    if (!isFeatureKey(featureRaw)) {
      return json({ error: `Unknown feature: ${featureRaw}` }, 400);
    }

    const feature: FeatureKey = featureRaw;
    const bucket = getQuotaBucket(feature);

    const amountRaw = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? Math.floor(amountRaw) : 1;

    const { auth, db } = getAdmin();
    const decoded = (await auth.verifyIdToken(token)) as Record<string, unknown>;

    const uid = safeString(decoded.uid);
    if (!uid) return json({ error: "Invalid token uid" }, 401);

    const { role, plan } = await resolveRoleAndPlan(uid, decoded);
    const period = currentPeriodOslo();
    const limit = getBucketLimit(role, plan, bucket);

    const ref = db.collection("users").doc(uid).collection("usage").doc(period);

    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.exists ? (snap.data() as UsageDoc) : null) ?? null;

      const usedBefore = readUsed(data, bucket);
      const usedAfter = usedBefore + amount;

      if (usedAfter > limit) {
        return {
          ok: false as const,
          info: {
            feature,
            bucket,
            role,
            plan,
            limit,
            used: usedBefore,
            remaining: Math.max(0, limit - usedBefore),
            period,
          } satisfies QuotaInfo,
        };
      }

      tx.set(
        ref,
        {
          [bucket]: usedAfter,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      return {
        ok: true as const,
        info: {
          feature,
          bucket,
          role,
          plan,
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
