// lib/featureGuard.ts

import {
  getFeatureDecision,
  getQuotaBucket,
  type FeatureKey,
  type AppRole,
  type PlanKey,
} from "@/lib/featureAccess";
import { getUsage, incrementUsage } from "@/lib/usage";

export type FeatureStatusReason =
  | "teacher_only"
  | "upgrade_required"
  | "not_allowed"
  | "limit_reached";

export type FeatureStatus = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  bucket: ReturnType<typeof getQuotaBucket>;
  reason?: FeatureStatusReason;
};

type GuardParams = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  feature: FeatureKey;
};

type ConsumeParams = {
  uid: string;
  feature: FeatureKey;
  amount?: number;
};

function toUsedValue(
  usage: Record<string, number>,
  bucket: ReturnType<typeof getQuotaBucket>
): number {
  const value = usage[bucket];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Main guard for UI and API.
 * Uses featureAccess for access rules,
 * then reads usage from the correct bucket.
 */
export async function getFeatureStatus(
  params: GuardParams
): Promise<FeatureStatus> {
  const { uid, role, plan, feature } = params;

  const decision = getFeatureDecision(role, plan, feature);
  const bucket = getQuotaBucket(feature);

  // Feature is not available for this role/plan at all
  if (!decision.allowed || decision.limit <= 0) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
      bucket,
      reason: decision.reason ?? "not_allowed",
    };
  }

  const usage = await getUsage(uid);
  const used = toUsedValue(usage, bucket);
  const limit = decision.limit;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: remaining > 0,
    used,
    limit,
    remaining,
    bucket,
    reason: remaining > 0 ? undefined : "limit_reached",
  };
}

/**
 * Simple boolean helper.
 */
export async function canUseFeature(params: GuardParams): Promise<boolean> {
  const status = await getFeatureStatus(params);
  return status.allowed;
}

/**
 * Use AFTER a successful action.
 * Counts on bucket level, never per-page/per-generator.
 */
export async function consumeFeature(params: ConsumeParams): Promise<void> {
  const { uid, feature, amount = 1 } = params;
  const bucket = getQuotaBucket(feature);
  await incrementUsage(uid, bucket, amount);
}

/**
 * Optional helper for API routes:
 * 1. check access
 * 2. caller runs the action
 * 3. consume usage only after success
 */
export async function runWithFeatureGuard<T>(
  params: GuardParams & {
    amount?: number;
    run: () => Promise<T>;
  }
): Promise<
  | { ok: true; result: T; status: FeatureStatus }
  | { ok: false; status: FeatureStatus }
> {
  const { uid, feature, amount = 1, run, ...rest } = params;

  const status = await getFeatureStatus({
    uid,
    feature,
    ...rest,
  });

  if (!status.allowed) {
    return {
      ok: false,
      status,
    };
  }

  const result = await run();

  await consumeFeature({
    uid,
    feature,
    amount,
  });

  return {
    ok: true,
    result,
    status: {
      ...status,
      used: status.used + amount,
      remaining: Math.max(0, status.remaining - amount),
      allowed: status.remaining - amount > 0,
      reason:
        status.remaining - amount > 0 ? undefined : "limit_reached",
    },
  };
}