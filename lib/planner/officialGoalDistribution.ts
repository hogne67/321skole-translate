import {
  normalizePlannerPeriodLearningGoal,
  type PlannerLocalInitiative,
  type PlannerPeriod,
  type PlannerPeriodLearningGoal,
} from "@/lib/planner/types";

type OfficialGoalPeriodLink = {
  periodId: string;
  officialGoalIds: string[];
};

type SupportGoalMatch = {
  goalId: string;
  periodIndex: number;
  related: boolean;
};

type PeriodLearningGoalLink = {
  periodId: string;
  learningGoals: PlannerPeriodLearningGoal[];
};

type PeriodPlanningSuggestion = {
  periodId: string;
  goals: string;
  content: string;
  methods: string;
  assessment: string;
};

type OfficialGoalDistributionResult = {
  officialGoalPeriodLinks: OfficialGoalPeriodLink[];
  periodLearningGoalLinks: PeriodLearningGoalLink[];
  periodPlanningSuggestions: PeriodPlanningSuggestion[];
};

export function validateOfficialGoalDistribution(
  value: unknown,
  periods: PlannerPeriod[],
  officialGoalsOrCount: string[] | number,
  lockedInitiatives: PlannerLocalInitiative[] = [],
  level = ""
): OfficialGoalDistributionResult | null {
  const record = isRecord(value) ? value : {};
  const officialGoals =
    Array.isArray(officialGoalsOrCount)
      ? officialGoalsOrCount
      : Array.from({ length: officialGoalsOrCount }, () => "");
  const officialGoalCount = officialGoals.length;
  if (officialGoalCount <= 0 || periods.length === 0) return null;

  const validPeriodIds = new Set(periods.map((period) => period.id));
  const validGoalIds = new Set(Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`));
  const rawAssignments = Array.isArray(record.goalAssignments) ? record.goalAssignments : [];
  const assignmentMap = new Map<string, Set<string>>();

  rawAssignments.forEach((item) => {
    const assignment = isRecord(item) ? item : {};
    const officialGoalId = typeof assignment.officialGoalId === "string" ? assignment.officialGoalId : "";
    if (!validGoalIds.has(officialGoalId)) return;

    const periodIds = Array.isArray(assignment.periodIds)
      ? assignment.periodIds.filter((id): id is string => typeof id === "string" && validPeriodIds.has(id))
      : [];
    if (periodIds.length === 0) return;

    assignmentMap.set(officialGoalId, new Set([...(assignmentMap.get(officialGoalId) ?? []), ...periodIds]));
  });

  for (let index = 0; index < officialGoalCount; index += 1) {
    const goalId = `udir-goal-${index + 1}`;
    if (assignmentMap.has(goalId)) continue;
    const targetPeriod = periods[Math.floor((index * periods.length) / officialGoalCount)] ?? periods[0];
    assignmentMap.set(goalId, new Set([targetPeriod.id]));
  }

  const assignments = [...assignmentMap.entries()].map(([officialGoalId, periodIds]) => ({
    officialGoalId,
    periodIds: [...periodIds],
  }));

  let officialGoalPeriodLinks = periods.map((period) => ({
    periodId: period.id,
    officialGoalIds: assignments
      .filter((assignment) => assignment.periodIds.includes(period.id))
      .map((assignment) => assignment.officialGoalId),
  }));
  if (shouldUseStructuredGoalSequence(periods, officialGoalCount)) {
    officialGoalPeriodLinks = createStructuredGoalSequence(periods, officialGoals, level);
  }
  officialGoalPeriodLinks = balanceGoalCoverageAcrossPeriods(officialGoalPeriodLinks, officialGoalCount);
  officialGoalPeriodLinks = diversifyRepeatedPrimaryGoals(officialGoalPeriodLinks, officialGoalCount);
  officialGoalPeriodLinks = applyLockedInitiativeGoalFocus(
    officialGoalPeriodLinks,
    periods,
    lockedInitiatives,
    officialGoals
  );
  const supportGoalMatches = getSupportGoalMatches(officialGoalPeriodLinks, officialGoalCount, officialGoals);
  officialGoalPeriodLinks = applySupportGoalMatches(officialGoalPeriodLinks, supportGoalMatches);

  const learningGoalRecords = (Array.isArray(record.periodLearningGoals) ? record.periodLearningGoals : []).map((item) => {
    const periodGoalRecord = isRecord(item) ? item : {};
    return {
      periodId: typeof periodGoalRecord.periodId === "string" ? periodGoalRecord.periodId : "",
      learningGoals: Array.isArray(periodGoalRecord.learningGoals) ? periodGoalRecord.learningGoals : [],
    };
  });
  const seenLearningGoalPeriodIds = new Set<string>();
  const validLearningGoalRecords = learningGoalRecords.filter((item) => {
    if (!validPeriodIds.has(item.periodId) || seenLearningGoalPeriodIds.has(item.periodId)) return false;
    seenLearningGoalPeriodIds.add(item.periodId);
    return true;
  });

  const periodIndexById = new Map(periods.map((period, index) => [period.id, index]));
  const focusOfficialGoalLimit = officialGoalCount > periods.length ? 2 : 1;
  const focusOfficialGoalsByPeriod = new Map(
    officialGoalPeriodLinks.map((link) => [link.periodId, link.officialGoalIds.slice(0, focusOfficialGoalLimit)])
  );
  const periodLearningGoalLinks = validLearningGoalRecords.flatMap((item): PeriodLearningGoalLink[] => {
    const period = periods.find((candidate) => candidate.id === item.periodId);
    const focusOfficialGoalIds = focusOfficialGoalsByPeriod.get(item.periodId) ?? [];
    const targetCountPerGoal = period
      ? targetLearningGoalCountPerOfficialGoal(periods, period, focusOfficialGoalIds.length)
      : 1;
    const maxLearningGoalCount = Math.max(1, Math.min(8, focusOfficialGoalIds.length * targetCountPerGoal));
    const learningGoals = item.learningGoals.slice(0, maxLearningGoalCount).map((goal, index) => {
      const normalized = normalizePlannerPeriodLearningGoal(goal, index);
      const sourceOfficialGoalIds = [...new Set(normalized.sourceOfficialGoalIds)];
      const sourceGoalId = sourceOfficialGoalIds.find((goalId) => focusOfficialGoalIds.includes(goalId)) ?? sourceOfficialGoalIds[0];
      const studentLanguage = normalizeGeneratedStudentLanguage(
        normalized.studentLanguage.trim() || normalized.goal.trim(),
        level,
        sourceGoalId ? officialGoals[officialGoalIndex(sourceGoalId)] ?? "" : "",
        periodIndexById.get(item.periodId) ?? 0,
        index
      );
      return {
        ...normalized,
        id: `period-learning-goal-${item.periodId}-${index + 1}`,
        goal: studentLanguage,
        studentLanguage,
        sourceOfficialGoalIds,
      };
    });
    const validLearningGoals = learningGoals.filter(
      (goal) =>
        goal.goal.trim() &&
        goal.studentLanguage.trim() &&
        !isGenericFillerLearningGoal(goal) &&
        goal.sourceOfficialGoalIds.length > 0 &&
        goal.sourceOfficialGoalIds.every((goalId) => focusOfficialGoalIds.includes(goalId))
    );
    const periodIndex = periodIndexById.get(item.periodId) ?? 0;
    for (const focusGoalId of focusOfficialGoalIds) {
      let countForGoal = validLearningGoals.filter((goal) => goal.sourceOfficialGoalIds.includes(focusGoalId)).length;
      while (countForGoal < targetCountPerGoal && validLearningGoals.length < maxLearningGoalCount) {
        validLearningGoals.push(
          createFallbackLearningGoal(item.periodId, validLearningGoals.length, [focusGoalId], officialGoals, level, periodIndex)
        );
        countForGoal += 1;
      }
    }
    return validLearningGoals.length > 0 ? [{ periodId: item.periodId, learningGoals: validLearningGoals }] : [];
  });
  const periodLearningGoalIds = new Set(periodLearningGoalLinks.map((link) => link.periodId));
  for (const period of periods) {
    if (periodLearningGoalIds.has(period.id)) continue;
    const focusOfficialGoalIds = focusOfficialGoalsByPeriod.get(period.id) ?? [];
    if (focusOfficialGoalIds.length === 0) continue;
    const targetCountPerGoal = targetLearningGoalCountPerOfficialGoal(periods, period, focusOfficialGoalIds.length);
    const periodIndex = periodIndexById.get(period.id) ?? 0;
    periodLearningGoalLinks.push({
      periodId: period.id,
      learningGoals: focusOfficialGoalIds.flatMap((goalId, goalIndex) =>
        Array.from({ length: targetCountPerGoal }, (_, index) =>
          createFallbackLearningGoal(
            period.id,
            goalIndex * targetCountPerGoal + index,
            [goalId],
            officialGoals,
            level,
            periodIndex
          )
        )
      ),
    });
  }

  const planningSuggestions = (Array.isArray(record.periodPlanningSuggestions) ? record.periodPlanningSuggestions : []).map((item) => {
    const suggestion = isRecord(item) ? item : {};
    return {
      periodId: typeof suggestion.periodId === "string" ? suggestion.periodId : "",
      goals: sanitizePlanningText(suggestion.goals, "goals", 700),
      content: sanitizePlanningText(suggestion.content, "content", 1000),
      methods: sanitizePlanningText(suggestion.methods, "methods", 1000),
      assessment: sanitizePlanningText(suggestion.assessment, "assessment", 1000),
    };
  });
  const seenPlanningPeriodIds = new Set<string>();
  const validPlanningSuggestions = planningSuggestions.flatMap((item): PeriodPlanningSuggestion[] => {
    if (!validPeriodIds.has(item.periodId) || seenPlanningPeriodIds.has(item.periodId)) return [];
    if (!item.goals.trim() || !item.content.trim() || !item.methods.trim() || !item.assessment.trim()) return [];
    seenPlanningPeriodIds.add(item.periodId);
    const period = periods.find((candidate) => candidate.id === item.periodId);
    const sourceOfficialGoalIds = focusOfficialGoalsByPeriod.get(item.periodId) ?? [];
    return period ? [contextualizePlanningSuggestion(item, period, sourceOfficialGoalIds, officialGoals)] : [item];
  });

  const planningPeriodIds = new Set(validPlanningSuggestions.map((item) => item.periodId));
  for (const period of periods) {
    if (planningPeriodIds.has(period.id)) continue;
    const sourceOfficialGoalIds = focusOfficialGoalsByPeriod.get(period.id) ?? [];
    validPlanningSuggestions.push(createFallbackPlanningSuggestion(period, sourceOfficialGoalIds, officialGoals));
  }
  const planningSuggestionsWithLockedInitiatives = applyLockedInitiatives(
    validPlanningSuggestions,
    periods,
    lockedInitiatives
  );

  return {
    officialGoalPeriodLinks,
    periodLearningGoalLinks,
    periodPlanningSuggestions: planningSuggestionsWithLockedInitiatives,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldUseStructuredGoalSequence(periods: PlannerPeriod[], officialGoalCount: number): boolean {
  return periods.length >= 8 && officialGoalCount > 0;
}

function createStructuredGoalSequence(
  periods: PlannerPeriod[],
  officialGoals: string[],
  level: string
): OfficialGoalPeriodLink[] {
  const orderedGoalIds = pedagogicalGoalOrder(officialGoals, level);
  const repeatCounts = weekRepeatCounts(periods.length, orderedGoalIds.length);
  const sequence = orderedGoalIds.flatMap((goalId, index) => Array.from({ length: repeatCounts[index] ?? 1 }, () => goalId));

  return periods.map((period, index) => ({
    periodId: period.id,
    officialGoalIds: [sequence[index] ?? orderedGoalIds[orderedGoalIds.length - 1] ?? "udir-goal-1"],
  }));
}

function weekRepeatCounts(periodCount: number, goalCount: number): number[] {
  if (goalCount <= 0) return [];
  const base = Math.max(1, Math.floor(periodCount / goalCount));
  const extra = periodCount % goalCount;
  return Array.from({ length: goalCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function pedagogicalGoalOrder(officialGoals: string[], level: string): string[] {
  return officialGoals
    .map((goal, index) => ({
      goalId: `udir-goal-${index + 1}`,
      index,
      score: pedagogicalGoalScore(goal, level),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.goalId);
}

function pedagogicalGoalScore(goal: string, level: string): number {
  const text = goal.toLowerCase();
  const grade = Number(level.match(/\d+/)?.[0] ?? 0);
  if (Number.isFinite(grade) && grade > 0 && grade <= 2) {
    if (/rim|rytme|språklyd|stavelser|bokstavlyd/.test(text)) return 1;
    if (/lytte|samtale|skjønnlitteratur|sakprosa|bøker|bibliotek/.test(text)) return 2;
    if (/lek|sang|tegning|kreative/.test(text)) return 3;
    if (/lese med sammenheng|leseforståelse|lesing/.test(text)) return 4;
    if (/ta ordet|meninger|fortelle muntlig|beskrive/.test(text)) return 5;
    if (/skrive tekster|hånd|tastatur|store og små bokstaver|punktum|spørsmålstegn|utropstegn/.test(text)) return 6;
    if (/skrift med bilder|ord og uttrykk|talespråk|skriftspråk/.test(text)) return 7;
    return 8;
  }
  if (isScienceGoal(text)) return scienceGoalScore(text);
  if (isPhysicalEducationGoal(text)) return physicalEducationGoalScore(text);
  const primaryTag = primarySemanticGoalTag(goal);
  const order = [
    "method-source-investigation",
    "media-digital",
    "history-change",
    "geography-sustainability",
    "democracy-rights-laws",
    "conflict-society",
    "identity-diversity-belonging",
    "economy-consumption",
  ];
  const index = order.indexOf(primaryTag);
  return index >= 0 ? index + 1 : 20;
}

function isPhysicalEducationGoal(text: string): boolean {
  return /trening|helse|velvære|lek|dans|friluftsliv|idrett|bevegelsesaktivitet|svømme|svømmeteknikk|livredning|førstehjelp|kart|orientere|uteaktivitet|sporløs|kroppsidentitet|selvbilde|skader|sykdom/.test(text);
}

function physicalEducationGoalScore(text: string): number {
  if (/trening|helse|velvære|lek|idrettsaktiviteter|bevegelsesaktiviteter/.test(text)) return 1;
  if (/trene på|utvikle ferdigheter|varierte bevegelsesaktiviteter/.test(text)) return 2;
  if (/dans|danseaktiviteter|dansekomposisjoner/.test(text)) return 3;
  if (/ulikhet|inkludere alle|forutsetninger/.test(text)) return 4;
  if (/kropp i media|kroppsidentitet|selvbilde|samfunnet påvirker/.test(text)) return 5;
  if (/skader|sykdom/.test(text)) return 6;
  if (/framgang for andre|medvirke til framgang/.test(text)) return 7;
  if (/kart|digitale verktøy|orientere seg/.test(text)) return 8;
  if (/svømme|svømmeteknikker|lengre distanse/.test(text)) return 9;
  if (/friluftsliv|overnatting ute|naturopplevelser|årstider/.test(text)) return 10;
  if (/risiko|sikkerhet|sporløs|trygg ferdsel|uteaktiviteter/.test(text)) return 11;
  if (/livredning|ved vann|på vann|i vann/.test(text)) return 12;
  if (/førstehjelp|livreddende/.test(text)) return 13;
  return 20;
}

function isScienceGoal(text: string): boolean {
  return /naturfag|hypotes|variabel|data|modell|forsøk|forskning|teknolog|programmering|atom|kjem|reaksjon|drivhus|klima|energi|evolusjon|biologisk|økosystem|celle|fotosyntese|celleånding|platetektonikk|nervesystem|hormon|immunforsvar|vaksin|seksuell|reproduktiv|naturressurs/.test(text);
}

function scienceGoalScore(text: string): number {
  if (/stille spørsmål|hypotes|variabel|samle data/.test(text)) return 1;
  if (/analysere|innsamlede data|forklaringene|kvaliteten/.test(text)) return 2;
  if (/risikovurder|sikkerhetstiltak/.test(text)) return 3;
  if (/modell|modeller/.test(text)) return 4;
  if (/forskning|ny kunnskap|kritisk tilnærming/.test(text)) return 5;
  if (/teknologiske systemer|sender og mottaker|programmering/.test(text)) return 6;
  if (/atom|periodesystem|grunnstoff|kjemiske forbindelser/.test(text)) return 7;
  if (/kjemiske reaksjoner|massebevaring|forbrenningsreaksjoner/.test(text)) return 8;
  if (/energi|energibevaring|energikvalitet|omdanne|transportere|lagre energi/.test(text)) return 9;
  if (/energiproduksjon|energibruk|miljøet/.test(text)) return 10;
  if (/drivhuseffekten|klimaendringer/.test(text)) return 11;
  if (/økosystem|abiotiske|biotiske|kretsløp/.test(text)) return 12;
  if (/celler|oppbygning og funksjon/.test(text)) return 13;
  if (/fotosyntese|celleånding|karbonkretsløpet/.test(text)) return 14;
  if (/evolusjon|biologisk mangfold/.test(text)) return 15;
  if (/naturressurser|tap av biologisk mangfold|bærekraftig/.test(text)) return 16;
  if (/samers tradisjonelle kunnskap|forvaltning av naturen/.test(text)) return 17;
  if (/platetektonikk|jordas utvikling/.test(text)) return 18;
  if (/nervesystem|hormonsystem|rusmidler|legemidler|miljøgifter|doping/.test(text)) return 19;
  if (/immunforsvar|vaksiner|folkehelsen/.test(text)) return 20;
  if (/seksuell|reproduktiv helse/.test(text)) return 21;
  return 30;
}

function balanceGoalCoverageAcrossPeriods(
  links: OfficialGoalPeriodLink[],
  officialGoalCount: number
): OfficialGoalPeriodLink[] {
  if (links.length === 0 || officialGoalCount === 0) return links;
  const allGoalIds = Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`);
  const emptyPeriodCount = links.filter((link) => link.officialGoalIds.length === 0).length;

  if (links.length > officialGoalCount && emptyPeriodCount > 0) {
    return links.map((link, index) => {
      const primaryGoalId = allGoalIds[Math.min(officialGoalCount - 1, Math.floor((index * officialGoalCount) / links.length))];
      return { ...link, officialGoalIds: [primaryGoalId] };
    });
  }

  return links.map((link, index) => {
    if (link.officialGoalIds.length > 0) return link;
    const previous = [...links].slice(0, index).reverse().find((item) => item.officialGoalIds.length > 0);
    const next = links.slice(index + 1).find((item) => item.officialGoalIds.length > 0);
    return {
      ...link,
      officialGoalIds: previous?.officialGoalIds.slice(0, 1) ?? next?.officialGoalIds.slice(0, 1) ?? [allGoalIds[0]],
    };
  });
}

function diversifyRepeatedPrimaryGoals(
  links: OfficialGoalPeriodLink[],
  officialGoalCount: number
): OfficialGoalPeriodLink[] {
  if (links.length <= 1 || officialGoalCount < links.length) return links;
  const allGoalIds = Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`);
  const usedPrimaryGoalIds = new Set<string>();

  return links.map((link, index) => {
    const proportionalGoalId = allGoalIds[Math.min(officialGoalCount - 1, Math.floor((index * officialGoalCount) / links.length))];
    const previousPrimaryGoalId = index > 0 ? links[index - 1]?.officialGoalIds[0] : "";
    const primaryGoalId = link.officialGoalIds[0] ?? "";
    const shouldReplace =
      !primaryGoalId ||
      primaryGoalId === previousPrimaryGoalId ||
      (usedPrimaryGoalIds.has(primaryGoalId) && !link.officialGoalIds.includes(proportionalGoalId));

    const nextPrimaryGoalId = shouldReplace ? proportionalGoalId : primaryGoalId;
    usedPrimaryGoalIds.add(nextPrimaryGoalId);
    return {
      ...link,
      officialGoalIds: [nextPrimaryGoalId, ...link.officialGoalIds.filter((goalId) => goalId !== nextPrimaryGoalId)],
    };
  });
}

function getSupportGoalMatches(
  links: OfficialGoalPeriodLink[],
  officialGoalCount: number,
  officialGoals: string[]
): SupportGoalMatch[] {
  if (links.length === 0 || officialGoalCount <= links.length) return [];
  const allGoalIds = Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`);
  const primaryGoalIds = new Set(links.map((link) => link.officialGoalIds[0]).filter(Boolean));
  const supportGoalIds = allGoalIds.filter((goalId) => !primaryGoalIds.has(goalId));
  if (supportGoalIds.length === 0) return [];

  const usedPeriodIndexes = new Set<number>();
  return supportGoalIds.map((goalId, index) => {
    const preferredMatch = bestSupportPeriodMatch(goalId, links, usedPeriodIndexes, officialGoals);
    const fallbackIndex = Math.min(links.length - 1, Math.floor(((index + 0.5) * links.length) / supportGoalIds.length));
    const periodIndex = preferredMatch?.periodIndex ?? nearestFreePeriodIndex(fallbackIndex, links.length, usedPeriodIndexes);
    usedPeriodIndexes.add(periodIndex);
    return { goalId, periodIndex, related: Boolean(preferredMatch) };
  });
}

function applySupportGoalMatches(links: OfficialGoalPeriodLink[], supportMatches: SupportGoalMatch[]): OfficialGoalPeriodLink[] {
  return links.map((link, index) => {
    const supportForPeriod = supportMatches
      .filter((match) => match.periodIndex === index)
      .map((match) => match.goalId)
      .slice(0, 1);
    return {
      ...link,
      officialGoalIds: [...link.officialGoalIds.slice(0, 1), ...supportForPeriod],
    };
  });
}

function applyLockedInitiativeGoalFocus(
  links: OfficialGoalPeriodLink[],
  periods: PlannerPeriod[],
  initiatives: PlannerLocalInitiative[],
  officialGoals: string[]
): OfficialGoalPeriodLink[] {
  const locked = initiatives.filter((item) => item.locked && (item.title.trim() || item.description.trim()));
  if (locked.length === 0 || officialGoals.length === 0) return links;

  return locked.reduce((currentLinks, initiative) => {
    const targetPeriodIndex = periods.findIndex((period) => initiativeMatchesPeriod(initiative, period));
    if (targetPeriodIndex < 0) return currentLinks;

    const initiativeText = `${initiative.title} ${initiative.description}`.trim();
    const bestGoal = bestOfficialGoalForInitiative(initiativeText, officialGoals);
    if (!bestGoal || bestGoal.score < 3) return currentLinks;

    const targetLink = currentLinks[targetPeriodIndex];
    if (!targetLink) return currentLinks;
    if (targetLink.officialGoalIds[0] === bestGoal.goalId) return currentLinks;

    const nextLinks = currentLinks.map((link) => ({ ...link, officialGoalIds: [...link.officialGoalIds] }));
    const currentOwnerIndex = nextLinks.findIndex((link) => link.officialGoalIds.includes(bestGoal.goalId));
    const previousPrimaryGoalId = targetLink.officialGoalIds[0] ?? "";

    if (currentOwnerIndex >= 0) {
      nextLinks[currentOwnerIndex].officialGoalIds = nextLinks[currentOwnerIndex].officialGoalIds.filter(
        (goalId) => goalId !== bestGoal.goalId
      );
      if (previousPrimaryGoalId && !nextLinks[currentOwnerIndex].officialGoalIds.includes(previousPrimaryGoalId)) {
        nextLinks[currentOwnerIndex].officialGoalIds.unshift(previousPrimaryGoalId);
      }
    }

    nextLinks[targetPeriodIndex].officialGoalIds = [
      bestGoal.goalId,
      ...nextLinks[targetPeriodIndex].officialGoalIds.filter((goalId) => goalId !== bestGoal.goalId),
    ].slice(0, 2);

    return nextLinks;
  }, links);
}

function bestOfficialGoalForInitiative(
  initiativeText: string,
  officialGoals: string[]
): { goalId: string; score: number } | null {
  const initiativeKeywords = goalKeywords(initiativeText);
  const initiativeTags = new Set(semanticGoalTags(initiativeText.toLowerCase()));
  const candidates = officialGoals
    .map((goal, index) => {
      const goalTags = new Set(semanticGoalTags(goal.toLowerCase()));
      const tagScore = [...initiativeTags].filter((tag) => goalTags.has(tag)).length * 4;
      const score = keywordOverlapScore(initiativeKeywords, goalKeywords(goal)) + tagScore;
      return { goalId: `udir-goal-${index + 1}`, score };
    })
    .sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function bestSupportPeriodMatch(
  supportGoalId: string,
  links: OfficialGoalPeriodLink[],
  usedPeriodIndexes: Set<number>,
  officialGoals: string[]
): { periodIndex: number } | null {
  const supportText = officialGoals[officialGoalIndex(supportGoalId)] ?? "";
  const supportKeywords = goalKeywords(supportText);
  const candidates = links
    .map((link, index) => {
      const primaryGoalId = link.officialGoalIds[0];
      const primaryText = primaryGoalId ? officialGoals[officialGoalIndex(primaryGoalId)] ?? "" : "";
      if (!primaryText || usedPeriodIndexes.has(index)) return null;
      const primaryKeywords = goalKeywords(primaryText);
      const score =
        keywordOverlapScore(supportKeywords, primaryKeywords) +
        semanticMatchBonus(supportText, primaryText);
      const listDistance = Math.abs(officialGoalIndex(supportGoalId) - officialGoalIndex(primaryGoalId ?? ""));
      return {
        index,
        score,
        listDistance,
      };
    })
    .filter((candidate): candidate is { index: number; score: number; listDistance: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.listDistance - b.listDistance);
  if (candidates[0] && candidates[0].score >= 5) return { periodIndex: candidates[0].index };
  if (candidates[0] && candidates[0].score >= 3 && candidates[0].listDistance <= 4) return { periodIndex: candidates[0].index };
  return null;
}

function nearestFreePeriodIndex(targetIndex: number, periodCount: number, usedPeriodIndexes: Set<number>): number {
  for (let distance = 0; distance < periodCount; distance += 1) {
    const before = targetIndex - distance;
    if (before >= 0 && !usedPeriodIndexes.has(before)) return before;
    const after = targetIndex + distance;
    if (after < periodCount && !usedPeriodIndexes.has(after)) return after;
  }
  return Math.max(0, Math.min(periodCount - 1, targetIndex));
}

function goalKeywords(value: string): string[] {
  const normalizedValue = value.toLowerCase();
  const stopWords = new Set([
    "hvordan",
    "hvorfor",
    "hvilke",
    "ulike",
    "samme",
    "sentrale",
    "hovedtrekk",
    "eksempler",
    "forklare",
    "beskrive",
    "utforske",
    "undersøke",
    "drøfte",
    "reflektere",
    "samtale",
    "presentere",
    "bruke",
    "gjennomføre",
    "utvikle",
    "sammenligne",
    "mennesker",
    "samfunnet",
  ]);
  const words = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !stopWords.has(word));
  const phrases: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]}`);
  }
  return [...new Set([...words, ...phrases, ...semanticGoalTags(normalizedValue)])].slice(0, 32);
}

function semanticGoalTags(value: string): string[] {
  const tags: string[] = [];
  const groups: Array<[string, RegExp]> = [
    ["method-source-investigation", /undersøk|kilde|kilder|informasjon|digital(e)? verktøy|presentere resultat/],
    ["media-digital", /nyhet|medie|fakta|mening|kommersiell|digital samhandling|dømmekraft/],
    ["history-change", /fortid|historie|historien|livnærte|teknologi|demografi|levekår|bosetting|møter mellom mennesker|samfunn har vært organisert|samene|minoritet/],
    ["geography-sustainability", /geograf|verden|global|bærekraft|utvikling|konsekvens|samarbeid mellom land/],
    ["democracy-rights-laws", /demokrati|rettighet|menneskerett|likeverd|likestilling|lover|regler|normer|styresett/],
    ["identity-diversity-belonging", /mangfold|identitet|seksuell|kjønn|grenser|følelser|kropp|fellesskap|fordom|rasisme|diskriminering/],
    ["conflict-society", /konflikt|håndtere|samfunnet|konsekvenser|radikalisering|terror|folkemord|holocaust|ekstremisme/],
    ["economy-consumption", /forbruk|økonomi|selvbilde|kommersiell|reklame/],
  ];

  groups.forEach(([tag, pattern]) => {
    if (pattern.test(value)) tags.push(tag);
  });
  return tags;
}

function keywordOverlapScore(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return a.reduce((score, keyword) => score + (bSet.has(keyword) ? (keyword.includes(" ") ? 2 : 1) : 0), 0);
}

function semanticMatchBonus(left: string, right: string): number {
  const leftTag = primarySemanticGoalTag(left);
  const rightTag = primarySemanticGoalTag(right);
  if (leftTag && rightTag && leftTag === rightTag) return 8;
  const leftTags = new Set(semanticGoalTags(left.toLowerCase()));
  const rightTags = new Set(semanticGoalTags(right.toLowerCase()));
  return [...leftTags].some((tag) => rightTags.has(tag)) ? 3 : 0;
}

function primarySemanticGoalTag(value: string): string {
  const text = value.toLowerCase();
  if (/nyhet|medie|fakta|mening|digital samhandling|dømmekraft/.test(text)) return "media-digital";
  if (/kilde|kilder|bestemte syn/.test(text)) return "method-source-investigation";
  if (/fortid|historie|historien|livnærte|teknologi|demografi|levekår|bosetting|møter mellom mennesker|samfunn har vært organisert|samene|minoritet/.test(text)) return "history-change";
  if (/global|bærekraft|geograf|verden|samarbeid mellom land/.test(text)) return "geography-sustainability";
  if (/identitet|seksuell|kjønn|grenser|følelser|kropp|mangfold|fellesskap|høre til/.test(text)) return "identity-diversity-belonging";
  if (/demokrati|rettighet|menneskerett|likeverd|likestilling|lover|regler|normer|styresett|fordom|rasisme|diskriminering/.test(text)) return "democracy-rights-laws";
  if (/konflikt|håndtere|radikalisering|terror|folkemord|holocaust|ekstremisme/.test(text)) return "conflict-society";
  if (/forbruk|økonomi|selvbilde|kommersiell|reklame/.test(text)) return "economy-consumption";
  if (/undersøk|presentere resultat/.test(text)) return "method-source-investigation";
  return "";
}

function targetLearningGoalCountPerOfficialGoal(
  periods: PlannerPeriod[],
  period: PlannerPeriod,
  focusGoalCount: number
): number {
  if (periods.length >= 30) return 1;
  const weekCount = estimateWeekCount(period.weeks);
  if (weekCount <= 1) return 1;
  if (focusGoalCount > 1) return 2;
  return 3;
}

function estimateWeekCount(value: string): number {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/(?:uke|undervisningsuke)\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end >= start) {
      for (let week = start; week <= end && week <= start + 8; week += 1) numbers.add(week);
    } else {
      for (let week = start; week <= 53; week += 1) numbers.add(week);
      for (let week = 1; week <= end; week += 1) numbers.add(week);
    }
  }
  return numbers.size > 0 ? numbers.size : 3;
}

function createFallbackLearningGoal(
  periodId: string,
  index: number,
  sourceOfficialGoalIds: string[],
  officialGoals: string[],
  level = "",
  periodIndex = 0
): PlannerPeriodLearningGoal {
  const sourceText = sourceOfficialGoalIds
    .map((goalId) => officialGoals[officialGoalIndex(goalId)] ?? "")
    .find((text) => text.trim().length > 0);
  const topic = localGoalTopic(sourceText, level);
  const variants = fallbackLearningGoalVariants(topic, level);
  const variant = variants[fallbackVariantIndex(periodIndex, index, variants.length)];
  return {
    id: `period-learning-goal-${periodId}-${index + 1}`,
    goal: variant.studentLanguage,
    studentLanguage: variant.studentLanguage,
    sourceOfficialGoalIds,
  };
}

function fallbackVariantIndex(periodIndex: number, goalIndex: number, variantCount: number): number {
  if (variantCount <= 1) return 0;
  const offset = Number.isFinite(periodIndex) && periodIndex >= 0 ? periodIndex : 0;
  return (offset + goalIndex) % variantCount;
}

function normalizeGeneratedStudentLanguage(
  value: string,
  level: string,
  sourceText: string,
  periodIndex: number,
  goalIndex: number
): string {
  const text = ensureSentence(value);
  if (!usesStrictStudentLanguage(level)) return text;
  if (!isBadStudentLanguage(text, sourceText, level)) return text;
  const topic = localGoalTopic(sourceText, level);
  const variants = fallbackLearningGoalVariants(topic, level);
  return variants[fallbackVariantIndex(periodIndex, goalIndex, variants.length)]?.studentLanguage ?? "Jeg kan forklare temaet med egne ord.";
}

function usesStrictStudentLanguage(level: string): boolean {
  const grade = Number(level.match(/\d+/)?.[0] ?? 0);
  return Number.isFinite(grade) && grade >= 1 && grade <= 6;
}

function usesSimpleTopicLanguage(level: string): boolean {
  return usesStrictStudentLanguage(level) || /fov|modul|voksenopplæring/i.test(level);
}

function isBadStudentLanguage(value: string, sourceText = "", level = ""): boolean {
  if (!value.trim()) return true;
  if (countWords(value) > 15) return true;
  if (/^jeg kan\s+(drøfte|reflektere)\b/i.test(value)) return true;
  if (/\b(knyttet|er|om|som|og|eller|for|til|ved|med)$/i.test(value.replace(/[.!?]\s*$/, "").trim())) return true;
  if (/gi eksempler som viser noe om gi eksempler/i.test(value)) return true;
  if (/variasjoner i identiteter,\s*seksuell orientering og kjønnsuttrykk/i.test(value)) return true;
  if (/sentrale hendelser som har ført til det demokratiet vi har i norge i dag/i.test(value)) return true;
  if (/hvordan møter mellom mennesker har bidratt til å endre hvordan mennesker har tenkt/i.test(value)) return true;
  if (hasWrongExplicitTopic(value, sourceText, level)) return true;
  return false;
}

function hasWrongExplicitTopic(value: string, sourceText: string, level: string): boolean {
  if (!usesSimpleTopicLanguage(level) || !sourceText.trim()) return false;
  const studentTopic = explicitStudentTopic(value);
  if (!studentTopic) return false;
  const allowedTopics = semanticStudentTopics(sourceText, level);
  if (allowedTopics.length === 0) return true;
  return allowedTopics.length > 0 && !allowedTopics.includes(studentTopic);
}

function explicitStudentTopic(value: string): string {
  const text = value.toLowerCase();
  const topics = [
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
    "kilder og påvirkning",
    "identitet og grenser",
    "digital dømmekraft",
    "lover og regler",
    "steder i verden",
    "konflikter og ekstremisme",
    "demokrati",
    "samisk historie",
    "bærekraft",
    "fordommer og diskriminering",
    "likeverd og likestilling",
    "rettigheter",
    "reklame og forbruk",
    "møter mellom mennesker",
    "en enkel undersøkelse",
    "samfunnsfaglig skriving",
  ];
  return topics.find((topic) => text.includes(topic)) ?? "";
}

function ensureSentence(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function officialGoalIndex(goalId: string): number {
  const number = Number(goalId.match(/^udir-goal-(\d+)$/)?.[1] ?? 0);
  return Number.isFinite(number) && number > 0 ? number - 1 : -1;
}

function localGoalTopic(value = "", level = ""): string {
  const semanticTopic = semanticStudentTopic(value, level);
  if (semanticTopic) return semanticTopic;
  const text = trimDanglingTopicWords(
    value
    .replace(/\s+/g, " ")
      .replace(/^\s*og\s+/i, "")
      .replace(
        /^(utforske|undersøke|beskrive|forklare|drøfte|reflektere over|samtale om|presentere|gjøre rede for|gjennomføre|sammenligne|utvikle|bruke|gi eksempler på|finne eksempler på)\s+/i,
        ""
      )
      .replace(/^hva\s+/i, "")
      .split(/[.;]/)[0]
      .split(/\s*,\s*og\s+|\s+og\s+(?=(presentere|reflektere|drøfte|samtale|utvikle|beskrive|forklare|undersøke|utforske|sammenligne|vurdere|gjøre|bruke|hvilke|hvordan|hvorfor|hva)\b)/i)[0]
      .trim()
  );
  const words = text.split(" ").filter(Boolean);
  const maxWords = usesStrictStudentLanguage(level) ? 5 : 14;
  const shortened = words.length > maxWords ? trimDanglingTopicWords(words.slice(0, maxWords).join(" ")) : text;
  return shortened || "periodens faglige tema";
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
  add("steder i verden", /geograf|verden/);
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
  add("norsk økonomi", /norsk økonomi|økonomiske forhold/);
  add("samfunnsfaglig skriving", /skrive tekster|samfunnsfaglige beskrivelser|forklaringer/);
  return [...new Set(topics)];
}

function trimDanglingTopicWords(value: string): string {
  let words = value.split(" ").filter(Boolean);
  while (
    words.length > 1 &&
    /^(og|eller|å|i|på|av|om|med|for|til|ved|som|det|den|de|et|en)$/i.test(words[words.length - 1])
  ) {
    words = words.slice(0, -1);
  }
  return words.join(" ").trim();
}

function fallbackLearningGoalVariants(topic: string, level = ""): Array<{ goal: string; studentLanguage: string }> {
  const grade = Number(level.match(/\d+/)?.[0] ?? 0);
  if (Number.isFinite(grade) && grade > 0 && grade <= 5) {
    return [
      {
        goal: `Forklare ${topic} med egne ord.`,
        studentLanguage: `Jeg kan forklare ${topic} med egne ord.`,
      },
      {
        goal: `Finne enkle eksempler på ${topic}.`,
        studentLanguage: `Jeg kan finne eksempler på ${topic}.`,
      },
      {
        goal: `Lage et enkelt spørsmål om ${topic}.`,
        studentLanguage: `Jeg kan lage et enkelt spørsmål om ${topic}.`,
      },
      {
        goal: `Samtale om ${topic}.`,
        studentLanguage: `Jeg kan samtale om ${topic}.`,
      },
      {
        goal: `Sortere enkel informasjon om ${topic}.`,
        studentLanguage: `Jeg kan sortere informasjon om ${topic}.`,
      },
      {
        goal: `Fortelle noe faglig om ${topic}.`,
        studentLanguage: `Jeg kan fortelle noe om ${topic}.`,
      },
    ];
  }
  if (Number.isFinite(grade) && grade >= 7) {
    return [
      {
        goal: `Undersøke ${topic} og bruke relevante kilder til å forklare funn.`,
        studentLanguage: `Jeg kan undersøke ${topic} og forklare funn med støtte i kilder.`,
      },
      {
        goal: `Sammenligne ulike perspektiver, eksempler eller forklaringer knyttet til ${topic}.`,
        studentLanguage: `Jeg kan sammenligne ulike sider ved ${topic}.`,
      },
      {
        goal: `Drøfte eller begrunne egne vurderinger av ${topic}.`,
        studentLanguage: `Jeg kan begrunne egne vurderinger av ${topic}.`,
      },
      {
        goal: `Presentere en faglig forklaring av ${topic} med relevante begreper.`,
        studentLanguage: `Jeg kan presentere en faglig forklaring av ${topic}.`,
      },
    ];
  }
  return [
    {
      goal: `Undersøke ${topic} og forklare sentrale funn med egne ord.`,
      studentLanguage: `Jeg kan undersøke ${topic} og forklare det med egne ord.`,
    },
    {
      goal: `Bruke kilder, eksempler eller faglige begreper til å arbeide med ${topic}.`,
      studentLanguage: `Jeg kan bruke kilder, eksempler eller fagord når jeg arbeider med ${topic}.`,
    },
    {
      goal: `Sammenligne, begrunne eller reflektere over ulike sider ved ${topic}.`,
      studentLanguage: `Jeg kan sammenligne og begrunne tanker om ${topic}.`,
    },
    {
      goal: `Vise forståelse for ${topic} gjennom samtale, kort tekst eller presentasjon.`,
      studentLanguage: `Jeg kan vise hva jeg forstår om ${topic}.`,
    },
  ];
}

function isGenericFillerLearningGoal(goal: PlannerPeriodLearningGoal): boolean {
  const text = `${goal.goal} ${goal.studentLanguage}`.toLowerCase();
  return [
    "bruke riktige begreper og strategier",
    "vise og forklare hva jeg har lært",
    "forklare viktige ideer i det vi arbeider med denne perioden",
    "periodens faglige innhold",
  ].some((phrase) => text.includes(phrase));
}

function createFallbackPlanningSuggestion(
  period: PlannerPeriod,
  sourceOfficialGoalIds: string[] = [],
  officialGoals: string[] = []
): PeriodPlanningSuggestion {
  const topic = topicFromOfficialGoalIds(sourceOfficialGoalIds, officialGoals);
  const variantIndex = fallbackPlanningVariantIndex(period);
  return {
    periodId: period.id,
    goals: defaultPlanningText("goals", topic, variantIndex),
    content: defaultPlanningText("content", topic, variantIndex),
    methods: defaultPlanningText("methods", topic, variantIndex),
    assessment: defaultPlanningText("assessment", topic, variantIndex),
  };
}

function contextualizePlanningSuggestion(
  suggestion: PeriodPlanningSuggestion,
  period: PlannerPeriod,
  sourceOfficialGoalIds: string[],
  officialGoals: string[]
): PeriodPlanningSuggestion {
  const topic = topicFromOfficialGoalIds(sourceOfficialGoalIds, officialGoals);
  return {
    periodId: period.id,
    goals: replaceDefaultPlanningText(suggestion.goals, "goals", topic),
    content: replaceDefaultPlanningText(suggestion.content, "content", topic),
    methods: replaceDefaultPlanningText(suggestion.methods, "methods", topic),
    assessment: replaceDefaultPlanningText(suggestion.assessment, "assessment", topic),
  };
}

function topicFromOfficialGoalIds(sourceOfficialGoalIds: string[], officialGoals: string[]): string {
  const sourceText = sourceOfficialGoalIds
    .map((goalId) => officialGoals[officialGoalIndex(goalId)] ?? "")
    .find((text) => text.trim().length > 0);
  return localGoalTopic(sourceText);
}

function fallbackPlanningVariantIndex(period: PlannerPeriod): number {
  const source = `${period.title} ${period.weeks} ${period.id}`;
  const number = Number(source.match(/\d+/)?.[0] ?? 0);
  return Number.isFinite(number) && number > 0 ? number - 1 : 0;
}

function applyLockedInitiatives(
  suggestions: PeriodPlanningSuggestion[],
  periods: PlannerPeriod[],
  initiatives: PlannerLocalInitiative[]
): PeriodPlanningSuggestion[] {
  const locked = initiatives.filter((item) => item.locked && item.title.trim());
  if (locked.length === 0) return suggestions;

  return suggestions.map((suggestion) => {
    const period = periods.find((item) => item.id === suggestion.periodId);
    if (!period) return suggestion;
    const matching = locked.filter((initiative) => initiativeMatchesPeriod(initiative, period));
    if (matching.length === 0) return suggestion;

    const enrichment = matching.map(lockedInitiativePlanningText);
    const hasLockedFrameNote = `${suggestion.content}\n${suggestion.methods}`.toLowerCase().includes("låst lokal ramme");

    return {
      ...suggestion,
      content: [
        suggestion.content,
        ...enrichment.map((item) => item.content),
        hasLockedFrameNote ? "" : `Låst lokal ramme: ${matching.map((initiative) => initiative.title).join(", ")}.`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
      methods: [
        suggestion.methods,
        ...enrichment.map((item) => item.methods),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    };
  });
}

function lockedInitiativePlanningText(initiative: PlannerLocalInitiative): { content: string; methods: string } {
  const title = initiative.title.trim();
  const description = shortInitiativeDescription(initiative.description);
  const timing = initiative.timing.trim();
  const frame = [title, timing ? timing : ""].filter(Boolean).join(" ");
  const presentation = /presentasjon|presentere|framføring|fremføring/i.test(`${frame} ${initiative.description}`);
  const groupWork = /gruppe|samarbeid|prosjekt/i.test(`${frame} ${initiative.description}`);

  return {
    content: description
      ? `Knytt periodens faglige arbeid til ${title}: ${description}.`
      : `Knytt periodens faglige arbeid til det lokale prosjektet ${title}.`,
    methods: presentation
      ? `La elevene arbeide ${groupWork ? "i grupper" : "praktisk"} mot en kort presentasjon knyttet til ${title}.`
      : `La arbeidsmåtene i perioden støtte det lokale prosjektet ${title}.`,
  };
}

function shortInitiativeDescription(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const firstSentence = text.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? text;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trim()}...` : firstSentence.replace(/[.!?]$/, "");
}

function initiativeMatchesPeriod(initiative: PlannerLocalInitiative, period: PlannerPeriod): boolean {
  const dateWeeks = weekNumbersFromDates(initiative.startDate, initiative.endDate);
  const periodWeeks = weekNumbers(period.weeks.toLowerCase());
  if (dateWeeks.length > 0 && periodWeeks.length > 0) {
    return dateWeeks.some((week) => periodWeeks.includes(week));
  }

  const timing = initiative.timing.toLowerCase();
  const weeks = period.weeks.toLowerCase();
  const timingWeeks = weekNumbers(timing);
  if (timingWeeks.length > 0 && periodWeeks.length > 0) {
    return timingWeeks.some((week) => periodWeeks.includes(week));
  }
  return Boolean(timing && weeks.includes(timing));
}

function weekNumbersFromDates(startValue: string, endValue: string): number[] {
  const start = parseIsoDate(startValue);
  if (!start) return [];
  const end = parseIsoDate(endValue) ?? start;
  if (end < start) return [];
  const numbers = new Set<number>();
  for (let date = startOfIsoWeek(start); date <= end; date = addUtcDays(date, 7)) {
    numbers.add(isoWeek(date));
  }
  return [...numbers];
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay() || 7;
  return addUtcDays(date, 1 - day);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoWeek(date: Date): number {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekStart = startOfIsoWeek(firstThursday);
  return Math.floor((thursday.getTime() - firstWeekStart.getTime()) / 604_800_000) + 1;
}

function weekNumbers(value: string): number[] {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/(?:uke|week|undervisningsuke)\s*(\d+)(?:\s*-\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let week = start; week <= end && week <= start + 60; week += 1) numbers.add(week);
  }
  return [...numbers];
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizePlanningText(value: unknown, field: keyof Omit<PeriodPlanningSuggestion, "periodId">, maxLength: number): string {
  const text = safeText(value, maxLength);
  if (!text || isPlaceholderPlanningText(text)) return defaultPlanningText(field);
  return text;
}

function replaceDefaultPlanningText(
  value: string,
  field: keyof Omit<PeriodPlanningSuggestion, "periodId">,
  topic: string
): string {
  return value === defaultPlanningText(field) || isPlaceholderPlanningText(value) ? defaultPlanningText(field, topic) : value;
}

function isPlaceholderPlanningText(value: string): boolean {
  const text = value.toLowerCase();
  return [
    "velg faglig innhold",
    "velg innhold",
    "fyll inn",
    "sett inn",
    "choose content",
    "select content",
    "fill in",
    "insert content",
  ].some((phrase) => text.includes(phrase));
}

function defaultPlanningText(
  field: keyof Omit<PeriodPlanningSuggestion, "periodId">,
  topic = "periodens kompetansemål",
  variantIndex = 0
): string {
  const index = Math.abs(variantIndex) % 4;
  if (field === "goals") {
    return [
      `Arbeid med ${topic} gjennom konkrete lokale læringsmål.`,
      `Bygg en enkel faglig forståelse av ${topic}.`,
      `Knytt periodens mål til sentrale begreper og eksempler innen ${topic}.`,
      `La deltakerne vise forståelse for ${topic} på en konkret måte.`,
    ][index];
  }
  if (field === "content") {
    return [
      `Bruk aktuelle eksempler, korte kilder og samtaler som åpner ${topic}.`,
      `Knytt ${topic} til deltakernes erfaringer, nyheter eller lokalsamfunnet.`,
      `Arbeid med ett konkret case som viser viktige sider ved ${topic}.`,
      `Samle begreper, eksempler og spørsmål som gjør ${topic} forståelig.`,
    ][index];
  }
  if (field === "methods") {
    return [
      `Bruk felles modellering, samtale og korte samarbeidsoppgaver.`,
      `La deltakerne arbeide parvis eller i små grupper før felles oppsummering.`,
      `Veksle mellom korte lærerinnspill, kildearbeid og muntlig deling.`,
      `Bruk en praktisk oppgave, felles begrepsarbeid og kort refleksjon.`,
    ][index];
  }
  return [
    `Følg forståelsen gjennom samtale, observasjon og korte elevprodukter.`,
    `Se etter om deltakerne bruker begreper og eksempler fra ${topic}.`,
    `Bruk muntlig oppsummering eller kort egenvurdering som underveisvurdering.`,
    `La deltakerne forklare ett eksempel eller én sammenheng fra perioden.`,
  ][index];
}
