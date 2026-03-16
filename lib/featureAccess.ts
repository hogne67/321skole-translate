// lib/featureAccess.ts

export type AppRole = "teacher" | "student" | "parent" | "creator" | "admin";
export type PlanKey = "free" | "basic" | "plus" | "pro";

export type FeatureKey =
  | "producer_create_lesson"
  | "producer_create_reading_test"
  | "producer_create_quiz"
  | "producer_create_writing_task"
  | "ai_image_generate";

export type QuotaBucket =
  | "premium_generators"
  | "image_generation";

/**
 * Map each feature to the bucket that should count usage.
 */
export function getQuotaBucket(feature: FeatureKey): QuotaBucket {
  switch (feature) {
    case "producer_create_lesson":
    case "producer_create_reading_test":
    case "producer_create_quiz":
    case "producer_create_writing_task":
      return "premium_generators";

    case "ai_image_generate":
      return "image_generation";

    default:
      return "premium_generators";
  }
}

/**
 * Determine monthly limit for a quota bucket
 */
export function getBucketLimit(
  role: AppRole,
  plan: PlanKey,
  bucket: QuotaBucket
): number {
  if (role === "admin") return 999999;

  if (bucket === "premium_generators") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 15;
      if (plan === "basic") return 50;
      if (plan === "plus") return 150;
      if (plan === "pro") return 500;
    }

    if (role === "student") {
      if (plan === "free") return 2;
      if (plan === "basic") return 10;
      if (plan === "plus") return 25;
      if (plan === "pro") return 100;
    }

    if (role === "parent") {
      if (plan === "free") return 1;
      if (plan === "basic") return 5;
      if (plan === "plus") return 20;
      if (plan === "pro") return 100;
    }
  }

  if (bucket === "image_generation") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 5;
      if (plan === "basic") return 50;
      if (plan === "plus") return 200;
      if (plan === "pro") return 1000;
    }

    if (role === "student" || role === "parent") {
      if (plan === "free") return 0;
      if (plan === "basic") return 10;
      if (plan === "plus") return 50;
      if (plan === "pro") return 150;
    }
  }

  return 0;
}

/**
 * Optional: can the user access the feature at all?
 */
export function canAccessFeature(
  role: AppRole,
  plan: PlanKey,
  feature: FeatureKey
): boolean {
  const bucket = getQuotaBucket(feature);
  const limit = getBucketLimit(role, plan, bucket);
  return limit > 0;
}