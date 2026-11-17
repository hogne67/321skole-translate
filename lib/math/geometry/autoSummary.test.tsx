import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import Summary from "@/components/generators/math/geometry/GeometryAutoCheckSummary";
import nb from "@/messages/nb/math/mathGeometry.json";
import en from "@/messages/en/math/mathGeometry.json";
import pt from "@/messages/pt/math/mathGeometry.json";

for (const [locale, messages] of Object.entries({ nb, en, pt })) {
  const translate = createTranslator({ locale, messages, namespace: "mathGeometry" });
  const t = (key: string, values?: Record<string, unknown>) => translate(key as never, values as never);
  test(`geometry result summary preserves translated sentences and labels (${locale})`, () => {
    const counts = { total: 3, correct: 1, partial: 1, wrong: 0, unanswered: 1 };
    const html = renderToStaticMarkup(<Summary auto={{ ...counts, percent: 50 }} t={t} />);
    assert.ok(html.includes(t("autoSummaryTitle")));
    assert.ok(html.includes(t("autoSummaryText", counts)));
    assert.ok(html.includes(t("tasks")));
    assert.ok(html.includes(t("score")));
    const emptyHtml = renderToStaticMarkup(<Summary auto={{ total: 0 }} t={t} />);
    assert.ok(emptyHtml.includes(t("autoSummaryEmpty")));
  });
}
