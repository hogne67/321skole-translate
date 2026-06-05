export type ReadingSignalTask = {
  id?: unknown;
  order?: unknown;
  type?: unknown;
  prompt?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
};

export type ReadingSignalsPayload = {
  autoResult: {
    totalTasks: number;
    correctCount: number;
    wrongCount: number;
    percentCorrect: number | null;
  };
  wrongByType: {
    mcqWrong: number;
    trueFalseWrong: number;
    bestSummaryWrong: number;
  };
  readingSpeed: {
    wordCount: number;
    timeSpentSeconds: number | null;
    wordsPerMinute: number | null;
  };
  readingSignals: {
    resultStrength: "strong" | "mostly_good" | "partial" | "weak";
    speedSignal: "calm_or_slow" | "expected" | "fast" | "very_fast";
    summarySignal: "summary_correct" | "summary_wrong" | "summary_missing";
    caution: string;
  };
};

type AnswersMap = Record<string, unknown>;

function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function taskReadableText(rawTask: unknown): string {
  if (!rawTask || typeof rawTask !== "object") return "";
  const task = rawTask as ReadingSignalTask & {
    sentence?: unknown;
    textWithGap?: unknown;
  };

  const parts: string[] = [];
  if (typeof task.prompt === "string") parts.push(task.prompt);
  if (typeof task.sentence === "string") parts.push(task.sentence);
  if (typeof task.textWithGap === "string") parts.push(task.textWithGap);
  if (Array.isArray(task.options)) {
    parts.push(...task.options.map((option) => String(option ?? "")));
  }

  return parts.join(" ");
}

export function countReadingTestWords(sourceText: string, tasks: unknown[]): number {
  const taskText = tasks.map(taskReadableText).filter(Boolean).join(" ");
  return countWords([sourceText, taskText].filter(Boolean).join(" "));
}

function normalizeText(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
}

function normalizeAnswerForTask(task: ReadingSignalTask, value: unknown): string {
  const options = Array.isArray(task.options) ? task.options : [];

  if (typeof value === "number" && options[value] != null) {
    return normalizeText(options[value]);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const numericIndex = Number(trimmed);

    if (options.some((option) => normalizeText(option) === normalizeText(trimmed))) {
      return normalizeText(trimmed);
    }

    if (
      trimmed !== "" &&
      Number.isInteger(numericIndex) &&
      options[numericIndex] != null
    ) {
      return normalizeText(options[numericIndex]);
    }
  }

  return normalizeText(value);
}

function normalizeTaskType(value: unknown): "mcq" | "true_false" | "best_summary" | null {
  const type = String(value ?? "").trim().toLowerCase();
  if (
    type === "mcq" ||
    type === "multiple_choice" ||
    type === "word_choice" ||
    type === "sentence_placement" ||
    type === "fill_in_word"
  ) {
    return "mcq";
  }
  if (type === "true_false" || type === "truefalse") return "true_false";
  if (type === "best_summary") return "best_summary";
  return null;
}

function getStableTaskId(task: ReadingSignalTask, idx: number): string {
  const id = typeof task.id === "string" ? task.id.trim() : "";
  if (id) return id;

  const orderPart = task.order != null ? String(task.order) : "x";
  const promptPart = typeof task.prompt === "string" ? task.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswer(task: ReadingSignalTask, answers: AnswersMap, stableId: string, idx: number) {
  const id = typeof task.id === "string" && task.id.trim() ? task.id.trim() : "";
  const order = task.order != null ? String(task.order).trim() : "";

  return (
    answers[stableId] ??
    (id ? answers[id] : undefined) ??
    (order ? answers[order] : undefined) ??
    answers[`task_${idx + 1}`]
  );
}

function correctValues(task: ReadingSignalTask): string[] {
  const raw = task.correctAnswer;
  const options = Array.isArray(task.options) ? task.options : [];

  if (Array.isArray(raw)) return raw.map(normalizeText).filter(Boolean);
  if (typeof raw === "number" && options[raw] != null) {
    return [normalizeText(options[raw])].filter(Boolean);
  }

  const value = normalizeText(raw);
  return value ? [value] : [];
}

function classifyResultStrength(wrongCount: number): ReadingSignalsPayload["readingSignals"]["resultStrength"] {
  if (wrongCount === 0) return "strong";
  if (wrongCount === 1) return "mostly_good";
  if (wrongCount === 2) return "partial";
  return "weak";
}

function classifySpeed(wordsPerMinute: number | null): ReadingSignalsPayload["readingSignals"]["speedSignal"] {
  if (wordsPerMinute == null) return "expected";
  if (wordsPerMinute < 80) return "calm_or_slow";
  if (wordsPerMinute >= 200) return "very_fast";
  if (wordsPerMinute >= 100) return "fast";
  return "expected";
}

function buildCaution(args: {
  wrongCount: number;
  bestSummaryWrong: number;
  speedSignal: ReadingSignalsPayload["readingSignals"]["speedSignal"];
  wordsPerMinute: number | null;
}) {
  const cautions = [
    "Dette er et støttesignal for læring og progresjon, ikke en offisiell kartleggingskonklusjon.",
  ];

  if (args.bestSummaryWrong > 0) {
    cautions.push("Beste sammendrag var feil, så helhetsforståelsen bør vurderes ekstra varsomt.");
  }

  if (args.wrongCount >= 3 && (args.speedSignal === "fast" || args.speedSignal === "very_fast")) {
    cautions.push("Mange feil sammen med høy fart kan tyde på at eleven bør lese roligere.");
  }

  if (args.wrongCount <= 1 && args.speedSignal === "calm_or_slow") {
    cautions.push("Lav fart sammen med høy score kan bety at eleven har lest grundig; det er ikke negativt i seg selv.");
  }

  if (args.wrongCount >= 3 && args.speedSignal === "calm_or_slow") {
    cautions.push("Lav fart sammen med flere feil kan tyde på at teksten var krevende.");
  }

  if (args.wordsPerMinute == null) {
    cautions.push("Lesehastighet mangler eller er usikker.");
  }

  return cautions.join(" ");
}

export function buildReadingSignalsPayload(args: {
  tasks: unknown[];
  answers: AnswersMap;
  wordCount: number;
  timeSpentSeconds?: number | null;
}): ReadingSignalsPayload {
  let totalTasks = 0;
  let correctCount = 0;
  let mcqWrong = 0;
  let trueFalseWrong = 0;
  let bestSummaryWrong = 0;
  let summarySeen = false;
  let summaryCorrect = false;

  args.tasks.forEach((rawTask, idx) => {
    const task = rawTask && typeof rawTask === "object" ? (rawTask as ReadingSignalTask) : {};
    const type = normalizeTaskType(task.type);
    if (!type) return;

    const correct = correctValues(task);
    if (!correct.length) return;

    totalTasks += 1;
    const stableId = getStableTaskId(task, idx);
    const answer = readAnswer(task, args.answers, stableId, idx);
    const isCorrect = correct.includes(normalizeAnswerForTask(task, answer));

    if (type === "best_summary") {
      summarySeen = true;
      summaryCorrect = isCorrect;
    }

    if (isCorrect) {
      correctCount += 1;
      return;
    }

    if (type === "mcq") mcqWrong += 1;
    if (type === "true_false") trueFalseWrong += 1;
    if (type === "best_summary") bestSummaryWrong += 1;
  });

  const wrongCount = Math.max(0, totalTasks - correctCount);
  const percentCorrect = totalTasks > 0 ? Math.round((correctCount / totalTasks) * 100) : null;

  const timeSpentSeconds =
    typeof args.timeSpentSeconds === "number" && Number.isFinite(args.timeSpentSeconds) && args.timeSpentSeconds > 0
      ? Math.round(args.timeSpentSeconds)
      : null;
  const wordCount = Math.max(0, Math.round(args.wordCount || 0));
  const wordsPerMinute =
    wordCount > 0 && timeSpentSeconds != null
      ? Math.round(wordCount / (timeSpentSeconds / 60))
      : null;
  const speedSignal = classifySpeed(wordsPerMinute);

  return {
    autoResult: {
      totalTasks,
      correctCount,
      wrongCount,
      percentCorrect,
    },
    wrongByType: {
      mcqWrong,
      trueFalseWrong,
      bestSummaryWrong,
    },
    readingSpeed: {
      wordCount,
      timeSpentSeconds,
      wordsPerMinute,
    },
    readingSignals: {
      resultStrength: classifyResultStrength(wrongCount),
      speedSignal,
      summarySignal: summarySeen
        ? summaryCorrect
          ? "summary_correct"
          : "summary_wrong"
        : "summary_missing",
      caution: buildCaution({ wrongCount, bestSummaryWrong, speedSignal, wordsPerMinute }),
    },
  };
}
