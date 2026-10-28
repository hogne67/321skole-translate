import { TRUST_REVISION } from "./schoolFacts";

export const trustReportPrintStyles = `
.trust-print-only { display: none; }
@media print {
  @page {
    size: A4; margin: 18mm 16mm;
    @top-left { content: "321school | Trust Center"; font: 8pt Arial, sans-serif; color: #64748b; }
    @top-right { content: "v${TRUST_REVISION.version} | ${TRUST_REVISION.updated}"; font: 8pt Arial, sans-serif; color: #64748b; }
    @bottom-center { content: counter(page) " / " counter(pages); font: 8pt Arial, sans-serif; color: #64748b; }
  }
  html, body, main { background: #fff !important; color: #172b43 !important; }
  body { font: 9.5pt/1.48 Arial, sans-serif !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .no-print, [data-print-included="false"] { display: none !important; }
  .trust-print-only { display: block !important; }
  .trust-report-shell { width: auto !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .trust-print-heading { border-bottom: 1pt solid #cbd5e1; padding-bottom: 10pt; margin-bottom: 14pt; }
  .trust-print-heading h2 { font-size: 21pt; line-height: 1.15; margin: 0 0 6pt; overflow-wrap: anywhere; }
  .trust-print-heading p { margin: 4pt 0; }
  .trust-report-note { white-space: pre-wrap; overflow-wrap: anywhere; }
  .trust-report-introduction { padding: 0 !important; border: 0 !important; border-radius: 0 !important; }
  .trust-report-introduction h2 { font-size: 16pt; line-height: 1.25; margin: 0 0 9pt; }
  .trust-report-introduction h3 { font-size: 11pt; margin: 10pt 0 5pt; break-after: avoid; }
  .trust-report-introduction p { font-size: 9.5pt; line-height: 1.4; margin: 0 0 6pt; orphans: 3; widows: 3; }
  .trust-report-introduction > div { margin-top: 10pt; }
  .trust-report-introduction > div:first-child { margin-top: 0; }
  .trust-analytics-plan { break-inside: avoid; padding: 10pt !important; margin-bottom: 14pt; }
  .trust-analytics-plan h2 { font-size: 12pt; margin: 0 0 6pt; }
  .trust-analytics-plan p { font-size: 9.5pt; line-height: 1.4; margin: 0; }
  [data-report-format="short"] .trust-summary-grid { break-before: page; }
  .trust-summary-grid { display: block !important; padding: 0 !important; }
  .trust-summary-card { break-inside: avoid; margin: 0 0 12pt; padding: 0 0 12pt !important; border: 0 !important; border-bottom: .5pt solid #cbd5e1 !important; border-radius: 0 !important; box-shadow: none !important; }
  .trust-summary-card h2 { margin: 0 0 6pt !important; font-size: 12pt !important; line-height: 1.25 !important; }
  .trust-summary-card p, .trust-summary-card li { font-size: 9.5pt !important; line-height: 1.45 !important; }
  .trust-summary-card ul { margin: 6pt 0 !important; }
  .trust-summary-card li { margin-bottom: 4pt; }
  [data-report-format="full"] .trust-summary-card { margin-bottom: 8pt; padding-bottom: 8pt !important; }
  [data-report-format="full"] .trust-summary-card p, [data-report-format="full"] .trust-summary-card li { font-size: 9pt !important; line-height: 1.4 !important; }
  .trust-summary-card svg, .trust-summary-card .trust-topic { display: none !important; }
  .trust-summary-card .trust-summary-body { margin-top: 6pt !important; }
  .trust-print-links { margin: 7pt 0 0; }
  a { color: #164e78 !important; text-decoration: underline !important; overflow-wrap: anywhere; }
  .trust-print-links a { display: block; font-size: 8pt; margin-top: 3pt; }
  .trust-package-contents { break-before: page; break-inside: avoid; padding: 12pt 0; }
  .trust-package-contents h2 { font-size: 13pt; margin-bottom: 6pt; }
  .trust-package-contents ol { list-style: decimal; padding-left: 18pt; }
  .trust-package-contents li { margin: 3pt 0; }
  [data-report-format="full"] .trust-summary-grid { margin-top: 0 !important; }
  .trust-print-document { break-before: page; }
  .trust-print-document h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 9pt; }
  .trust-print-document h2 { font-size: 12pt; line-height: 1.3; margin: 10pt 0 5pt; break-after: avoid; }
  .trust-print-document p, .trust-print-document li { font-size: 9.5pt; line-height: 1.4; orphans: 3; widows: 3; }
  .trust-print-document p { margin: 0 0 4pt; }
  .trust-print-document ul { list-style: disc; padding-left: 15pt; margin: 4pt 0 8pt; }
  .trust-print-document li { padding-left: 2pt; margin: 0 0 3pt; }
  .trust-print-document .trust-document-source { font-size: 8pt; color: #475569; margin: 0 0 7pt; }
  .trust-print-document .trust-document-lead { font-size: 10pt; margin-bottom: 12pt; }
  .trust-document-references { break-inside: avoid; }
  .trust-document-references a { display: inline-block; margin: 0 10pt 3pt 0; }
  [data-full-document="providers"] p { margin-bottom: 2pt; }
  [data-full-document="providers"] h2 { margin-top: 8pt; }
  [data-full-document="rights"] h2, [data-full-document="ai"] h2 { margin-top: 8pt; }
  [data-full-document="rights"] p, [data-full-document="ai"] p { margin-bottom: 3pt; }
  [data-full-document="rights"] p, [data-full-document="rights"] li { line-height: 1.35; }
  [data-full-document="rights"] ul, [data-full-document="ai"] ul { margin-bottom: 6pt; }
}
`;
