import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "next-intl";
import nb from "../messages/nb/libraryLanding.json";
import en from "../messages/en/libraryLanding.json";
import pt from "../messages/pt/libraryLanding.json";

const source = readFileSync(new URL("../app/[locale]/(app)/321quiz/page.tsx", import.meta.url), "utf8");
const namespace = source.match(/getTranslations\(\{\s*locale,\s*namespace:\s*"([^"]+)"/)?.[1];
const keys = [...source.matchAll(/\bt\("([^"]+)"/g)].map(match => match[1]);

for (const [locale, messages] of Object.entries({ nb, en, pt })) {
  test(`quiz library resolves every page and card label in ${locale}`, () => {
    assert.ok(namespace);
    assert.ok(keys.length > 15, "Check the page's filters, status, empty state and card labels");
    const errors: unknown[] = [];
    const t = createTranslator({ locale, messages, namespace: namespace as "libraryLanding", onError: error => errors.push(error) });
    for (const key of keys) {
      const label = t(key as Parameters<typeof t>[0], { count: 2, shown: 2, total: 10, title: "{title}", value: "{value}", star: "{star}" });
      assert.ok(label.trim(), key);
      assert.notEqual(label, `${namespace}.${key}`, key);
    }
    assert.deepEqual(errors, []);
    assert.ok(t("quiz.card.shareText", { title: "{title}" }).includes("{title}"));
    assert.ok(t("rating.ariaLabel", { value: "{value}" }).includes("{value}"));
    assert.ok(t("rating.rateStar", { star: "{star}" }).includes("{star}"));
  });
}
