import type { SchoolPlanKey } from "@/lib/schools/types";

export const DEFAULT_SCHOOL_PLAN_KEY: SchoolPlanKey = "school_5";

export const SCHOOL_PLAN_LIMITS = {
  school_5: 5,
  school_10: 10,
  school_25: 25,
} as const satisfies Record<Exclude<SchoolPlanKey, "custom">, number>;

export function isValidSchoolPlanKey(value: unknown): value is SchoolPlanKey {
  return (
    value === "school_5" ||
    value === "school_10" ||
    value === "school_25" ||
    value === "custom"
  );
}

export function getTeacherSeatLimit(planKey: SchoolPlanKey): number | null {
  if (planKey === "custom") return null;

  return SCHOOL_PLAN_LIMITS[planKey];
}
