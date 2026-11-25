import type { BillingMarket, BillingPlan, BillingPriceConfig, BillingRole } from "./config";

type PaidPlan = Exclude<BillingPlan, "free">;
export type PublicMonthlyPrice = { unitAmount: number; currency: string };
export type PublicPricing = {
  currency: string;
  plans: Record<BillingRole, Partial<Record<PaidPlan, PublicMonthlyPrice>>>;
};
export type StripePriceDetails = {
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
};

export async function resolvePublicPricing(
  market: BillingMarket,
  configs: BillingPriceConfig[],
  retrieve: (priceId: string) => Promise<StripePriceDetails>,
): Promise<PublicPricing> {
  const currency = market === "br" ? "brl" : market === "uk" ? "gbp" : "nok";
  const result: PublicPricing = { currency, plans: { teacher: {}, student: {}, parent: {} } };
  await Promise.all(configs.map(async (config) => {
    if (config.market !== market) return;
    try {
      const price = await retrieve(config.priceId);
      // These plans are monthly. Never present a different currency or period as a monthly price.
      if (!price.active || price.currency !== currency || !Number.isSafeInteger(price.unit_amount)
        || price.unit_amount === null || price.unit_amount < 0
        || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) return;
      result.plans[config.role][config.plan] = { unitAmount: price.unit_amount, currency: price.currency };
    } catch {
      // Keep the plan available to choose, without displaying an unverified amount.
    }
  }));
  return result;
}

export function formatPublicPrice(price: PublicMonthlyPrice, locale: string): string {
  return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale, {
    style: "currency", currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.unitAmount / 100);
}
