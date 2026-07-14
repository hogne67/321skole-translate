import * as cheerio from "cheerio";

export type ImportedSchoolCalendarEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

export type ImportedSchoolCalendar = {
  sourceUrl: string;
  sourceTitle: string;
  fetchedAt: string;
  confidence: "high" | "medium" | "low";
  notes: string[];
  debugLines: string[];
  firstSchoolDay: string;
  lastSchoolDay: string;
  officialSchoolDays: number;
  events: ImportedSchoolCalendarEvent[];
};

export type SchoolCalendarAiReader = (input: {
  sourceUrl: string;
  sourceTitle: string;
  schoolYear: string;
  text: string;
  lines: string[];
}) => Promise<Partial<Pick<ImportedSchoolCalendar, "firstSchoolDay" | "lastSchoolDay" | "events" | "notes">> | null>;

const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  mars: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

const EVENT_RULES: Array<{ id: string; title: string; patterns: RegExp[] }> = [
  { id: "autumn-break", title: "Høstferie", patterns: [/høstferie/i, /haustferie/i] },
  { id: "christmas-break", title: "Juleferie", patterns: [/juleferie/i] },
  { id: "winter-break", title: "Vinterferie", patterns: [/vinterferie/i] },
  { id: "easter-break", title: "Påskeferie", patterns: [/påskeferie/i] },
  { id: "ascension-day", title: "Kristi himmelfartsdag", patterns: [/kristi\s+himmelfartsdag/i] },
  { id: "national-day", title: "Nasjonaldag", patterns: [/nasjonaldag/i, /17\.\s*mai/i] },
  { id: "whit-monday", title: "Pinse", patterns: [/pinse/i, /pinsedag/i] },
  { id: "planning-day", title: "Planleggingsdag / fridag", patterns: [/^[^\p{L}\p{N}]*(?:fridager|fridagar|fridag|planleggingsdag|elevfri)/iu] },
];

export async function importSchoolCalendarFromUrl(input: {
  url: string;
  schoolYear: string;
  aiReader?: SchoolCalendarAiReader;
}): Promise<ImportedSchoolCalendar> {
  const url = normalizeImportUrl(input.url);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "321Planner/1.0 school-calendar-reader",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Skolerutesiden svarte med status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("Lenken peker ikke til en HTML-side vi kan lese trygt ennå.");
  }

  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("Skolerutesiden var uventet stor.");

  const $ = cheerio.load(html);
  $("script, style, svg, noscript").remove();
  const sourceTitle = normalizeText($("title").first().text()) || new URL(url).hostname;
  const structuredLines = extractStructuredLines($);
  const fullText = normalizeText(structuredLines.join("\n") || $("body").text());
  const schoolYearLines = selectSchoolYearLines(structuredLines, input.schoolYear);
  const schoolYearText = schoolYearLines.join("\n") || selectSchoolYearText(fullText, input.schoolYear);
  const lines = splitUsefulLines(schoolYearText || fullText);
  const notes: string[] = [];
  if (!schoolYearText) {
    notes.push("Fant ikke en tydelig egen seksjon for valgt skoleår. Forslaget er hentet fra hele siden.");
  }

  const schoolYear = parseSchoolYear(input.schoolYear);
  const calendarRows = extractCalendarRows(schoolYearText || fullText, schoolYear);
  const sourceLines = calendarRows.length > 0 ? calendarRows : lines;
  const fallbackFirstSchoolDay = findLineDate(sourceLines, [/første\s+skoledag/i, /første\s+skuledag/i, /skolestart/i], schoolYear);
  const fallbackLastSchoolDay = findLineDate(sourceLines, [/siste\s+skoledag/i, /siste\s+skuledag/i, /sommerferie/i, /ferien/i], schoolYear);
  const officialSchoolDays = findOfficialSchoolDays(lines);
  const fallbackEvents = findEvents(sourceLines, schoolYear);
  const aiResult = input.aiReader
    ? await input.aiReader({
        sourceUrl: url,
        sourceTitle,
        schoolYear: input.schoolYear,
        text: schoolYearText || fullText,
        lines: sourceLines,
      }).catch((error) => {
        notes.push(`AI-lesing av skoleruten feilet: ${error instanceof Error ? error.message : "ukjent feil"}.`);
        return null;
      })
    : null;
  const firstSchoolDay = cleanDate(aiResult?.firstSchoolDay, schoolYear) || fallbackFirstSchoolDay;
  const lastSchoolDay = cleanDate(aiResult?.lastSchoolDay, schoolYear) || fallbackLastSchoolDay;
  const aiEvents = cleanImportedEvents(aiResult?.events ?? [], schoolYear, sourceLines.join("\n"));
  const events = mergeCalendarEvents(
    [...aiEvents, ...fallbackEvents, ...getNorwegianNationalSchoolEvents(schoolYear)],
    schoolYear
  );

  if (!firstSchoolDay) notes.push("Fant ikke sikker startdato for skoleåret.");
  if (!lastSchoolDay) notes.push("Fant ikke sikker sluttdato for skoleåret.");
  if (events.length === 0) notes.push("Fant ingen tydelige ferier eller fridager.");
  if (aiResult?.notes?.length) notes.push(...aiResult.notes.slice(0, 4));

  const confidence = firstSchoolDay && lastSchoolDay && events.length >= 3 ? "medium" : "low";
  return {
    sourceUrl: url,
    sourceTitle,
    fetchedAt: new Date().toISOString(),
    confidence,
    notes,
    debugLines: getDebugLines(sourceLines),
    firstSchoolDay,
    lastSchoolDay,
    officialSchoolDays,
    events,
  };
}

function cleanImportedEvents(
  events: ImportedSchoolCalendarEvent[],
  schoolYear: { startYear: number; endYear: number },
  evidenceText: string
): ImportedSchoolCalendarEvent[] {
  return events
    .map((event, index) => ({
      id: event.id || `ai-event-${index + 1}`,
      title: normalizeText(event.title).slice(0, 80),
      startDate: cleanDate(event.startDate, schoolYear),
      endDate: cleanDate(event.endDate || event.startDate, schoolYear),
    }))
    .filter(
      (event) =>
        event.title &&
        event.startDate &&
        event.endDate &&
        event.startDate <= event.endDate &&
        dateHasSourceEvidence(event.startDate, evidenceText) &&
        dateHasSourceEvidence(event.endDate, evidenceText)
    );
}

function cleanDate(value: string | undefined, schoolYear: { startYear: number; endYear: number }): string {
  const trimmed = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";
  return dateIsInSchoolYear(trimmed, schoolYear) ? trimmed : "";
}

function mergeCalendarEvents(
  events: ImportedSchoolCalendarEvent[],
  schoolYear: { startYear: number; endYear: number }
): ImportedSchoolCalendarEvent[] {
  const byDate = new Map<string, ImportedSchoolCalendarEvent>();
  for (const event of events) {
    if (!event.startDate || !event.endDate) continue;
    if (!dateIsInSchoolYear(event.startDate, schoolYear) || !dateIsInSchoolYear(event.endDate, schoolYear)) continue;
    const key = `${event.startDate}:${event.endDate}:${normalizeEventTitle(event.title)}`;
    if (byDate.has(key)) continue;
    byDate.set(key, { ...event, id: event.id || `calendar-event-${byDate.size + 1}` });
  }
  return tidyCalendarEvents([...byDate.values()])
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title))
    .map((event, index) => ({ ...event, id: event.id || `calendar-event-${index + 1}` }));
}

function tidyCalendarEvents(events: ImportedSchoolCalendarEvent[]): ImportedSchoolCalendarEvent[] {
  return combineSameDayNamedHolidays(removeDuplicateCoveredHolidays(events));
}

function removeDuplicateCoveredHolidays(events: ImportedSchoolCalendarEvent[]): ImportedSchoolCalendarEvent[] {
  const namedHolidayRanges = new Set(
    events
      .filter((event) => isNamedHolidayTitle(event.title))
      .map((event) => `${event.startDate}:${event.endDate}`)
  );
  const easterBreaks = events.filter((event) => normalizeEventTitle(event.title) === "påskeferie");

  return events.filter((event) => {
    const range = `${event.startDate}:${event.endDate}`;
    if (isGenericFreeDayTitle(event.title) && namedHolidayRanges.has(range)) return false;
    if (normalizeEventTitle(event.title) === "påske" && easterBreaks.some((breakEvent) => eventIsInside(event, breakEvent))) {
      return false;
    }
    return true;
  });
}

function combineSameDayNamedHolidays(events: ImportedSchoolCalendarEvent[]): ImportedSchoolCalendarEvent[] {
  const bySingleDate = new Map<string, ImportedSchoolCalendarEvent[]>();
  const rest: ImportedSchoolCalendarEvent[] = [];

  for (const event of events) {
    if (event.startDate === event.endDate && isNamedHolidayTitle(event.title)) {
      bySingleDate.set(event.startDate, [...(bySingleDate.get(event.startDate) ?? []), event]);
    } else {
      rest.push(event);
    }
  }

  for (const sameDateEvents of bySingleDate.values()) {
    if (sameDateEvents.length === 1) {
      rest.push(sameDateEvents[0]);
      continue;
    }
    const title = sameDateEvents
      .map((event) => event.title.trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(" / ");
    rest.push({ ...sameDateEvents[0], id: sameDateEvents.map((event) => event.id).join("-"), title });
  }

  return rest;
}

function eventIsInside(event: ImportedSchoolCalendarEvent, wrapper: ImportedSchoolCalendarEvent): boolean {
  return event.startDate >= wrapper.startDate && event.endDate <= wrapper.endDate;
}

function isNamedHolidayTitle(title: string): boolean {
  return ["nasjonaldag", "1-mai", "kristi-himmelfartsdag", "pinse", "påske"].includes(normalizeEventTitle(title));
}

function isGenericFreeDayTitle(title: string): boolean {
  const normalized = normalizeEventTitle(title);
  return normalized === "fridag" || normalized.includes("elevfri") || normalized.includes("planleggingsdag");
}

function getNorwegianNationalSchoolEvents(schoolYear: { startYear: number; endYear: number }): ImportedSchoolCalendarEvent[] {
  const easterSunday = getEasterSunday(schoolYear.endYear);
  const events = [
    singleHoliday("may-day", "1. mai", `${schoolYear.endYear}-05-01`),
    singleHoliday("national-day", "Nasjonaldag", `${schoolYear.endYear}-05-17`),
    singleHoliday("ascension-day", "Kristi himmelfartsdag", addDays(easterSunday, 39)),
    singleHoliday("whit-monday", "2. pinsedag", addDays(easterSunday, 50)),
    {
      id: "easter-holidays",
      title: "Påskehelligdager",
      startDate: addDays(easterSunday, -3),
      endDate: addDays(easterSunday, 1),
    },
  ];

  return events.filter((event) => {
    if (!dateIsInSchoolYear(event.startDate, schoolYear) || !dateIsInSchoolYear(event.endDate, schoolYear)) return false;
    if (event.startDate === event.endDate && isWeekendIsoDate(event.startDate)) return false;
    return true;
  });
}

function singleHoliday(id: string, title: string, date: string): ImportedSchoolCalendarEvent {
  return { id, title, startDate: date, endDate: date };
}

function getEasterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekendIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function normalizeEventTitle(value: string): string {
  const normalized = value.toLocaleLowerCase("nb-NO");
  if (normalized.includes("nasjonaldag") || normalized.includes("17. mai")) return "nasjonaldag";
  if (normalized.includes("1. mai")) return "1-mai";
  if (normalized.includes("kristi")) return "kristi-himmelfartsdag";
  if (normalized.includes("pinse")) return "pinse";
  if (normalized.includes("påskeferie")) return "påskeferie";
  if (normalized.includes("påske")) return "påske";
  if (normalized.includes("fridag") || normalized.includes("fri")) return "fridag";
  return normalized.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function dateHasSourceEvidence(isoValue: string, evidenceText: string): boolean {
  if (!isoValue || !evidenceText) return false;
  if (evidenceText.includes(isoValue)) return true;
  const [, , monthValue, dayValue] = isoValue.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!monthValue || !dayValue) return false;

  const day = Number(dayValue);
  const month = Number(monthValue);
  const monthName = Object.entries(MONTHS).find(([, value]) => value === month)?.[0] ?? "";
  const escapedMonthName = escapeRegExp(monthName);
  const numericPattern = new RegExp(`(^|\\D)0?${day}\\s*\\.\\s*0?${month}(\\D|$)`, "i");
  const textPattern = new RegExp(`(^|\\D)0?${day}\\s*\\.\\s*${escapedMonthName}\\b`, "i");
  const textRangePattern = new RegExp(
    `(^|\\D)(?:0?${day}\\s*\\.?\\s*[-–—−]\\s*\\d{1,2}|\\d{1,2}\\s*\\.?\\s*[-–—−]\\s*0?${day})\\s*\\.?\\s*${escapedMonthName}\\b`,
    "i"
  );
  return numericPattern.test(evidenceText) || textPattern.test(evidenceText) || textRangePattern.test(evidenceText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDebugLines(lines: string[]): string[] {
  return lines
    .filter((line) => /\d{1,2}\.|\d{4}|første|siste|ferie|fridag|fridager|fridagar|elevfri|pinse|mai/i.test(line))
    .slice(0, 40);
}

function extractStructuredLines($: cheerio.CheerioAPI): string[] {
  const lines: string[] = [];
  $("h1, h2, h3, h4, p, li, tr, dt, dd").each((_, element) => {
    const line = normalizeText($(element).text());
    if (!line || line.length < 3) return;
    if (lines.at(-1) === line) return;
    lines.push(line);
  });
  return lines.length > 0 ? lines : splitUsefulLines(normalizeText($("body").text()));
}

function selectSchoolYearLines(lines: string[], schoolYear: string): string[] {
  const [startYear, endYear] = schoolYear.split(/[/-]/).map((part) => Number(part));
  if (!startYear || !endYear) return [];
  const yearPattern = new RegExp(`${startYear}\\s*[/-]\\s*(?:${endYear}|${String(endYear).slice(2)})`);
  const hits = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => yearPattern.test(item.line));
  if (hits.length === 0) return [];

  const candidates = hits.map((hit, hitIndex) => {
    const start = Math.max(0, findHeadingIndexBefore(lines, hit.index));
    const nextHitIndex = hits[hitIndex + 1]?.index ?? lines.length;
    const end = Math.max(hit.index + 1, findHeadingIndexBefore(lines, nextHitIndex));
    const candidateLines = lines.slice(start, end > start ? end : nextHitIndex);
    return { lines: candidateLines, score: scoreSchoolYearCandidate(candidateLines.join(" ")) };
  });

  return candidates.sort((left, right) => right.score - left.score)[0]?.lines ?? [];
}

function findHeadingIndexBefore(lines: string[], index: number): number {
  for (let current = index; current >= Math.max(0, index - 8); current -= 1) {
    if (/skolerut(?:e|a|en)?|skuleår|skoleår/i.test(lines[current] ?? "")) return current;
  }
  return index;
}

function extractCalendarRows(text: string, schoolYear: { startYear: number; endYear: number }): string[] {
  const monthNames = Object.keys(MONTHS).join("|");
  const rowRegex = new RegExp(
    `\\b(${monthNames})\\b\\s+\\d{1,2}\\s+([\\s\\S]*?)(?=\\b(?:${monthNames})\\b\\s+\\d{1,2}\\s+|\\bSum\\s+(?:skole|skule)dagar?\\b|\\bSkolerut(?:e|a|en)?\\s+\\d{4})`,
    "gi"
  );
  return [...text.matchAll(rowRegex)]
    .map((match) => normalizeText(`${match[1]} ${match[2]}`))
    .filter((row) => {
      const month = monthNumber(row.split(" ")[0] ?? "");
      const expectedYear = inferYearFromMonth(month, schoolYear);
      return expectedYear > 0 && (row.includes(String(expectedYear)) || /\d{1,2}\./.test(row));
    });
}

function normalizeImportUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Lim inn en lenke til kommunens skolerute først.");
  const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Lenken må starte med http eller https.");
  }
  if (isLocalHostname(url.hostname)) {
    throw new Error("Av sikkerhetshensyn kan vi ikke hente lokale eller interne lenker.");
  }
  return url.toString();
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  );
}

function selectSchoolYearText(text: string, schoolYear: string): string {
  const [startYear, endYear] = schoolYear.split(/[/-]/).map((part) => Number(part));
  if (!startYear || !endYear) return "";
  const patterns = [
    `${startYear}\\s*[/-]\\s*${endYear}`,
    `${startYear}\\s*[/-]\\s*${String(endYear).slice(2)}`,
  ];
  const yearRegex = new RegExp(`(?:${patterns.join("|")})`, "gi");
  const matches = [...text.matchAll(yearRegex)];
  if (matches.length === 0) return "";
  const candidates = matches.map((match, index) => {
    const yearStart = match.index ?? 0;
    const headingStart = findNearbySchoolRouteHeadingStart(text, yearStart);
    const start = headingStart >= 0 ? headingStart : yearStart;
    const nextYearStart = matches[index + 1]?.index ?? text.length;
    const nextHeadingStart = findNearbySchoolRouteHeadingStart(text, nextYearStart);
    const nextStart = nextHeadingStart > start ? nextHeadingStart : nextYearStart;
    const candidate = text.slice(start, nextStart);
    return { candidate, score: scoreSchoolYearCandidate(candidate) };
  });
  return candidates.sort((left, right) => right.score - left.score)[0]?.candidate ?? "";
}

function findNearbySchoolRouteHeadingStart(text: string, yearStart: number): number {
  const before = text.slice(Math.max(0, yearStart - 160), yearStart);
  const matches = [...before.matchAll(/skolerut(?:e|a|en)?/gi)];
  const last = matches.at(-1);
  return last?.index === undefined ? -1 : Math.max(0, yearStart - 160) + last.index;
}

function scoreSchoolYearCandidate(value: string): number {
  const dateCount = (value.match(/\d{1,2}\.\d{1,2}|\d{1,2}\.\s*[a-zæøå]+/gi) ?? []).length;
  const keywordCount = (
    value.match(
      /første|siste|skole|skule|høstferie|haustferie|juleferie|vinterferie|påskeferie|fridag|elevfri|mai|pinse/gi
    ) ?? []
  ).length;
  return dateCount * 3 + keywordCount;
}

function splitUsefulLines(text: string): string[] {
  return text
    .replace(/\s+(?=(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\b)/gi, "\n")
    .replace(/\s+(?=(første|siste|høstferie|haustferie|juleferie|vinterferie|påskeferie|kristi|nasjonaldag|pinse|planleggingsdag|elevfri|fridag|fridager|fridagar)\b)/gi, "\n")
    .split(/\n|(?<=\.)\s+(?=[A-ZÆØÅ])/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 0);
}

function findLineDate(lines: string[], patterns: RegExp[], schoolYear: { startYear: number; endYear: number }): string {
  const line = lines.find((item) => patterns.some((pattern) => pattern.test(item)));
  if (!line) return "";
  return parseDateRange(line, schoolYear).startDate;
}

function findOfficialSchoolDays(lines: string[]): number {
  const text = lines.join(" ");
  const match = text.match(/\b(19[0-9]|20[0-9])\s+skuledagar\b/i) ?? text.match(/\b(19[0-9]|20[0-9])\s+skoledager\b/i);
  return match ? Number(match[1]) : 0;
}

function findEvents(lines: string[], schoolYear: { startYear: number; endYear: number }): ImportedSchoolCalendarEvent[] {
  const seen = new Set<string>();
  const events: ImportedSchoolCalendarEvent[] = [];

  for (const line of lines) {
    for (const rule of EVENT_RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(line))) continue;
      const singleDates = parseSingleDateEvents(line, schoolYear);
      if (singleDates.length > 1 && !hasRangeWords(line)) {
        for (const date of singleDates) {
          const key = `${rule.id}:${date}:${date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          events.push({
            id: `${rule.id}-${events.length + 1}`,
            title: eventTitleForDate(rule.title, line, date),
            startDate: date,
            endDate: date,
          });
        }
        continue;
      }
      const range = parseDateRange(line, schoolYear);
      if (!range.startDate) continue;
      if (!dateIsInSchoolYear(range.startDate, schoolYear) || !dateIsInSchoolYear(range.endDate || range.startDate, schoolYear)) {
        continue;
      }
      const key = `${rule.id}:${range.startDate}:${range.endDate || range.startDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: `${rule.id}-${events.length + 1}`,
        title: eventTitleFromLine(rule.title, line),
        startDate: range.startDate,
        endDate: range.endDate || range.startDate,
      });
    }
  }

  return events.sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function hasRangeWords(line: string): boolean {
  return /\b(fra|til|t\.?o\.?m|til\s+og\s+med)\b|[-–—−]/i.test(line);
}

function parseSingleDateEvents(text: string, schoolYear: { startYear: number; endYear: number }): string[] {
  return extractDateCandidates(text, schoolYear)
    .map((candidate) => isoDate(candidate))
    .filter((date) => dateIsInSchoolYear(date, schoolYear));
}

function eventTitleForDate(defaultTitle: string, line: string, date: string): string {
  if (date.endsWith("-05-17")) return "Nasjonaldag";
  if (/fridager|fridagar|fridag/i.test(line)) return "Fridag";
  return eventTitleFromLine(defaultTitle, line);
}

function eventTitleFromLine(defaultTitle: string, line: string): string {
  if (/planleggingsdag/i.test(line)) return "Planleggingsdag / fridag";
  if (/elevfri/i.test(line)) return "Elevfri dag";
  if (/kristi\s+himmelfartsdag/i.test(line) && /fridag/i.test(line)) return "Kristi himmelfartsdag / fridag";
  if (/nasjonaldag/i.test(line) && /pinse/i.test(line)) return "Nasjonaldag / pinse";
  return defaultTitle;
}

function parseDateRange(text: string, schoolYear: { startYear: number; endYear: number }): { startDate: string; endDate: string } {
  const normalized = text.replace(/–|—|−/g, "-").replace(/\s+/g, " ");
  const fullDates = extractDateCandidates(normalized, schoolYear);
  if (fullDates.length >= 2) {
    const first = fullDates.find((date) => dateCandidateIsInSchoolYear(date, schoolYear));
    const last = [...fullDates].reverse().find((date) => dateCandidateIsInSchoolYear(date, schoolYear));
    if (first && last) return { startDate: isoDate(first), endDate: isoDate(last) };
  }
  if (fullDates.length === 1) {
    const first = fullDates[0];
    if (!dateCandidateIsInSchoolYear(first, schoolYear)) return { startDate: "", endDate: "" };
    const sameMonthRange = normalized.match(/(\d{1,2})\.?\s*-\s*(\d{1,2})\.\s*[a-zæøå]+(?:\s+\d{4})?/i);
    if (sameMonthRange) {
      return {
        startDate: isoDate({ ...first, day: Number(sameMonthRange[1]) }),
        endDate: isoDate({ ...first, day: Number(sameMonthRange[2]) }),
      };
    }
    return { startDate: isoDate(first), endDate: isoDate(first) };
  }

  const compactRange = normalized.match(/(\d{1,2})\.?\s*-\s*(\d{1,2})\.\s*([a-zæøå]+)(?:\s+(\d{4}))?/i);
  if (compactRange) {
    const month = monthNumber(compactRange[3]);
    const year = compactRange[4] ? Number(compactRange[4]) : inferYearFromMonth(month, schoolYear);
    return {
      startDate: isoDate({ day: Number(compactRange[1]), month, year }),
      endDate: isoDate({ day: Number(compactRange[2]), month, year }),
    };
  }

  return { startDate: "", endDate: "" };
}

function dateCandidateIsInSchoolYear(
  date: { day: number; month: number; year: number },
  schoolYear: { startYear: number; endYear: number }
): boolean {
  return dateIsInSchoolYear(isoDate(date), schoolYear);
}

function dateIsInSchoolYear(value: string, schoolYear: { startYear: number; endYear: number }): boolean {
  if (!value) return false;
  return value >= `${schoolYear.startYear}-08-01` && value <= `${schoolYear.endYear}-07-31`;
}

function extractDateCandidates(text: string, schoolYear: { startYear: number; endYear: number }) {
  const normalized = text.replace(/–|—|−/g, "-").replace(/\s+/g, " ");
  const textDates = [...normalized.matchAll(/(\d{1,2})\.\s*([a-zæøå]+)(?:\s+(\d{2,4}))?/gi)].map((match) => {
    const month = monthNumber(match[2]);
    return {
      index: match.index ?? 0,
      day: Number(match[1]),
      month,
      year: match[3] ? normalizeYear(Number(match[3]), schoolYear) : inferYearFromMonth(month, schoolYear),
    };
  });
  const numericDates = [...normalized.matchAll(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/g)].map((match) => {
    const month = Number(match[2]);
    return {
      index: match.index ?? 0,
      day: Number(match[1]),
      month,
      year: match[3] ? normalizeYear(Number(match[3]), schoolYear) : inferYearFromMonth(month, schoolYear),
    };
  });

  return [...textDates, ...numericDates]
    .filter((date) => date.day >= 1 && date.day <= 31 && date.month >= 1 && date.month <= 12 && date.year > 0)
    .sort((left, right) => left.index - right.index)
    .map(({ day, month, year }) => ({ day, month, year }));
}

function parseSchoolYear(value: string): { startYear: number; endYear: number } {
  const [start, end] = value.split(/[/-]/).map((part) => Number(part));
  const startYear = Number.isFinite(start) && start > 1900 ? start : new Date().getFullYear();
  const endYear =
    Number.isFinite(end) && end > 1900
      ? end
      : Number.isFinite(end) && end > 0
        ? Math.floor(startYear / 100) * 100 + end
        : startYear + 1;
  return { startYear, endYear };
}

function inferYearFromMonth(month: number, schoolYear: { startYear: number; endYear: number }): number {
  if (month >= 8 && month <= 12) return schoolYear.startYear;
  if (month >= 1 && month <= 7) return schoolYear.endYear;
  return 0;
}

function normalizeYear(year: number, schoolYear: { startYear: number; endYear: number }): number {
  if (year >= 1000) return year;
  const startCentury = Math.floor(schoolYear.startYear / 100) * 100;
  const candidate = startCentury + year;
  if (candidate >= schoolYear.startYear - 1 && candidate <= schoolYear.endYear + 1) return candidate;
  return 2000 + year;
}

function monthNumber(value: string): number {
  return MONTHS[value.toLowerCase()] ?? 0;
}

function isoDate(date: { day: number; month: number; year: number }): string {
  if (!date.day || !date.month || !date.year) return "";
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
