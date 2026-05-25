// app/[locale]/(app)/student/lesson/[lessonId]/page.tsx
"use client";

import { SearchableSelect } from "@/components/SearchableSelect";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  setDoc,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { LANGUAGES } from "@/lib/languages";
import { useLocale, useTranslations } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimit, getEffectivePlan, type PlanKey } from "@/lib/featureAccess";
import { incrementUsage } from "@/lib/usage";
import { trackAiFeedback } from "@/lib/analytics";
import { Volume2 } from "lucide-react";
import ReadingTestPlayer, {
  type ReadingLessonTask,
  type ReadingTestConfig,
} from "@/components/student/ReadingTestPlayer";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

type Lesson = {
  ownerId?: string;
  title: string;
  level?: string;
  topic?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  status?: "draft" | "published";
  language?: string;
  coverImageUrl?: string;
  lessonType?: string;
  taskType?: string;
  imageTasks?: unknown;
  readingTestConfig?: unknown;
  isActive?: boolean;
  sourceCollection?: "published_lessons" | "lessons";
  publishedLessonId?: string | null;
};

type AnswersMap = Record<string, unknown>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

type SubmissionDoc = {
  uid?: string;
  lessonId?: string;
  publishedLessonId?: string | null;
  answers?: Record<string, unknown>;
  status?: "draft" | "submitted";
  feedback?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  feedbackUpdatedAt?: Timestamp;
};

type PublishedLessonDoc = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  lessonType?: string;
  taskType?: string;
  imageTasks?: unknown;
  readingTestConfig?: unknown;
  isActive?: boolean;
};

type PrivateLessonDoc = {
  ownerId?: string;
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  lessonType?: string;
  taskType?: string;
  imageTasks?: unknown;
  readingTestConfig?: unknown;
  status?: "draft" | "published";
};

type TaskType = "mcq" | "truefalse" | "open";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
  supportWords?: unknown[];
  successCriteria?: unknown[];
  imageDescription?: string;
  imageUrl?: string;
  sentence?: string;
  textWithGap?: string;
  enabled?: boolean;
};

type ImageWritingTask = {
  id?: string;
  imageUrl?: string;
  imageDescription?: string;
  instruction?: string;
  supportWords?: unknown[];
  successCriteria?: unknown[];
};

type Role = "student" | "teacher" | "parent";

type AudioMode =
  | "text_original"
  | "text_translation"
  | "task_original"
  | "feedback_original"
  | "feedback_translation";

type TtsLang = "no" | "en" | "pt-BR";

type ReadingProgress = {
  timeLimitSeconds: number | null;
  secondsLeft: number | null;
  secondsUsed: number | null;
  isTimeUp: boolean;
  hasStarted: boolean;
  questionsVisible: boolean;
};

type SentenceSeg = {
  text: string;
  startChar: number;
  endChar: number;
  startRatio: number;
  endRatio: number;
};

function safeRole(role: unknown): Role {
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  return "student";
}

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

function asPublishedLessonDoc(data: DocumentData): PublishedLessonDoc {
  const d = data as Partial<PublishedLessonDoc>;
  return {
    title: typeof d.title === "string" ? d.title : undefined,
    level: typeof d.level === "string" ? d.level : undefined,
    topic: typeof d.topic === "string" ? d.topic : undefined,
    language: typeof d.language === "string" ? d.language : undefined,
    sourceText: typeof d.sourceText === "string" ? d.sourceText : undefined,
    text: typeof d.text === "string" ? d.text : undefined,
    tasks: d.tasks,
    coverImageUrl: typeof d.coverImageUrl === "string" ? d.coverImageUrl : undefined,
    lessonType: typeof d.lessonType === "string" ? d.lessonType : undefined,
    taskType: typeof d.taskType === "string" ? d.taskType : undefined,
    imageTasks: d.imageTasks,
    readingTestConfig: d.readingTestConfig,
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
  };
}

function asPrivateLessonDoc(data: DocumentData): PrivateLessonDoc {
  const d = data as Partial<PrivateLessonDoc>;
  return {
    ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
    title: typeof d.title === "string" ? d.title : undefined,
    level: typeof d.level === "string" ? d.level : undefined,
    topic: typeof d.topic === "string" ? d.topic : undefined,
    language: typeof d.language === "string" ? d.language : undefined,
    sourceText: typeof d.sourceText === "string" ? d.sourceText : undefined,
    text: typeof d.text === "string" ? d.text : undefined,
    tasks: d.tasks,
    coverImageUrl: typeof d.coverImageUrl === "string" ? d.coverImageUrl : undefined,
    lessonType: typeof d.lessonType === "string" ? d.lessonType : undefined,
    taskType: typeof d.taskType === "string" ? d.taskType : undefined,
    imageTasks: d.imageTasks,
    readingTestConfig: d.readingTestConfig,
    status: d.status === "published" ? "published" : "draft",
  };
}

function asSubmissionDoc(data: DocumentData): SubmissionDoc {
  const d = data as Partial<SubmissionDoc>;
  const answers =
    d.answers && typeof d.answers === "object" && !Array.isArray(d.answers)
      ? (d.answers as Record<string, unknown>)
      : undefined;

  return {
    uid: typeof d.uid === "string" ? d.uid : undefined,
    lessonId: typeof d.lessonId === "string" ? d.lessonId : undefined,
    publishedLessonId:
      typeof d.publishedLessonId === "string"
        ? d.publishedLessonId
        : d.publishedLessonId === null
          ? null
          : undefined,
    answers,
    status: d.status === "draft" || d.status === "submitted" ? d.status : undefined,
    feedback: typeof d.feedback === "string" ? d.feedback : undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    feedbackUpdatedAt: d.feedbackUpdatedAt,
  };
}

function isPermissionDenied(e: unknown) {
  const err = e as { code?: unknown; message?: unknown };
  const code = String(err?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

async function translateOne(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  const raw = await res.text();

  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Translate API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  const d = data as {
    error?: unknown;
    translatedText?: unknown;
    translation?: unknown;
    text?: unknown;
  };

  if (d?.error) throw new Error(`Translate API error (HTTP ${res.status}): ${String(d.error)}`);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);

  const out = String(d?.translatedText ?? d?.translation ?? d?.text ?? "").trim();
  if (!out) {
    throw new Error(
      `Translate returned empty (HTTP ${res.status}). Keys: ${Object.keys(d as object).join(", ") || "(no keys)"}`
    );
  }
  return out;
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

function safeImageTasksArray(tasks: unknown): ImageWritingTask[] {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((task) => task && typeof task === "object")
    .map((task) => task as ImageWritingTask);
}

function safeReadingConfig(value: unknown): ReadingTestConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ReadingTestConfig;
}

function safeReadingTasksArray(tasks: unknown): ReadingLessonTask[] {
  return safeTasksArray(tasks).map((task, idx) => {
    const stableId = getStableTaskId(task, idx);
    const options = Array.isArray(task.options)
      ? task.options.map((option) => String(option ?? ""))
      : undefined;

    return {
      id: stableId,
      order: typeof task.order === "number" ? task.order : idx + 1,
      type: String(task.type || "open") as ReadingLessonTask["type"],
      prompt: String(task.prompt || ""),
      options,
      correctAnswer: task.correctAnswer as ReadingLessonTask["correctAnswer"],
      sentence: typeof task.sentence === "string" ? task.sentence : undefined,
      textWithGap: typeof task.textWithGap === "string" ? task.textWithGap : undefined,
      enabled: task.enabled === false ? false : true,
    };
  });
}

function toCleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function imageWritingStudentLabels(language: unknown) {
  if (language === "en") {
    return {
      showSupport: "Show support words",
      hideSupport: "Hide support words",
      showCriteria: "Show success criteria",
      hideCriteria: "Hide success criteria",
    };
  }
  if (language === "pt") {
    return {
      showSupport: "Mostrar palavras de apoio",
      hideSupport: "Ocultar palavras de apoio",
      showCriteria: "Mostrar critérios de sucesso",
      hideCriteria: "Ocultar critérios de sucesso",
    };
  }
  return {
    showSupport: "Vis støtteord",
    hideSupport: "Skjul støtteord",
    showCriteria: "Vis suksesskriterier",
    hideCriteria: "Skjul suksesskriterier",
  };
}

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function toTtsLang(lang: string): TtsLang {
  const v = (lang || "").toLowerCase().trim();
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
  if (v === "en") return "en";
  return "no";
}

function segmentSentences(fullText: string): { clean: string; segs: SentenceSeg[] } {
  const clean = (fullText || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return { clean: "", segs: [] };

  const parts = clean
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return { clean, segs: [] };

  const segsRaw: Array<{ text: string; startChar: number; endChar: number; weight: number }> = [];
  let cursor = 0;

  for (const p of parts) {
    const idx = clean.indexOf(p, cursor);
    const startChar = idx >= 0 ? idx : cursor;
    const endChar = startChar + p.length;
    cursor = endChar;

    const weight = Math.max(8, p.replace(/\s+/g, " ").length);
    segsRaw.push({ text: p, startChar, endChar, weight });
  }

  const total = segsRaw.reduce((sum, s) => sum + s.weight, 0) || 1;

  let acc = 0;
  const segs: SentenceSeg[] = segsRaw.map((s) => {
    const startRatio = acc / total;
    acc += s.weight;
    const endRatio = acc / total;
    return {
      text: s.text,
      startChar: s.startChar,
      endChar: s.endChar,
      startRatio,
      endRatio,
    };
  });

  if (segs.length) segs[segs.length - 1].endRatio = 1;
  return { clean, segs };
}

function fmtTime(sec: number) {
  if (!sec || !isFinite(sec)) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function Pill({ text, kind = "neutral" }: { text: string; kind?: "neutral" | "good" | "bad" }) {
  const bg =
    kind === "good"
      ? "rgba(46, 204, 113, 0.95)"
      : kind === "bad"
        ? "rgba(231, 76, 60, 0.95)"
        : "rgba(0,0,0,0.05)";
  const brd =
    kind === "good"
      ? "rgba(46, 204, 113, 0.75)"
      : kind === "bad"
        ? "rgba(231, 76, 60, 0.75)"
        : "rgba(0,0,0,0.14)";
  const col = kind === "good" || kind === "bad" ? "white" : "rgba(0,0,0,0.75)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${brd}`,
        background: bg,
        color: col,
        fontSize: 12,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function lsKey(lessonId: string) {
  return `321skole:answers:${lessonId}`;
}

function buildAutoResultat(lessonObj: Lesson, answersObj: AnswersMap): string {
  const tasksArr = safeTasksArray(lessonObj.tasks);
  const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  let total = 0;
  let correct = 0;
  const lines: string[] = [];
  const wrongLines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tt = sorted[i];
    const stableId = getStableTaskId(tt, i);
    const type = String(tt?.type ?? "open").toLowerCase();
    const isTrueFalse = type === "truefalse" || type === "true_false";
    const isChoice =
      type === "mcq" ||
      type === "multiple_choice" ||
      type === "best_summary" ||
      type === "word_choice" ||
      type === "sentence_placement" ||
      type === "fill_in_word";

    if (!isChoice && !isTrueFalse) continue;

    const val = answersObj[stableId];
    if (val === undefined || val === null || val === "") continue;

    const options = Array.isArray(tt?.options) ? (tt.options as unknown[]) : [];
    const rawCorrect = tt?.correctAnswer;

    const mcqCorrectText = (() => {
      if (!options.length) return null;
      if (typeof rawCorrect === "number" && rawCorrect >= 0 && rawCorrect < options.length) {
        return String(options[rawCorrect]);
      }
      if (typeof rawCorrect === "string") return rawCorrect;
      if (Array.isArray(rawCorrect) && rawCorrect.length > 0) return String(rawCorrect[0]);
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
      (isChoice && mcqCorrectText != null) || (isTrueFalse && tfCorrectBool != null);

    if (!hasCorrect) continue;

    total += 1;

    const isCorrect =
      isChoice
        ? mcqCorrectText != null && val != null && String(val).trim() === String(mcqCorrectText).trim()
        : isTrueFalse
          ? tfCorrectBool != null &&
            (typeof val === "boolean"
              ? val === tfCorrectBool
              : String(val).trim().toLowerCase() === String(tfCorrectBool))
          : false;

    if (isCorrect) correct += 1;

    const order = tt?.order ?? i + 1;
    const prompt = String(tt?.prompt ?? "").trim();

    if (!isCorrect) {
      if (isChoice) {
        wrongLines.push(
          `- Oppgave ${order} (${type}): "${prompt}" | Elev: "${String(val)}" | Fasit: "${String(
            mcqCorrectText
          )}"`
        );
      } else {
        wrongLines.push(
          `- Oppgave ${order} (sant/usant): "${prompt}" | Elev: ${String(val)} | Fasit: ${String(
            tfCorrectBool
          )}`
        );
      }
    }
  }

  if (total === 0) return "";

  lines.push(`Lukkede oppgaver: ${correct}/${total} riktige.`);
  if (wrongLines.length) {
    lines.push("");
    lines.push("Feil/misforståelser (kort oversikt):");
    lines.push(...wrongLines.slice(0, 8));
  }

  return lines.join("\n").trim();
}

function buildOppgaveString(lessonObj: Lesson, isReadingTestLesson = false): string {
  const tasksArr = safeTasksArray(lessonObj.tasks);
  const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
  const openPrompts: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tt = sorted[i];
    const type = String(tt?.type ?? "open");
    if (type !== "open" && type !== "") continue;
    const order = tt?.order ?? i + 1;
    const prompt = String(tt?.prompt ?? "").trim();
    if (!prompt) continue;
    openPrompts.push(`- Oppgave ${order}: ${prompt}`);
  }

  const level = (lessonObj.level ?? "A2").toString();

  if (isReadingTestLesson) {
    return (
      `Vurder resultatet fra denne lesetesten forsiktig i forhold til teksten og nivå ${level}. ` +
      `Ikke gi bastante nivåkonklusjoner.\n` +
      (openPrompts.length ? `Åpne oppgaver:\n${openPrompts.join("\n")}\n` : "")
    ).trim();
  }

  return (
    `Vurder elevens åpne svar i forhold til CEFR ${level}, og gi råd for videre progresjon.\n` +
    (openPrompts.length ? `Åpne oppgaver:\n${openPrompts.join("\n")}\n` : "")
  ).trim();
}

function buildSvarString(lessonObj: Lesson, answersObj: AnswersMap): string {
  const tasksArr = safeTasksArray(lessonObj.tasks);
  const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
  const lines: string[] = [];

  if (sorted.length > 0) {
    for (let i = 0; i < sorted.length; i++) {
      const tt = sorted[i];
      const stableId = getStableTaskId(tt, i);

      const order = tt?.order ?? i + 1;
      const prompt = String(tt?.prompt ?? "").trim();
      const type = String(tt?.type ?? "open");
      const ans = answersObj[stableId];

      const isOpen = type === "open" || (type !== "mcq" && type !== "truefalse");
      if (!isOpen) continue;

      const ansText =
        typeof ans === "string" ? ans.trim() : ans == null ? "" : String(ans).trim();

      if (!ansText) continue;

      lines.push(`Oppgave ${order} (åpen): ${prompt}`);
      lines.push(`Svar: ${ansText}`);
      lines.push("");
    }
  } else {
    for (const [k, v] of Object.entries(answersObj)) {
      const ansText = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
      if (!ansText) continue;
      lines.push(`${k}: ${ansText}`);
    }
  }

  return lines.join("\n").trim();
}

export default function StudentLessonPage() {
  const t = useTranslations("lessonsLanding");
  const locale = useLocale();

  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const router = useRouter();
  const { profile } = useUserProfile();

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState<boolean>(true);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [audioLoginNoticeMode, setAudioLoginNoticeMode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);

  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);

  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});
  const [supportWordsOpen, setSupportWordsOpen] = useState<Record<string, boolean>>({});
  const [successCriteriaOpen, setSuccessCriteriaOpen] = useState<Record<string, boolean>>({});

  const [translatedFeedback, setTranslatedFeedback] = useState<string | null>(null);
  const [feedbackTranslating, setFeedbackTranslating] = useState(false);
  const [feedbackTranslateErr, setFeedbackTranslateErr] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [readingSubmitted, setReadingSubmitted] = useState(false);
  const [readingAttemptKey, setReadingAttemptKey] = useState(0);

  const hasAnswers = useMemo(() => Object.keys(answers).length > 0, [answers]);

  const role: Role = isAnon ? "student" : safeRole(readStringField(profile, "role"));
  const plan: PlanKey = isAnon
    ? "free"
    : getEffectivePlan({
        plan: safePlan(readStringField(profile, "plan")),
        schoolId: readStringField(profile, "schoolId"),
        schoolRole: readStringField(profile, "schoolRole"),
        schoolStatus: readStringField(profile, "schoolStatus"),
      });

  const { usage, loading: usageLoading, reload: reloadUsage } = useUsage(uid ?? undefined);

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, plan, "ai_feedback");
  const feedbackRemaining = Math.max(0, feedbackLimit - feedbackUsed);

  const feedbackLimitReached =
    !isAnon && !usageLoading && feedbackLimit > 0 && feedbackUsed >= feedbackLimit;

  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => {
    setShowAnswers(!!feedback);
  }, [feedback]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsBusy, setTtsBusy] = useState<null | AudioMode>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [activeTextMode, setActiveTextMode] = useState<AudioMode | null>(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

  const sourceTextSafe = useMemo(() => {
    const txt = (lesson?.sourceText ?? lesson?.text ?? "").toString();
    return txt;
  }, [lesson?.sourceText, lesson?.text]);

  const isImageWriting = useMemo(
    () => String(lesson?.lessonType ?? "").trim().toLowerCase() === "image_writing",
    [lesson?.lessonType]
  );

  const isReadingTest = useMemo(
    () => String(lesson?.lessonType ?? "").trim().toLowerCase() === "reading_test",
    [lesson?.lessonType]
  );

  const displayedSourceTextSafe = isImageWriting || isReadingTest ? "" : sourceTextSafe;

  const readingTestConfig = useMemo(
    () => safeReadingConfig(lesson?.readingTestConfig),
    [lesson?.readingTestConfig]
  );

  const readingTasks = useMemo(
    () => safeReadingTasksArray(lesson?.tasks),
    [lesson?.tasks]
  );

  const imageWritingTask = useMemo(
    () => safeImageTasksArray(lesson?.imageTasks)[0] ?? null,
    [lesson?.imageTasks]
  );
  const imageWritingLabels = useMemo(
    () => imageWritingStudentLabels(lesson?.language),
    [lesson?.language]
  );

  const textFollow = useMemo(() => {
    const original = segmentSentences(displayedSourceTextSafe || "");
    const translation = segmentSentences(translatedText || "");
    return { original, translation };
  }, [displayedSourceTextSafe, translatedText]);

  const originalLangForTTS: TtsLang = toTtsLang(lesson?.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((tt) => m.set(tt.stableId, tt));
    return m;
  }, [translatedTasks]);

  const stickyAudioLabel =
    activeTextMode === "text_translation" || activeTextMode === "feedback_translation"
      ? t("text.audioSourceTranslation")
      : activeTextMode === "feedback_original"
        ? t("feedback.title")
        : activeTextMode === "task_original"
          ? t("tasks.title")
          : t("text.audioSourceOriginal");

  const loginHref = useMemo(() => {
    const next = `/${locale}/student/lesson/${lessonId}`;
    return `/${locale}/login?next=${encodeURIComponent(next)}`;
  }, [locale, lessonId]);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setActiveSentenceIndex(null);
    setActiveTextMode(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }

  function pauseAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
  }

  function resumeAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.play().catch(() => { });
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 2600);
  }

  function requireAudioLogin(mode: string) {
    if (isAnon) {
      setAudioLoginNoticeMode(mode);
      setTimeout(() => {
        setAudioLoginNoticeMode((current) => (current === mode ? null : current));
      }, 3600);
      return false;
    }
    return true;
  }

  function renderAudioLoginNotice(mode: string) {
    if (!isAnon || audioLoginNoticeMode !== mode) return null;

    return (
      <div
        style={{
          marginTop: 6,
          maxWidth: 220,
          fontSize: 12,
          lineHeight: 1.35,
          color: "#1e3a8a",
          background: "rgba(59,130,246,0.10)",
          border: "1px solid rgba(37,99,235,0.18)",
          borderRadius: 10,
          padding: "7px 9px",
        }}
      >
        {t("text.loginToPlayAudio")}
      </div>
    );
  }

  async function playTTS(text: string, lang: TtsLang, mode: AudioMode) {
    if (!lessonId) return;
    const clean = (text || "").trim();
    if (!clean) return;
    setTtsBusy(mode);

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          lang,
          text: clean,
          voice: "marin",
        }),
      });

      const raw = await res.text();
      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`TTS API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
      }

      const d = data as { error?: unknown; url?: unknown };

      if (!res.ok) throw new Error(d?.error ? String(d.error) : `TTS error (HTTP ${res.status})`);

      const url = String(d?.url ?? "").trim();
      if (!url) throw new Error("TTS returned no url");

      const a = new Audio(url);
      a.playbackRate = playbackRate;
      audioRef.current = a;

      setActiveTextMode(mode);
      setActiveSentenceIndex(0);
      setCurrentTime(0);
      setDuration(0);

      a.addEventListener("ended", () => {
        setActiveSentenceIndex(null);
        setActiveTextMode(null);
      });

      await a.play();
    } catch (e: unknown) {
      console.error("TTS error:", e);
      setActiveSentenceIndex(null);
      setActiveTextMode(null);
    } finally {
      setTtsBusy(null);
    }
  }

  async function playOriginalTextAudio() {
    if (!requireAudioLogin("text_original")) return;
    const txt = (displayedSourceTextSafe || "").trim();
    if (!txt) return;
    await playTTS(txt, originalLangForTTS, "text_original");
  }

  async function playTranslatedTextAudio() {
    if (!requireAudioLogin("text_translation")) return;
    const txt = (translatedText || "").trim();
    if (!txt) return;
    await playTTS(txt, translationLangForTTS, "text_translation");
  }

  async function playTaskAudio(text: string, stableId: string) {
    if (!requireAudioLogin(`task:${stableId}`)) return;
    const txt = (text || "").trim();
    if (!txt) return;
    await playTTS(txt, originalLangForTTS, "task_original");
  }

  async function playTranslatedTaskAudio(text: string, stableId: string) {
    if (!requireAudioLogin(`taskTranslation:${stableId}`)) return;
    const txt = (text || "").trim();
    if (!txt) return;
    await playTTS(txt, translationLangForTTS, "task_original");
  }

  async function playTaskOptionAudio(text: string, stableId: string, optionIndex: number) {
    if (!requireAudioLogin(`taskOption:${stableId}:${optionIndex}`)) return;
    const txt = (text || "").trim();
    if (!txt) return;
    await playTTS(txt, originalLangForTTS, "task_original");
  }

  async function playTranslatedTaskOptionAudio(text: string, stableId: string, optionIndex: number) {
    if (!requireAudioLogin(`taskOptionTranslation:${stableId}:${optionIndex}`)) return;
    const txt = (text || "").trim();
    if (!txt) return;
    await playTTS(txt, translationLangForTTS, "task_original");
  }

  async function playFeedbackAudio() {
    if (!requireAudioLogin("feedback_original")) return;
    const txt = (feedback || "").trim();
    if (!txt) return;
    await playTTS(txt, toTtsLang(targetLang || lesson?.language || "no"), "feedback_original");
  }

  async function playTranslatedFeedbackAudio() {
    if (!requireAudioLogin("feedback_translation")) return;
    const txt = (translatedFeedback || "").trim();
    if (!txt) return;
    await playTTS(txt, translationLangForTTS, "feedback_translation");
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(a.duration || 0);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnded);

    setCurrentTime(a.currentTime || 0);
    setDuration(a.duration || 0);
    setIsPlaying(!a.paused);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnded);
    };
  }, [ttsBusy]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (activeTextMode !== "text_original" && activeTextMode !== "text_translation") return;

    const onTime = () => {
      const d = a.duration;
      if (!d || !isFinite(d)) return;

      const tt = a.currentTime;
      const ratio = Math.max(0, Math.min(1, tt / d));

      const segs = activeTextMode === "text_translation"
        ? textFollow.translation.segs
        : textFollow.original.segs;

      if (!segs || segs.length === 0) return;

      let idx = segs.findIndex((s) => ratio >= s.startRatio && ratio < s.endRatio);
      if (idx === -1) idx = segs.length - 1;

      setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
    };

    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [activeTextMode, textFollow.original.segs, textFollow.translation.segs]);

  function seekToSentence(mode: AudioMode, idx: number) {
    const a = audioRef.current;
    if (!a) return;

    const segs =
      mode === "text_translation"
        ? textFollow.translation.segs
        : mode === "text_original"
          ? textFollow.original.segs
          : [];

    if (!segs || !segs[idx]) return;

    const d = a.duration;
    if (!d || !isFinite(d)) return;

    const target = segs[idx].startRatio * d;
    a.currentTime = Math.max(0, Math.min(d - 0.05, target));
    setActiveTextMode(mode);
    setActiveSentenceIndex(idx);

    if (a.paused) a.play().catch(() => { });
  }

  function prevSentence() {
    if (!audioRef.current) return;
    if (!activeTextMode) return;
    if (activeTextMode !== "text_original" && activeTextMode !== "text_translation") return;

    const segs =
      activeTextMode === "text_translation"
        ? textFollow.translation.segs
        : textFollow.original.segs;

    if (!segs.length) return;

    const nextIdx = Math.max(0, (activeSentenceIndex ?? 0) - 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  function nextSentence() {
    if (!audioRef.current) return;
    if (!activeTextMode) return;
    if (activeTextMode !== "text_original" && activeTextMode !== "text_translation") return;

    const segs =
      activeTextMode === "text_translation"
        ? textFollow.translation.segs
        : textFollow.original.segs;

    if (!segs.length) return;

    const nextIdx = Math.min(segs.length - 1, (activeSentenceIndex ?? 0) + 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  useEffect(() => {
    if (!lessonId) return;

    const scrollNow = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollNow();

    const r1 = requestAnimationFrame(scrollNow);
    const r2 = requestAnimationFrame(() => {
      requestAnimationFrame(scrollNow);
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [lessonId]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      if (!lessonId) {
        setError(t("errors.missingLessonId"));
        if (alive) setLoading(false);
        return;
      }

      try {
        const user = auth.currentUser ?? (await ensureAnonymousUser());
        if (!alive) return;

        setUid(user.uid);
        setIsAnon(!!user.isAnonymous);

        let loadedLesson: Lesson | null = null;

        try {
          const publishedSnap = await getDoc(doc(db, "published_lessons", lessonId));

          if (publishedSnap.exists()) {
            const rawData = asPublishedLessonDoc(publishedSnap.data());

            if (rawData?.isActive === false) {
              setLesson(null);
              setError(t("errors.notPublished"));
              if (alive) setLoading(false);
              return;
            }

            loadedLesson = {
              title: rawData.title ?? t("fallback.lessonTitle"),
              level: rawData.level,
              topic: rawData.topic,
              language: rawData.language,
              tasks: rawData.tasks,
              coverImageUrl: rawData.coverImageUrl,
              lessonType: rawData.lessonType,
              taskType: rawData.taskType,
              imageTasks: rawData.imageTasks,
              readingTestConfig: rawData.readingTestConfig,
              isActive: rawData.isActive,
              sourceText: (rawData.sourceText ?? rawData.text ?? "") as string,
              text: rawData.text,
              status: "published",
              sourceCollection: "published_lessons",
              publishedLessonId: lessonId,
            };
          }
        } catch (e: unknown) {
          if (!isPermissionDenied(e)) throw e;
        }

        if (!loadedLesson) {
          const privateSnap = await getDoc(doc(db, "lessons", lessonId));
          if (!alive) return;

          if (!privateSnap.exists()) {
            setLesson(null);
            setError(t("errors.notFound"));
            if (alive) setLoading(false);
            return;
          }

          const rawPrivate = asPrivateLessonDoc(privateSnap.data());

          if (user.isAnonymous) {
            setLesson(null);
            setError(t("errors.noAccess"));
            if (alive) setLoading(false);
            return;
          }

          if (!rawPrivate.ownerId || rawPrivate.ownerId !== user.uid) {
            setLesson(null);
            setError(t("errors.noAccess"));
            if (alive) setLoading(false);
            return;
          }

          loadedLesson = {
            ownerId: rawPrivate.ownerId,
            title: rawPrivate.title ?? t("fallback.lessonTitle"),
            level: rawPrivate.level,
            topic: rawPrivate.topic,
            language: rawPrivate.language,
            tasks: rawPrivate.tasks,
            coverImageUrl: rawPrivate.coverImageUrl,
            lessonType: rawPrivate.lessonType,
            taskType: rawPrivate.taskType,
            imageTasks: rawPrivate.imageTasks,
            readingTestConfig: rawPrivate.readingTestConfig,
            sourceText: (rawPrivate.sourceText ?? rawPrivate.text ?? "") as string,
            text: rawPrivate.text,
            status: rawPrivate.status ?? "draft",
            sourceCollection: "lessons",
            publishedLessonId: null,
          };
        }

        setLesson(loadedLesson);
        setImageUrl(loadedLesson.coverImageUrl ?? null);

        if (user.isAnonymous) {
          try {
            const raw = localStorage.getItem(lsKey(lessonId));
            const parsed: unknown = raw ? JSON.parse(raw) : null;
            const p = parsed as { answers?: unknown };
            if (p?.answers && typeof p.answers === "object" && !Array.isArray(p.answers)) {
              setAnswers(p.answers as Record<string, unknown>);
            } else {
              setAnswers({});
            }
          } catch {
            setAnswers({});
          }
          setFeedback(null);
        } else {
          const stableSubId = `${user.uid}_${lessonId}`;
          try {
            const subRef = doc(db, "practiceSubmissions", stableSubId);
            const subDoc = await getDoc(subRef);
            if (!alive) return;

            if (subDoc.exists()) {
              const data = asSubmissionDoc(subDoc.data());
              if (data?.answers) setAnswers(data.answers);
              else setAnswers({});
              if (typeof data?.feedback === "string") setFeedback(data.feedback);
              else setFeedback(null);
            } else {
              setAnswers({});
              setFeedback(null);
            }
          } catch (e: unknown) {
            if (!isPermissionDenied(e)) throw e;
            setAnswers({});
            setFeedback(null);
          }
        }

        setTranslatedText(null);
        setTranslatedTasks(null);
        setTaskTranslationOpen({});
        setTranslatedFeedback(null);
        setFeedbackTranslateErr(null);
        setTtsBusy(null);
        stopAudio();
      } catch (e: unknown) {
        if (!alive) return;
        if (isPermissionDenied(e)) {
          setError(t("errors.noAccess"));
        } else {
          const m = (e as { message?: unknown })?.message;
          setError(typeof m === "string" ? m : t("errors.generic"));
        }
      }

      if (alive) setLoading(false);
    };

    run();
    return () => {
      alive = false;
    };
  }, [lessonId, t]);

  useEffect(() => {
    if (!lessonId) return;
    if (!isAnon) return;

    try {
      localStorage.setItem(lsKey(lessonId), JSON.stringify({ answers, updatedAt: Date.now() }));
    } catch {
      // ignore
    }
  }, [answers, isAnon, lessonId]);

  useEffect(() => {
    setFeedbackTranslateErr(null);
  }, [targetLang]);

  function setAnswer(taskId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  function restartReadingTest() {
    setAnswers({});
    setFeedback(null);
    setTranslatedFeedback(null);
    setReadingProgress(null);
    setReadingSubmitted(false);
    setReadingAttemptKey((key) => key + 1);

    if (lessonId && isAnon) {
      try {
        localStorage.removeItem(lsKey(lessonId));
      } catch {
        // ignore
      }
    }

    flash("Klar for en ny runde.");
  }

  function toggleTaskTranslation(stableId: string) {
    setTaskTranslationOpen((prev) => {
      const current = prev[stableId];
      return { ...prev, [stableId]: current === undefined ? false : !current };
    });
  }

  function isTaskTranslationVisible(stableId: string) {
    const v = taskTranslationOpen[stableId];
    if (v === undefined) return showTaskTranslations;
    return v;
  }

  function toggleSupportWords(stableId: string) {
    setSupportWordsOpen((prev) => ({ ...prev, [stableId]: !prev[stableId] }));
  }

  function isSupportWordsVisible(stableId: string) {
    return !!supportWordsOpen[stableId];
  }

  function toggleSuccessCriteria(stableId: string) {
    setSuccessCriteriaOpen((prev) => ({ ...prev, [stableId]: !prev[stableId] }));
  }

  function isSuccessCriteriaVisible(stableId: string) {
    return !!successCriteriaOpen[stableId];
  }

  async function saveDraft() {
    if (!lessonId || !uid || !lesson) return;

    setSaving(true);
    setMsg(null);

    try {
      if (isAnon) {
        try {
          localStorage.setItem(
            lsKey(lessonId),
            JSON.stringify({ answers, updatedAt: Date.now() })
          );
        } catch {
          // ignore
        }
        flash(t("flash.saved"));
        return;
      }

      const stableId = `${uid}_${lessonId}`;
      const publishedLessonId =
        lesson.sourceCollection === "published_lessons" ? lessonId : null;
      const source =
        lesson.sourceCollection === "published_lessons" ? "library" : "my_content";

      const practiceRef = doc(db, "practiceSubmissions", stableId);
      await setDoc(
        practiceRef,
        {
          uid,
          lessonId,
          publishedLessonId,
          answers,
          readingProgress: isReadingTest ? readingProgress : null,
          status: "draft",
          source,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const subRef = doc(db, "submissions", stableId);
      await setDoc(
        subRef,
        {
          uid,
          lessonId,
          publishedLessonId,
          answers,
          readingProgress: isReadingTest ? readingProgress : null,
          status: "draft",
          kind: "practice",
          source,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      flash(t("flash.saved"));
      router.push(`/${locale}/content`);
      return;
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setMsg(typeof m === "string" ? m : t("errors.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  async function submitForFeedback(progressOverride?: ReadingProgress) {
    if (!lessonId || !uid || !lesson) return;
    if (!hasAnswers) {
      flash(t("flash.answerAtLeastOne"));
      return;
    }

    if (isAnon) {
      router.push(loginHref);
      return;
    }

    if (feedbackLimitReached) {
      flash(t("feedback.limitReached"));
      router.push(`/${locale}/pricing`);
      return;
    }

    setSubmitting(true);
    setMsg(null);

    setFeedback(t("feedback.generatingNew"));
    setTranslatedFeedback(null);

    try {
      const activeReadingProgress = progressOverride ?? readingProgress;
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "practiceSubmissions", stableId);
      const publishedLessonId =
        lesson.sourceCollection === "published_lessons" ? lessonId : null;
      const source =
        lesson.sourceCollection === "published_lessons" ? "library" : "my_content";

      await setDoc(
        ref,
        {
          uid,
          lessonId,
          publishedLessonId,
          answers,
          readingProgress: isReadingTest ? activeReadingProgress : null,
          status: "submitted",
          source,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const imageDescription = String(imageWritingTask?.imageDescription ?? "").trim();
      const lesetekst = isImageWriting
        ? imageDescription
        : (lesson.sourceText ?? lesson.text ?? "").trim();
      const oppgave = buildOppgaveString(lesson, isReadingTest);
      const svar = buildSvarString(lesson, answers);
      const autoResultat = buildAutoResultat(lesson, answers);

      if (!svar && !autoResultat) {
        throw new Error(t("feedback.errors.answerAtLeastOne"));
      }

      const baseLevel = (lesson.level ?? "A2").toString();
      const nivå = isReadingTest ? baseLevel : `${baseLevel} (mål: videre progresjon)`;

      const payload = {
        lesetekst,
        oppgave,
        svar,
        nivå,
        autoResultat,
        lessonType: lesson.lessonType ?? null,
        imageDescription: imageDescription || null,
        imageInstruction: String(imageWritingTask?.instruction ?? "").trim() || null,
        locale,
        readingTasks: isReadingTest ? readingTasks : null,
        readingAnswers: isReadingTest ? answers : null,
        readingTestConfig: isReadingTest ? readingTestConfig : null,
        readingProgress: isReadingTest ? activeReadingProgress : null,
      };

      trackAiFeedback("student");

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const tt = await res.text();
        throw new Error(`Feedback API error (${res.status}): ${tt}`);
      }

      const data: unknown = await res.json();
      const d = data as { feedback?: unknown };
      const fb = typeof d?.feedback === "string" ? d.feedback : JSON.stringify(d);

      setFeedback(fb);
      setTranslatedFeedback(null);

      await updateDoc(ref, {
        feedback: fb,
        feedbackUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await incrementUsage(uid, "ai_feedback");
      await reloadUsage();

      flash(t("flash.submitted"));
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setMsg(typeof m === "string" ? m : t("errors.couldNotSubmit"));
      setFeedback(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function onTranslateText() {
    const base = displayedSourceTextSafe;
    if (!base.trim()) return;

    setTranslating("text");

    try {
      const out = await translateOne(base, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: unknown) {
      console.error("Translate text error:", e);
      setTranslatedText(null);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTasks() {
    if (!lesson) return;
    const tasksArr = safeTasksArray(lesson.tasks);
    if (tasksArr.length === 0) return;

    setTranslating("tasks");

    try {
      const sorted = tasksArr.slice().sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
      const out: TranslatedTask[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const tt = sorted[i];
        const stableId = getStableTaskId(tt, i);

        const promptOrig = typeof tt?.prompt === "string" ? tt.prompt : "";
        const optionsOrig = Array.isArray(tt?.options) ? tt.options : [];

        let translatedPrompt = "";
        if (promptOrig) {
          try {
            translatedPrompt = await translateOne(promptOrig, targetLang);
          } catch (e: unknown) {
            console.error("Translate task prompt error:", e);
          }
        }

        let translatedOptions: string[] = [];

        if (optionsOrig.length > 0) {
          translatedOptions = await Promise.all(
            optionsOrig.map(async (o) => {
              try {
                return await translateOne(String(o), targetLang);
              } catch {
                return "";
              }
            })
          );
        }

        out.push({
          stableId,
          translatedPrompt: translatedPrompt || undefined,
          translatedOptions: translatedOptions.length > 0 ? translatedOptions : undefined,
        });
      }

      setTranslatedTasks(out);
      setShowTaskTranslations(true);
      setTaskTranslationOpen({});
    } catch (e: unknown) {
      console.error("Translate error:", e);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateFeedback() {
    setFeedbackTranslateErr(null);
    setTranslatedFeedback(null);

    const txt = (feedback ?? "").trim();
    if (!txt) return;

    setFeedbackTranslating(true);
    try {
      const out = await translateOne(txt, targetLang);
      setTranslatedFeedback(out);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setFeedbackTranslateErr(typeof m === "string" ? m : t("feedback.translateFailed"));
    } finally {
      setFeedbackTranslating(false);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>{t("loading")}</p>;

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "crimson" }}>{error}</p>
        <Link href={`/${locale}/content`}>← {t("nav.backToDashboard")}</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>{t("noData")}</p>
        <Link href={`/${locale}/content`}>← {t("nav.backToDashboard")}</Link>
      </div>
    );
  }

  const tasksOriginal = safeTasksArray(lesson.tasks)
    .slice()
    .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  const renderFollowText = (
    mode: AudioMode,
    segs: SentenceSeg[],
    fallbackText: string
  ) => {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>{t("text.noText")}</span>;

    if (!segs || segs.length === 0) {
      return <span style={{ whiteSpace: "pre-wrap" }}>{fallbackText}</span>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map((s, i) => {
          const isActive = activeTextMode === mode && activeSentenceIndex === i;
          const canSeek =
            !!audioRef.current &&
            activeTextMode === mode &&
            (mode === "text_original" || mode === "text_translation");

          return (
            <span
              key={`${mode}_${i}_${s.startChar}`}
              onClick={() => (canSeek ? seekToSentence(mode, i) : undefined)}
              style={{
                cursor: canSeek ? "pointer" : "default",
                padding: "3px 8px",
                borderRadius: 8,
                background: isActive ? "rgba(255, 230, 120, 0.65)" : "transparent",
                transition: "background 120ms ease",
                lineHeight: 1.6,
              }}
              title={canSeek ? t("text.clickToSeek") : undefined}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  };

  const backHref =
    lesson.sourceCollection === "published_lessons"
      ? `/${locale}/lesson/${lessonId}`
      : `/${locale}/content`;

  return (
    <main
      style={{
        width: "100%",
        maxWidth: 980,
        margin: "0 auto",
        paddingTop: 12,
        paddingLeft: "clamp(3px, 1.5vw, 8px)",
        paddingRight: "clamp(3px, 1.5vw, 8px)",
        paddingBottom: 120,
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "14px 14px 10px",
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
          boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 8px", fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", lineHeight: 1.1 }}>
            {isReadingTest ? "Lesetest" : lesson.title}
          </h1>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              opacity: 0.88,
            }}
          >
            {!isReadingTest && lesson.level ? <Pill text={lesson.level} /> : null}
            {!isReadingTest && lesson.language ? <Pill text={lesson.language.toUpperCase()} /> : null}
          </div>

        </div>

      </header>

      {msg ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            border: "1px solid rgba(37,99,235,0.18)",
            borderRadius: 14,
            background: "rgba(59,130,246,0.08)",
            color: "#1e3a8a",
            fontWeight: 500,
          }}
        >
          {msg}
        </div>
      ) : null}

      {!isReadingTest ? (
      <section style={{ marginTop: 14 }}>
        <div style={cardStyle}>
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 14,
              border: "1px dashed rgba(0,0,0,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: isImageWriting ? "rgba(0,0,0,0.03)" : "white",
            }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={t("image.alt")}
                style={{ width: "100%", height: "100%", objectFit: isImageWriting ? "contain" : "cover" }}
              />
            ) : (
              <div style={{ textAlign: "center", padding: 16, opacity: 0.7 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("image.noImageTitle")}</div>
                <div style={{ fontSize: 13 }}>{t("image.noImageHint")}</div>
              </div>
            )}
          </div>
        </div>
      </section>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {isReadingTest ? (
          <button
            type="button"
            onClick={restartReadingTest}
            disabled={saving || submitting}
            style={{
              ...btnStyle,
              fontWeight: 800,
              opacity: saving || submitting ? 0.6 : 1,
            }}
          >
            Gjør en gang til
          </button>
        ) : null}

        <button
          onClick={saveDraft}
          disabled={saving || !uid}
          style={{
            ...greenBtnStyle,
            fontWeight: 700,
            opacity: saving ? 0.6 : 1,
            minWidth: 120,
          }}
        >
          {saving ? t("actions.saving") : t("actions.save")}
        </button>
      </div>

      {isReadingTest ? (
        <section style={{ marginTop: 14 }}>
          <ReadingTestPlayer
            key={readingAttemptKey}
            title={lesson.title}
            level={lesson.level}
            language={lesson.language}
            sourceText={sourceTextSafe}
            tasks={readingTasks}
            readingTestConfig={readingTestConfig}
            initialAnswers={answers}
            disabled={submitting}
            onAnswersChange={setAnswers}
            onProgressChange={setReadingProgress}
            onSubmittedChange={setReadingSubmitted}
            onSubmit={submitForFeedback}
          />
        </section>
      ) : null}

      {!isImageWriting && !isReadingTest && displayedSourceTextSafe.trim() ? (
      <section style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <h2 style={sectionHeadingStyle}>{t("text.title")}</h2>

          <div style={textToolsStyle}>
            <div>
              <button
                type="button"
                onClick={playOriginalTextAudio}
                disabled={ttsBusy !== null || !(displayedSourceTextSafe || "").trim()}
                style={{ ...greenBtnStyle, opacity: ttsBusy !== null ? 0.6 : 1, fontWeight: 600 }}
                title={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
              >
                {t("text.playAudio")}
              </button>
              {renderAudioLoginNotice("text_original")}
            </div>

            <div style={translateToolStyle}>
              <SearchableSelect
                label=""
                value={targetLang}
                options={LANGUAGE_OPTIONS}
                onChange={setTargetLang}
                placeholder={t("translate.searchPlaceholder")}
                buttonWidth={132}
              />

              <button
                type="button"
                onClick={onTranslateText}
                disabled={translating === "text" || !(displayedSourceTextSafe || "").trim()}
                style={{ ...compactBlueBtnStyle, opacity: translating === "text" ? 0.6 : 1 }}
                title={t("translate.translateText")}
              >
                {translating === "text" ? t("translate.translating") : t("translate.compactAction")}
              </button>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          {renderFollowText("text_original", originalSegs, (displayedSourceTextSafe ?? "").trim())}
        </div>
      </section>
      ) : null}

      {!isImageWriting && !isReadingTest && translatedText ? (
        <section style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <h2 style={sectionHeadingStyle}>{t("translate.title")}</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div>
                <button
                  type="button"
                  onClick={playTranslatedTextAudio}
                  disabled={ttsBusy !== null || !translatedText.trim()}
                  style={{ ...greenBtnStyle, opacity: ttsBusy !== null ? 0.6 : 1, fontWeight: 600 }}
                  title={isAnon ? t("text.loginToPlayAudio") : t("text.playTranslation")}
                >
                  {t("text.playAudio")}
                </button>
                {renderAudioLoginNotice("text_translation")}
              </div>

              <button type="button" style={btnStyle} onClick={() => setShowTextTranslation((v) => !v)}>
                {showTextTranslation ? t("text.hideTranslation") : t("text.showTranslation")}
              </button>
            </div>
          </div>

          {showTextTranslation ? (
            <div
              style={{
                ...cardStyle,
                border: "1px solid rgba(59,130,246,0.20)",
                background: "rgba(59,130,246,0.09)",
              }}
            >
              {renderFollowText("text_translation", translationSegs, translatedText)}
            </div>
          ) : null}
        </section>
      ) : null}

      {!isReadingTest ? (
      <section style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={sectionHeadingStyle}>{t("tasks.title")}</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setShowAnswers((v) => !v)} style={btnStyle}>
              {showAnswers ? t("tasks.hideAnswers") : t("tasks.showAnswers")}
            </button>

            <button
              onClick={() => {
                setAnswers({});
                if (lessonId && isAnon) {
                  try {
                    localStorage.removeItem(lsKey(lessonId));
                  } catch {
                    // ignore
                  }
                }
                flash(t("flash.clearedAnswers"));
              }}
              style={btnStyle}
            >
              {t("tasks.clearAnswers")}
            </button>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 10, paddingTop: 12, paddingBottom: 12 }}>
          <div style={textToolsStyle}>
            <div style={translateToolStyle}>
              <SearchableSelect
                label=""
                value={targetLang}
                options={LANGUAGE_OPTIONS}
                onChange={setTargetLang}
                placeholder={t("translate.searchPlaceholder")}
                buttonWidth={132}
              />

              <button
                type="button"
                onClick={onTranslateTasks}
                disabled={translating === "tasks" || tasksOriginal.length === 0}
                style={{ ...compactBlueBtnStyle, opacity: translating === "tasks" ? 0.6 : 1 }}
                title={t("translate.translateTasks")}
              >
                {translating === "tasks" ? t("translate.translating") : t("translate.compactAction")}
              </button>
            </div>

            {(translatedTasks ?? []).length > 0 ? (
              <button type="button" style={blueBtnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
                {showTaskTranslations ? t("tasks.hideAllTranslations") : t("tasks.showAllTranslations")}
              </button>
            ) : null}
          </div>
        </div>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>{t("tasks.noTasks")}</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            {tasksOriginal.map((tt, idx) => {
              const stableId = getStableTaskId(tt, idx);
              const tr = tMap.get(stableId);

              const type = String(tt?.type ?? "open");
              const prompt = String(tt?.prompt ?? "");
              const options = Array.isArray(tt?.options) ? (tt.options as unknown[]) : [];
              const val = answers[stableId];
              const supportWords = toCleanStringList(tt?.supportWords);
              const successCriteria = toCleanStringList(tt?.successCriteria);
              const showSupportWords = isSupportWordsVisible(stableId);
              const showSuccessCriteria = isSuccessCriteriaVisible(stableId);

              const hasThisTranslation =
                !!tr?.translatedPrompt || (tr?.translatedOptions?.length ?? 0) > 0;
              const showThisTranslation = hasThisTranslation ? isTaskTranslationVisible(stableId) : false;

              const rawCorrect = tt?.correctAnswer;

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

              const isCorrect =
                type === "mcq"
                  ? mcqCorrectText != null && val != null && String(val) === String(mcqCorrectText)
                  : type === "truefalse"
                    ? tfCorrectBool != null && typeof val === "boolean" && val === tfCorrectBool
                    : null;

              return (
                <div
                  key={stableId}
                  style={{
                    ...cardStyle,
                    padding: 14,
                    borderRadius: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 8,
                      opacity: 0.9,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.95, alignItems: "center" }}>
                      <span>{t("tasks.taskLabel", { n: String(tt?.order ?? idx + 1) })}</span>

                      {showAnswers && hasCorrect && val != null ? (
                        <span style={{ marginLeft: 6 }}>
                          {isCorrect ? <Pill text={t("tasks.correct")} kind="good" /> : <Pill text={t("tasks.wrong")} kind="bad" />}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div>
                        <button
                          type="button"
                          onClick={() => playTaskAudio(prompt, stableId)}
                          disabled={ttsBusy !== null || !prompt.trim()}
                          style={{ ...audioIconBtnStyle, opacity: ttsBusy !== null || !prompt.trim() ? 0.6 : 1 }}
                          title={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                          aria-label={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                        >
                          <Volume2 size={16} strokeWidth={2.4} />
                        </button>
                        {renderAudioLoginNotice(`task:${stableId}`)}
                      </div>

                      {hasThisTranslation ? (
                        <button type="button" style={blueBtnStyle} onClick={() => toggleTaskTranslation(stableId)}>
                          {showThisTranslation ? t("tasks.hideTranslation") : t("tasks.showTranslation")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: 10, fontSize: 16 }}>
                    {prompt}
                  </div>

                  {showThisTranslation && tr?.translatedPrompt ? (
                    <div
                      style={{
                        marginTop: -4,
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(59,130,246,0.22)",
                        background: "rgba(59,130,246,0.08)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.45,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "flex-start",
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{t("translate.translatedLabel")}</div>
                        <div>
                          <button
                            type="button"
                            onClick={() => playTranslatedTaskAudio(tr.translatedPrompt || "", stableId)}
                            disabled={ttsBusy !== null || !tr.translatedPrompt.trim()}
                            style={{
                              ...audioIconBtnStyle,
                              opacity: ttsBusy !== null || !tr.translatedPrompt.trim() ? 0.6 : 1,
                            }}
                            title={isAnon ? t("text.loginToPlayAudio") : t("text.playTranslation")}
                            aria-label={isAnon ? t("text.loginToPlayAudio") : t("text.playTranslation")}
                          >
                            <Volume2 size={16} strokeWidth={2.4} />
                          </button>
                          {renderAudioLoginNotice(`taskTranslation:${stableId}`)}
                        </div>
                      </div>
                      {tr.translatedPrompt}
                    </div>
                  ) : null}

                  {supportWords.length > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <button type="button" style={blueBtnStyle} onClick={() => toggleSupportWords(stableId)}>
                        {showSupportWords
                          ? imageWritingLabels.hideSupport
                          : `${imageWritingLabels.showSupport} (${supportWords.length})`}
                      </button>

                      {showSupportWords ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          {supportWords.map((word) => (
                            <span
                              key={word}
                              style={{
                                border: "1px solid rgba(59,130,246,0.20)",
                                borderRadius: 999,
                                padding: "5px 9px",
                                background: "rgba(59,130,246,0.07)",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {successCriteria.length > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <button type="button" style={blueBtnStyle} onClick={() => toggleSuccessCriteria(stableId)}>
                        {showSuccessCriteria
                          ? imageWritingLabels.hideCriteria
                          : `${imageWritingLabels.showCriteria} (${successCriteria.length})`}
                      </button>

                      {showSuccessCriteria ? (
                        <ul style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.45, color: "rgba(0,0,0,0.72)" }}>
                          {successCriteria.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 9 }}>
                      {options.map((o, i) => {
                        const opt = String(o);
                        const checked = val === opt;
                        const optT = tr?.translatedOptions?.[i] || "";

                        const isOptionCorrect = showAnswers && mcqCorrectText != null && opt === mcqCorrectText;
                        const isOptionChosenWrong = showAnswers && checked && mcqCorrectText != null && opt !== mcqCorrectText;

                        let borderColor = "rgba(0,0,0,0.10)";
                        let background = "rgba(255,255,255,0.95)";
                        let boxShadow = "none";

                        if (checked) {
                          borderColor = "rgba(37, 99, 235, 0.95)";
                          background = "rgba(59, 130, 246, 0.14)";
                          boxShadow = "0 0 0 2px rgba(59,130,246,0.14)";
                        }

                        if (isOptionCorrect) {
                          borderColor = "rgba(46, 204, 113, 0.88)";
                          background = checked ? "rgba(46, 204, 113, 0.20)" : "rgba(46, 204, 113, 0.12)";
                          boxShadow = checked ? "0 0 0 2px rgba(46, 204, 113, 0.16)" : "none";
                        } else if (isOptionChosenWrong) {
                          borderColor = "rgba(231, 76, 60, 0.88)";
                          background = "rgba(231, 76, 60, 0.14)";
                          boxShadow = "0 0 0 2px rgba(231, 76, 60, 0.12)";
                        }

                        return (
                          <label
                            key={i}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                              padding: "11px 12px",
                              border: checked ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                              borderRadius: 14,
                              cursor: "pointer",
                              background,
                              boxShadow,
                              transition: "all 120ms ease",
                            }}
                          >
                            <input
                              type="radio"
                              name={stableId}
                              checked={checked}
                              onChange={() => setAnswer(stableId, opt)}
                              style={{ marginTop: 3, accentColor: "#2563eb", transform: "scale(1.08)" }}
                            />

                            <div style={{ width: "100%" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ fontWeight: checked ? 700 : 500 }}>{opt}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                  {checked ? <Pill text={t("tasks.yourAnswer")} /> : null}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void playTaskOptionAudio(opt, stableId, i);
                                    }}
                                    disabled={ttsBusy !== null || !opt.trim()}
                                    style={{
                                      ...optionAudioIconBtnStyle,
                                      opacity: ttsBusy !== null || !opt.trim() ? 0.6 : 1,
                                    }}
                                    title={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                                    aria-label={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                                  >
                                    <Volume2 size={15} strokeWidth={2.4} />
                                  </button>
                                </div>
                              </div>

                              {showThisTranslation && optT ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    marginTop: 4,
                                  }}
                                >
                                  <div style={{ fontSize: 12, opacity: 0.72 }}>{optT}</div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void playTranslatedTaskOptionAudio(optT, stableId, i);
                                    }}
                                    disabled={ttsBusy !== null || !optT.trim()}
                                    style={{
                                      ...optionAudioIconBtnStyle,
                                      opacity: ttsBusy !== null || !optT.trim() ? 0.6 : 1,
                                    }}
                                    title={isAnon ? t("text.loginToPlayAudio") : t("text.playTranslation")}
                                    aria-label={isAnon ? t("text.loginToPlayAudio") : t("text.playTranslation")}
                                  >
                                    <Volume2 size={14} strokeWidth={2.4} />
                                  </button>
                                </div>
                              ) : null}
                              {renderAudioLoginNotice(`taskOption:${stableId}:${i}`)}
                              {renderAudioLoginNotice(`taskOptionTranslation:${stableId}:${i}`)}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {type === "truefalse" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setAnswer(stableId, true)}
                          aria-pressed={val === true}
                          style={{
                            ...(val === true ? blueBtnActiveStyle : blueBtnStyle),
                            fontWeight: val === true ? 700 : 500,
                            minWidth: 110,
                          }}
                        >
                          {t("tasks.true")}
                        </button>

                        <button
                          type="button"
                          onClick={() => setAnswer(stableId, false)}
                          aria-pressed={val === false}
                          style={{
                            ...(val === false ? blueBtnActiveStyle : blueBtnStyle),
                            fontWeight: val === false ? 700 : 500,
                            minWidth: 110,
                          }}
                        >
                          {t("tasks.false")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                    <textarea
                      value={typeof val === "string" ? val : val == null ? "" : String(val)}
                      onChange={(e) => setAnswer(stableId, e.target.value)}
                      placeholder={t("tasks.writeAnswerPlaceholder")}
                      rows={isImageWriting ? 9 : 4}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.16)",
                        resize: "vertical",
                        background: "rgba(255,255,255,0.98)",
                        minHeight: isImageWriting ? 190 : undefined,
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {(!isReadingTest || readingSubmitted) ? (
      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          background: "rgba(15,23,42,0.045)",
          boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{t("feedback.title")}</h2>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
              {t("feedback.subtitle")}
            </div>
          </div>

          {!isAnon && feedbackLimit > 0 ? (
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {t("feedback.usage", {
                used: String(feedbackUsed),
                limit: String(feedbackLimit),
                remaining: String(feedbackRemaining),
              })}
            </div>
          ) : null}
        </div>

        <div style={textToolsStyle}>
          <button
            onClick={() => void submitForFeedback()}
            disabled={submitting || !uid}
            style={{
              ...greenBtnStyle,
              fontWeight: 700,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? t("feedback.submitting")
              : isAnon
                ? t("feedback.loginForFeedback")
                : feedbackLimitReached
                  ? t("feedback.limitReachedShort")
                  : t("feedback.getFeedback")}
          </button>

          <div style={translateToolStyle}>
            <SearchableSelect
              label=""
              value={targetLang}
              options={LANGUAGE_OPTIONS}
              onChange={setTargetLang}
              placeholder={t("translate.searchPlaceholder")}
              buttonWidth={132}
            />

            <button
              onClick={onTranslateFeedback}
              disabled={feedbackTranslating || !(feedback || "").trim()}
              style={{
                ...compactBlueBtnStyle,
                opacity: feedbackTranslating || !(feedback || "").trim() ? 0.6 : 1,
              }}
              title={t("feedback.translateFeedback")}
            >
              {feedbackTranslating ? t("feedback.translating") : t("translate.compactAction")}
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={playFeedbackAudio}
              disabled={ttsBusy !== null || !(feedback || "").trim()}
              style={{
                ...greenBtnStyle,
                fontWeight: 700,
                opacity: ttsBusy !== null || !(feedback || "").trim() ? 0.6 : 1,
              }}
              title={isAnon ? t("text.loginToPlayAudio") : t("feedback.playAudio")}
            >
              {t("feedback.playAudio")}
            </button>
            {renderAudioLoginNotice("feedback_original")}
          </div>
        </div>

        {feedbackTranslateErr ? (
          <div style={{ marginTop: 8, color: "crimson", fontSize: 14 }}>
            {feedbackTranslateErr}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 12,
            padding: 14,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.96)",
            minHeight: 120,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
            {t("feedback.resultLabel")}
          </div>

          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {feedback ? (
              feedback
            ) : (
              <span style={{ opacity: 0.6 }}>
                {isAnon ? t("feedback.anonHint") : t("feedback.noFeedbackYet")}
              </span>
            )}
          </div>
        </div>

        {translatedFeedback ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              border: "1px solid rgba(59,130,246,0.22)",
              borderRadius: 14,
              background: "rgba(59,130,246,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t("feedback.translatedFeedbackLabel")}
              </div>

              <div>
                <button
                  type="button"
                  onClick={playTranslatedFeedbackAudio}
                  disabled={ttsBusy !== null || !translatedFeedback.trim()}
                  style={{ ...greenBtnStyle, opacity: ttsBusy !== null ? 0.6 : 1, fontWeight: 700 }}
                  title={isAnon ? t("text.loginToPlayAudio") : t("feedback.playAudio")}
                >
                  {t("feedback.playAudio")}
                </button>
                {renderAudioLoginNotice("feedback_translation")}
              </div>
            </div>

            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{translatedFeedback}</div>
          </div>
        ) : null}
      </section>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <Link href={backHref} style={{ textDecoration: "none" }}>
          ← {t("nav.backToPreview")}
        </Link>
      </section>

      {audioRef.current ? (
        <div
          style={{
            position: "fixed",
            left: "50%",
            width: "calc(100% - 24px)",
            maxWidth: 980,
            bottom: 12,
            transform: "translateX(-50%)",
            zIndex: 60,
            padding: 12,
            borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.14)",
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>
              {t("text.nowPlaying")}: {stickyAudioLabel}
            </div>

            <div style={speedGroupStyle}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{t("text.speed")}</span>
              <button
                type="button"
                style={playbackRate === 0.8 ? speedBtnActiveStyle : speedBtnStyle}
                onClick={() => setPlaybackRate(0.8)}
              >
                0.8x
              </button>
              <button
                type="button"
                style={playbackRate === 1 ? speedBtnActiveStyle : speedBtnStyle}
                onClick={() => setPlaybackRate(1)}
              >
                1x
              </button>
              <button
                type="button"
                style={playbackRate === 1.2 ? speedBtnActiveStyle : speedBtnStyle}
                onClick={() => setPlaybackRate(1.2)}
              >
                1.2x
              </button>
              <span style={{ fontSize: 12, minWidth: 42, textAlign: "right", color: "#64748b" }}>
                {playbackRate.toFixed(1)}x
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={{ ...btnStyle, minWidth: 44 }} onClick={prevSentence} title={t("text.prev")}>
              ⏮
            </button>

            <button
              type="button"
              style={{ ...yellowBtnStyle, minWidth: 52, fontWeight: 700 }}
              onClick={isPlaying ? pauseAudio : resumeAudio}
              title={isPlaying ? t("text.pause") : t("text.continue")}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>

            <button type="button" style={{ ...redBtnStyle, minWidth: 44 }} onClick={stopAudio} title={t("text.stop")}>
              ⏹
            </button>

            <button type="button" style={{ ...btnStyle, minWidth: 44 }} onClick={nextSentence} title={t("text.next")}>
              ⏭
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: "1 1 280px",
                minWidth: 220,
                marginLeft: 4,
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>{fmtTime(currentTime)}</span>

              <input
                type="range"
                min={0}
                max={Math.max(0.01, duration || 0)}
                step={0.05}
                value={Math.min(currentTime, duration || currentTime)}
                onChange={(e) => {
                  const a = audioRef.current;
                  if (!a) return;
                  const v = Number(e.target.value);
                  a.currentTime = v;
                  setCurrentTime(v);
                }}
                style={{ flex: 1 }}
              />

              <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>{fmtTime(duration)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 22,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color: "#0f172a",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: "clamp(10px, 2.8vw, 14px)",
  background: "linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.92))",
  boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
};

const textToolsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "flex-end",
};

const translateToolStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "nowrap",
  alignItems: "flex-start",
  maxWidth: "100%",
  padding: 3,
  border: "1px solid rgba(37,99,235,0.16)",
  borderRadius: 13,
  background: "rgba(255,255,255,0.72)",
};

const audioIconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  border: "1px solid rgba(22,163,74,0.42)",
  borderRadius: 12,
  background: "rgba(34,197,94,0.16)",
  color: "#166534",
  cursor: "pointer",
};

const optionAudioIconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  border: "1px solid rgba(245,158,11,0.48)",
  borderRadius: 11,
  background: "rgba(245,158,11,0.16)",
  color: "#92400e",
  cursor: "pointer",
};

const speedGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 4,
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "rgba(248,250,252,0.9)",
};

const speedBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,0.16)",
  borderRadius: 10,
  padding: "7px 9px",
  background: "white",
  color: "#334155",
  cursor: "pointer",
  fontWeight: 700,
};

const speedBtnActiveStyle: React.CSSProperties = {
  ...speedBtnStyle,
  border: "1px solid rgba(37,99,235,0.70)",
  background: "rgba(59,130,246,0.16)",
  color: "#1d4ed8",
  boxShadow: "0 0 0 2px rgba(59,130,246,0.10)",
};

const btnStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "9px 13px",
  background: "white",
  cursor: "pointer",
  color: "#111827",
};

const blueBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(37,99,235,0.38)",
  background: "rgba(59,130,246,0.12)",
  color: "#1d4ed8",
};

const compactBlueBtnStyle: React.CSSProperties = {
  ...blueBtnStyle,
  padding: "9px 10px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const blueBtnActiveStyle: React.CSSProperties = {
  ...btnStyle,
  border: "2px solid rgba(37,99,235,0.95)",
  background: "rgba(59,130,246,0.18)",
  color: "#1d4ed8",
  boxShadow: "0 0 0 2px rgba(59,130,246,0.10)",
};

const greenBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(22,163,74,0.45)",
  background: "rgba(34,197,94,0.18)",
  color: "#166534",
};

const yellowBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(202,138,4,0.45)",
  background: "rgba(250,204,21,0.20)",
  color: "#854d0e",
};

const redBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(220,38,38,0.42)",
  background: "rgba(239,68,68,0.16)",
  color: "#b91c1c",
};
