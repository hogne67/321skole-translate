import { normalizePlannerPeriodLearningGoal, type PlannerPeriodLearningGoal } from "@/lib/planner/types";

export function validateSinglePeriodLearningGoal(
  value: unknown,
  validOfficialGoalIds: string[],
  level = "",
  options: { officialGoalsById?: Record<string, string>; avoidTexts?: string[]; variantOffset?: number } = {}
): PlannerPeriodLearningGoal | null {
  const record = isRecord(value) ? value : {};
  const rawGoal = isRecord(record.periodLearningGoal)
    ? record.periodLearningGoal
    : Array.isArray(record.periodLearningGoals)
      ? record.periodLearningGoals[0]
      : null;
  if (!rawGoal) return null;

  const validSourceIds = new Set(validOfficialGoalIds);
  const normalized = normalizePlannerPeriodLearningGoal(rawGoal, 0);
  const normalizedSourceIds = [...new Set(normalized.sourceOfficialGoalIds)];
  const sourceOfficialGoalIds = normalizedSourceIds.length > 0 ? normalizedSourceIds : validOfficialGoalIds.slice(0, 1);
  let studentLanguage = normalizeStudentLanguageForLevel(
    normalized.studentLanguage.trim() || normalized.goal.trim(),
    level,
    options.variantOffset ?? 0,
    sourceTextForGoalIds(sourceOfficialGoalIds, options.officialGoalsById)
  );
  if (
    !studentLanguage ||
    sourceOfficialGoalIds.length === 0 ||
    sourceOfficialGoalIds.some((goalId) => !validSourceIds.has(goalId))
  ) {
    return null;
  }
  if (isDuplicateGoalText(studentLanguage, options.avoidTexts ?? [])) {
    studentLanguage = fallbackStudentLanguage(
      options.variantOffset ?? 0,
      sourceTextForGoalIds(sourceOfficialGoalIds, options.officialGoalsById),
      options.avoidTexts ?? []
    );
  }

  return {
    ...normalized,
    id: "period-learning-goal-1",
    goal: studentLanguage,
    studentLanguage,
    sourceOfficialGoalIds,
  };
}

export function validatePeriodLearningGoals(
  value: unknown,
  selectedOfficialGoalIds: string[],
  level = "",
  options: { officialGoalsById?: Record<string, string>; expectedGoalCount?: number } = {}
): { goals: PlannerPeriodLearningGoal[]; uncoveredOfficialGoalIds: string[] } | null {
  const record = isRecord(value) ? value : {};
  if (!Array.isArray(record.periodLearningGoals)) return null;
  const maxGoalCount = Math.max(1, Math.min(8, (selectedOfficialGoalIds.length || 1) * 3));
  if (record.periodLearningGoals.length < 1 || record.periodLearningGoals.length > maxGoalCount) return null;
  const officialGoalsById = options.officialGoalsById ?? {};
  const fallbackTargetCount =
    selectedOfficialGoalIds.length > 1 ? Math.min(8, selectedOfficialGoalIds.length * 2) : 3;
  const targetGoalCount = Math.max(1, Math.min(maxGoalCount, options.expectedGoalCount ?? fallbackTargetCount));

  const validSourceIds = new Set(selectedOfficialGoalIds);
  const usedStudentTexts: string[] = [];
  const goals = record.periodLearningGoals.map((item, index) => {
    const normalized = normalizePlannerPeriodLearningGoal(item, index);
    const normalizedSourceIds = [...new Set(normalized.sourceOfficialGoalIds)];
    const sourceOfficialGoalIds =
      normalizedSourceIds.length > 0
        ? normalizedSourceIds
        : selectedOfficialGoalIds.length > 0
          ? [selectedOfficialGoalIds[index % selectedOfficialGoalIds.length]]
          : [];
    let studentLanguage = normalizeStudentLanguageForLevel(
      normalized.studentLanguage.trim() || normalized.goal.trim(),
      level,
      index,
      sourceTextForGoalIds(sourceOfficialGoalIds, officialGoalsById)
    );
    if (isDuplicateGoalText(studentLanguage, usedStudentTexts)) {
      studentLanguage = fallbackStudentLanguage(
        index,
        sourceTextForGoalIds(sourceOfficialGoalIds, officialGoalsById),
        usedStudentTexts
      );
    }
    usedStudentTexts.push(studentLanguage);
    return {
      ...normalized,
      id: `period-learning-goal-${index + 1}`,
      goal: studentLanguage,
      studentLanguage,
      sourceOfficialGoalIds,
    };
  });

  const invalidGoal = goals.some(
    (goal) =>
      !goal.studentLanguage.trim() ||
      goal.sourceOfficialGoalIds.length === 0 ||
      goal.sourceOfficialGoalIds.some((goalId) => !validSourceIds.has(goalId))
  );
  if (invalidGoal) return null;

  let coveredSourceIds = new Set(goals.flatMap((goal) => goal.sourceOfficialGoalIds));
  let uncoveredOfficialGoalIds = selectedOfficialGoalIds.filter((goalId) => !coveredSourceIds.has(goalId));

  while (goals.length < targetGoalCount || (uncoveredOfficialGoalIds.length > 0 && goals.length < maxGoalCount)) {
    const sourceOfficialGoalIds =
      uncoveredOfficialGoalIds.length > 0
        ? [uncoveredOfficialGoalIds[0]]
        : selectedOfficialGoalIds.length > 0
          ? [selectedOfficialGoalIds[goals.length % selectedOfficialGoalIds.length]]
          : [];
    if (sourceOfficialGoalIds.length === 0) break;

    const sourceText = sourceTextForGoalIds(sourceOfficialGoalIds, officialGoalsById);
    const studentLanguage = fallbackStudentLanguage(goals.length, sourceText, usedStudentTexts);
    usedStudentTexts.push(studentLanguage);
    goals.push({
      id: `period-learning-goal-${goals.length + 1}`,
      goal: studentLanguage,
      studentLanguage,
      sourceOfficialGoalIds,
    });
    coveredSourceIds = new Set(goals.flatMap((goal) => goal.sourceOfficialGoalIds));
    uncoveredOfficialGoalIds = selectedOfficialGoalIds.filter((goalId) => !coveredSourceIds.has(goalId));
  }

  goals.forEach((goal, index) => {
    goal.id = `period-learning-goal-${index + 1}`;
  });

  coveredSourceIds = new Set(goals.flatMap((goal) => goal.sourceOfficialGoalIds));
  uncoveredOfficialGoalIds = selectedOfficialGoalIds.filter((goalId) => !coveredSourceIds.has(goalId));
  return { goals, uncoveredOfficialGoalIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStudentLanguageForLevel(value: string, level: string, index: number, sourceText = ""): string {
  const text = ensureSentence(value);
  if (!usesSimpleTopicLanguage(level)) return text;
  if (!isBadStudentLanguage(text) && !hasWrongExplicitTopic(text, sourceText, level)) return text;
  return fallbackStudentLanguage(index, sourceText);
}

function usesStrictStudentLanguage(level: string): boolean {
  const grade = Number(level.match(/\d+/)?.[0] ?? 0);
  return Number.isFinite(grade) && grade >= 1 && grade <= 6;
}

function usesSimpleTopicLanguage(level: string): boolean {
  return usesStrictStudentLanguage(level) || /fov|modul|voksenopplæring/i.test(level);
}

function isBadStudentLanguage(value: string): boolean {
  if (!value.trim()) return true;
  if (countWords(value) > 15) return true;
  if (/^jeg kan\s+(drøfte|reflektere)\b/i.test(value)) return true;
  if (/\b(knyttet|er|om|som|og|eller|for|til|ved|med)$/i.test(value.replace(/[.!?]\s*$/, "").trim())) return true;
  if (/gi eksempler som viser noe om gi eksempler/i.test(value)) return true;
  if (/variasjoner i identiteter,\s*seksuell orientering og kjønnsuttrykk/i.test(value)) return true;
  if (/sentrale hendelser som har ført til det demokratiet vi har i norge i dag/i.test(value)) return true;
  if (/hvordan møter mellom mennesker har bidratt til å endre hvordan mennesker har tenkt/i.test(value)) return true;
  return false;
}

function hasWrongExplicitTopic(value: string, sourceText: string, level: string): boolean {
  if (!usesSimpleTopicLanguage(level) || !sourceText.trim()) return false;
  const studentTopic = explicitStudentTopic(value);
  if (!studentTopic) return false;
  const allowedTopics = semanticStudentTopics(sourceText, level);
  if (allowedTopics.length === 0) return true;
  return !allowedTopics.includes(studentTopic);
}

function explicitStudentTopic(value: string): string {
  const text = value.toLowerCase();
  return semanticTopicLabels().find((topic) => text.includes(topic)) ?? "";
}

function ensureSentence(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function fallbackStudentLanguage(index: number, sourceText = "", avoidTexts: string[] = []): string {
  const candidates = fallbackCandidates(sourceText);
  return candidates.find((candidate) => !isDuplicateGoalText(candidate, avoidTexts)) ?? candidates[index % candidates.length];
}

function fallbackCandidates(sourceText = ""): string[] {
  const text = sourceText.toLowerCase();
  const topic = semanticStudentTopic(sourceText, "FOV");
  if (topic) {
    return [
      `Jeg kan forklare ${topic} med egne ord.`,
      `Jeg kan finne eksempler på ${topic}.`,
      `Jeg kan lage et enkelt spørsmål om ${topic}.`,
      `Jeg kan samtale om ${topic}.`,
    ];
  }
  if (/stille spørsmål|hypotes|variabel|samle data|undersøk/.test(text)) {
    return [
      "Jeg kan lage et naturfaglig spørsmål.",
      "Jeg kan lage en enkel hypotese.",
      "Jeg kan finne variabler i et forsøk.",
      "Jeg kan samle data fra en undersøkelse.",
    ];
  }
  if (/kropp|helse|livsmestring|psykisk|fysisk/.test(text)) {
    return [
      "Jeg kan forklare noe kroppen trenger.",
      "Jeg kan gi eksempler på gode helsevalg.",
      "Jeg kan samtale om trygghet og helse.",
      "Jeg kan bruke helseinformasjon med omtanke.",
    ];
  }
  if (/kilde|informasjon|vitenskap|argumentasjon/.test(text)) {
    return [
      "Jeg kan finne en kilde.",
      "Jeg kan forklare hvorfor en kilde er nyttig.",
      "Jeg kan sammenligne to enkle kilder.",
      "Jeg kan bruke fakta i en forklaring.",
    ];
  }
  if (/miljø|bærekraft|klima|natur|biologisk mangfold/.test(text)) {
    return [
      "Jeg kan beskrive et miljøvalg.",
      "Jeg kan forklare en sammenheng i naturen.",
      "Jeg kan finne eksempler på bærekraft.",
      "Jeg kan samtale om hvordan vi påvirker naturen.",
    ];
  }
  return [
    "Jeg kan forklare temaet med egne ord.",
    "Jeg kan finne enkle eksempler.",
    "Jeg kan samtale om det vi lærer.",
    "Jeg kan lage et enkelt spørsmål.",
  ];
}

function sourceTextForGoalIds(goalIds: string[], officialGoalsById: Record<string, string> = {}): string {
  return goalIds.map((goalId) => officialGoalsById[goalId] ?? "").filter(Boolean).join(" ");
}

function semanticStudentTopic(value: string, level = ""): string {
  return semanticStudentTopics(value, level)[0] ?? "";
}

function semanticStudentTopics(value: string, level = ""): string[] {
  if (!usesSimpleTopicLanguage(level)) return [];
  const text = value.toLowerCase();
  const topics: string[] = [];
  const add = (topic: string, pattern: RegExp) => {
    if (pattern.test(text)) topics.push(topic);
  };
  add("rim og språklyder", /rim|rytme|språklyd|stavelser/);
  add("bokstaver og lyder", /bokstavlyd|bokstaver|trekke bokstavlyder/);
  add("bøker og tekster", /skjønnlitteratur|sakprosa|bokmål|nynorsk|bøker|bibliotek/);
  add("lek og tekstopplevelser", /tekstopplevelser|\blek\b|sang|tegning|kreative aktiviteter/);
  add("ord som påvirker andre", /ord vi bruker.*påvirke|påvirke andre/);
  add("lesing og forståelse", /lese med sammenheng|leseforståelse/);
  add("samtale og meninger", /ta ordet|begrunne egne meninger|samtaler/);
  add("muntlig og skriftlig fortelling", /beskrive og fortelle|fortelle muntlig|skriftlig/);
  add("skriving for hånd og tastatur", /skrive tekster for hånd|tastatur/);
  add("tegnsetting", /store og små bokstaver|punktum|spørsmålstegn|utropstegn/);
  add("tekst og bilder", /skrift med bilder|kombinerer skrift/);
  add("ord og uttrykk", /ord og uttrykk|betydningen til ord/);
  add("talespråk og skriftspråk", /talespråk|skriftspråk/);
  add("en enkel undersøkelse", /undersøk|resultat|digital(e)? verktøy/);
  add("nyheter og fakta", /nyhet|fakta|mening|medie/);
  add("digital dømmekraft", /digital samhandling|dømmekraft/);
  add("livet før", /fortid|livnærte|teknologi|levekår|bosetting/);
  add("norsk økonomi", /norsk økonomi|økonomiske forhold|økonomi.*resten av verden|påvirkes av økonomi/);
  add("steder i verden", /geograf|steder i verden|verdensdel|verdenskart|land i verden/);
  add("konflikter og ekstremisme", /konflikt|radikalisering|terror|folkemord|holocaust|ekstremisme/);
  add("mangfold og fellesskap", /mangfold|fellesskap|høre til/);
  add("identitet og grenser", /identitet|seksuell|kjønn|grenser|kropp/);
  add("samisk historie", /samene|minoritet/);
  add("rettigheter", /menneskerett|rettigheter/);
  add("kilder og påvirkning", /kilde|bestemte syn/);
  add("likeverd og likestilling", /likeverd|likestilling/);
  add("fordommer og diskriminering", /fordom|rasisme|diskriminering/);
  add("demokrati", /demokrati|styresett/);
  add("reklame og forbruk", /kommersiell|forbruk|økonomi|selvbilde|reklame/);
  add("lover og regler", /lover|regler|normer/);
  add("møter mellom mennesker", /møter mellom mennesker|samfunn har vært organisert/);
  add("bærekraft", /global|bærekraft|samarbeid mellom land/);
  add("arbeidsliv", /arbeidsliv|fagforening|regulering|teknologi påvirker arbeidslivet/);
  add("norsk økonomi", /norsk økonomi|økonomiske forhold|økonomi.*resten av verden|påvirkes av økonomi/);
  add("samfunnsfaglig skriving", /skrive tekster|samfunnsfaglige beskrivelser|forklaringer/);
  return [...new Set(topics)];
}

function semanticTopicLabels(): string[] {
  return [
    "rim og språklyder",
    "bokstaver og lyder",
    "bøker og tekster",
    "lek og tekstopplevelser",
    "ord som påvirker andre",
    "lesing og forståelse",
    "samtale og meninger",
    "muntlig og skriftlig fortelling",
    "skriving for hånd og tastatur",
    "tegnsetting",
    "tekst og bilder",
    "ord og uttrykk",
    "talespråk og skriftspråk",
    "en enkel undersøkelse",
    "nyheter og fakta",
    "digital dømmekraft",
    "livet før",
    "steder i verden",
    "konflikter og ekstremisme",
    "mangfold og fellesskap",
    "identitet og grenser",
    "samisk historie",
    "rettigheter",
    "kilder og påvirkning",
    "likeverd og likestilling",
    "fordommer og diskriminering",
    "demokrati",
    "reklame og forbruk",
    "lover og regler",
    "møter mellom mennesker",
    "bærekraft",
    "arbeidsliv",
    "norsk økonomi",
    "samfunnsfaglig skriving",
  ];
}

function isDuplicateGoalText(value: string, existingTexts: string[]): boolean {
  const normalized = normalizeGoalText(value);
  return Boolean(normalized) && existingTexts.some((text) => normalizeGoalText(text) === normalized);
}

function normalizeGoalText(value: string): string {
  return value.toLocaleLowerCase("nb-NO").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
