// lib/limits.ts
import "server-only";

/**
 * Central place for all quota and plan decisions.
 *
 * Phase 1:
 * - hardcoded limits by role + plan
 * - single source of truth for feature access
 *
 * Later:
 * - read subscription/plan from Firestore or Stripe sync
 * - replace hardcoded limits with DB-config if wanted
 */

export type Role = "student" | "teacher" | "parent" | "admin" | "anonymous";
export type Plan = "free" | "basic" | "plus" | "pro";

export type FeatureKey =
  | "producer_create_lesson"
  | "teacher_assign_task"
  | "ai_feedback"
  | "ai_generate_text"
  | "ai_generate_reading_test"
  | "image_generate"
  | "image_download"
  | "pdf_download"
  | "space_members"
  | "premium_app_access";

export type UserCtx = {
  uid: string;
  role?: string;
  plan?: string;
  isAdmin?: boolean;
};

export type FeatureDecision = {
  allowed: boolean;
  limit: number;
  reason?: string;
};

const UNLIMITED = 999999;

function normalizeRole(role?: string): Role {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "admin") return "admin";
  return "anonymous";
}

function normalizePlan(plan?: string): Plan {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

export function limitForFeature(feature: FeatureKey, ctx?: UserCtx): number {
  if (ctx?.isAdmin) return UNLIMITED;

  const role = normalizeRole(ctx?.role);
  const plan = normalizePlan(ctx?.plan);

  // Role gates first
  if (feature === "producer_create_lesson" && role !== "teacher") return 0;
  if (feature === "teacher_assign_task" && role !== "teacher") return 0;

  // Anonymous users: very restricted
  if (role === "anonymous") {
    if (feature === "ai_feedback") return 0;
    if (feature === "ai_generate_text") return 0;
    if (feature === "ai_generate_reading_test") return 0;
    if (feature === "image_generate") return 0;
    if (feature === "image_download") return 0;
    if (feature === "pdf_download") return 0;
    if (feature === "space_members") return 0;
    if (feature === "premium_app_access") return 0;
    return 0;
  }

  // Free
  if (plan === "free") {
    if (feature === "producer_create_lesson") return 3;
    if (feature === "teacher_assign_task") return 15;
    if (feature === "ai_feedback") return 5;
    if (feature === "ai_generate_text") return 2;
    if (feature === "ai_generate_reading_test") return 1;
    if (feature === "image_generate") return 0;
    if (feature === "image_download") return 0;
    if (feature === "pdf_download") return 3;
    if (feature === "space_members") return 50;
    if (feature === "premium_app_access") return 0;
  }

  // Basic
  if (plan === "basic") {
    if (feature === "producer_create_lesson") return 20;
    if (feature === "teacher_assign_task") return 50;
    if (feature === "ai_feedback") return 30;
    if (feature === "ai_generate_text") return 10;
    if (feature === "ai_generate_reading_test") return 5;
    if (feature === "image_generate") return 5;
    if (feature === "image_download") return 10;
    if (feature === "pdf_download") return 20;
    if (feature === "space_members") return 150;
    if (feature === "premium_app_access") return 1;
  }

  // Plus
  if (plan === "plus") {
    if (feature === "producer_create_lesson") return 100;
    if (feature === "teacher_assign_task") return 200;
    if (feature === "ai_feedback") return 100;
    if (feature === "ai_generate_text") return 30;
    if (feature === "ai_generate_reading_test") return 15;
    if (feature === "image_generate") return 20;
    if (feature === "image_download") return 50;
    if (feature === "pdf_download") return 100;
    if (feature === "space_members") return 500;
    if (feature === "premium_app_access") return 1;
  }

  // Pro
  if (plan === "pro") {
    if (feature === "premium_app_access") return 1;
    return UNLIMITED;
  }

  return 0;
}

export function canUseFeature(feature: FeatureKey, ctx?: UserCtx): boolean {
  return limitForFeature(feature, ctx) > 0;
}

export function getFeatureDecision(feature: FeatureKey, ctx?: UserCtx): FeatureDecision {
  const limit = limitForFeature(feature, ctx);

  if (limit > 0) {
    return {
      allowed: true,
      limit,
    };
  }

  const role = normalizeRole(ctx?.role);

  if (feature === "producer_create_lesson" && role !== "teacher") {
    return {
      allowed: false,
      limit: 0,
      reason: "teacher_only",
    };
  }

  if (feature === "teacher_assign_task" && role !== "teacher") {
    return {
      allowed: false,
      limit: 0,
      reason: "teacher_only",
    };
  }

  return {
    allowed: false,
    limit: 0,
    reason: "upgrade_required",
  };
}

/**
 * Optional helper for later pricing/credits model.
 * Keep this already now so future migration becomes easier.
 */
export function costForFeature(feature: FeatureKey): number {
  if (feature === "ai_feedback") return 1;
  if (feature === "ai_generate_text") return 3;
  if (feature === "ai_generate_reading_test") return 5;
  if (feature === "producer_create_lesson") return 5;
  if (feature === "teacher_assign_task") return 1;
  if (feature === "image_generate") return 3;
  if (feature === "image_download") return 1;
  if (feature === "pdf_download") return 1;
  if (feature === "space_members") return 0;
  if (feature === "premium_app_access") return 0;
  return 1;
}