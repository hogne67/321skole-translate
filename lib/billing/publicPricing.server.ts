import "server-only";
import { unstable_cache } from "next/cache";
import { getStripe } from "@/lib/stripe";
import { getPriceConfigsForRole, type BillingMarket } from "./config";
import { resolvePublicPricing } from "./publicPricing";

const readPrice = unstable_cache(async (priceId: string) => {
  const price = await getStripe().prices.retrieve(priceId, {}, { timeout: 8000, maxNetworkRetries: 0 });
  return { active: price.active, currency: price.currency, unit_amount: price.unit_amount,
    recurring: price.recurring ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count } : null };
}, ["public-monthly-plan-price-v1"], { revalidate: 300 });

export async function getPublicPricing(market: BillingMarket) {
  const configs = (["teacher", "student", "parent"] as const).flatMap(role => getPriceConfigsForRole(role, market));
  return resolvePublicPricing(market, configs, readPrice);
}
