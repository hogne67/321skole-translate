import type { Planner } from "./types";

export type PlannerExportOptions = {
  showWeekPlans?: boolean;
  showReflectionLog?: boolean;
  showYearEndSummary?: boolean;
  periodId?: string;
};

export function plannerToMarkdown(planner: Planner, options: PlannerExportOptions = {}): string {
  const { document, frame, curriculum } = planner;
  const showWeekPlans = options.showWeekPlans !== false;
  const showReflectionLog = options.showReflectionLog !== false;
  const showYearEndSummary = options.showYearEndSummary !== false;
  const periods = getScopedPeriods(planner, options.periodId);
  const lines: string[] = [];

  pushHeading(lines, 1, document.title || "Uten tittel");
  pushMeta(lines, [
    ["Fag", frame.subject],
    ["Nivå", frame.level],
    ["Skoleår", frame.schoolYear],
    ["Timer", String(frame.totalHours)],
    ["Land", frame.country],
    ["Skoleslag", frame.schoolType],
    ["Læreplangrunnlag", curriculum.framework || curriculum.type],
  ]);

  pushSection(lines, "Planramme", document.description);
  pushSection(lines, "Fagets relevans", document.subjectRelevance);
  pushSection(lines, "Sentrale verdier", document.coreValues);
  pushSection(lines, "Kjerneelementer", document.coreElements);
  pushSection(lines, "Tverrfaglige temaer", document.interdisciplinaryThemes);
  pushSection(lines, "Grunnleggende ferdigheter", document.basicSkills);
  pushSection(lines, "Læringsmål", document.learningGoals);

  if (document.concreteLearningGoals.length > 0) {
    pushHeading(lines, 2, "Konkrete læringsmål");
    document.concreteLearningGoals.forEach((goal, index) => {
      pushHeading(lines, 3, `Mål ${index + 1}`);
      pushMeta(lines, [
        ["Konkret læringsmål", goal.goal],
        ["Elevspråk", goal.studentLanguage],
        ["Slik kan eleven vise det", goal.evidence],
      ]);
    });
  }

  pushSection(lines, "Vurderingsformer", document.assessmentForms);
  pushSection(lines, "Arbeidsmåter", document.workMethods);
  pushSection(lines, "Årsoversikt", document.annualOverview);

  if (frame.planType === "individual") {
    pushHeading(lines, 2, "Individuell plan");
    pushMeta(lines, [
      ["Elev / deltaker", document.individualDetails.learnerName],
      ["Utgangspunkt og kontekst", document.individualDetails.learnerContext],
      ["Behov for støtte", document.individualDetails.supportNeeds],
      ["Tilrettelegging", document.individualDetails.adaptations],
      ["Individuell progresjon", document.individualDetails.progression],
      ["Samarbeid", document.individualDetails.collaboration],
      ["Evaluering og justering", document.individualDetails.evaluation],
    ]);
  }

  pushHeading(lines, 2, "Perioder");
  if (periods.length === 0) {
    lines.push("Ingen perioder er lagt inn ennå.", "");
  } else {
    periods.forEach((period) => {
      pushHeading(lines, 3, period.title || "Uten tittel");
      pushMeta(lines, [
        ["Status", formatPeriodStatus(period.status)],
        ["Uker", period.weeks],
      ]);
      pushMeta(lines, [
        ["Mål", period.goals],
        ["Innhold", period.content],
        ["Arbeidsmåter", period.methods],
        ["Vurdering", period.assessment],
        ["Refleksjon", period.reflection],
      ]);
      pushOfficialGoals(lines, period.officialGoalIds, planner.officialBasis?.competenceGoals ?? []);
      pushPeriodLearningGoals(lines, period.learningGoals);
      pushLinkedGoals(lines, "Koblede læringsmål", period.linkedGoalIds, document.concreteLearningGoals);

      if (showWeekPlans && period.weekPlans.length > 0) {
        pushHeading(lines, 4, "Ukeplaner");
        period.weekPlans.forEach((weekPlan) => {
          pushHeading(lines, 5, `${weekPlan.week || "Uke ikke satt"}: ${weekPlan.title || "Uten tittel"}`);
          pushMeta(lines, [
            ["Mål", weekPlan.goals],
            ["Aktiviteter", weekPlan.activities],
            ["Vurdering", weekPlan.assessment],
            ["Notater", weekPlan.notes],
          ]);
          pushLinkedGoals(lines, "Koblede mål", weekPlan.linkedGoalIds, document.concreteLearningGoals);
        });
      }
    });
  }

  pushHeading(lines, 2, "Aktiviteter");
  if (document.activities.length === 0) {
    lines.push("Ingen aktiviteter er lagt inn ennå.", "");
  } else {
    document.activities.forEach((activity) => {
      pushHeading(lines, 3, activity.title || "Uten tittel");
      pushMeta(lines, [
        ["Periode", activity.period],
        ["Beskrivelse", activity.description],
        ["Metode", activity.method],
        ["Vurdering", activity.assessment],
      ]);
    });
  }

  pushSection(lines, "Refleksjonsfelt", document.reflection);

  if (showYearEndSummary && (document.yearEndSummary || document.nextYearNotes)) {
    pushSection(lines, "Årsoppsummering", document.yearEndSummary);
    pushSection(lines, "Notater til neste skoleår", document.nextYearNotes);
  }

  if (showReflectionLog && document.reflectionLog.length > 0) {
    pushHeading(lines, 2, "Refleksjonslogg");
    document.reflectionLog.forEach((entry) => {
      pushHeading(lines, 3, entry.title || "Refleksjon");
      pushMeta(lines, [
        ["Dato", entry.date],
        ["Periode", entry.period],
        ["Hva fungerte?", entry.whatWorked],
        ["Hva bør justeres?", entry.whatToAdjust],
        ["Neste steg", entry.nextStep],
      ]);
    });
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function plannerToStudentMarkdown(planner: Planner, options: Pick<PlannerExportOptions, "periodId"> = {}): string {
  const { document, frame } = planner;
  const periods = getScopedPeriods(planner, options.periodId);
  const lines: string[] = [];

  pushHeading(lines, 1, "Dette skal vi lære");
  pushMeta(lines, [
    ["Fag", frame.subject],
    ["Nivå", frame.level],
    ["Skoleår", frame.schoolYear],
  ]);

  pushSection(lines, document.title || "Plan for læring", document.description || document.subjectRelevance);

  if (document.concreteLearningGoals.length > 0) {
    pushHeading(lines, 2, "Mål vi jobber mot");
    document.concreteLearningGoals.forEach((goal, index) => {
      pushHeading(lines, 3, `Mål ${index + 1}`);
      pushMeta(lines, [
        ["Dette skal du kunne", goal.studentLanguage || goal.goal],
        ["Slik kan du vise det", goal.evidence],
      ]);
    });
  } else {
    pushSection(lines, "Mål vi jobber mot", document.learningGoals);
  }

  if (periods.length > 0) {
    pushHeading(lines, 2, options.periodId ? "Dette jobber vi med nå" : "Slik jobber vi gjennom året");
    periods.forEach((period) => {
      pushHeading(lines, 3, period.title || "Periode");
      pushMeta(
        lines,
        period.learningGoals.length > 0
          ? [["Uker", period.weeks]]
          : [
              ["Uker", period.weeks],
              ["Dette jobber vi med", period.goals || period.content],
            ]
      );
      if (period.learningGoals.length > 0) {
        lines.push("**Mål i denne perioden:**");
        period.learningGoals.forEach((goal) => lines.push(`- ${goal.studentLanguage || goal.goal}`));
        lines.push("");
      }
      pushLinkedGoals(lines, "Mål i denne perioden", period.linkedGoalIds, document.concreteLearningGoals);
    });
  }

  pushSection(lines, "Hvordan vi jobber", document.workMethods);
  pushSection(lines, "Hvordan du kan vise læring", document.assessmentForms);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function pushHeading(lines: string[], level: number, value: string) {
  lines.push(`${"#".repeat(level)} ${value.trim() || "-"}`, "");
}

function getScopedPeriods(planner: Planner, periodId?: string) {
  if (!periodId) return planner.document.periods;
  return planner.document.periods.filter((period) => period.id === periodId);
}

function pushSection(lines: string[], title: string, value: string) {
  pushHeading(lines, 2, title);
  lines.push(value.trim() || "-", "");
}

function pushMeta(lines: string[], items: Array<[string, string]>) {
  items.forEach(([label, value]) => {
    lines.push(`**${label}:** ${value.trim() || "-"}`);
  });
  lines.push("");
}

function pushLinkedGoals(
  lines: string[],
  title: string,
  goalIds: string[],
  goals: Array<{ id: string; goal: string; studentLanguage: string }>
) {
  const linkedGoals = goalIds
    .map((goalId) => goals.find((goal) => goal.id === goalId))
    .filter((goal): goal is { id: string; goal: string; studentLanguage: string } => Boolean(goal));
  if (linkedGoals.length === 0) return;

  lines.push(`**${title}:**`);
  linkedGoals.forEach((goal) => {
    lines.push(`- ${goal.studentLanguage || goal.goal || "-"}`);
  });
  lines.push("");
}

function pushOfficialGoals(lines: string[], goalIds: string[], goals: string[]) {
  const selectedGoals = goalIds
    .map((goalId) => {
      const match = goalId.match(/^udir-goal-(\d+)$/);
      return match ? goals[Number(match[1]) - 1] : undefined;
    })
    .filter((goal): goal is string => Boolean(goal));
  if (selectedGoals.length === 0) return;

  lines.push("**Offisielle kompetansemål:**");
  selectedGoals.forEach((goal) => lines.push(`- ${goal}`));
  lines.push("");
}

function pushPeriodLearningGoals(
  lines: string[],
  goals: Planner["document"]["periods"][number]["learningGoals"]
) {
  if (goals.length === 0) return;
  lines.push("**Lokale læringsmål:**");
  goals.forEach((goal, index) => {
    lines.push(`${index + 1}. ${goal.goal}`);
    lines.push(`   - Elev-/deltakerspråk: ${goal.studentLanguage}`);
    const sourceNumbers = goal.sourceOfficialGoalIds
      .map((goalId) => goalId.match(/^udir-goal-(\d+)$/)?.[1])
      .filter(Boolean)
      .join(", ");
    lines.push(`   - Bygger på Udir-mål: ${sourceNumbers || "ikke angitt"}`);
  });
  lines.push("");
}

function formatPeriodStatus(status: string): string {
  if (status === "active") return "Pågår";
  if (status === "completed") return "Fullført";
  return "Planlagt";
}
