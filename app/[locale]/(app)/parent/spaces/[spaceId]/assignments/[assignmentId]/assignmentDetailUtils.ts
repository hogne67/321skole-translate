import { type useTranslations } from "next-intl";
import { type Firestore } from "firebase/firestore";

type TFn = ReturnType<typeof useTranslations>;

export function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

export function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export type AssignmentDoc = {
  title?: string;
  description?: string;
  summary?: string;
  subtitle?: string;
  instructions?: string;
  text?: string;
  sourceText?: string;
  status?: string;
  archived?: boolean;
  level?: string;
  language?: string;
  topic?: string;
  topics?: string[];
  sourceId?: string;
  sourceType?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  imageUrl?: string;
  visibility?: string;
  lessonId?: string;
  [k: string]: unknown;
};

export type Task = {
  id?: string;
  order?: number;
  type?: string;
  prompt?: string;
  question?: string;
  text?: string;
  sentence?: string;
  options?: unknown;
  choices?: unknown;
  alternatives?: unknown;
  answer?: unknown;
  correctAnswer?: unknown;
  correctOptionId?: unknown;
  isTrue?: unknown;
  explanation?: unknown;
};

export type ParentReviewDoc = {
  uid?: string;
  comment?: string;
  stars?: number;
  updatedAt?: unknown;
};

export type ChildSelfReport = {
  readSilently?: boolean;
  readAloud?: boolean;
  completedTasks?: boolean;
  feltEasy?: boolean;
  feltHard?: boolean;
  comment?: string;
};

export type SubmissionDoc = {
  uid?: string;
  role?: string;
  answers?: Record<string, string | boolean>;
  childSelfReport?: ChildSelfReport;
  auto?: {
    score?: number;
    maxScore?: number;
    correctCount?: number;
    totalAutoGraded?: number;
    byTask?: Record<
      string,
      {
        correct?: boolean;
        expected?: string | boolean | null;
        answer?: string | boolean | null;
      }
    >;
  };
  aiFeedback?: string | null;
  status?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
};

export function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

export function kindLabel(kind: string | null, t: TFn) {
  if (kind === "family") return t("kinds.family");
  if (kind === "parent_group") return t("kinds.parentGroup");
  return t("kinds.other");
}

export function firstLongText(d: AssignmentDoc): string | null {
  const candidates = [d.sourceText, d.text, d.description, d.instructions, d.summary, d.subtitle];
  for (const c of candidates) {
    const s = safeString(c);
    if (s) return s;
  }
  return null;
}

export function coerceTopics(a: AssignmentDoc): string[] {
  const out: string[] = [];

  if (Array.isArray(a.topics)) {
    for (const t of a.topics) {
      const v = String(t || "").trim();
      if (v) out.push(v);
    }
  }

  const topic = safeString(a.topic);
  if (topic && !out.includes(topic)) out.push(topic);

  return out;
}

export function pickImageUrl(a: AssignmentDoc): string | null {
  const cover = safeString(a.coverImageUrl);
  if (cover) return cover;

  const img = safeString(a.imageUrl);
  if (img) return img;

  return null;
}

export function safeTasksArray(tasks: unknown): Task[] {
  if (Array.isArray(tasks)) return tasks as Task[];

  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function sortTasksByOrder(a: Task, b: Task) {
  const ao = typeof a.order === "number" ? a.order : 999;
  const bo = typeof b.order === "number" ? b.order : 999;
  return ao - bo;
}

export function getStableTaskId(t: Task, idx: number): string {
  if (t.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t.order != null ? String(t.order) : "x";
  const prompt =
    safeString(t.prompt) ??
    safeString(t.question) ??
    safeString(t.text) ??
    safeString(t.sentence) ??
    "";

  if (prompt) return `${orderPart}__${prompt.slice(0, 80)}`;
  return `${orderPart}__idx${idx}`;
}

export function taskPrompt(t: Task): string {
  return (
    safeString(t.prompt) ??
    safeString(t.question) ??
    safeString(t.text) ??
    safeString(t.sentence) ??
    ""
  );
}

export function taskType(t: Task): "mcq" | "truefalse" | "open" {
  const raw = (safeString(t.type) ?? "open").toLowerCase();

  if (raw === "mcq" || raw === "multiplechoice" || raw === "multiple_choice") return "mcq";
  if (raw === "truefalse" || raw === "true_false" || raw === "boolean") return "truefalse";

  return "open";
}

export function taskOptions(t: Task): string[] {
  const raw = Array.isArray(t.options)
    ? t.options
    : Array.isArray(t.choices)
      ? t.choices
      : Array.isArray(t.alternatives)
        ? t.alternatives
        : [];

  return raw
    .map((v) => {
      if (typeof v === "string") return v.trim();
      if (isRecord(v)) {
        return (
          safeString(v.text) ??
          safeString(v.label) ??
          safeString(v.value) ??
          safeString(v.title) ??
          ""
        );
      }
      return "";
    })
    .filter(Boolean);
}

export function looksLikeLibraryAssignment(a: AssignmentDoc | null): boolean {
  if (!a) return false;

  const st = (safeString(a.sourceType) ?? "").toLowerCase();
  const sid = safeString(a.sourceId);

  if (st.includes("library")) return true;
  if (st.includes("published")) return true;
  if (st.includes("lesson")) return true;
  if (sid) return true;

  return false;
}

function normalizeAnswerString(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v.trim().toLowerCase();
  return "";
}

export function evaluateAnswers(tasks: Task[], answers: Record<string, string | boolean>) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  const byTask: Record<
    string,
    {
      correct?: boolean;
      expected?: string | boolean | null;
      answer?: string | boolean | null;
    }
  > = {};

  tasks.forEach((t, idx) => {
    const stableId = getStableTaskId(t, idx);
    const type = taskType(t);
    const answer = answers[stableId];

    if (type === "open") {
      byTask[stableId] = { answer: answer ?? null };
      return;
    }

    maxScore += 1;

    const expectedRaw =
      typeof t.correctAnswer !== "undefined"
        ? t.correctAnswer
        : typeof t.answer !== "undefined"
          ? t.answer
          : typeof t.isTrue !== "undefined"
            ? t.isTrue
            : typeof t.correctOptionId !== "undefined"
              ? t.correctOptionId
              : null;

    let correct = false;

    if (type === "truefalse") {
      const expected =
        typeof expectedRaw === "boolean" ? expectedRaw : normalizeAnswerString(expectedRaw) === "true";

      const actual = typeof answer === "boolean" ? answer : normalizeAnswerString(answer) === "true";

      correct = expected === actual;

      byTask[stableId] = {
        correct,
        expected,
        answer: typeof answer === "undefined" ? null : actual,
      };
    } else {
      const expected = normalizeAnswerString(expectedRaw);
      const actual = normalizeAnswerString(answer);
      correct = !!expected && expected === actual;

      byTask[stableId] = {
        correct,
        expected: expectedRaw == null ? null : String(expectedRaw),
        answer: typeof answer === "undefined" ? null : answer,
      };
    }

    if (correct) {
      score += 1;
      correctCount += 1;
    }
  });

  return {
    score,
    maxScore,
    correctCount,
    totalAutoGraded: maxScore,
    byTask,
  };
}

export function renderAutoSummary(auto: SubmissionDoc["auto"]): string | null {
  if (!auto) return null;

  const score = safeNumber(auto.score);
  const maxScore = safeNumber(auto.maxScore);
  if (score !== null && maxScore !== null && maxScore > 0) return `${score} / ${maxScore}`;

  const correct = safeNumber(auto.correctCount);
  const total = safeNumber(auto.totalAutoGraded);
  if (correct !== null && total !== null && total > 0) return `${correct} / ${total}`;

  return null;
}

export function starsLabel(value: number, t: TFn) {
  return value === 1 ? t("stars.one", { count: value }) : t("stars.many", { count: value });
}

export function buildAutoResultatForParent(
  assignmentObj: AssignmentDoc,
  answersObj: Record<string, string | boolean>,
  t: TFn
): string {
  const tasksArr = safeTasksArray(assignmentObj.tasks);
  const sorted = [...tasksArr].sort(sortTasksByOrder);

  let total = 0;
  let correct = 0;
  const lines: string[] = [];
  const wrongLines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tt = sorted[i];
    const stableId = getStableTaskId(tt, i);
    const type = taskType(tt);

    if (type !== "mcq" && type !== "truefalse") continue;

    const val = answersObj[stableId];
    if (val === undefined || val === null || val === "") continue;

    const options = taskOptions(tt);
    const rawCorrect =
      typeof tt.correctAnswer !== "undefined"
        ? tt.correctAnswer
        : typeof tt.answer !== "undefined"
          ? tt.answer
          : typeof tt.isTrue !== "undefined"
            ? tt.isTrue
            : typeof tt.correctOptionId !== "undefined"
              ? tt.correctOptionId
              : null;

    const mcqCorrectText = (() => {
      if (!options.length) return null;
      if (typeof rawCorrect === "number" && rawCorrect >= 0 && rawCorrect < options.length) {
        return String(options[rawCorrect]);
      }
      if (typeof rawCorrect === "string") return rawCorrect;
      return null;
    })();

    const tfCorrectBool = (() => {
      if (typeof rawCorrect === "boolean") return rawCorrect;
      if (typeof rawCorrect === "string") {
        const s = rawCorrect.trim().toLowerCase();
        if (s === "true") return true;
        if (s === "false") return false;
      }
      return null;
    })();

    const hasCorrect =
      (type === "mcq" && mcqCorrectText != null) ||
      (type === "truefalse" && tfCorrectBool != null);

    if (!hasCorrect) continue;

    total += 1;

    const isCorrect =
      type === "mcq"
        ? mcqCorrectText != null && val != null && String(val) === String(mcqCorrectText)
        : tfCorrectBool != null && typeof val === "boolean" && val === tfCorrectBool;

    if (isCorrect) correct += 1;

    const order = tt.order ?? i + 1;
    const prompt = taskPrompt(tt);

    if (!isCorrect) {
      if (type === "mcq") {
        wrongLines.push(
          t("ai.wrongMcq", {
            order,
            prompt,
            answer: String(val),
            correct: String(mcqCorrectText),
          })
        );
      } else {
        wrongLines.push(
          t("ai.wrongTrueFalse", {
            order,
            prompt,
            answer: String(val),
            correct: String(tfCorrectBool),
          })
        );
      }
    }
  }

  if (total === 0) return "";

  lines.push(t("ai.closedSummary", { correct, total }));

  if (wrongLines.length) {
    lines.push("");
    lines.push(t("ai.mistakesTitle"));
    lines.push(...wrongLines.slice(0, 8));
  }

  return lines.join("\n").trim();
}

export function buildOppgaveStringForParent(assignmentObj: AssignmentDoc, t: TFn): string {
  const tasksArr = safeTasksArray(assignmentObj.tasks);
  const sorted = [...tasksArr].sort(sortTasksByOrder);
  const openPrompts: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tt = sorted[i];
    const type = taskType(tt);
    if (type !== "open") continue;

    const order = tt.order ?? i + 1;
    const prompt = taskPrompt(tt).trim();
    if (!prompt) continue;

    openPrompts.push(t("ai.openTaskLine", { order, prompt }));
  }

  const level = (assignmentObj.level ?? "A2").toString();
  const target = "C1";

  return (
    t("ai.assessmentIntro", { level, target }) +
    "\n" +
    (openPrompts.length ? `${t("ai.openTasksTitle")}\n${openPrompts.join("\n")}\n` : "")
  ).trim();
}

export function buildSvarStringForParent(
  assignmentObj: AssignmentDoc,
  answersObj: Record<string, string | boolean>,
  t: TFn
): string {
  const tasksArr = safeTasksArray(assignmentObj.tasks);
  const sorted = [...tasksArr].sort(sortTasksByOrder);
  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tt = sorted[i];
    const stableId = getStableTaskId(tt, i);
    const type = taskType(tt);
    const ans = answersObj[stableId];

    if (type !== "open") continue;

    const ansText = typeof ans === "string" ? ans.trim() : ans == null ? "" : String(ans).trim();
    if (!ansText) continue;

    const order = tt.order ?? i + 1;
    const prompt = taskPrompt(tt).trim();

    lines.push(t("ai.openAnswerTask", { order, prompt }));
    lines.push(t("ai.answerLine", { answer: ansText }));
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function hasChildSelfReport(report: ChildSelfReport | undefined | null) {
  if (!report) return false;

  return Boolean(
    report.readSilently ||
    report.readAloud ||
    report.completedTasks ||
    report.feltEasy ||
    report.feltHard ||
    safeString(report.comment)
  );
}

export function childMessageFromParentAi(text: string | null): string {
  if (!text) return "";

  const startMarker = "💬 Forslag til melding til barnet";
  const endMarker = "🎯 Neste steg hjemme";

  const start = text.indexOf(startMarker);
  if (start === -1) return text.trim();

  const afterStart = text.slice(start + startMarker.length).trim();
  const end = afterStart.indexOf(endMarker);

  return (end === -1 ? afterStart : afterStart.slice(0, end)).replace(/^-{5,}/g, "").trim();
}

export function isAnswered(v: string | boolean | undefined) {
  if (typeof v === "boolean") return true;
  if (typeof v === "string") return v.trim().length > 0;
  return false;
}

