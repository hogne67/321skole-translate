// lib/featureAccess.ts

export type AppRole =
  | "teacher"
  | "student"
  | "parent"
  | "creator"
  | "admin"
  | "anonymous";

export type PlanKey = "free" | "basic" | "plus" | "pro";

export type FeatureKey =
  | "producer_create_lesson"
  | "producer_create_reading_test"
  | "producer_create_quiz"
  | "producer_create_writing_task"
  | "producer_create_math_worksheet"
  | "teacher_assign_task"
  | "ai_feedback"
  | "ai_generate_text"
  | "ai_generate_reading_test"
  | "ai_image_generate"
  | "image_download"
  | "pdf_download"
  | "space_members"
  | "premium_app_access";

export type QuotaBucket =
  | "premium_generators"
  | "image_generation"
  | "ai_feedback"
  | "downloads"
  | "members"
  | "app_access";

export type FeatureDecision = {
  allowed: boolean;
  limit: number;
  reason?: "teacher_only" | "upgrade_required" | "not_allowed";
};

const UNLIMITED = 999999;

function normalizeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "anonymous";
}

function normalizePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function isTeacherOnlyFeature(feature: FeatureKey): boolean {
  return feature === "teacher_assign_task";
}

/**
 * Map each feature to the bucket that should count usage.
 */
export function getQuotaBucket(feature: FeatureKey): QuotaBucket {
  switch (feature) {
    case "producer_create_lesson":
    case "producer_create_reading_test":
    case "producer_create_quiz":
    case "producer_create_writing_task":
    case "producer_create_math_worksheet":
    case "teacher_assign_task":
    case "ai_generate_text":
    case "ai_generate_reading_test":
      return "premium_generators";

    case "ai_image_generate":
      return "image_generation";

    case "ai_feedback":
      return "ai_feedback";

    case "image_download":
    case "pdf_download":
      return "downloads";

    case "space_members":
      return "members";

    case "premium_app_access":
      return "app_access";

    default:
      return "premium_generators";
  }
}

/**
 * Determine monthly limit for a quota bucket.
 */
export function getBucketLimit(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  bucket: QuotaBucket
): number {
  const role = normalizeRole(roleInput);
  const plan = normalizePlan(planInput);

  if (role === "admin") return UNLIMITED;

  if (role === "anonymous") {
    if (bucket === "members") return 0;
    if (bucket === "app_access") return 0;
    return 0;
  }

  if (bucket === "premium_generators") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 25;
      if (plan === "basic") return 50;
      if (plan === "plus") return 150;
      if (plan === "pro") return 500;
    }

    if (role === "student") {
      if (plan === "free") return 5;
      if (plan === "basic") return 10;
      if (plan === "plus") return 25;
      if (plan === "pro") return 100;
    }

    if (role === "parent") {
      if (plan === "free") return 5;
      if (plan === "basic") return 5;
      if (plan === "plus") return 20;
      if (plan === "pro") return 100;
    }
  }

  if (bucket === "image_generation") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 15;
      if (plan === "basic") return 50;
      if (plan === "plus") return 200;
      if (plan === "pro") return 1000;
    }

    if (role === "student" || role === "parent") {
      if (plan === "free") return 2;
      if (plan === "basic") return 10;
      if (plan === "plus") return 50;
      if (plan === "pro") return 150;
    }
  }

  if (bucket === "ai_feedback") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 20;
      if (plan === "basic") return 100;
      if (plan === "plus") return 300;
      if (plan === "pro") return 1000;
    }

    if (role === "student") {
      if (plan === "free") return 5;
      if (plan === "basic") return 30;
      if (plan === "plus") return 100;
      if (plan === "pro") return 300;
    }

    if (role === "parent") {
      if (plan === "free") return 3;
      if (plan === "basic") return 20;
      if (plan === "plus") return 75;
      if (plan === "pro") return 200;
    }
  }

  if (bucket === "downloads") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 10;
      if (plan === "basic") return 50;
      if (plan === "plus") return 200;
      if (plan === "pro") return 1000;
    }

    if (role === "student") {
      if (plan === "free") return 5;
      if (plan === "basic") return 20;
      if (plan === "plus") return 75;
      if (plan === "pro") return 200;
    }

    if (role === "parent") {
      if (plan === "free") return 5;
      if (plan === "basic") return 15;
      if (plan === "plus") return 50;
      if (plan === "pro") return 150;
    }
  }

  if (bucket === "members") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 30;
      if (plan === "basic") return 25;
      if (plan === "plus") return 75;
      if (plan === "pro") return 150;
    }

    return 0;
  }

  if (bucket === "app_access") {
    if (plan === "free") return 0;
    return 1;
  }

  return 0;
}

/**
 * Limit for a specific feature.
 */
export function getFeatureLimit(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey
): number {
  const role = normalizeRole(roleInput);

  if (
    isTeacherOnlyFeature(feature) &&
    role !== "teacher" &&
    role !== "creator" &&
    role !== "admin"
  ) {
    return 0;
  }

  const bucket = getQuotaBucket(feature);
  return getBucketLimit(role, planInput, bucket);
}

export function canAccessFeature(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey
): boolean {
  return getFeatureLimit(roleInput, planInput, feature) > 0;
}

export function getFeatureDecision(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey
): FeatureDecision {
  const role = normalizeRole(roleInput);
  const limit = getFeatureLimit(role, planInput, feature);

  if (limit > 0) {
    return {
      allowed: true,
      limit,
    };
  }

  if (isTeacherOnlyFeature(feature)) {
    if (role !== "teacher" && role !== "creator" && role !== "admin") {
      return {
        allowed: false,
        limit: 0,
        reason: "teacher_only",
      };
    }
  }

  return {
    allowed: false,
    limit: 0,
    reason: "upgrade_required",
  };
}

export function costForFeature(feature: FeatureKey): number {
  switch (feature) {
    case "producer_create_lesson":
      return 5;
    case "producer_create_reading_test":
      return 5;
    case "producer_create_quiz":
      return 4;
    case "producer_create_writing_task":
      return 4;
    case "producer_create_math_worksheet":
      return 4;
    case "teacher_assign_task":
      return 1;
    case "ai_feedback":
      return 1;
    case "ai_generate_text":
      return 3;
    case "ai_generate_reading_test":
      return 5;
    case "ai_image_generate":
      return 3;
    case "image_download":
      return 1;
    case "pdf_download":
      return 1;
    case "space_members":
      return 0;
    case "premium_app_access":
      return 0;
    default:
      return 1;
  }
}