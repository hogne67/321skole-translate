// lib/featureAccess.ts

export type AppRole =
  | "teacher"
  | "student"
  | "parent"
  | "creator"
  | "admin"
  | "anonymous";

export type PlanKey = "free" | "basic" | "plus" | "pro";
export type StudentAccessMode = "space_only" | "self_study";

export type BillingStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type BillingSnapshot = {
  plan?: string | null;
  status?: string | null;
};

export type PartnerAccessSnapshot = {
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
};

export type SchoolAccessSnapshot = {
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
};

export type StudentAccessSnapshot = {
  studentAccessMode?: string | null;
};

export type FeatureKey =
  | "producer_create_lesson"
  | "producer_create_reading_test"
  | "producer_create_quiz"
  | "producer_create_writing_task"
  | "producer_create_math_worksheet"
  | "writing_station_create_activity"
  | "writing_station_ai_support"
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

function normalizePlan(plan?: string | null): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function normalizeStudentAccessMode(mode?: string | null): StudentAccessMode | null {
  if (mode === "space_only") return "space_only";
  if (mode === "self_study") return "self_study";
  return null;
}

function normalizeBillingStatus(status?: string | null): BillingStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "unpaid") return "unpaid";
  if (status === "incomplete") return "incomplete";
  return "inactive";
}

function isActiveBillingStatus(status?: string | null): boolean {
  const normalized = normalizeBillingStatus(status);
  return normalized === "active" || normalized === "trialing";
}

function isActiveSchoolLicense(input: SchoolAccessSnapshot): boolean {
  return Boolean(
    input.schoolId &&
      input.schoolStatus === "active" &&
      (input.schoolRole === "school_teacher" || input.schoolRole === "school_admin")
  );
}

function atLeastPlus(plan: PlanKey): PlanKey {
  if (plan === "pro" || plan === "plus") return plan;
  return "plus";
}

function isTeacherOnlyFeature(feature: FeatureKey): boolean {
  return feature === "teacher_assign_task";
}

/**
 * Stripe-aware effective plan.
 * If billing is active/trialing, billing.plan wins.
 * Otherwise we fall back to the stored top-level plan.
 * Active school license access upgrades feature limits to at least plus
 * without changing personal billing data.
 */
export function getEffectivePlan(input: {
  plan?: string | null;
  billing?: BillingSnapshot | null;
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
}): PlanKey {
  const topLevelPlan = normalizePlan(input.plan);
  const billingPlan = normalizePlan(input.billing?.plan);
  const billingStatus = input.billing?.status ?? null;

  const basePlan =
    isActiveBillingStatus(billingStatus) && billingPlan !== "free"
      ? billingPlan
      : topLevelPlan;

  if (input.partnerAccess === true && input.partnerStatus === "active") {
    return atLeastPlus(basePlan);
  }

  if (isActiveSchoolLicense(input)) {
    return atLeastPlus(basePlan);
  }

  return basePlan;
}

/**
 * Backward-compatible helper for older code paths.
 */
export function resolvePlanKey(
  planInput?: string | null,
  billing?: BillingSnapshot | null
): PlanKey {
  return getEffectivePlan({
    plan: planInput,
    billing,
  });
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
    case "writing_station_create_activity":
    case "teacher_assign_task":
    case "ai_generate_text":
    case "ai_generate_reading_test":
      return "premium_generators";

    case "ai_image_generate":
      return "image_generation";

    case "ai_feedback":
    case "writing_station_ai_support":
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
  bucket: QuotaBucket,
  opts?: StudentAccessSnapshot
): number {
  const role = normalizeRole(roleInput);
  const plan = normalizePlan(planInput);
  const studentAccessMode = normalizeStudentAccessMode(opts?.studentAccessMode);

  if (role === "admin") return UNLIMITED;

  if (role === "anonymous") {
    if (bucket === "members") return 0;
    if (bucket === "app_access") return 0;
    return 0;
  }

  if (bucket === "premium_generators") {
    if (role === "student" && studentAccessMode === "space_only") return 0;

    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 3;
      if (plan === "basic") return 30;
      if (plan === "plus") return 100;
      if (plan === "pro") return 500;
    }

    if (role === "student") {
      if (plan === "free") return 2;
      if (plan === "basic") return 30;
      if (plan === "plus") return 30;
      if (plan === "pro") return 30;
    }

    if (role === "parent") {
      if (plan === "free") return 2;
      if (plan === "basic") return 30;
      if (plan === "plus") return 30;
      if (plan === "pro") return 30;
    }
  }

  if (bucket === "image_generation") {
    if (role === "student" && studentAccessMode === "space_only") return 0;

    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 2;
      if (plan === "basic") return 30;
      if (plan === "plus") return 100;
      if (plan === "pro") return 500;
    }

    if (role === "student" || role === "parent") {
      if (plan === "free") return 2;
      if (plan === "basic") return 30;
      if (plan === "plus") return 30;
      if (plan === "pro") return 30;
    }
  }

  if (bucket === "ai_feedback") {
    if (role === "student" && studentAccessMode === "space_only") return 0;

    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 3;
      if (plan === "basic") return 100;
      if (plan === "plus") return 300;
      if (plan === "pro") return 1000;
    }

    if (role === "student") {
      if (plan === "free") return 3;
      if (plan === "basic") return 100;
      if (plan === "plus") return 100;
      if (plan === "pro") return 100;
    }

    if (role === "parent") {
      if (plan === "free") return 3;
      if (plan === "basic") return 100;
      if (plan === "plus") return 100;
      if (plan === "pro") return 100;
    }
  }

  if (bucket === "downloads") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 3;
      if (plan === "basic") return 30;
      if (plan === "plus") return 100;
      if (plan === "pro") return 500;
    }

    if (role === "student") {
      if (plan === "free") return 5;
      if (plan === "basic") return 20;
      if (plan === "plus") return 20;
      if (plan === "pro") return 20;
    }

    if (role === "parent") {
      if (plan === "free") return 5;
      if (plan === "basic") return 20;
      if (plan === "plus") return 20;
      if (plan === "pro") return 20;
    }
  }

  if (bucket === "members") {
    if (role === "teacher" || role === "creator") {
      if (plan === "free") return 10;
      if (plan === "basic") return 30;
      if (plan === "plus") return 100;
      if (plan === "pro") return 300;
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
 * Billing-aware bucket limit helper.
 */
export function getBucketLimitFromProfile(input: {
  role?: string | null;
  plan?: string | null;
  billing?: BillingSnapshot | null;
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
  bucket: QuotaBucket;
} & StudentAccessSnapshot): number {
  const role = normalizeRole(input.role ?? undefined);
  const plan = getEffectivePlan({
    plan: input.plan,
    billing: input.billing,
    partnerAccess: input.partnerAccess,
    partnerStatus: input.partnerStatus,
    schoolId: input.schoolId,
    schoolRole: input.schoolRole,
    schoolStatus: input.schoolStatus,
  });

  return getBucketLimit(role, plan, input.bucket, {
    studentAccessMode: input.studentAccessMode,
  });
}

/**
 * Limit for a specific feature.
 */
export function getFeatureLimit(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey,
  opts?: StudentAccessSnapshot
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
  return getBucketLimit(role, planInput, bucket, opts);
}

/**
 * Billing-aware feature limit helper.
 */
export function getFeatureLimitFromProfile(input: {
  role?: string | null;
  plan?: string | null;
  billing?: BillingSnapshot | null;
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
  feature: FeatureKey;
} & StudentAccessSnapshot): number {
  const role = normalizeRole(input.role ?? undefined);

  if (
    isTeacherOnlyFeature(input.feature) &&
    role !== "teacher" &&
    role !== "creator" &&
    role !== "admin"
  ) {
    return 0;
  }

  const effectivePlan = getEffectivePlan({
    plan: input.plan,
    billing: input.billing,
    partnerAccess: input.partnerAccess,
    partnerStatus: input.partnerStatus,
    schoolId: input.schoolId,
    schoolRole: input.schoolRole,
    schoolStatus: input.schoolStatus,
  });

  const bucket = getQuotaBucket(input.feature);
  return getBucketLimit(role, effectivePlan, bucket, {
    studentAccessMode: input.studentAccessMode,
  });
}

export function canAccessFeature(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey
): boolean {
  return getFeatureLimit(roleInput, planInput, feature) > 0;
}

/**
 * Billing-aware access helper.
 */
export function canAccessFeatureFromProfile(input: {
  role?: string | null;
  plan?: string | null;
  billing?: BillingSnapshot | null;
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
  feature: FeatureKey;
}): boolean {
  return getFeatureLimitFromProfile(input) > 0;
}

export function getFeatureDecision(
  roleInput: AppRole | string,
  planInput: PlanKey | string,
  feature: FeatureKey,
  opts?: StudentAccessSnapshot
): FeatureDecision {
  const role = normalizeRole(roleInput);
  const limit = getFeatureLimit(role, planInput, feature, opts);

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

/**
 * Billing-aware feature decision helper.
 */
export function getFeatureDecisionFromProfile(input: {
  role?: string | null;
  plan?: string | null;
  billing?: BillingSnapshot | null;
  partnerAccess?: boolean | null;
  partnerStatus?: string | null;
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
  feature: FeatureKey;
} & StudentAccessSnapshot): FeatureDecision {
  const role = normalizeRole(input.role ?? undefined);
  const limit = getFeatureLimitFromProfile(input);

  if (limit > 0) {
    return {
      allowed: true,
      limit,
    };
  }

  if (isTeacherOnlyFeature(input.feature)) {
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
    case "writing_station_create_activity":
      return 4;
    case "writing_station_ai_support":
      return 1;
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
