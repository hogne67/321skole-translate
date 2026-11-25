import assert from "node:assert/strict";
import test from "node:test";
import type { BillingPriceConfig } from "./config";
import { formatPublicPrice, resolvePublicPricing, type StripePriceDetails } from "./publicPricing";

const config: BillingPriceConfig = { market: "no", role: "teacher", plan: "pro", priceId: "teacher-pro" };
const price: StripePriceDetails = { active: true, currency: "nok", unit_amount: 22900, recurring: { interval: "month", interval_count: 1 } };

test("public pricing uses Stripe amounts and keeps role-specific prices separate", async () => {
  const configs: BillingPriceConfig[] = [config,
    { ...config, role: "student", priceId: "student-pro" }, { ...config, role: "parent", priceId: "parent-pro" }];
  const result = await resolvePublicPricing("no", configs, async id => ({ ...price, unit_amount: id === "teacher-pro" ? 22900 : id === "student-pro" ? 7900 : 8900 }));
  assert.equal(result.plans.teacher.pro?.unitAmount, 22900);
  assert.equal(result.plans.student.pro?.unitAmount, 7900);
  assert.equal(result.plans.parent.pro?.unitAmount, 8900);
  assert.deepEqual(Object.keys(result.plans.teacher.pro!), ["unitAmount", "currency"]);
});

test("public pricing respects the requested checkout market and currency", async () => {
  for (const [market, currency, amount] of [
    ["no", "nok", 22900], ["uk", "gbp", 1599], ["br", "brl", 9990],
  ] as const) {
    const result = await resolvePublicPricing(market, [{ ...config, market }], async () => ({ ...price, currency, unit_amount: amount }));
    assert.equal(result.plans.teacher.pro?.currency, currency);
    assert.equal(result.plans.teacher.pro?.unitAmount, amount);
  }
});

test("inactive, mismatched, non-monthly or unavailable prices never show a made-up amount", async () => {
  for (const patch of [{ active: false }, { currency: "brl" }, { unit_amount: null }, { unit_amount: -1 },
    { recurring: null }, { recurring: { interval: "year", interval_count: 1 } },
    { recurring: { interval: "month", interval_count: 3 } }]) {
    const result = await resolvePublicPricing("no", [config], async () => ({ ...price, ...patch }));
    assert.equal(result.plans.teacher.pro, undefined);
  }
  assert.equal((await resolvePublicPricing("no", [config], async () => { throw Error("unavailable"); })).plans.teacher.pro, undefined);
});

test("one failed plan does not hide other plans, and other markets are not requested", async () => {
  const seen: string[] = [];
  const result = await resolvePublicPricing("no", [config, { ...config, role: "parent", priceId: "missing" }, { ...config, market: "br", priceId: "other-market" }], async id => {
    seen.push(id); if (id === "missing") throw Error("unavailable"); return price;
  });
  assert.deepEqual(seen.sort(), ["missing", "teacher-pro"]);
  assert.equal(result.plans.teacher.pro?.unitAmount, 22900);
  assert.equal(result.plans.parent.pro, undefined);
});

test("Brazilian decimal amounts and Norwegian whole amounts retain their currency", () => {
  assert.match(formatPublicPrice({ unitAmount: 2999, currency: "brl" }, "pt"), /29,99/);
  assert.match(formatPublicPrice({ unitAmount: 22900, currency: "nok" }, "nb"), /229/);
  assert.match(formatPublicPrice({ unitAmount: 1599, currency: "gbp" }, "en"), /15\.99/);
});
