// lib/featureGuard.ts

import {
  getFeatureDecision,
  getFeatureDecisionFromProfile,
  getQuotaBucket,
  type FeatureKey,
  type AppRole,
  type PlanKey,
  type BillingSnapshot,
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

type GuardProfileParams = {
  uid: string;
  role?: string | null;
  plan?: string | null;
  billing?: BillingSnapshot | null;
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

function buildFeatureStatus(input: {
  used: number;
  limit: number;
  bucket: ReturnType<typeof getQuotaBucket>;
  allowedByPlan: boolean;
  reason?: FeatureStatusReason;
}): FeatureStatus {
  const { used, limit, bucket, allowedByPlan, reason } = input;

  if (!allowedByPlan || limit <= 0) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
      bucket,
      reason: reason ?? "not_allowed",
    };
  }

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
 * Main guard for legacy callers using role + plan.
 */
export async function getFeatureStatus(
  params: GuardParams
): Promise<FeatureStatus> {
  const { uid, role, plan, feature } = params;

  const decision = getFeatureDecision(role, plan, feature);
  const bucket = getQuotaBucket(feature);

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

  return buildFeatureStatus({
    used,
    limit: decision.limit,
    bucket,
    allowedByPlan: true,
  });
}

/**
 * New billing-aware guard.
 * Uses billing.plan + billing.status when available.
 */
export async function getFeatureStatusFromProfile(
  params: GuardProfileParams
): Promise<FeatureStatus> {
  const { uid, role, plan, billing, feature } = params;

  const decision = getFeatureDecisionFromProfile({
    role,
    plan,
    billing,
    feature,
  });

  const bucket = getQuotaBucket(feature);

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

  return buildFeatureStatus({
    used,
    limit: decision.limit,
    bucket,
    allowedByPlan: true,
  });
}

/**
 * Simple boolean helper for legacy callers.
 */
export async function canUseFeature(params: GuardParams): Promise<boolean> {
  const status = await getFeatureStatus(params);
  return status.allowed;
}

/**
 * Simple boolean helper for billing-aware callers.
 */
export async function canUseFeatureFromProfile(
  params: GuardProfileParams
): Promise<boolean> {
  const status = await getFeatureStatusFromProfile(params);
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
 * Optional helper for API routes, legacy version:
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

  const nextRemaining = Math.max(0, status.remaining - amount);

  return {
    ok: true,
    result,
    status: {
      ...status,
      used: status.used + amount,
      remaining: nextRemaining,
      allowed: nextRemaining > 0,
      reason: nextRemaining > 0 ? undefined : "limit_reached",
    },
  };
}

/**
 * Billing-aware API helper:
 * 1. check access from profile + billing
 * 2. caller runs the action
 * 3. consume usage only after success
 */
export async function runWithFeatureGuardFromProfile<T>(
  params: GuardProfileParams & {
    amount?: number;
    run: () => Promise<T>;
  }
): Promise<
  | { ok: true; result: T; status: FeatureStatus }
  | { ok: false; status: FeatureStatus }
> {
  const { uid, feature, amount = 1, run, ...rest } = params;

  const status = await getFeatureStatusFromProfile({
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

  const nextRemaining = Math.max(0, status.remaining - amount);

  return {
    ok: true,
    result,
    status: {
      ...status,
      used: status.used + amount,
      remaining: nextRemaining,
      allowed: nextRemaining > 0,
      reason: nextRemaining > 0 ? undefined : "limit_reached",
    },
  };
}