// app/api/teacher/ai-feedback/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open";
type Role = "student" | "teacher" | "admin" | "parent" | "creator";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
  sentence?: string;
  textWithGap?: string;
};

type AnswersMap = Record<string, unknown>;

type MathWorksheetTask = {
  id?: string;
  prompt?: string;
  type?: string;
  expected?: {
    shapeName?: string;
    perimeterValue?: number | null;
    areaValue?: number | null;
  } | null;
};

type MathWorksheet = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  tasks?: MathWorksheetTask[];
};

type GeometryAnswerRow = {
  taskId?: string;
  shapeName?: string;
  perimeterValue?: number | null;
  areaValue?: number | null;
};

type GeometryTaskAuto = {
  shapeName?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  perimeterValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  areaValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
};

type GeometryAutoResult = {
  total?: number;
  correct?: number;
  partial?: number;
  wrong?: number;
  unanswered?: number;
  percent?: number | null;
  byTaskId?: Record<string, GeometryTaskAuto>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function safeTasksArray(tasks: unknown): Task[] {
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

function isMathWorksheet(value: unknown): value is MathWorksheet {
  if (!value || typeof value !== "object") return false;
  const v = value as { tasks?: unknown; title?: unknown };
  return Array.isArray(v.tasks) && typeof v.title === "string";
}

function hasAssignmentSnapshotContent(a: Record<string, unknown> | null): boolean {
  if (!a) return false;
  const hasText = safeString(a.sourceText).trim().length > 0 || safeString(a.text).trim().length > 0;
  const hasTasks = safeTasksArray(a.tasks).length > 0;
  const hasImage = safeString(a.coverImageUrl).trim().length > 0;
  const hasMathWorksheet = isMathWorksheet(a.mathWorksheet);
  return hasText || hasTasks || hasImage || hasMathWorksheet;
}

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswerMap(a: unknown): AnswersMap {
  if (a && typeof a === "object" && !Array.isArray(a)) return a as AnswersMap;
  return {};
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

function isOpenLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "open" || t === "text" || t === "writing" || t === "short_answer";
}

function isReadingTestType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t === "word_choice" ||
    t === "sentence_placement" ||
    t === "best_summary" ||
    t === "fill_in_word"
  );
}

function pickModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function readLegacyRole(profile: Record<string, unknown>): Role | null {
  const roles = profile["roles"];
  if (!isRecord(roles)) return null;

  if (roles["admin"] === true) return "admin";
  if (roles["teacher"] === true) return "teacher";
  if (roles["creator"] === true) return "creator";
  if (roles["parent"] === true) return "parent";
  if (roles["student"] === true) return "student";
  return null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;

  const r = profile["role"];
  if (r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator") {
    return r;
  }

  return readLegacyRole(profile);
}

function normalizeLocale(raw: string): "no" | "en" | "pt" {
  const v = (raw || "").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt";
  return "no";
}

function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function formatDuration(totalSeconds: number | null): string {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "unknown";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildTimeSignal(wordCount: number, usedSeconds: number | null): {
  wordsPerMinute: number | null;
  summary: string;
} {
  if (!wordCount || typeof usedSeconds !== "number" || !Number.isFinite(usedSeconds) || usedSeconds <= 0) {
    return {
      wordsPerMinute: null,
      summary: "No reliable timing data available.",
    };
  }

  const minutes = usedSeconds / 60;
  const wpm = Math.round(wordCount / minutes);

  let band = "";
  if (wpm < 60) band = "slow";
  else if (wpm <= 140) band = "normal";
  else if (wpm <= 180) band = "fast";
  else band = "very fast";

  return {
    wordsPerMinute: wpm,
    summary: `Estimated reading pace: about ${wpm} words per minute (${band}). Treat this as a supportive signal only, not as proof by itself.`,
  };
}

function buildReadingSystemPrompt(lang: "no" | "en" | "pt") {
  if (lang === "en") {
    return [
      "You are an experienced Norwegian language teacher.",
      "Address the student directly using 'you'. Be supportive, clear, and motivating.",
      "Give short, precise, and helpful feedback on the student's work.",
      "Adapt your language and expectations to the provided CEFR level.",
      "Do NOT write a full corrected version of the entire text.",
      "Use: LOW / MEDIUM / HIGH achievement relative to CEFR.",
      "",
      "IMPORTANT:",
      "- Base the reading assessment mainly on automatic results.",
      "- Time is only a supportive signal, never proof by itself.",
      "- If open answers exist, assess them briefly too.",
      "",
      "Use these exact headings:",
      "1) AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
      "2) ÅPNE OPPGAVER – FAGLIG VURDERING",
      "3) NIVÅ OG VIDERE PROGRESJON (CEFR)",
      "",
      "Keep it concise.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de norueguês/língua.",
      "Fale diretamente com o aluno usando 'você'. Seja claro, encorajador e específico.",
      "Dê um feedback curto, preciso e útil.",
      "Adapte ao nível CEFR informado.",
      "Não escreva uma versão corrigida completa do texto.",
      "",
      "Use estes títulos exatos:",
      "1) AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
      "2) ÅPNE OPPGAVER – FAGLIG VURDERING",
      "3) NIVÅ OG VIDERE PROGRESJON (CEFR)",
    ].join("\n");
  }

  return [
    "Du er en erfaren norsklærer/språklærer.",
    "Skriv direkte til eleven med 'du'. Vær støttende, konkret og motiverende.",
    "Gi kort, presis og nyttig tilbakemelding tilpasset oppgitt CEFR-nivå.",
    "Ikke skriv en fullstendig korrigert versjon av hele teksten.",
    "Bruk: LAV / MIDDELS / HØY målopnåelse i forhold til nivå.",
    "",
    "VIKTIG:",
    "- Lesetest vurderes først og fremst ut fra autoresultat.",
    "- Tidsbruk er bare et støttesignal.",
    "- Hvis åpne svar finnes, vurder dem kort også.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    "1) AUTORESULTAT, LESEFORSTÅELSE OG CEFR",
    "2) ÅPNE OPPGAVER – FAGLIG VURDERING",
    "3) NIVÅ OG VIDERE PROGRESJON (CEFR)",
    "",
    "Hold det konsist.",
  ].join("\n");
}

function buildGeneralSystemPrompt(lang: "no" | "en" | "pt") {
  if (lang === "en") {
    return [
      "You are an experienced language teacher.",
      "Address the student directly using 'you'. Be supportive, clear, and motivating.",
      "Give short, precise, and useful feedback.",
      "Focus on whether the tasks are answered correctly, reading comprehension according to autoscore, and whether open tasks are answered relevantly.",
      "Assess language with particular attention to grammar, and point out concrete errors that should be corrected.",
      "Do NOT write a full corrected version of the whole text.",
      "",
      "Use these exact headings:",
      "1) OPPGAVELØSNING OG INNHOLD",
      "2) SPRÅK",
      "3) NESTE STEG",
      "",
      "Keep it concise.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de língua.",
      "Fale diretamente com o aluno usando 'você'.",
      "Dê um feedback curto, preciso e útil.",
      "Foque se as tarefas foram respondidas corretamente, na compreensão de leitura de acordo com a pontuação automática, e se as tarefas abertas foram respondidas de forma relevante.",
      "Avalie a linguagem com atenção especial à gramática e aponte erros concretos que devem ser corrigidos.",
      "Não escreva uma versão completa corrigida do texto inteiro.",
      "",
      "Use estes títulos exatos:",
      "1) OPPGAVELØSNING OG INNHOLD",
      "2) SPRÅK",
      "3) NESTE STEG",
    ].join("\n");
  }

  return [
    "Du er en erfaren språk- og norsklærer.",
    "Skriv direkte til eleven med 'du'. Vær støttende, konkret og motiverende.",
    "Gi kort, presis og nyttig tilbakemelding.",
    "Fokuser på om oppgavene er besvart riktig, leseforståelse i henhold til autoscore, og om åpne oppgaver er besvart relevant.",
    "Vurder språk med særlig fokus på grammatikk, og pek på konkrete feil som bør rettes.",
    "Ikke skriv en fullstendig korrigert versjon av hele teksten.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    "1) OPPGAVELØSNING OG INNHOLD",
    "2) SPRÅK",
    "3) NESTE STEG",
    "",
    "Hold det konsist.",
  ].join("\n");
}

function buildGeometrySystemPrompt(lang: "no" | "en" | "pt") {
  if (lang === "en") {
    return [
      "You are an experienced math teacher giving feedback to a student.",
      "Write directly to the student using 'you'.",
      "Be supportive, concrete, and short.",
      "Use the geometry auto-check actively.",
      "Mention what the student got right, what needs improvement, and what to practice next.",
      "Do not invent scores that are not provided.",
      "Do not explain every single task in detail.",
      "",
      "Use these exact headings:",
      "1) DET DU HAR FÅTT TIL",
      "2) DET DU BØR ØVE MER PÅ",
      "3) NESTE STEG",
      "",
      "Keep it concise and teacher-like.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de matemática dando feedback ao aluno.",
      "Fale diretamente com o aluno usando 'você'.",
      "Seja encorajador, concreto e breve.",
      "Use ativamente o resultado da autocorreção de geometria.",
      "",
      "Use estes títulos exatos:",
      "1) DET DU HAR FÅTT TIL",
      "2) DET DU BØR ØVE MER PÅ",
      "3) NESTE STEG",
    ].join("\n");
  }

  return [
    "Du er en erfaren matematikklærer som gir tilbakemelding til en elev.",
    "Skriv direkte til eleven med 'du'.",
    "Vær vennlig, konkret og kort.",
    "Bruk geometry-autokorrekturen aktivt.",
    "Trekk fram hva eleven har fått til, hva som bør forbedres, og hva neste øvingspunkt bør være.",
    "Ikke forklar hver enkelt oppgave i detalj.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    "1) DET DU HAR FÅTT TIL",
    "2) DET DU BØR ØVE MER PÅ",
    "3) NESTE STEG",
    "",
    "Hold det kort og læreraktig.",
  ].join("\n");
}

function summarizeAutoResult(auto: unknown): string {
  if (!auto || typeof auto !== "object" || Array.isArray(auto)) return "(not provided)";

  const rec = auto as Record<string, unknown>;
  const totalAuto = safeNumber(rec.totalAuto);
  const correctAuto = safeNumber(rec.correctAuto);
  const wrongAuto = safeNumber(rec.wrongAuto);
  const unansweredAuto = safeNumber(rec.unansweredAuto);
  const percentAuto = safeNumber(rec.percentAuto);

  if (
    totalAuto == null &&
    correctAuto == null &&
    wrongAuto == null &&
    unansweredAuto == null &&
    percentAuto == null
  ) {
    try {
      return JSON.stringify(auto, null, 2);
    } catch {
      return "(not provided)";
    }
  }

  return [
    `total: ${totalAuto ?? "unknown"}`,
    `correct: ${correctAuto ?? "unknown"}`,
    `wrong: ${wrongAuto ?? "unknown"}`,
    `unanswered: ${unansweredAuto ?? "unknown"}`,
    `percent: ${percentAuto ?? "unknown"}`,
  ].join("\n");
}

function summarizeGeometryAuto(auto: unknown): string {
  if (!auto || typeof auto !== "object" || Array.isArray(auto)) return "(not provided)";

  const rec = auto as Record<string, unknown>;
  const total = safeNumber(rec.total);
  const correct = safeNumber(rec.correct);
  const partial = safeNumber(rec.partial);
  const wrong = safeNumber(rec.wrong);
  const unanswered = safeNumber(rec.unanswered);
  const percent = safeNumber(rec.percent);

  return [
    `total: ${total ?? "unknown"}`,
    `correct: ${correct ?? "unknown"}`,
    `partial: ${partial ?? "unknown"}`,
    `wrong: ${wrong ?? "unknown"}`,
    `unanswered: ${unanswered ?? "unknown"}`,
    `percent: ${percent ?? "unknown"}`,
  ].join("\n");
}

function summarizeGeometryWorksheet(
  worksheet: MathWorksheet | null,
  answersByTaskId: AnswersMap,
  geometryAuto: GeometryAutoResult | null
): string {
  if (!worksheet || !Array.isArray(worksheet.tasks) || worksheet.tasks.length === 0) {
    return "(No geometry worksheet tasks found.)";
  }

  return worksheet.tasks
    .map((task, idx) => {
      const taskId = safeString(task.id).trim() || `task_${idx + 1}`;
      const answerRaw = answersByTaskId[taskId];
      const answer =
        answerRaw && typeof answerRaw === "object" && !Array.isArray(answerRaw)
          ? (answerRaw as GeometryAnswerRow)
          : {};

      const autoByTask = geometryAuto?.byTaskId?.[taskId];

      const lines = [
        `#${idx + 1}`,
        `Task id: ${taskId}`,
        `Prompt: ${safeString(task.prompt) || "(no prompt)"}`,
        `Expected shape: ${task.expected?.shapeName ?? "unknown"}`,
        `Expected perimeter: ${task.expected?.perimeterValue ?? "unknown"}`,
        `Expected area: ${task.expected?.areaValue ?? "unknown"}`,
        `Student shape: ${answer.shapeName ?? "not answered"}`,
        `Student perimeter: ${answer.perimeterValue ?? "not answered"}`,
        `Student area: ${answer.areaValue ?? "not answered"}`,
      ];

      if (autoByTask) {
        lines.push(
          `Shape correct: ${safeBoolean(autoByTask.shapeName?.isCorrect) === true ? "yes" : safeBoolean(autoByTask.shapeName?.isCorrect) === false ? "no" : "unknown"}`,
          `Perimeter correct: ${safeBoolean(autoByTask.perimeterValue?.isCorrect) === true ? "yes" : safeBoolean(autoByTask.perimeterValue?.isCorrect) === false ? "no" : "unknown"}`,
          `Area correct: ${safeBoolean(autoByTask.areaValue?.isCorrect) === true ? "yes" : safeBoolean(autoByTask.areaValue?.isCorrect) === false ? "no" : "unknown"}`
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

type Body = {
  spaceId: string;
  assignmentId: string;
  subId: string;
  locale?: string;
};

export async function POST(req: Request) {
  try {
    requireEnv();

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const spaceId = safeString(body.spaceId).trim();
    const assignmentId = safeString(body.assignmentId).trim();
    const subId = safeString(body.subId).trim();
    const locale = normalizeLocale(safeString(body.locale || "no"));

    if (!spaceId || !assignmentId || !subId) {
      return json({ error: "Missing spaceId/assignmentId/subId" }, 400);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);

    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;

    const role = readRole(profile);
    const isTeacherish = role === "teacher" || role === "creator" || role === "admin";

    if (!isTeacherish) {
      return json({ error: "Not allowed (role)" }, 403);
    }

    const subRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(subId);

    const subSnap = await subRef.get();
    if (!subSnap.exists) return json({ error: "Submission not found" }, 404);
    const subDoc = (subSnap.data() || {}) as Record<string, unknown>;

    const aRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const aSnap = await aRef.get();
    const assignment = (aSnap.exists ? aSnap.data() || {} : {}) as Record<string, unknown>;

    let lesson: Record<string, unknown> = {};
    if (hasAssignmentSnapshotContent(assignment)) {
      lesson = assignment;
    } else {
      const sourceType = (safeString(assignment.sourceType) || "library") as SourceType;
      const sourceId = safeString(assignment.sourceId).trim();

      if (!sourceId) {
        return json({ error: "Assignment missing sourceId and no snapshot content" }, 400);
      }

      const lessonRef =
        sourceType === "library"
          ? db.collection("published_lessons").doc(sourceId)
          : db.collection("lessons").doc(sourceId);

      const lessonSnap = await lessonRef.get();
      lesson = (lessonSnap.exists ? lessonSnap.data() || {} : {}) as Record<string, unknown>;
    }

    const lessonTitle = safeString(lesson.title) || safeString(assignment.title) || "Oppgave";
    const level = safeString(lesson.level) || safeString(assignment.level) || "A2";
    const languageHint = safeString(lesson.language) || safeString(assignment.language) || "";

    const lessonType = safeString(lesson.lessonType || assignment.lessonType).toLowerCase().trim();
    const taskType = safeString(lesson.taskType || assignment.taskType).toLowerCase().trim();
    const mathWorksheet = isMathWorksheet(lesson.mathWorksheet) ? (lesson.mathWorksheet as MathWorksheet) : null;

    const isGeometry =
      lessonType === "math_geometry" ||
      taskType === "math_geometry" ||
      !!mathWorksheet;

    if (isGeometry) {
      const answersByTaskId = readAnswerMap(subDoc.answersByTaskId);
      const geometryAuto = (subDoc.auto ?? null) as GeometryAutoResult | null;

      const systemPrompt = buildGeometrySystemPrompt(locale);
      const userContent =
        `Worksheet title: ${mathWorksheet?.title || lessonTitle}\n` +
        `Level: ${level}\n` +
        (languageHint ? `Language hint: ${languageHint}\n` : "") +
        `Geometry auto summary:\n${summarizeGeometryAuto(geometryAuto)}\n\n` +
        `Geometry tasks and student answers:\n${summarizeGeometryWorksheet(mathWorksheet, answersByTaskId, geometryAuto)}\n\n` +
        `Instruction:\n` +
        `Write teacher feedback for the student in the required structure. ` +
        `Use the auto-check actively. Mention what the student understands, what is partly correct or wrong, and what should be practiced next.`;

      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = pickModel();

      const resp = await client.responses.create({
        model,
        temperature: 0.3,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

      const textOut = (resp.output_text || "").trim();
      if (!textOut) return json({ error: "Empty AI response" }, 502);

      const payload = {
        aiFeedback: {
          text: textOut,
          updatedAt: FieldValue.serverTimestamp(),
          teacherUid: uid,
          createdAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      };

      const batch = db.batch();
      batch.set(subRef, payload, { merge: true });
      batch.set(db.collection("spaceSubmissions").doc(subId), payload, { merge: true });
      await batch.commit();

      return json({ text: textOut }, 200);
    }

    const tasks = safeTasksArray(lesson.tasks);
    const answers = readAnswerMap(subDoc.answers);

    const openItems = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .map((task, idx) => {
        const stableId = getStableTaskId(task, idx);
        const type = safeString(task?.type || "open");
        if (!isOpenLike(type)) return null;

        const prompt = safeString(task?.prompt);
        const ans = asText(answers[stableId]).trim();

        return {
          n: Number(task?.order ?? idx + 1),
          prompt: prompt.trim(),
          answer: ans,
        };
      })
      .filter(Boolean) as Array<{ n: number; prompt: string; answer: string }>;

    const readingTasks = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .filter((task) => isReadingTestType(safeString(task?.type)));

    const sourceText = safeString(lesson.sourceText) || safeString(lesson.text) || "";
    const sourceWordCount = countWords(sourceText);

    const autoResultat = summarizeAutoResult(subDoc.auto);

    const readingTimeLimitSeconds = safeNumber(subDoc.readingTestTimeLimitSeconds);
    const readingTimeUsedSeconds =
      safeNumber(subDoc.readingTestTimeUsedSeconds) ?? safeNumber(subDoc.timeSpentSeconds);
    const readingTimedOut = safeBoolean(subDoc.readingTestTimedOut);
    const readingSubmittedManually = safeBoolean(subDoc.readingTestSubmittedManually);

    const timeSignal = buildTimeSignal(sourceWordCount, readingTimeUsedSeconds);
    const isReadingTest =
      safeString(lesson.lessonType).toLowerCase() === "reading_test" || readingTasks.length > 0;

    const systemPrompt = isReadingTest
      ? buildReadingSystemPrompt(locale)
      : buildGeneralSystemPrompt(locale);

    const openTasksBlock =
      openItems.length > 0
        ? openItems
            .map(
              (x) =>
                `#${x.n}\n` +
                `OPPGAVE: ${x.prompt || "(ingen prompt)"}\n` +
                `SVAR: ${x.answer || "(ikke besvart)"}`
            )
            .join("\n\n")
        : "(Ingen åpne svar i denne innleveringen.)";

    const readingModeBlock = isReadingTest
      ? [
          "Reading test metadata:",
          `- Reading text word count: ${sourceWordCount || "unknown"}`,
          `- Time limit: ${readingTimeLimitSeconds != null ? `${readingTimeLimitSeconds} seconds (${formatDuration(readingTimeLimitSeconds)})` : "unknown"}`,
          `- Time used: ${readingTimeUsedSeconds != null ? `${readingTimeUsedSeconds} seconds (${formatDuration(readingTimeUsedSeconds)})` : "unknown"}`,
          `- Submitted manually: ${readingSubmittedManually === true ? "yes" : readingSubmittedManually === false ? "no" : "unknown"}`,
          `- Timed out: ${readingTimedOut === true ? "yes" : readingTimedOut === false ? "no" : "unknown"}`,
          `- ${timeSignal.summary}`,
        ].join("\n")
      : "";

    const taskOverviewBlock =
      tasks.length > 0
        ? tasks
            .slice()
            .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
            .map((task, idx) => {
              const type = safeString(task.type || "open");
              const stableId = getStableTaskId(task, idx);
              const prompt = safeString(task.prompt);
              const answer = asText(answers[stableId]).trim() || "(ikke besvart)";
              return `#${task.order ?? idx + 1} [${type}] ${prompt || "(ingen prompt)"}\nSVAR: ${answer}`;
            })
            .join("\n\n")
        : "(Ingen oppgaver funnet.)";

    const userContent = isReadingTest
      ? `CEFR level: ${level}\n` +
        (languageHint ? `Language hint: ${languageHint}\n` : "") +
        `Lesson title: ${lessonTitle}\n` +
        `Is reading test: yes\n\n` +
        `Auto result:\n${autoResultat || "(not provided)"}\n\n` +
        `Reading text:\n${sourceText.trim() || "(not provided)"}\n\n` +
        `${readingModeBlock}\n\n` +
        `All tasks and student answers:\n${taskOverviewBlock}\n\n` +
        `Open tasks and answers:\n${openTasksBlock}\n\n` +
        `Instruction:\n` +
        `Write teacher feedback in the required structure. Base the reading assessment mainly on the auto result. Use time only as a cautious supporting signal.`
      : (languageHint ? `Language hint: ${languageHint}\n` : "") +
        `Lesson title: ${lessonTitle}\n` +
        `Task type: normal task\n\n` +
        `Automatic result data:\n${autoResultat || "(not provided)"}\n\n` +
        `Source text / task context:\n${sourceText.trim() || "(not provided)"}\n\n` +
        `All tasks and student answers:\n${taskOverviewBlock}\n\n` +
        `Open tasks and answers:\n${openTasksBlock}\n\n` +
        `Instruction:\n` +
        `Write short teacher feedback in the required structure. ` +
        `Focus on whether the student has understood the task, answered relevantly, and responded to the open tasks. ` +
        `Use automatic result data as support when it exists. ` +
        `In the language section, comment on grammar and point out concrete errors that should be corrected. ` +
        `Do not set a CEFR level.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = pickModel();

    const resp = await client.responses.create({
      model,
      temperature: 0.3,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const textOut = (resp.output_text || "").trim();
    if (!textOut) return json({ error: "Empty AI response" }, 502);

    const payload = {
      aiFeedback: {
        text: textOut,
        updatedAt: FieldValue.serverTimestamp(),
        teacherUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(subRef, payload, { merge: true });
    batch.set(db.collection("spaceSubmissions").doc(subId), payload, { merge: true });
    await batch.commit();

    return json({ text: textOut }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}