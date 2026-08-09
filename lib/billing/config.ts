// lib/billing/config.ts

export type BillingRole = "student" | "teacher" | "parent";
export type BillingPlan = "free" | "basic" | "plus" | "pro";
export type BillingMarket = "no" | "br" | "uk";

export type BillingStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type BillingPriceConfig = {
  market?: BillingMarket;
  role: BillingRole;
  plan: Exclude<BillingPlan, "free">;
  priceId: string;
};

type PaidBillingPlan = Exclude<BillingPlan, "free">;

const BILLING_MARKETS: BillingMarket[] = ["no", "br", "uk"];

const PRICE_ENV_BY_ROLE_PLAN: Record<
  BillingRole,
  Partial<Record<PaidBillingPlan, string>>
> = {
  student: {
    pro: "STRIPE_PRICE_STUDENT_PRO",
  },
  teacher: {
    basic: "STRIPE_PRICE_TEACHER_BASIC",
    plus: "STRIPE_PRICE_TEACHER_PLUS",
    pro: "STRIPE_PRICE_TEACHER_PRO",
  },
  parent: {
    pro: "STRIPE_PRICE_PARENT_PRO",
  },
};

function marketEnvName(
  market: BillingMarket,
  role: BillingRole,
  plan: PaidBillingPlan
) {
  return `STRIPE_PRICE_${market.toUpperCase()}_${role.toUpperCase()}_${plan.toUpperCase()}`;
}

export function getBillingMarketFromHost(host: string | null | undefined): BillingMarket {
  const normalized = String(host ?? "")
    .trim()
    .toLowerCase()
    .split(":")[0];

  if (normalized.endsWith("321escola.com.br")) return "br";
  if (normalized.endsWith("321skole.no")) return "no";
  if (normalized.endsWith("321school.co.uk")) return "uk";

  return "no";
}

export function getBillingPrices(): BillingPriceConfig[] {
  const prices: BillingPriceConfig[] = [];

  for (const market of BILLING_MARKETS) {
    for (const [roleRaw, plans] of Object.entries(PRICE_ENV_BY_ROLE_PLAN)) {
      const role = roleRaw as BillingRole;

      for (const planRaw of Object.keys(plans)) {
        const plan = planRaw as PaidBillingPlan;
        const priceId = process.env[marketEnvName(market, role, plan)];
        if (!priceId) continue;

        prices.push({
          market,
          role,
          plan,
          priceId,
        });
      }
    }
  }

  for (const [roleRaw, plans] of Object.entries(PRICE_ENV_BY_ROLE_PLAN)) {
    const role = roleRaw as BillingRole;

    for (const [planRaw, envName] of Object.entries(plans)) {
      if (!envName) continue;

      const priceId = process.env[envName];
      if (!priceId) continue;

      prices.push({
        market: "no",
        role,
        plan: planRaw as PaidBillingPlan,
        priceId,
      });
    }
  }

  const seen = new Set<string>();
  return prices.filter((price) => {
    const key = `${price.market ?? ""}:${price.role}:${price.plan}:${price.priceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  plan: PaidBillingPlan,
  market: BillingMarket = "no"
): string | null {
  const marketEnv = marketEnvName(market, role, plan);
  const marketPriceId = process.env[marketEnv];
  if (marketPriceId) return marketPriceId;

  const legacyEnv = PRICE_ENV_BY_ROLE_PLAN[role][plan];
  if (!legacyEnv) return null;

  if (market === "no") return process.env[legacyEnv] ?? null;

  return null;
}

export function getPriceEnvName(
  role: BillingRole,
  plan: PaidBillingPlan,
  market: BillingMarket = "no"
): string | null {
  const marketEnv = marketEnvName(market, role, plan);
  if (process.env[marketEnv]) return marketEnv;

  const legacyEnv = PRICE_ENV_BY_ROLE_PLAN[role][plan] ?? null;
  if (market === "no") return legacyEnv;

  return process.env[legacyEnv ?? ""] ? legacyEnv : marketEnv;
}

export function getPriceConfigsForRole(
  role: BillingRole,
  market: BillingMarket = "no"
): BillingPriceConfig[] {
  return getAllowedPlansForRole(role).flatMap((plan) => {
    const priceId = getCheckoutPriceId(role, plan, market);
    if (!priceId) return [];

    return [
      {
        market,
        role,
        plan,
        priceId,
      },
    ];
  });
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
