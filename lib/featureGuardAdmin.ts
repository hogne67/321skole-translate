// lib/featureGuardAdmin.ts
import "server-only";

import {
  getFeatureDecision,
  getQuotaBucket,
  type AppRole,
  type FeatureKey,
  type PlanKey,
} from "@/lib/featureAccess";
import { getUsageAdmin, incrementUsageAdmin } from "@/lib/usageAdmin";

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

function toUsedValue(
  usage: Record<string, number>,
  bucket: ReturnType<typeof getQuotaBucket>
): number {
  const value = usage[bucket];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getFeatureStatusAdmin(
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

  const usage = await getUsageAdmin(uid);
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

export async function consumeFeatureAdmin(params: {
  uid: string;
  feature: FeatureKey;
  amount?: number;
}): Promise<void> {
  const { uid, feature, amount = 1 } = params;
  const bucket = getQuotaBucket(feature);
  await incrementUsageAdmin(uid, bucket, amount);
}