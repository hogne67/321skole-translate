import { generalPrivacyContent, schoolAiContent, schoolDataRightsContent, schoolDpaContent, schoolPrivacyContent, schoolSubprocessorsContent } from "./schoolContent";
import { municipalAssessmentAreas, municipalAssessmentUi } from "./municipalAssessment";
import { SCHOOL_PROVIDER, translated as t, trustLocale } from "./schoolFacts";
import { municipalityDocuments } from "./schoolReport";

// Public documentation only. No credentials, user records, remote fetching or signed URLs.
const publicOrigin = "https://321school.com";
export function trustDocumentUrl(locale: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Trust Center document path");
  return `${publicOrigin}/${trustLocale(locale)}${path}`;
}
export type PrintLink = { href: string; label: string };
export type PrintSection = { id?: string; title: string; paragraphs: string[]; points: string[]; links?: PrintLink[] };
export type PrintDocument = { id: string; title: string; lead: string; path: string; sections: PrintSection[] };
const sections = (items: { id?: string; title: string; body: string; points: string[] }[]): PrintSection[] => items.map(item => ({ id: item.id, title: item.title, paragraphs: [item.body], points: item.points }));

export function trustPrintDocuments(locale: string): PrintDocument[] {
  const school = schoolPrivacyContent(locale), dpa = schoolDpaContent(locale), vendors = schoolSubprocessorsContent(locale);
  const rights = schoolDataRightsContent(locale), ai = schoolAiContent(locale), privacy = generalPrivacyContent(locale);
  const assessment = municipalAssessmentUi(locale);
  return [
    { id: "school-privacy", title: school.title, lead: school.lead, path: "/school/privacy", sections: [
      { title: t(locale, ["Kort oversikt", "Overview", "Visão geral"]), paragraphs: [], points: school.cards.map(card => `${card.title}: ${card.text}`) },
      ...sections(school.sections), { title: school.contactTitle, paragraphs: [school.contactText], points: [] },
    ] },
    { id: "dpa", title: dpa.title, lead: dpa.lead, path: "/school/dpa", sections: [
      { title: t(locale, ["Avtalestatus", "Agreement status", "Estado do acordo"]), paragraphs: [dpa.warning], points: [] }, ...sections(dpa.sections),
    ] },
    { id: "providers", title: vendors.title, lead: vendors.lead, path: "/school/subprocessors", sections: [
      ...vendors.vendors.map(vendor => ({ title: vendor.name, paragraphs: [
        `${vendors.headers.purpose}: ${vendor.purpose}`, `${vendors.headers.data}: ${vendor.data}`,
        `${vendors.headers.location}: ${vendor.location}`, `${vendors.headers.status}: ${vendor.status}`,
      ], points: [] })), { title: vendors.notesTitle, paragraphs: [], points: vendors.notes },
    ] },
    { id: "rights", title: rights.title, lead: rights.lead, path: "/school/data-rights", sections: [
      ...sections(rights.sections), { title: rights.noteTitle, paragraphs: [rights.noteText], points: [], links: rights.sourceLinks },
    ] },
    { id: "ai", title: ai.title, lead: ai.lead, path: "/school/ai-guidelines", sections: [
      { title: ai.noticeTitle, paragraphs: [ai.noticeText, ai.municipalStatus], points: [] },
      { title: ai.principlesTitle, paragraphs: [], points: ai.principles },
      ...sections(ai.sections), { title: ai.footerTitle, paragraphs: [ai.footerText], points: [], links: ai.sourceLinks },
    ] },
    { id: "privacy", title: privacy.title, lead: privacy.intro, path: "/privacy", sections: [
      { title: privacy.controllerTitle, paragraphs: [privacy.controllerText, `${privacy.company}, ${privacy.org}`, privacy.address, privacy.email], points: [] },
      ...privacy.sections.map(item => ({ id: item.id, title: item.title, paragraphs: [item.text], points: item.points, links: item.links.map(link => ({ ...link, href: link.href.startsWith("/") ? `${publicOrigin}${link.href}` : link.href })) })),
      { title: privacy.statusTitle, paragraphs: [privacy.statusText], points: [] },
      { title: privacy.contactTitle, paragraphs: [privacy.contactText], points: [], links: privacy.sourceLinks },
    ] },
    { id: "features", title: assessment.title, lead: assessment.lead, path: "/school/trust#school-assessment", sections: [
      { title: t(locale, ["Rammer for skolebruk", "School-use framework", "Bases do uso escolar"]), paragraphs: [assessment.status, assessment.hierarchy, assessment.pilotStatus], points: [] },
      ...municipalAssessmentAreas(locale).map(area => ({ title: `${area.title} (${assessment.statuses[area.status]})`, paragraphs: [
        `${assessment.labels.data}: ${area.data}`, `${assessment.labels.controls}: ${area.controls}`,
        `${assessment.labels.review}: ${area.review}`,
        ...(area.proposal ? [`${assessment.labels.proposal}: ${area.proposal}`] : []),
      ], points: [] })), { title: t(locale, ["Tilpasninger", "Adaptations", "Adaptações"]), paragraphs: [assessment.changes], points: [] },
    ] },
  ];
}

export const trustPrintSupplier = `${SCHOOL_PROVIDER.shortName} · ${SCHOOL_PROVIDER.organizationNumber}`;

export function trustReportSummaries(locale: string) {
  const studentSupport = schoolAiContent(locale).noticeText;
  return municipalityDocuments(locale).map(document => ({ ...document, points:
    document.id === "feide" ? document.points.slice(0, 1) :
    document.id === "dpa" ? document.points.slice(1, 2) :
    document.id === "purpose" ? [document.points[0], studentSupport] : document.points.slice(0, 2),
  }));
}
