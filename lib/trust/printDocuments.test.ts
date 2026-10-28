import assert from "node:assert/strict";
import test from "node:test";
import { generalPrivacyContent, schoolAiContent, schoolDataRightsContent, schoolDpaContent, schoolPrivacyContent, schoolSubprocessorsContent } from "./schoolContent";
import { trustDocumentUrl, trustPrintDocuments, trustReportSummaries } from "./printDocuments";

for (const locale of ["nb", "en", "pt"]) {
  test(`${locale}: complete package retains seven document areas and all four DPA annexes`, () => {
    const documents = trustPrintDocuments(locale);
    assert.deepEqual(documents.map(item => item.id), ["school-privacy", "dpa", "providers", "rights", "ai", "privacy", "features"]);
    assert.deepEqual(documents.find(item => item.id === "dpa")!.sections.filter(item => item.id?.startsWith("annex-")).map(item => item.id), ["annex-a", "annex-b", "annex-c", "annex-d"]);
  });
  test(`${locale}: full text preserves source paragraphs and points rather than summaries alone`, () => {
    const documents = trustPrintDocuments(locale);
    const factories = { "school-privacy": schoolPrivacyContent(locale), dpa: schoolDpaContent(locale), rights: schoolDataRightsContent(locale), ai: schoolAiContent(locale) };
    for (const [id, source] of Object.entries(factories)) {
      const doc = documents.find(item => item.id === id)!;
      const text = doc.sections.flatMap(item => [...item.paragraphs, ...item.points]);
      for (const section of source.sections) for (const value of [section.body, ...section.points]) assert.ok(text.includes(value), `${id} omitted source text`);
    }
    const general = documents.find(item => item.id === "privacy")!.sections.flatMap(item => [...item.paragraphs, ...item.points]);
    for (const section of generalPrivacyContent(locale).sections) for (const value of [section.text, ...section.points]) assert.ok(general.includes(value), "General privacy omitted source text");
    const vendors = documents.find(item => item.id === "providers")!.sections;
    for (const source of schoolSubprocessorsContent(locale).vendors) {
      const text = vendors.find(item => item.title === source.name)!.paragraphs.join("\n");
      for (const value of [source.purpose, source.data, source.location, source.status]) assert.ok(text.includes(value), `Missing vendor field: ${source.name}`);
    }
  });
  test(`${locale}: short report retains the six required topics with at most two supporting points`, () => {
    const summaries = trustReportSummaries(locale);
    assert.deepEqual(summaries.map(item => item.id), ["privacy", "dpa", "data", "storage", "purpose", "feide"]);
    for (const summary of summaries) assert.ok(summary.summary && summary.points.length >= 1 && summary.points.length <= 2 && summary.links.length > 0);
    assert.ok(summaries.find(item => item.id === "purpose")!.points.includes(schoolAiContent(locale).noticeText));
  });
  test(`${locale}: document links use the public origin and preserve document fragments`, () => {
    assert.equal(trustDocumentUrl(locale, "/school/dpa#annex-c"), `https://321school.com/${locale}/school/dpa#annex-c`);
    for (const doc of trustPrintDocuments(locale)) assert.ok(trustDocumentUrl(locale, doc.path).startsWith(`https://321school.com/${locale}/`));
  });
}
test("Print links reject external and protocol-relative input", () => {
  for (const path of ["https://example.invalid", "//example.invalid", "javascript:alert(1)"]) assert.throws(() => trustDocumentUrl("nb", path));
});
