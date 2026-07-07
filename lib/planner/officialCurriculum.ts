import * as cheerio from "cheerio";
import { Agent, get } from "node:https";

export type OfficialCurriculumSection = {
  title: string;
  text: string;
};

export type OfficialCurriculumHours = {
  note: string;
  sections: Array<{
    title: string;
    rows: string[][];
  }>;
};

export type OfficialCurriculumBasis = {
  source: {
    provider: "Utdanningsdirektoratet";
    planCode: string;
    title: string;
    status: string;
    validFrom: string;
    lastChanged: string;
    sourceUrl: string;
    fetchedAt: string;
  };
  competenceLevel: string;
  competenceGoals: string[];
  coreElements: OfficialCurriculumSection[];
  interdisciplinaryThemes: OfficialCurriculumSection[];
  basicSkills: OfficialCurriculumSection[];
  hours: OfficialCurriculumHours;
};

const VERIFIED_PLAN_CODES: Record<string, string> = {
  Norsk: "NOR01-07",
  Matematikk: "MAT01-05",
  Engelsk: "ENG01-05",
  Naturfag: "NAT01-04",
  Samfunnsfag: "SAF01-04",
  KRLE: "RLE01-03",
  Kroppsøving: "KRO01-05",
  "Kunst og håndverk": "KHV01-02",
  Musikk: "MUS01-02",
  "Mat og helse": "MHE01-02",
  "Norsk - FOV": "NOR10-01",
  "Norsk for språklige minoriteter - FOV": "NOR11-01",
  "Matematikk - FOV": "MAT10-01",
  "Engelsk - FOV": "ENG05-01",
  "Samfunnsfag - FOV": "SAF03-01",
  "Naturfag - FOV": "NAT03-01",
};

const UDIR_ORIGIN = "https://www.udir.no";
const UDIR_AGENT = new Agent({ keepAlive: true, maxSockets: 1, family: 4 });

export function verifiedPlanCodeForSubject(subject: string): string | null {
  return VERIFIED_PLAN_CODES[subject] ?? null;
}

export async function fetchOfficialCurriculumBasis(input: {
  subject: string;
  level: string;
}): Promise<OfficialCurriculumBasis> {
  const planCode = verifiedPlanCodeForSubject(input.subject);
  if (!planCode) {
    throw new Error(
      "Dette faget har ikke et verifisert automatisk oppslag ennå. Læreplankode eller offisiell Udir-lenke må legges inn manuelt."
    );
  }

  const baseUrl = `${UDIR_ORIGIN}/lk20/${planCode.toLowerCase()}`;
  const frontPageUrl = `${baseUrl}?lang=nob`;
  const frontPageHtml = await fetchUdirHtml(frontPageUrl);
  const $front = cheerio.load(frontPageHtml);
  const status = metaContent($front, "laereplan.status");
  const pageCode = metaContent($front, "laereplan.kode");

  if (status.toLocaleLowerCase("nb-NO") !== "gyldig" || pageCode.toUpperCase() !== planCode) {
    throw new Error("Udir bekreftet ikke at den valgte læreplanen er gyldig. Oppslaget er derfor stoppet.");
  }

  const competenceLink = findCompetenceLink($front, input.level);
  if (!competenceLink) {
    throw new Error(
      "Riktig kompetansemålsett kunne ikke identifiseres entydig for dette trinnet. Velg læreplankode eller målsett manuelt."
    );
  }

  const urls = {
    competence: absoluteUdirUrl(competenceLink.href),
    coreElements: `${baseUrl}/om-faget/kjerneelementer?lang=nob`,
    interdisciplinaryThemes: `${baseUrl}/om-faget/tverrfaglige-temaer?lang=nob`,
    basicSkills: `${baseUrl}/om-faget/grunnleggende-ferdigheter?lang=nob`,
    hours: `${baseUrl}/timetall?lang=nob`,
  };

  const competenceHtml = await fetchUdirHtml(urls.competence);
  const coreElementsHtml = await fetchUdirHtml(urls.coreElements);
  const themesHtml = await fetchUdirHtml(urls.interdisciplinaryThemes);
  const basicSkillsHtml = await fetchUdirHtml(urls.basicSkills);
  const hoursHtml = await fetchUdirHtml(urls.hours);

  const competenceGoals = extractCompetenceGoals(competenceHtml);
  const coreElements = extractCurriculumSections(coreElementsHtml);
  const interdisciplinaryThemes = extractCurriculumSections(themesHtml);
  const basicSkills = extractCurriculumSections(basicSkillsHtml);
  const hours = extractHours(hoursHtml);

  const missingParts = [
    competenceGoals.length === 0 ? "kompetansemål" : "",
    coreElements.length === 0 ? "kjerneelementer" : "",
    basicSkills.length === 0 ? "grunnleggende ferdigheter" : "",
  ].filter(Boolean);
  if (missingParts.length > 0) {
    throw new Error(
      `Udir-siden manglet forventet struktur for ${missingParts.join(", ")}. Ingen ufullstendig grunnplan ble vist.`
    );
  }

  return {
    source: {
      provider: "Utdanningsdirektoratet",
      planCode,
      title: metaContent($front, "laereplan.navn"),
      status,
      validFrom: metaContent($front, "laereplan.gyldigfradato"),
      lastChanged: metaContent($front, "laereplan.sistendret"),
      sourceUrl: frontPageUrl,
      fetchedAt: new Date().toISOString(),
    },
    competenceLevel: competenceLink.label,
    competenceGoals,
    coreElements,
    interdisciplinaryThemes,
    basicSkills,
    hours: withManualHoursFallback(hours),
  };
}

async function fetchUdirHtml(url: string): Promise<string> {
  return requestUdirHtml(url, 0);
}

function requestUdirHtml(url: string, redirectCount: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        agent: UDIR_AGENT,
        headers: {
          Accept: "text/html",
          "User-Agent": "321Planner/1.0 official-curriculum-reader",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirectCount >= 3) {
            reject(new Error("Udir sendte for mange omdirigeringer. Oppslaget ble stoppet."));
            return;
          }
          resolve(requestUdirHtml(new URL(response.headers.location, url).toString(), redirectCount + 1));
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`Udir svarte med status ${status}. Oppslaget ble stoppet.`));
          return;
        }

        response.setEncoding("utf8");
        let html = "";
        response.on("data", (chunk: string) => {
          html += chunk;
          if (html.length > 5_000_000) request.destroy(new Error("Udir-siden var uventet stor."));
        });
        response.on("end", () => resolve(html));
      }
    );
    request.setTimeout(15_000, () => request.destroy(new Error("Udir svarte ikke innen tidsfristen.")));
    request.on("error", reject);
  });
}

function metaContent($: cheerio.CheerioAPI, name: string): string {
  return normalizeText($(`meta[name="${name}"]`).first().attr("content") || "");
}

function findCompetenceLink(
  $: cheerio.CheerioAPI,
  level: string
): { href: string; label: string } | null {
  const links = $('a[href*="/kompetansemaal-og-vurdering/"]')
    .map((_, element) => ({
      href: $(element).attr("href") || "",
      label: normalizeText($(element).text()),
    }))
    .get()
    .filter((link) => link.href && link.label);
  const uniqueLinks = Array.from(new Map(links.map((link) => [link.href, link])).values());
  const targetLabel = competenceMilestone(level);
  const exactMatches = uniqueLinks.filter(
    (link) => link.label.toLocaleLowerCase("nb-NO") === targetLabel.toLocaleLowerCase("nb-NO")
  );
  if (exactMatches.length === 1) return exactMatches[0];

  const prefixMatches = uniqueLinks.filter((link) =>
    link.label.toLocaleLowerCase("nb-NO").startsWith(targetLabel.toLocaleLowerCase("nb-NO"))
  );
  return prefixMatches.length === 1 ? prefixMatches[0] : null;
}

function competenceMilestone(level: string): string {
  const moduleMatch = level.match(/modul\s+(4[SY]?|\d)/i);
  if (moduleMatch) return `Modul ${moduleMatch[1].toUpperCase()}`;

  const gradeMatch = level.match(/^(\d{1,2})\./);
  if (gradeMatch) {
    const grade = Number(gradeMatch[1]);
    if (grade <= 2) return "2. trinn";
    if (grade <= 4) return "4. trinn";
    if (grade <= 7) return "7. trinn";
    return "10. trinn";
  }
  if (level.startsWith("Vg3 påbygg")) return "Vg3 påbygg";
  if (level.startsWith("Vg")) return level.split(" ")[0];
  return level;
}

function extractCompetenceGoals(html: string): string[] {
  const $ = cheerio.load(html);
  const goals = $(".curriculum-goal__item-text")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter(Boolean);
  return Array.from(new Set(goals));
}

function extractCurriculumSections(html: string): OfficialCurriculumSection[] {
  const $ = cheerio.load(html);
  return $(".curriculum-content-chapter")
    .map((_, element) => {
      const chapter = $(element);
      const title = normalizeText(
        chapter.find(".curriculum-content-chapter__title, h2, h3").first().text()
      );
      const content = chapter.clone();
      content.find(".curriculum-content-chapter__heading, script, style, svg, button").remove();
      return { title, text: normalizeText(content.text()) };
    })
    .get()
    .filter((section) => section.title || section.text);
}

function extractHours(html: string): OfficialCurriculumHours {
  const $ = cheerio.load(html);
  const chapters = $(".curriculum-content-chapter").toArray();
  const sections = chapters
    .map((chapterElement) => {
      const chapter = $(chapterElement);
      const rows = chapter
        .find("tr")
        .toArray()
        .map((row) =>
          $(row)
            .find("th, td")
            .toArray()
            .map((cell) => normalizeText($(cell).text()))
            .filter(Boolean)
        )
        .filter((row) => row.length > 0);
      return {
        title: normalizeText(chapter.find(".curriculum-content-chapter__title, h2, h3").first().text()),
        rows,
      };
    })
    .filter((section) => section.rows.length > 0);
  const noteChapter = $(chapters.find((chapter) => $(chapter).find("table").length === 0));
  const noteContent = noteChapter.clone();
  noteContent.find(".curriculum-content-chapter__heading, script, style, svg, button").remove();
  return {
    note: normalizeText(noteContent.text()),
    sections,
  };
}

function withManualHoursFallback(hours: OfficialCurriculumHours): OfficialCurriculumHours {
  if (hours.sections.length > 0) return hours;
  return {
    note: [
      hours.note,
      "Tallet eller tabellen for timetall kunne ikke hentes sikkert fra Udir med dagens struktur. Læreren må kontrollere og fylle inn timetall eller lokal fordeling manuelt.",
    ]
      .filter(Boolean)
      .join(" "),
    sections: [],
  };
}

function absoluteUdirUrl(href: string): string {
  return new URL(href, UDIR_ORIGIN).toString();
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
