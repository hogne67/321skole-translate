import { getLocale } from "next-intl/server";
import { getPublicPricing } from "@/lib/billing/publicPricing.server";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const locale = await getLocale();
  // Match the market explicitly requested by the account billing page.
  const market = locale === "pt" ? "br" : locale === "en" ? "uk" : "no";
  return <PricingClient pricing={await getPublicPricing(market)} />;
}
