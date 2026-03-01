// lib/limits.ts
import "server-only";

/**
 * Central place for all quota limits.
 * - Later you can read plans/subscriptions/caps from Firestore here.
 * - For now: test-phase hardcoded limits per feature.
 */

export type FeatureKey = "producer_create_lesson" | "teacher_assign_task";

export type UserCtx = {
  uid: string;
  role?: string; // "student" | "teacher" | "parent" | "admin" ...
  plan?: string; // "free" | "basic" | "plus" | "pro" ...
  isAdmin?: boolean;
};

export function limitForFeature(feature: string, ctx?: UserCtx): number {
  // Admin: effectively unlimited (optional rule)
  if (ctx?.isAdmin) return 999999;

  // ✅ TESTPHASE defaults
  if (feature === "producer_create_lesson") return 15;
  if (feature === "teacher_assign_task") return 15;

  // default fallback
  return 999999;
}

/**
 * Later: replace this with true plan/role/caps logic. Example structure:
 *
 * - if ctx.plan === "basic" -> 5
 * - if ctx.plan === "plus" -> 40
 * - if ctx.role === "student" -> 0 for create-lesson
 *
 * Keep "limitForFeature" as the single exported decision function.
 */