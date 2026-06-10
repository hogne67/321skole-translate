// lib/billing/config.ts

export type BillingRole = "student" | "teacher" | "parent";
export type BillingPlan = "free" | "basic" | "plus" | "pro";

export type BillingStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type BillingPriceConfig = {
  role: BillingRole;
  plan: Exclude<BillingPlan, "free">;
  priceId: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getBillingPrices(): BillingPriceConfig[] {
  return [
    {
      role: "student",
      plan: "pro",
      priceId: required("STRIPE_PRICE_STUDENT_PRO"),
    },
    {
      role: "teacher",
      plan: "basic",
      priceId: required("STRIPE_PRICE_TEACHER_BASIC"),
    },
    {
      role: "teacher",
      plan: "plus",
      priceId: required("STRIPE_PRICE_TEACHER_PLUS"),
    },
    {
      role: "teacher",
      plan: "pro",
      priceId: required("STRIPE_PRICE_TEACHER_PRO"),
    },
    {
      role: "parent",
      plan: "pro",
      priceId: required("STRIPE_PRICE_PARENT_PRO"),
    },
  ];
}

export function isBillingRole(value: unknown): value is BillingRole {
  return value === "student" || value === "teacher" || value === "parent";
}

export function isBillingPlan(value: unknown): value is BillingPlan {
  return value === "free" || value === "basic" || value === "plus" || value === "pro";
}

export function getAllowedPlansForRole(role: BillingRole): Exclude<BillingPlan, "free">[] {
  switch (role) {
    case "student":
      return ["pro"];
    case "teacher":
      return ["basic", "plus", "pro"];
    case "parent":
      return ["pro"];
    default:
      return [];
  }
}

export function getCheckoutPriceId(
  role: BillingRole,
  plan: Exclude<BillingPlan, "free">
): string | null {
  const item = getBillingPrices().find((entry) => entry.role === role && entry.plan === plan);
  return item?.priceId ?? null;
}

export function getBillingPlanByPriceId(priceId: string): BillingPriceConfig | null {
  const item = getBillingPrices().find((entry) => entry.priceId === priceId);
  return item ?? null;
}

export function normalizeStripeStatus(status: string | null | undefined): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    default:
      return "inactive";
  }
}

export function planFromBillingState(input: {
  requestedPlan: BillingPlan;
  billingStatus?: BillingStatus | null;
}): BillingPlan {
  const { requestedPlan, billingStatus } = input;
  if (billingStatus === "active" || billingStatus === "trialing") {
    return requestedPlan;
  }
  return "free";
}
