import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import SchoolStatisticsCards from "../../components/school/SchoolStatisticsCards";

test("statistics cards show ranges or suppression without pupil details in every supported locale", async () => {
  for (const locale of ["nb", "en", "pt"]) {
    const messages = JSON.parse(await readFile(`messages/${locale}/schoolAdmin.json`, "utf8"));
    for (const countRange of [null, { minimum: 5, maximum: 9 }]) {
      const statistics = { totalSpaceCount: 2, totalActivityCount: 3,
        submissions: { policyVersion: 1 as const, period: "2026-09", countRange },
        pupilName: "DO-NOT-DISPLAY", answers: "DO-NOT-DISPLAY", roomCode: "DO-NOT-DISPLAY", latestTeacherLoginAt: "DO-NOT-DISPLAY" };
      const html = renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, timeZone: "Europe/Oslo", messages,
        children: createElement(SchoolStatisticsCards, { statistics, teachers: 1 }) }));
      assert.doesNotMatch(html, /DO-NOT-DISPLAY|\/teacher\/spaces\/|href=/);
      assert.ok(html.includes(countRange ? "5–9" : "—"));
      assert.ok(html.includes(messages.schoolAdmin.aggregate.title));
    }
  }
});
