// app/[locale]/(app)/student/lesson/[lessonId]/page.tsx
"use client";

import { SearchableSelect } from "@/components/SearchableSelect";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

type TextSize = "normal" | "large" | "xlarge";

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
  textSize?: TextSize;
  sourceCollection?: "published_lessons" | "lessons";
  publishedLessonId?: string | null;
};

type AnswersMap = Record<string, unknown>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

type TranslatedSection = {
  key: LessonTextSectionKey;
  translatedText: string;
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
  textSize?: TextSize;
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
  textSize?: TextSize;
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
  taskType?: string;
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

type LessonTextSectionKey =
  | "text"
  | "focus"
  | "words"
  | "sentences"
  | "highfreq_text_1"
  | "highfreq_text_2"
  | "highfreq_text_3"
  | "highfreq_text_4"
  | "highfreq_text_5"
  | "highfreq_explanation"
  | "highfreq_examples";

type LessonTextSection = {
  key: LessonTextSectionKey;
  title: string;
  text: string;
};

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

function normalizeHeading(value: string) {
  return value
    .trim()
    .replace(/[:：]+$/g, "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const SOUND_TRAINING_HEADING_KEYS: Record<string, "focus" | "words" | "sentences"> = {
  forklaring: "focus",
  explanation: "focus",
  explicacao: "focus",
  "ord og lydtrening": "words",
  "words and sound training": "words",
  "palavras e treino de som": "words",
  "setninger med lyden": "sentences",
  "sentences with the sound": "sentences",
  "frases com o som": "sentences",
};

function getSoundTrainingTitles(language?: string): Record<"text" | "focus" | "words" | "sentences", string> {
  const lang = String(language || "").trim().toLocaleLowerCase();

  if (lang === "en") {
    return {
      text: "Text",
      focus: "Today we work with the sound",
      words: "Words",
      sentences: "Sentences",
    };
  }

  if (lang === "pt" || lang === "pt-br") {
    return {
      text: "Texto",
      focus: "Hoje trabalhamos com o som",
      words: "Palavras",
      sentences: "Frases",
    };
  }

  return {
    text: "Tekst",
    focus: "I dag jobber vi med lyden",
    words: "Ord",
    sentences: "Setninger",
  };
}

function splitSoundTrainingSections(text: string, language?: string): LessonTextSection[] {
  const clean = text.trim();
  if (!clean) return [];

  const titles = getSoundTrainingTitles(language);
  const sections: LessonTextSection[] = [];
  let current: LessonTextSection = {
    key: "text",
    title: titles.text,
    text: "",
  };

  for (const rawLine of clean.split(/\r?\n/g)) {
    const line = rawLine.trim();
    const headingKey = SOUND_TRAINING_HEADING_KEYS[normalizeHeading(line)];

    if (headingKey) {
      if (current.text.trim()) {
        sections.push({ ...current, text: current.text.trim() });
      }
      current = {
        key: headingKey,
        title: titles[headingKey],
        text: "",
      };
      continue;
    }

    current.text = current.text ? `${current.text}\n${rawLine}` : rawLine;
  }

  if (current.text.trim()) {
    sections.push({ ...current, text: current.text.trim() });
  }

  return sections.some((section) => section.key !== "text") ? sections : [];
}

const HIGH_FREQUENCY_HEADING_KEYS: Record<string, "highfreq_explanation" | "highfreq_examples"> = {
  forklaring: "highfreq_explanation",
  explanation: "highfreq_explanation",
  explicacao: "highfreq_explanation",
  eksempelsetninger: "highfreq_examples",
  "example sentences": "highfreq_examples",
  "frases de exemplo": "highfreq_examples",
};

function getHighFrequencyTitles(language?: string) {
  const lang = String(language || "").trim().toLocaleLowerCase();
  if (lang === "en") {
    return {
      text: "Text",
      explanation: "Explanation",
      examples: "Example sentences",
    };
  }
  if (lang === "pt" || lang === "pt-br") {
    return {
      text: "Texto",
      explanation: "Explicação",
      examples: "Frases de exemplo",
    };
  }
  return {
    text: "Tekst",
    explanation: "Forklaring",
    examples: "Eksempelsetninger",
  };
}

function highFrequencyTextKey(index: number): LessonTextSectionKey {
  return `highfreq_text_${Math.min(Math.max(index, 1), 5)}` as LessonTextSectionKey;
}

function splitHighFrequencySections(text: string, language?: string): LessonTextSection[] {
  const clean = text.trim();
  if (!clean) return [];

  const titles = getHighFrequencyTitles(language);
  const sections: LessonTextSection[] = [];
  let current: LessonTextSection = {
    key: "highfreq_text_1",
    title: titles.text,
    text: "",
  };

  for (const rawLine of clean.split(/\r?\n/g)) {
    const line = rawLine.trim();
    const headingKey = HIGH_FREQUENCY_HEADING_KEYS[normalizeHeading(line)];

    if (headingKey) {
      if (current.text.trim()) {
        sections.push({ ...current, text: current.text.trim() });
      }
      current = {
        key: headingKey,
        title: headingKey === "highfreq_explanation" ? titles.explanation : titles.examples,
        text: "",
      };
      continue;
    }

    current.text = current.text ? `${current.text}\n${rawLine}` : rawLine;
  }

  if (current.text.trim()) {
    sections.push({ ...current, text: current.text.trim() });
  }

  if (!sections.some((section) => section.key === "highfreq_explanation" || section.key === "highfreq_examples")) {
    return [];
  }

  const mainSections: LessonTextSection[] = [];
  const restSections: LessonTextSection[] = [];
  for (const section of sections) {
    if (section.key !== "highfreq_text_1") {
      restSections.push(section);
      continue;
    }

    const parts = section.text
      .split(/\n\s*\n/g)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (parts.length <= 1) {
      mainSections.push(section);
      continue;
    }

    parts.forEach((part, index) => {
      mainSections.push({
        key: highFrequencyTextKey(index + 1),
        title: `${titles.text} ${index + 1}`,
        text: part,
      });
    });
  }

  return [...mainSections, ...restSections];
}

function normalizeTextSize(value: unknown): TextSize {
  if (value === "large" || value === "xlarge") return value;
  return "normal";
}

function getStudentReadingTextStyle(textSize: TextSize): React.CSSProperties {
  if (textSize === "xlarge") {
    return { fontSize: 21, lineHeight: 1.75 };
  }
  if (textSize === "large") {
    return { fontSize: 18, lineHeight: 1.7 };
  }
  return { fontSize: 16, lineHeight: 1.6 };
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
    textSize: normalizeTextSize(d.textSize),
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
    textSize: normalizeTextSize(d.textSize),
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

function imageWritingTaskTypeLabel(language: unknown, value: unknown): string {
  const taskType = String(value || "").trim();
  const lang = String(language || "").trim().toLowerCase();
  const labels = {
    nb: {
      describe: "Beskriv bildet",
      story: "Skriv en historie",
      dialogue: "Skriv en dialog",
      reflection: "Reflekter",
    },
    en: {
      describe: "Describe the picture",
      story: "Write a story",
      dialogue: "Write a dialogue",
      reflection: "Reflect",
    },
    pt: {
      describe: "Descrever a imagem",
      story: "Escrever uma história",
      dialogue: "Escrever um diálogo",
      reflection: "Refletir",
    },
  };

  const languageKey = lang === "en" || lang === "pt" ? lang : "nb";
  return labels[languageKey][taskType as keyof (typeof labels)["nb"]] || "";
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
  const t = useTranslations("studentLesson");
  const tReading = useTranslations("readingTestPlayer");
  const locale = useLocale();

  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;
  const searchParams = useSearchParams();
  const courseContext = useMemo(() => {
    const courseId = (searchParams.get("courseId") || "").trim();
    if (!courseId) return null;

    const sessionNumberRaw = (searchParams.get("sessionNumber") || "").trim();
    const sessionNumber = Number(sessionNumberRaw);
    const resourceId = (searchParams.get("resourceId") || "").trim();

    return {
      courseId,
      sessionNumber: Number.isFinite(sessionNumber) ? sessionNumber : null,
      resourceId,
    };
  }, [searchParams]);
  const isCourseMode = courseContext !== null;
  const courseRoomHref = courseContext ? `/${locale}/academy/courses/${courseContext.courseId}` : "";

  const router = useRouter();
  const { profile } = useUserProfile();

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState<boolean>(true);
  const [isMobileView, setIsMobileView] = useState(false);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [audioLoginNoticeMode, setAudioLoginNoticeMode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);
  const [translatedSections, setTranslatedSections] = useState<TranslatedSection[] | null>(null);

  const [translating, setTranslating] = useState<null | "text" | `section:${string}` | `task:${string}`>(null);

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
  const [activeSoundSectionKey, setActiveSoundSectionKey] = useState<LessonTextSectionKey | null>(null);

  useEffect(() => {
    const update = () => setIsMobileView(window.innerWidth < 720);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const soundTrainingSections = useMemo(() => {
    return splitSoundTrainingSections(displayedSourceTextSafe, lesson?.language);
  }, [displayedSourceTextSafe, lesson?.language]);

  const showSoundTrainingSections = soundTrainingSections.some(
    (section) => section.key === "words" || section.key === "sentences"
  );

  const highFrequencySections = useMemo(() => {
    return showSoundTrainingSections
      ? []
      : splitHighFrequencySections(displayedSourceTextSafe, lesson?.language);
  }, [displayedSourceTextSafe, lesson?.language, showSoundTrainingSections]);

  const lessonTextSections = showSoundTrainingSections ? soundTrainingSections : highFrequencySections;
  const showLessonTextSections = lessonTextSections.length >= 2;

  const translatedSectionMap = useMemo(() => {
    const map = new Map<LessonTextSectionKey, string>();
    (translatedSections ?? []).forEach((section) => map.set(section.key, section.translatedText));
    return map;
  }, [translatedSections]);

  const activeSoundSectionSegs = useMemo(() => {
    if (!activeSoundSectionKey) return null;
    const section = lessonTextSections.find((item) => item.key === activeSoundSectionKey);
    return section ? segmentSentences(section.text).segs : null;
  }, [activeSoundSectionKey, lessonTextSections]);

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
  const imageWritingTypeLabel = useMemo(
    () => imageWritingTaskTypeLabel(lesson?.language, imageWritingTask?.taskType || lesson?.taskType),
    [imageWritingTask?.taskType, lesson?.language, lesson?.taskType]
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
    setActiveSoundSectionKey(null);
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
    setActiveSoundSectionKey(null);
    await playTTS(txt, originalLangForTTS, "text_original");
  }

  async function playSoundTrainingSectionAudio(section: LessonTextSection) {
    const mode = `text_original:${section.key}`;
    if (!requireAudioLogin(mode)) return;
    const txt = section.text.trim();
    if (!txt) return;
    setActiveSoundSectionKey(section.key);
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
    await playTTS(txt, originalLangForTTS, "feedback_original");
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
        : activeSoundSectionSegs ?? textFollow.original.segs;

      if (!segs || segs.length === 0) return;

      let idx = segs.findIndex((s) => ratio >= s.startRatio && ratio < s.endRatio);
      if (idx === -1) idx = segs.length - 1;

      setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
    };

    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [activeSoundSectionSegs, activeTextMode, textFollow.original.segs, textFollow.translation.segs]);

  function seekToSentence(mode: AudioMode, idx: number) {
    const a = audioRef.current;
    if (!a) return;

    const segs =
      mode === "text_translation"
        ? textFollow.translation.segs
        : mode === "text_original"
          ? activeSoundSectionSegs ?? textFollow.original.segs
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
        : activeSoundSectionSegs ?? textFollow.original.segs;

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
        : activeSoundSectionSegs ?? textFollow.original.segs;

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
              textSize: rawData.textSize,
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
            textSize: rawPrivate.textSize,
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

      const stableId = courseContext
        ? `${uid}_course_${courseContext.courseId}_${courseContext.resourceId || lessonId}`
        : `${uid}_${lessonId}`;
      const publishedLessonId =
        lesson.sourceCollection === "published_lessons" ? lessonId : null;
      const source =
        courseContext
          ? "course"
          : lesson.sourceCollection === "published_lessons"
            ? "library"
            : "my_content";

      const practiceRef = doc(db, "practiceSubmissions", stableId);
      await setDoc(
        practiceRef,
        {
          uid,
          lessonId,
          publishedLessonId,
          courseId: courseContext?.courseId ?? null,
          courseSessionNumber: courseContext?.sessionNumber ?? null,
          courseResourceId: courseContext?.resourceId ?? null,
          answers,
          readingProgress: isReadingTest ? readingProgress : null,
          status: "draft",
          source,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (!courseContext) {
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
      }

      flash(t("flash.saved"));
      router.push(courseContext ? courseRoomHref : `/${locale}/content`);
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
      const stableId = courseContext
        ? `${uid}_course_${courseContext.courseId}_${courseContext.resourceId || lessonId}`
        : `${uid}_${lessonId}`;
      const ref = doc(db, "practiceSubmissions", stableId);
      const publishedLessonId =
        lesson.sourceCollection === "published_lessons" ? lessonId : null;
      const source =
        courseContext
          ? "course"
          : lesson.sourceCollection === "published_lessons"
            ? "library"
            : "my_content";

      await setDoc(
        ref,
        {
          uid,
          lessonId,
          publishedLessonId,
          courseId: courseContext?.courseId ?? null,
          courseSessionNumber: courseContext?.sessionNumber ?? null,
          courseResourceId: courseContext?.resourceId ?? null,
          answers,
          readingProgress: isReadingTest ? activeReadingProgress : null,
          status: "submitted",
          source,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const subRef = !courseContext ? doc(db, "submissions", stableId) : null;
      if (subRef) {
        await setDoc(
          subRef,
          {
            uid,
            lessonId,
            publishedLessonId,
            answers,
            readingProgress: isReadingTest ? activeReadingProgress : null,
            status: "submitted",
            kind: "practice",
            source,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

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

      if (subRef) {
        await updateDoc(subRef, {
          feedback: fb,
          feedbackUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

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

  async function onTranslateSection(section: LessonTextSection) {
    const text = section.text.trim();
    if (!text) return;

    setTranslating(`section:${section.key}`);

    try {
      const out = await translateOne(text, targetLang);
      setTranslatedSections((current) => {
        const rest = (current ?? []).filter((item) => item.key !== section.key);
        return [...rest, { key: section.key, translatedText: out }];
      });
    } catch (e: unknown) {
      console.error("Translate section error:", e);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTask(tt: Task, idx: number) {
    const stableId = getStableTaskId(tt, idx);
    const promptOrig = typeof tt?.prompt === "string" ? tt.prompt : "";
    const optionsOrig = Array.isArray(tt?.options) ? tt.options : [];

    if (!promptOrig.trim() && optionsOrig.length === 0) return;

    setTranslating(`task:${stableId}`);

    try {
      let translatedPrompt = "";
      if (promptOrig.trim()) {
        translatedPrompt = await translateOne(promptOrig, targetLang);
      }

      let translatedOptions: string[] = [];
      if (optionsOrig.length > 0) {
        translatedOptions = await Promise.all(
          optionsOrig.map(async (option) => {
            try {
              return await translateOne(String(option), targetLang);
            } catch {
              return "";
            }
          })
        );
      }

      setTranslatedTasks((current) => {
        const rest = (current ?? []).filter((item) => item.stableId !== stableId);
        return [
          ...rest,
          {
            stableId,
            translatedPrompt: translatedPrompt || undefined,
            translatedOptions: translatedOptions.length > 0 ? translatedOptions : undefined,
          },
        ];
      });
      setShowTaskTranslations(true);
      setTaskTranslationOpen((current) => ({ ...current, [stableId]: true }));
    } catch (e: unknown) {
      console.error("Translate task error:", e);
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

  const readingTextStyle = getStudentReadingTextStyle(normalizeTextSize(lesson.textSize));

  const renderFollowText = (
    mode: AudioMode,
    segs: SentenceSeg[],
    fallbackText: string
  ) => {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>{t("text.noText")}</span>;

    if (!segs || segs.length === 0) {
      return <span style={{ whiteSpace: "pre-wrap", ...readingTextStyle }}>{fallbackText}</span>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map((s, i) => {
          const isActive = activeTextMode === mode && activeSentenceIndex === i;
          const normalizedSegment = s.text.trim().toLocaleLowerCase();
          const isSectionHeading = [
            "forklaring",
            "ord og lydtrening",
            "setninger med lyden",
            "explanation",
            "words and sound training",
            "sentences with the sound",
            "explicação",
            "palavras e treino de som",
            "frases com o som",
          ].includes(normalizedSegment);
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
                marginTop: isSectionHeading && i > 0 ? 14 : 0,
                fontWeight: isSectionHeading ? 800 : 400,
                ...readingTextStyle,
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

  const renderSoundTrainingText = (section: LessonTextSection) => {
    const segs = segmentSentences(section.text).segs;
    if (segs.length === 0) {
      return <div style={{ ...soundTrainingTextStyle, ...readingTextStyle }}>{section.text}</div>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map((s, i) => {
          const isActive =
            activeTextMode === "text_original" &&
            activeSoundSectionKey === section.key &&
            activeSentenceIndex === i;

          return (
            <span
              key={`${section.key}_${i}_${s.startChar}`}
              onClick={() =>
                activeSoundSectionKey === section.key && audioRef.current
                  ? seekToSentence("text_original", i)
                  : undefined
              }
              style={{
                cursor: activeSoundSectionKey === section.key && audioRef.current ? "pointer" : "default",
                padding: "3px 8px",
                borderRadius: 8,
                background: isActive ? "rgba(255, 230, 120, 0.65)" : "transparent",
                transition: "background 120ms ease",
                color: "#0f172a",
                ...readingTextStyle,
              }}
              title={activeSoundSectionKey === section.key && audioRef.current ? t("text.clickToSeek") : undefined}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  };

  const backHref = courseContext
    ? courseRoomHref
    : lesson.sourceCollection === "published_lessons"
      ? `/${locale}/321lessons`
      : `/${locale}/content`;
  const backLabel = courseContext
    ? "Back to course room"
    : lesson.sourceCollection === "published_lessons"
      ? t("nav.backToLibrary")
      : t("nav.backToDashboard");

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
            {isReadingTest ? tReading("fallback.title") : lesson.title}
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

      {isCourseMode ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            border: "1px solid #bbf7d0",
            borderRadius: 14,
            background: "#f0fdf4",
            color: "#14532d",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>
              321Academy course task
            </div>
            <div style={{ marginTop: 3, fontSize: 14, fontWeight: 650 }}>
              This work will be saved to the course session.
            </div>
          </div>
          <Link
            href={courseRoomHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              padding: "8px 12px",
              border: "1px solid #86efac",
              background: "#ffffff",
              color: "#166534",
              fontSize: 13,
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Back to course room
          </Link>
        </div>
      ) : null}

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

      <div style={lessonUtilityRowStyle}>
        {!isReadingTest ? (
          <div style={translateToolStyle}>
            <SearchableSelect
              label={t("translate.languageLabel")}
              value={targetLang}
              options={LANGUAGE_OPTIONS}
              onChange={setTargetLang}
              placeholder={t("translate.searchPlaceholder")}
              buttonWidth={220}
            />
          </div>
        ) : <span />}

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
            {tReading("actions.tryAgain")}
          </button>
        ) : null}

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

          {!showLessonTextSections ? (
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
          ) : null}
        </div>

        {showLessonTextSections ? (
          <div style={soundTrainingGridStyle}>
            {lessonTextSections.map((section) => (
              <div key={section.key} style={soundTrainingCardStyle}>
                <div style={soundTrainingHeaderStyle}>
                  <h3 style={soundTrainingTitleStyle}>{section.title}</h3>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => playSoundTrainingSectionAudio(section)}
                      disabled={ttsBusy !== null || !section.text.trim()}
                      style={{
                        ...audioIconBtnStyle,
                        opacity: ttsBusy !== null || !section.text.trim() ? 0.6 : 1,
                      }}
                      title={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                      aria-label={isAnon ? t("text.loginToPlayAudio") : t("text.playOriginal")}
                    >
                      <Volume2 size={16} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onTranslateSection(section)}
                      disabled={translating === `section:${section.key}` || !section.text.trim()}
                      style={{
                        ...compactBlueBtnStyle,
                        opacity: translating === `section:${section.key}` || !section.text.trim() ? 0.6 : 1,
                      }}
                      title={t("translate.translateText")}
                    >
                      {translating === `section:${section.key}` ? t("translate.translating") : t("translate.compactAction")}
                    </button>
                    {renderAudioLoginNotice(`text_original:${section.key}`)}
                  </div>
                </div>

                {renderSoundTrainingText(section)}

                {translatedSectionMap.get(section.key) ? (
                  <div style={soundTrainingTranslationStyle}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("translate.translatedLabel")}</div>
                    <div style={{ whiteSpace: "pre-wrap", ...readingTextStyle }}>
                      {translatedSectionMap.get(section.key)}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={cardStyle}>
            {renderFollowText("text_original", originalSegs, (displayedSourceTextSafe ?? "").trim())}
          </div>
        )}
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
          <div>
            <h2 style={sectionHeadingStyle}>{t("tasks.title")}</h2>
            {isImageWriting && imageWritingTypeLabel ? (
              <div
                style={{
                  marginTop: 4,
                  display: "inline-flex",
                  border: "1px solid rgba(59,130,246,0.22)",
                  borderRadius: 999,
                  padding: "5px 9px",
                  background: "rgba(59,130,246,0.08)",
                  color: "#1e40af",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {imageWritingTypeLabel}
              </div>
            ) : null}
          </div>

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
              const canTranslateTask = prompt.trim() || options.length > 0;

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

                      <button
                        type="button"
                        style={{
                          ...compactBlueBtnStyle,
                          opacity: translating === `task:${stableId}` || !canTranslateTask ? 0.6 : 1,
                        }}
                        onClick={() => onTranslateTask(tt, idx)}
                        disabled={translating === `task:${stableId}` || !canTranslateTask}
                        title={t("translate.translateTasks")}
                      >
                        {translating === `task:${stableId}` ? t("translate.translating") : t("translate.compactAction")}
                      </button>

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
              {isCourseMode
                ? "KI-feedback lagres sammen med kursbesvarelsen, slik at kursinstruktøren kan følge den opp."
                : t("feedback.subtitle")}
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

          <button
            type="button"
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
          ← {backLabel}
        </Link>
      </section>

      {!isReadingTest ? (
        <div
          style={{
            position: "fixed",
            left: isMobileView ? 8 : "50%",
            right: isMobileView ? 8 : undefined,
            width: isMobileView ? "auto" : "calc(100% - 24px)",
            maxWidth: 980,
            bottom: isMobileView ? 8 : 12,
            transform: isMobileView ? "none" : "translateX(-50%)",
            zIndex: 60,
            padding: isMobileView ? 8 : 10,
            borderRadius: isMobileView ? 14 : 16,
            border: "1px solid rgba(0,0,0,0.14)",
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isMobileView ? 6 : 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!audioRef.current}
              style={{
                ...(isMobileView ? mobileAudioPlayerBtnStyle : audioPlayerBtnStyle),
                opacity: audioRef.current ? 1 : 0.45,
              }}
              onClick={prevSentence}
              title={t("text.prev")}
            >
              ⏮
            </button>

            <button
              type="button"
              disabled={!audioRef.current}
              style={{
                ...(isMobileView ? mobileAudioPlayerPrimaryBtnStyle : audioPlayerPrimaryBtnStyle),
                opacity: audioRef.current ? 1 : 0.45,
              }}
              onClick={isPlaying ? pauseAudio : resumeAudio}
              title={isPlaying ? t("text.pause") : t("text.continue")}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>

            <button
              type="button"
              disabled={!audioRef.current}
              style={{
                ...(isMobileView ? mobileAudioPlayerStopBtnStyle : audioPlayerStopBtnStyle),
                opacity: audioRef.current ? 1 : 0.45,
              }}
              onClick={stopAudio}
              title={t("text.stop")}
            >
              ⏹
            </button>

            <button
              type="button"
              disabled={!audioRef.current}
              style={{
                ...(isMobileView ? mobileAudioPlayerBtnStyle : audioPlayerBtnStyle),
                opacity: audioRef.current ? 1 : 0.45,
              }}
              onClick={nextSentence}
              title={t("text.next")}
            >
              ⏭
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: isMobileView ? 6 : 8,
                flex: isMobileView ? "1 1 calc(100% - 142px)" : "1 1 280px",
                minWidth: isMobileView ? 120 : 220,
                marginLeft: isMobileView ? 0 : 4,
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>{fmtTime(currentTime)}</span>

              <input
                type="range"
                min={0}
                max={Math.max(0.01, duration || 0)}
                step={0.05}
                value={Math.min(currentTime, duration || currentTime)}
                disabled={!audioRef.current}
                onChange={(e) => {
                  const a = audioRef.current;
                  if (!a) return;
                  const v = Number(e.target.value);
                  a.currentTime = v;
                  setCurrentTime(v);
                }}
                style={{ flex: 1, opacity: audioRef.current ? 1 : 0.45 }}
              />

              <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>{fmtTime(duration)}</span>
            </div>

            <div style={isMobileView ? mobileSpeedGroupStyle : speedGroupStyle}>
              <button
                type="button"
                style={playbackRate === 0.8 ? mobileAwareSpeedActiveStyle(isMobileView) : mobileAwareSpeedStyle(isMobileView)}
                onClick={() => setPlaybackRate(0.8)}
              >
                0.8x
              </button>
              <button
                type="button"
                style={playbackRate === 1 ? mobileAwareSpeedActiveStyle(isMobileView) : mobileAwareSpeedStyle(isMobileView)}
                onClick={() => setPlaybackRate(1)}
              >
                1x
              </button>
              <button
                type="button"
                style={playbackRate === 1.2 ? mobileAwareSpeedActiveStyle(isMobileView) : mobileAwareSpeedStyle(isMobileView)}
                onClick={() => setPlaybackRate(1.2)}
              >
                1.2x
              </button>
            </div>

            <button
              type="button"
              onClick={saveDraft}
              disabled={saving || !uid}
              aria-label={isCourseMode ? "Save course draft" : t("actions.saveToMyContent")}
              title={isCourseMode ? "Save course draft" : t("actions.saveToMyContent")}
              style={{
                ...(isMobileView ? mobileStickySaveBtnStyle : stickySaveBtnStyle),
                opacity: saving || !uid ? 0.6 : 1,
                cursor: saving || !uid ? "not-allowed" : "pointer",
                flex: isMobileView ? "1 1 0" : "0 0 auto",
              }}
            >
              {saving ? t("actions.saving") : isCourseMode ? "Save draft" : t("actions.saveShort")}
            </button>
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

const soundTrainingGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const soundTrainingCardStyle: React.CSSProperties = {
  ...cardStyle,
  background: "rgba(255,255,255,0.96)",
};

const soundTrainingHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 8,
};

const soundTrainingTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.18,
  fontWeight: 900,
  color: "#0f172a",
};

const soundTrainingTextStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.65,
  fontSize: 17,
  color: "#0f172a",
};

const soundTrainingTranslationStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(59,130,246,0.22)",
  background: "rgba(59,130,246,0.08)",
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
  gap: 6,
  flexWrap: "nowrap",
  alignItems: "flex-start",
  maxWidth: "100%",
  padding: 8,
  border: "1px solid rgba(37,99,235,0.16)",
  borderRadius: 14,
  background: "rgba(239,246,255,0.82)",
};

const lessonUtilityRowStyle: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "flex-start",
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

const mobileSpeedGroupStyle: React.CSSProperties = {
  ...speedGroupStyle,
  gap: 4,
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

const compactSpeedBtnStyle: React.CSSProperties = {
  ...speedBtnStyle,
  padding: "6px 9px",
  minHeight: 32,
};

const compactSpeedBtnActiveStyle: React.CSSProperties = {
  ...compactSpeedBtnStyle,
  border: "1px solid rgba(37,99,235,0.70)",
  background: "rgba(59,130,246,0.16)",
  color: "#1d4ed8",
  boxShadow: "0 0 0 2px rgba(59,130,246,0.10)",
};

const mobileCompactSpeedBtnStyle: React.CSSProperties = {
  ...compactSpeedBtnStyle,
  padding: "5px 7px",
  minHeight: 30,
  fontSize: 12,
};

const mobileCompactSpeedBtnActiveStyle: React.CSSProperties = {
  ...mobileCompactSpeedBtnStyle,
  border: "1px solid rgba(37,99,235,0.70)",
  background: "rgba(59,130,246,0.16)",
  color: "#1d4ed8",
  boxShadow: "0 0 0 2px rgba(59,130,246,0.10)",
};

function mobileAwareSpeedStyle(isMobileView: boolean): React.CSSProperties {
  return isMobileView ? mobileCompactSpeedBtnStyle : compactSpeedBtnStyle;
}

function mobileAwareSpeedActiveStyle(isMobileView: boolean): React.CSSProperties {
  return isMobileView ? mobileCompactSpeedBtnActiveStyle : compactSpeedBtnActiveStyle;
}

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

const audioPlayerBtnStyle: React.CSSProperties = {
  ...btnStyle,
  padding: "8px 10px",
  minHeight: 40,
  borderRadius: 12,
};

const mobileAudioPlayerBtnStyle: React.CSSProperties = {
  ...audioPlayerBtnStyle,
  minWidth: 36,
  minHeight: 36,
  padding: "6px 8px",
  borderRadius: 11,
};

const audioPlayerPrimaryBtnStyle: React.CSSProperties = {
  ...audioPlayerBtnStyle,
  border: "1px solid rgba(202,138,4,0.45)",
  background: "rgba(250,204,21,0.20)",
  color: "#854d0e",
};

const mobileAudioPlayerPrimaryBtnStyle: React.CSSProperties = {
  ...audioPlayerPrimaryBtnStyle,
  minWidth: 38,
  minHeight: 36,
  padding: "6px 8px",
  borderRadius: 11,
};

const audioPlayerStopBtnStyle: React.CSSProperties = {
  ...audioPlayerBtnStyle,
  border: "1px solid rgba(220,38,38,0.42)",
  background: "rgba(239,68,68,0.16)",
  color: "#b91c1c",
};

const mobileAudioPlayerStopBtnStyle: React.CSSProperties = {
  ...audioPlayerStopBtnStyle,
  minWidth: 36,
  minHeight: 36,
  padding: "6px 8px",
  borderRadius: 11,
};

const stickySaveBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: "1px solid rgba(22,163,74,0.35)",
  background: "rgb(22,163,74)",
  color: "white",
  fontSize: 14,
  fontWeight: 900,
  minHeight: 40,
  minWidth: 96,
  padding: "8px 14px",
  boxShadow: "none",
  whiteSpace: "nowrap",
};

const mobileStickySaveBtnStyle: React.CSSProperties = {
  ...stickySaveBtnStyle,
  minWidth: 94,
  minHeight: 36,
  padding: "6px 10px",
  fontSize: 14,
};
