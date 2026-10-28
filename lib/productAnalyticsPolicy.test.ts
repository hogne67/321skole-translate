import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { isProductAnalyticsEnabled } from "./productAnalyticsPolicy";
import { trackEvent, trackSignUp, trackCreateLesson, trackAiFeedback, trackSubmitAssignment, trackAssignToSpace } from "./analytics";
import { trackEvent as trackOwnEvent } from "./trackEvent";

test("global policy cannot be enabled by environment, user or school state", () => {
  assert.equal(isProductAnalyticsEnabled(), false);
  assert.equal(isProductAnalyticsEnabled.length, 0);
});

test("all legacy event helpers discard events even with an existing gtag", async () => {
  let calls = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { gtag: () => { calls++; } } });
  const log = console.log;
  console.log = () => { calls++; };
  try {
    trackEvent("page_view", { path: "/synthetic" });
    for (const method of ["email", "google", "feide", "anonymous_upgrade"] as const) trackSignUp(method);
    trackCreateLesson("text");
    for (const context of ["student", "teacher", "practice", "geometry"] as const) trackAiFeedback(context);
    trackSubmitAssignment("audio");
    trackAssignToSpace("library");
    await trackOwnEvent("lesson_created", { privateContent: "DO-NOT-LOG" });
    assert.equal(calls, 0);
  } finally {
    console.log = log;
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("root and locale layouts have no analytics loader, config or page collector", () => {
  const root = readFileSync("app/layout.tsx", "utf8");
  const locale = readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.doesNotMatch(root, /googletagmanager|google-analytics|gtag\(|G-EP3QFKR9YS/);
  assert.doesNotMatch(locale, /PageTracker/);
  assert.match(root, /organization-json-ld/);
  assert.match(root, /PwaInstallSupport/);
});

test("discarding facades have no Firebase, network, persistence or queue dependency", () => {
  for (const file of ["lib/analytics.ts", "lib/trackEvent.ts", "lib/productAnalyticsPolicy.ts", "components/PageTracker.tsx"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /from ["'][^"']*(?:firebase|analytics-sdk)|fetch\(|sendBeacon\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|setTimeout\(/);
  }
});
