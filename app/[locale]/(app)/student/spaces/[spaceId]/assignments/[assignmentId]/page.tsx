// app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { LANGUAGES } from "@/lib/languages";
import Image from "next/image";
import ReadingTestPlayer, {
  type ReadingLessonTask,
  type ReadingTestConfig,
} from "@/components/student/ReadingTestPlayer";
import GeometryWorksheetPracticeView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import type {
  GeometryAnswersByTaskId,
  GeometryAutoResult,
} from "@/lib/math/geometry/submissionTypes";
import { gradeGeometryWorksheet } from "@/lib/math/geometry/autoCheck";
import GeometryAutoCheckSummary from "@/components/generators/math/geometry/GeometryAutoCheckSummary";
import GeometryAutoCheckTaskList from "@/components/generators/math/geometry/GeometryAutoCheckTaskList";

/* =========================
   Types
========================= */

type Lesson = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  isActive?: boolean;
  status?: string;
  lessonType?: string;
  taskType?: string;
  readingTestConfig?: ReadingTestConfig | null;
  mathWorksheet?: MathWorksheet | null;
};

type SourceType = "myContent" | "library";

type AssignmentDoc = {
  status?: "active" | "archived" | string;
  sourceType?: SourceType;
  sourceId?: string;
  title?: string;
  level?: string;
  language?: string;
  topic?: string;
  description?: string;
  createdAt?: unknown;
  assignedAt?: unknown;
  assignedByUid?: string;

  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  lessonType?: string;
  taskType?: string;
  readingTestConfig?: ReadingTestConfig | null;
  mathWorksheet?: MathWorksheet | null;
};

type TaskType = "mcq" | "truefalse" | "open";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
};

type AnswersMap = Record<string, unknown>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

type TtsLang = "no" | "en" | "pt-BR";

type SubmissionStatus =
  | "draft"
  | "submitted"
  | "needs_work"
  | "reviewed"
  | "approved"
  | "rejected"
  | string;

type TeacherFeedback = {
  text?: string;
  updatedAt?: unknown;
  teacherUid?: string | null;
};

type AutoGradeEntry = {
  type: "mcq" | "truefalse";
  isCorrect: boolean;
  studentAnswer: unknown;
  correctAnswer: unknown;
};

type AutoGrade = {
  totalAuto: number;
  correctAuto: number;
  wrongAuto: number;
  unansweredAuto: number;
  percentAuto: number | null;
  byTask: Record<string, AutoGradeEntry>;
};

type SubmissionDoc = {
  uid?: string;
  status?: SubmissionStatus;
  title?: string | null;
  teacherFeedback?: TeacherFeedback | null;
  updatedAt?: unknown;
  createdAt?: unknown;
  answers?: AnswersMap | unknown;
  answersByTaskId?: AnswersMap | unknown;
  auto?: AutoGrade | unknown;
  aiFeedback?: unknown;
};

/* =========================
   Helpers
========================= */

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

function isPermissionDenied(e: unknown) {
  const err = e as { code?: unknown; message?: unknown };
  const code = String(err?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions")
  );
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

function hasSnapshotContent(a: AssignmentDoc | null): boolean {
  if (!a) return false;
  const hasText = String(a.sourceText ?? a.text ?? "").trim().length > 0;
  const hasTasks = safeTasksArray(a.tasks).length > 0;
  const hasImage = String(a.coverImageUrl ?? "").trim().length > 0;
  const hasMathWorksheet = !!a.mathWorksheet && typeof a.mathWorksheet === "object";
  return hasText || hasTasks || hasImage || hasMathWorksheet;
}

function assignmentToLesson(a: AssignmentDoc): Lesson {
  return {
    title: a.title,
    level: a.level,
    topic: a.topic,
    language: a.language,
    sourceText: a.sourceText,
    text: a.text,
    tasks: a.tasks,
    coverImageUrl: a.coverImageUrl,
    status: a.status,
    lessonType: a.lessonType,
    taskType: a.taskType,
    readingTestConfig: a.readingTestConfig ?? null,
    mathWorksheet: a.mathWorksheet ?? null,
  };
}

function isMathWorksheet(value: unknown): value is MathWorksheet {
  if (!value || typeof value !== "object") return false;

  const v = value as { tasks?: unknown; title?: unknown };
  return Array.isArray(v.tasks) && typeof v.title === "string";
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

  const d = data as { error?: unknown; translatedText?: unknown; translation?: unknown; text?: unknown };
  if (d?.error) throw new Error(`Translate API error (HTTP ${res.status}): ${String(d.error)}`);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);

  const out = String(d?.translatedText ?? d?.translation ?? d?.text ?? "").trim();
  if (!out) throw new Error("Translate returned empty");
  return out;
}

async function resolveUserForStudentPage(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;

  const existingUser = await new Promise<User | null>((resolve) => {
    let done = false;
    let unsub: (() => void) | null = null;

    const finish = (u: User | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (unsub) unsub();
      resolve(u);
    };

    unsub = onAuthStateChanged(
      auth,
      (u) => finish(u ?? null),
      () => finish(null)
    );

    const timer = window.setTimeout(() => {
      finish(auth.currentUser ?? null);
    }, 1500);
  });

  if (existingUser) return existingUser;

  return await ensureAnonymousUser();
}

function normalizeBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return true === v || false === v ? v : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function normalizeMcq(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function computeAutoGrade(tasks: Task[], answersMap: AnswersMap): AutoGrade {
  let totalAuto = 0;
  let correctAuto = 0;
  let wrongAuto = 0;
  let unansweredAuto = 0;

  const byTask: Record<string, AutoGradeEntry> = {};

  const u2n = (v: unknown) => (v === undefined ? null : v);

  tasks.forEach((t, idx) => {
    const stableId = getStableTaskId(t, idx);
    const type = String(t?.type ?? "open").toLowerCase();

    const isAutoGradedType =
      type === "mcq" ||
      type === "truefalse" ||
      type === "true_false" ||
      type === "word_choice" ||
      type === "sentence_placement" ||
      type === "best_summary" ||
      type === "fill_in_word";

    if (!isAutoGradedType) return;

    totalAuto += 1;

    const student = answersMap[stableId];
    const correct = t?.correctAnswer;

    if (
      type === "mcq" ||
      type === "word_choice" ||
      type === "sentence_placement" ||
      type === "best_summary" ||
      type === "fill_in_word"
    ) {
      const studentRaw = answersMap[stableId];

      let s: string | null = null;
      if (typeof studentRaw === "number" && Array.isArray(t?.options)) {
        const opt = (t.options as unknown[])[studentRaw];
        s = normalizeMcq(opt);
      } else {
        s = normalizeMcq(studentRaw);
      }

      const correctRaw = t?.correctAnswer;
      let c: string | null = null;
      if (typeof correctRaw === "number" && Array.isArray(t?.options)) {
        const opt = (t.options as unknown[])[correctRaw];
        c = normalizeMcq(opt);
      } else {
        c = normalizeMcq(correctRaw);
      }

      if (s == null) {
        unansweredAuto += 1;
        byTask[stableId] = {
          type: "mcq",
          isCorrect: false,
          studentAnswer: u2n(studentRaw),
          correctAnswer: u2n(correctRaw),
        };
        return;
      }

      const isCorrect = c != null && s === c;

      if (isCorrect) correctAuto += 1;
      else wrongAuto += 1;

      byTask[stableId] = {
        type: "mcq",
        isCorrect,
        studentAnswer: u2n(studentRaw),
        correctAnswer: u2n(correctRaw),
      };
      return;
    }

    const sB = normalizeBool(student);
    const cB = normalizeBool(correct);

    if (sB == null) {
      unansweredAuto += 1;
      byTask[stableId] = {
        type: "truefalse",
        isCorrect: false,
        studentAnswer: u2n(student),
        correctAnswer: u2n(correct),
      };
      return;
    }

    const isCorrect = cB != null && sB === cB;

    if (isCorrect) correctAuto += 1;
    else wrongAuto += 1;

    byTask[stableId] = {
      type: "truefalse",
      isCorrect,
      studentAnswer: u2n(student),
      correctAnswer: u2n(correct),
    };
  });

  const percentAuto = totalAuto > 0 ? Math.round((correctAuto / totalAuto) * 100) : null;

  return {
    totalAuto,
    correctAuto,
    wrongAuto,
    unansweredAuto,
    percentAuto,
    byTask,
  };
}

function readAutoGrade(sd: SubmissionDoc | null): AutoGrade | null {
  const a = sd?.auto;
  if (!a || typeof a !== "object") return null;
  const r = a as Partial<AutoGrade>;
  const totalAuto = typeof r.totalAuto === "number" ? r.totalAuto : 0;
  const correctAuto = typeof r.correctAuto === "number" ? r.correctAuto : 0;
  const wrongAuto = typeof r.wrongAuto === "number" ? r.wrongAuto : 0;
  const unansweredAuto = typeof r.unansweredAuto === "number" ? r.unansweredAuto : 0;
  const percentAuto = typeof r.percentAuto === "number" ? r.percentAuto : null;
  const byTask =
    r.byTask && typeof r.byTask === "object" && !Array.isArray(r.byTask)
      ? (r.byTask as Record<string, AutoGradeEntry>)
      : {};
  if (totalAuto === 0 && Object.keys(byTask).length === 0) return null;
  return { totalAuto, correctAuto, wrongAuto, unansweredAuto, percentAuto, byTask };
}

type SentenceSeg = {
  text: string;
  startChar: number;
  endChar: number;
  startRatio: number;
  endRatio: number;
};

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
    return { text: s.text, startChar: s.startChar, endChar: s.endChar, startRatio, endRatio };
  });

  if (segs.length) segs[segs.length - 1].endRatio = 1;
  return { clean, segs };
}

function hasToDate(v: unknown): v is { toDate: () => Date } {
  return (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate?: unknown }).toDate === "function"
  );
}

function toDateString(v: unknown) {
  try {
    if (!v) return null;

    if (hasToDate(v)) {
      const d = v.toDate();
      return d.toLocaleString();
    }

    if (v instanceof Date) return v.toLocaleString();
    if (typeof v === "number") return new Date(v).toLocaleString();
    if (typeof v === "string") {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeStatus(s: unknown): SubmissionStatus {
  const raw = String(s ?? "").trim();
  if (!raw) return "";

  const lowered = raw.toLowerCase();
  const compact = lowered.replace(/[\s_-]+/g, "");

  if (compact === "needswork") return "needs_work";
  if (compact === "reviewed") return "reviewed";
  if (compact === "approved") return "approved";
  if (compact === "submitted") return "submitted";
  if (compact === "draft") return "draft";
  if (compact === "rejected") return "rejected";

  return lowered as SubmissionStatus;
}

function statusTheme(s: SubmissionStatus): { border: string; bg: string } {
  const v = normalizeStatus(s);
  if (v === "needs_work") return { border: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.10)" };
  if (v === "reviewed" || v === "approved")
    return { border: "rgba(46,204,113,0.45)", bg: "rgba(46,204,113,0.10)" };
  if (v === "draft") return { border: "rgba(99,102,241,0.45)", bg: "rgba(99,102,241,0.08)" };
  return { border: "rgba(0,0,0,0.14)", bg: "rgba(0,0,0,0.02)" };
}

function formatSeconds(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(secs / 60);
  const rest = secs % 60;
  return `${String(mins).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === null) return value;
  if (value === undefined) return value;

  if (Array.isArray(value)) return value.map((v) => stripUndefinedDeep(v)) as unknown as T;

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

function buildSubmissionId(
  spaceId: string | undefined,
  assignmentId: string | undefined,
  currentUid: string,
  editingSubmissionId: string | null
) {
  if (editingSubmissionId) return editingSubmissionId;
  return `${spaceId}_${assignmentId}_${currentUid}`;
}

function toFiniteNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(",", ".")
      .replace(/\s*(cm|m|mm|kvadratcentimeter|cm2|cm²|m2|m²)\s*$/i, "")
      .trim();

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeGeometryAnswersByTaskId(raw: unknown): GeometryAnswersByTaskId {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const input = raw as Record<string, unknown>;
  const out: GeometryAnswersByTaskId = {};

  for (const [taskId, value] of Object.entries(input)) {
    const row =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const shapeName =
      typeof row.shapeName === "string" && row.shapeName.trim()
        ? row.shapeName.trim()
        : undefined;

    out[taskId] = {
      taskId,
      shapeName,
      perimeterValue: toFiniteNumberOrNull(row.perimeterValue),
      areaValue: toFiniteNumberOrNull(row.areaValue),
      updatedAt: row.updatedAt,
    };
  }

  return out;
}

function isFinalSubmissionStatus(status: SubmissionStatus): boolean {
  const s = normalizeStatus(status);
  return s === "submitted" || s === "reviewed" || s === "approved";
}

/* =========================
   Small UI atoms
========================= */

function Badge({
  text,
  kind = "neutral",
  title,
}: {
  text: string;
  kind?: "neutral" | "good" | "bad" | "warn";
  title?: string;
}) {
  const styles =
    kind === "good"
      ? { bg: "rgba(16,185,129,0.16)", bd: "rgba(16,185,129,0.45)", tx: "rgba(5,150,105,1)" }
      : kind === "bad"
        ? { bg: "rgba(231,76,60,0.14)", bd: "rgba(231,76,60,0.40)", tx: "rgba(180,40,30,1)" }
        : kind === "warn"
          ? { bg: "rgba(245,158,11,0.16)", bd: "rgba(245,158,11,0.45)", tx: "rgba(180,83,9,1)" }
          : { bg: "rgba(0,0,0,0.04)", bd: "rgba(0,0,0,0.14)", tx: "rgba(0,0,0,0.75)" };

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.bd}`,
        background: styles.bg,
        color: styles.tx,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function AutoGradeBadge({
  auto,
  labelAuto,
  labelDetails,
}: {
  auto: AutoGrade | null;
  labelAuto: string;
  labelDetails: (s: string) => string;
}) {
  if (!auto) return null;

  const pct = auto.percentAuto;
  const main = `${labelAuto}: ${auto.correctAuto}/${auto.totalAuto}${pct != null ? ` (${pct}%)` : ""}`;
  const kind = pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";
  const detailsRaw = `Riktig: ${auto.correctAuto} · Feil: ${auto.wrongAuto} · Ikke besvart: ${auto.unansweredAuto}`;

  return <Badge text={main} kind={kind} title={labelDetails(detailsRaw)} />;
}

function StatusToggleButton({
  active,
  label,
  kind,
  title,
}: {
  active: boolean;
  label: string;
  kind: "warn" | "good";
  title: string;
}) {
  const activeBg =
    kind === "good" ? "rgba(46,204,113,0.18)" : "rgba(245,158,11,0.18)";
  const activeBorder =
    kind === "good" ? "rgba(46,204,113,0.60)" : "rgba(245,158,11,0.60)";
  const activeText =
    kind === "good" ? "rgba(5,150,105,1)" : "rgba(180,83,9,1)";

  return (
    <span
      title={title}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 40,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${active ? activeBorder : "rgba(0,0,0,0.14)"}`,
        background: active ? activeBg : "white",
        color: active ? activeText : "rgba(0,0,0,0.75)",
        fontWeight: active ? 900 : 700,
        opacity: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function SmartImage({ src, alt }: { src: string; alt: string }) {
  const isInline = src.startsWith("data:") || src.startsWith("blob:");
  if (isInline) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={1600}
      height={900}
      sizes="(max-width: 920px) 100vw, 920px"
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

/* =========================
   Page
========================= */

export default function StudentAssignmentPage() {
  const t = useTranslations("studentAssignment");
  const tGeometry = useTranslations("mathGeometry");
  const tBrand = useTranslations("brandLogo");
  const tGeometryAny = tGeometry as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const tBrandAny = tBrand as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const params = useParams<{ spaceId: string; assignmentId: string }>();
  const spaceId = params?.spaceId;
  const assignmentId = params?.assignmentId;

  const sp = useSearchParams();
  const sid = useMemo(() => (sp.get("sid") ?? "").trim(), [sp]);

  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState(true);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const answersRef = useRef<AnswersMap>({});
  const [draftSaving, setDraftSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [liveStatus, setLiveStatus] = useState<SubmissionStatus | null>(null);
  const [liveTeacherText, setLiveTeacherText] = useState<string | null>(null);
  const [liveTeacherUpdatedAt, setLiveTeacherUpdatedAt] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveAuto, setLiveAuto] = useState<AutoGrade | null>(null);
  const [liveGeometryAuto, setLiveGeometryAuto] = useState<GeometryAutoResult | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);
  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
  const [startedAt] = useState<number>(() => Date.now());
  const [translateErr, setTranslateErr] = useState<string | null>(null);
  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsBusy, setTtsBusy] = useState<null | "original" | "translation">(null);
  const [ttsErr, setTtsErr] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTextMode, setActiveTextMode] = useState<null | "original" | "translation">(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

  const [readingTestStarted, setReadingTestStarted] = useState(false);
  const [readingTestFinished, setReadingTestFinished] = useState(false);
  const [readingTestSecondsLeft, setReadingTestSecondsLeft] = useState<number | null>(null);
  const [readingTestRuntimeActive, setReadingTestRuntimeActive] = useState(false);
  const timeoutHandledRef = useRef(false);

  const tasksOriginal = useMemo(
    () =>
      safeTasksArray(lesson?.tasks)
        .slice()
        .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999)),
    [lesson?.tasks]
  );

  const isReadingTest = useMemo(() => {
    const lt = String(lesson?.lessonType ?? "").trim().toLowerCase();
    if (lt === "reading_test") return true;

    return tasksOriginal.some((task) => {
      const type = String(task?.type ?? "").trim().toLowerCase();
      return type === "word_choice" || type === "sentence_placement" || type === "best_summary";
    });
  }, [lesson?.lessonType, tasksOriginal]);

  const geometryWorksheet = useMemo(() => {
    return isMathWorksheet(lesson?.mathWorksheet) ? lesson.mathWorksheet : null;
  }, [lesson?.mathWorksheet]);

  const isGeometryAssignment = useMemo(() => {
    const lessonType = String(lesson?.lessonType ?? "").trim().toLowerCase();
    const taskType = String(lesson?.taskType ?? "").trim().toLowerCase();
    const assignmentLessonType = String(assignment?.lessonType ?? "").trim().toLowerCase();
    const assignmentTaskType = String(assignment?.taskType ?? "").trim().toLowerCase();

    return (
      lessonType === "math_geometry" ||
      taskType === "math_geometry" ||
      assignmentLessonType === "math_geometry" ||
      assignmentTaskType === "math_geometry" ||
      !!geometryWorksheet
    );
  }, [lesson, assignment, geometryWorksheet]);

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((x) => m.set(x.stableId, x));
    return m;
  }, [translatedTasks]);

  const sourceTextSafe = useMemo(
    () => String(lesson?.sourceText ?? lesson?.text ?? ""),
    [lesson?.sourceText, lesson?.text]
  );

  const imageUrl = useMemo(() => {
    const u = String(lesson?.coverImageUrl ?? "").trim();
    return u || null;
  }, [lesson?.coverImageUrl]);

  const textFollow = useMemo(() => {
    const original = segmentSentences(sourceTextSafe || "");
    const translation = segmentSentences(translatedText || "");
    return { original, translation };
  }, [sourceTextSafe, translatedText]);

  const originalLangForTTS: TtsLang = toTtsLang(lesson?.language || assignment?.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  const readingTestTotalSeconds = useMemo(() => {
    const cfg = lesson?.readingTestConfig;
    if (!cfg?.timerEnabled) return null;

    const raw =
      typeof cfg.timerSeconds === "number" && Number.isFinite(cfg.timerSeconds)
        ? Math.floor(cfg.timerSeconds)
        : 300;

    return Math.max(10, raw);
  }, [lesson?.readingTestConfig]);

  const readingProgressPercent = useMemo(() => {
    if (!readingTestTotalSeconds || readingTestSecondsLeft == null) return 100;
    return Math.max(0, Math.min(100, (readingTestSecondsLeft / readingTestTotalSeconds) * 100));
  }, [readingTestSecondsLeft, readingTestTotalSeconds]);

  const readingTimerIsRed = useMemo(
    () => readingTestStarted && readingTestSecondsLeft != null && readingTestSecondsLeft <= 15,
    [readingTestStarted, readingTestSecondsLeft]
  );

  const readingPlayerConfig = useMemo<ReadingTestConfig | null>(() => {
    const cfg = lesson?.readingTestConfig ?? null;
    if (!cfg) return null;
    return {
      ...cfg,
      timerEnabled: false,
      timerSeconds: null,
    };
  }, [lesson?.readingTestConfig]);

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
    a.play().catch(() => {});
  }

  function seekToSentence(mode: "original" | "translation", idx: number) {
    const a = audioRef.current;
    if (!a) return;

    const segs = mode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs || !segs[idx]) return;

    const d = a.duration;
    if (!d || !isFinite(d)) return;

    const target = segs[idx].startRatio * d;
    a.currentTime = Math.max(0, Math.min(d - 0.05, target));
    setActiveTextMode(mode);
    setActiveSentenceIndex(idx);

    if (a.paused) a.play().catch(() => {});
  }

  function replaySentence() {
    const a = audioRef.current;
    if (!a) return;

    if (activeTextMode && activeSentenceIndex != null) {
      seekToSentence(activeTextMode, activeSentenceIndex);
    } else {
      a.currentTime = Math.max(0, a.currentTime - 2.0);
      a.play().catch(() => {});
    }
  }

  function prevSentence() {
    if (!audioRef.current) return;
    if (!activeTextMode) return;

    const segs = activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs.length) return;

    const nextIdx = Math.max(0, (activeSentenceIndex ?? 0) - 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  function nextSentence() {
    if (!audioRef.current) return;
    if (!activeTextMode) return;

    const segs = activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs.length) return;

    const nextIdx = Math.min(segs.length - 1, (activeSentenceIndex ?? 0) + 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  async function playTTS(text: string, lang: TtsLang, mode: "original" | "translation") {
    if (!assignmentId) return;
    const clean = (text || "").trim();
    if (!clean) return;

    setTtsErr(null);
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
          lessonId: assignmentId,
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
      const m = (e as { message?: unknown })?.message;
      setTtsErr(typeof m === "string" ? m : t("tts.failed"));
      setActiveSentenceIndex(null);
      setActiveTextMode(null);
    } finally {
      setTtsBusy(null);
    }
  }

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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

    const onTime = () => {
      const d = a.duration;
      if (!d || !isFinite(d)) return;

      const tt = a.currentTime;
      const ratio = Math.max(0, Math.min(1, tt / d));

      const segs = activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
      if (!segs || segs.length === 0) return;

      let idx = segs.findIndex((s) => ratio >= s.startRatio && ratio < s.endRatio);
      if (idx === -1) idx = segs.length - 1;

      setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
    };

    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [activeTextMode, textFollow.original.segs, textFollow.translation.segs]);

  function setAnswer(taskId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
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

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!spaceId || !assignmentId) {
          setErr(t("errors.missingParams"));
          return;
        }

        const user = await resolveUserForStudentPage();
        if (!alive) return;

        setUid(user.uid);
        setIsAnon(!!user.isAnonymous);

        const memberId = `${spaceId}_${user.uid}`;
        const memberSnap = await getDoc(doc(db, "spaceMembers", memberId));
        if (!memberSnap.exists()) throw new Error(t("errors.notMember"));

        const aSnap = await getDoc(doc(db, "spaces", spaceId, "lessons", assignmentId));
        if (!alive) return;

        if (!aSnap.exists()) {
          setErr(t("errors.assignmentNotFoundInSpace"));
          setLesson(null);
          setAssignment(null);
          return;
        }

        const aDoc = (aSnap.data() as AssignmentDoc) ?? {};
        setAssignment(aDoc);

        let resolvedLesson: Lesson | null = null;

        if (hasSnapshotContent(aDoc)) {
          resolvedLesson = assignmentToLesson(aDoc);
        } else {
          const srcType = (aDoc.sourceType ?? "library") as SourceType;
          const srcId = String(aDoc.sourceId ?? "").trim();

          if (!srcId) {
            setErr(t("errors.missingSourceId"));
            setLesson(null);
            return;
          }

          const lSnap =
            srcType === "library"
              ? await getDoc(doc(db, "published_lessons", srcId))
              : await getDoc(doc(db, "lessons", srcId));

          if (!alive) return;

          if (!lSnap.exists()) {
            setErr(t("errors.sourceLessonMissing"));
            setLesson(null);
            return;
          }

          const d = lSnap.data() as Lesson;

          if (srcType === "library") {
            const isInactive = d?.isActive === false;
            const isArchived = typeof d?.status === "string" && d.status.toLowerCase() === "archived";
            if (isInactive || isArchived) {
              setErr(t("errors.unpublished"));
              setLesson(null);
              return;
            }
          }

          resolvedLesson = {
            title: aDoc.title ?? d.title,
            level: aDoc.level ?? d.level,
            topic: aDoc.topic ?? d.topic,
            language: aDoc.language ?? d.language,
            sourceText: d.sourceText,
            text: d.text,
            tasks: d.tasks,
            coverImageUrl: aDoc.coverImageUrl ?? d.coverImageUrl,
            status: d.status,
            isActive: d.isActive,
            lessonType: aDoc.lessonType ?? d.lessonType,
            taskType: aDoc.taskType ?? d.taskType,
            readingTestConfig: aDoc.readingTestConfig ?? d.readingTestConfig ?? null,
            mathWorksheet: aDoc.mathWorksheet ?? d.mathWorksheet ?? null,
          };
        }

        setLesson(resolvedLesson);

        const isGeometryResolved =
          String(resolvedLesson?.lessonType ?? "").trim().toLowerCase() === "math_geometry" ||
          String(resolvedLesson?.taskType ?? "").trim().toLowerCase() === "math_geometry" ||
          isMathWorksheet(resolvedLesson?.mathWorksheet);

        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);
        setTaskTranslationOpen({});
        setTtsErr(null);
        setTtsBusy(null);
        stopAudio();

        setSubmitted(false);
        setSubmissionId(null);
        setMsg(null);
        setAnswers({});

        setReadingTestStarted(false);
        setReadingTestFinished(false);
        setReadingTestSecondsLeft(readingTestTotalSeconds);
        setReadingTestRuntimeActive(false);
        timeoutHandledRef.current = false;

        setLiveStatus(null);
        setLiveTeacherText(null);
        setLiveTeacherUpdatedAt(null);
        setLiveUpdatedAt(null);
        setLiveAuto(null);
        setLiveGeometryAuto(null);

        if (sid) {
          const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", sid);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const sd = (sSnap.data() as SubmissionDoc) ?? {};
            const owner = typeof sd.uid === "string" ? sd.uid : null;
            if (owner && owner !== user.uid) throw new Error(t("errors.noAccessSubmission"));

            const sStatus = normalizeStatus(sd.status);
            setLiveStatus(sStatus);
            setSubmitted(isFinalSubmissionStatus(sStatus));
            setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
            setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
            setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);

            const nextAnswers = isGeometryResolved
              ? (normalizeGeometryAnswersByTaskId(sd.answersByTaskId) as unknown as AnswersMap)
              : (
                  sd.answers && typeof sd.answers === "object" && !Array.isArray(sd.answers)
                    ? (sd.answers as AnswersMap)
                    : {}
                );

            if (Object.keys(nextAnswers).length > 0) {
              setAnswers(nextAnswers);
            }

            if (isGeometryResolved) {
              setLiveGeometryAuto((sd.auto as GeometryAutoResult | null) ?? null);
              setLiveAuto(null);
            } else {
              setLiveAuto(readAutoGrade(sd));
              setLiveGeometryAuto(null);
            }

            if (sStatus === "needs_work" || sStatus === "draft") {
              setEditingSubmissionId(sid);
            } else {
              setEditingSubmissionId(null);
              if (sStatus === "submitted" || sStatus === "reviewed" || sStatus === "approved") {
                setReadingTestStarted(true);
                setReadingTestFinished(true);
              }
            }
          } else {
            setMsg(t("messages.submissionNotFound"));
            setEditingSubmissionId(null);
          }
        } else {
          const autoId = `${spaceId}_${assignmentId}_${user.uid}`;

          let sSnap: Awaited<ReturnType<typeof getDoc>> | null = null;

          try {
            const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", autoId);
            sSnap = await getDoc(sRef);
          } catch (e: unknown) {
            if (!isPermissionDenied(e)) throw e;
            sSnap = null;
          }

          if (sSnap && sSnap.exists()) {
            const sd = (sSnap.data() as SubmissionDoc) ?? {};
            const owner = typeof sd.uid === "string" ? sd.uid : null;
            if (owner && owner !== user.uid) throw new Error(t("errors.noAccessSubmission"));

            const sStatus = normalizeStatus(sd.status);
            setLiveStatus(sStatus);
            setSubmitted(isFinalSubmissionStatus(sStatus));
            setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
            setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
            setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);

            const nextAnswers = isGeometryResolved
              ? (normalizeGeometryAnswersByTaskId(sd.answersByTaskId) as unknown as AnswersMap)
              : (
                  sd.answers && typeof sd.answers === "object" && !Array.isArray(sd.answers)
                    ? (sd.answers as AnswersMap)
                    : {}
                );

            if (Object.keys(nextAnswers).length > 0) {
              setAnswers(nextAnswers);
            }

            if (isGeometryResolved) {
              setLiveGeometryAuto((sd.auto as GeometryAutoResult | null) ?? null);
              setLiveAuto(null);
            } else {
              setLiveAuto(readAutoGrade(sd));
              setLiveGeometryAuto(null);
            }

            if (sStatus === "draft" || sStatus === "needs_work") {
              setEditingSubmissionId(autoId);
            } else {
              setEditingSubmissionId(null);
              if (sStatus === "submitted" || sStatus === "reviewed" || sStatus === "approved") {
                setReadingTestStarted(true);
                setReadingTestFinished(true);
              }
            }
          } else {
            setEditingSubmissionId(null);
          }
        }
      } catch (e: unknown) {
        if (!alive) return;

        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.generic"));
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [spaceId, assignmentId, sid, t, readingTestTotalSeconds]);

  useEffect(() => {
    if (!spaceId || !assignmentId) return;
    if (!uid) return;

    const activeSubId = (sid || submissionId || editingSubmissionId || "").trim();
    if (!activeSubId) return;

    const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", activeSubId);

    const unsub = onSnapshot(
      sRef,
      (snap) => {
        if (!snap.exists()) return;

        const sd = (snap.data() as SubmissionDoc) ?? {};
        const owner = typeof sd.uid === "string" ? sd.uid : null;
        if (owner && owner !== uid) return;

        const sStatus = normalizeStatus(sd.status);
        setLiveStatus(sStatus);
        setSubmitted(isFinalSubmissionStatus(sStatus));

        const tText = sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : "";
        setLiveTeacherText(tText ? tText : null);

        setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
        setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);

        if (isGeometryAssignment) {
          setLiveGeometryAuto((sd.auto as GeometryAutoResult | null) ?? null);
          setLiveAuto(null);

          const nextAnswers = normalizeGeometryAnswersByTaskId(sd.answersByTaskId);
          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers as unknown as AnswersMap);
          }
        } else {
          setLiveAuto(readAutoGrade(sd));
          setLiveGeometryAuto(null);
        }

        if (sStatus === "needs_work" || sStatus === "draft") {
          setEditingSubmissionId(activeSubId);
        } else {
          setEditingSubmissionId(null);
        }

        if (sStatus === "submitted" || sStatus === "reviewed" || sStatus === "approved") {
          setReadingTestStarted(true);
          setReadingTestFinished(true);
          setReadingTestRuntimeActive(false);
        }
      },
      () => {}
    );

    return () => unsub();
  }, [spaceId, assignmentId, uid, sid, submissionId, editingSubmissionId, isGeometryAssignment]);

  useEffect(() => {
    setTranslateErr(null);
  }, [targetLang]);

  useEffect(() => {
    if (!isReadingTest) return;
    if (!readingTestStarted) return;
    if (!readingTestRuntimeActive) return;
    if (submitted) return;
    if (submitting) return;

    if (readingTestSecondsLeft == null) return;
    if (readingTestSecondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setReadingTestSecondsLeft((prev) => {
        if (prev == null) return prev;
        return Math.max(0, prev - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isReadingTest, readingTestStarted, readingTestRuntimeActive, submitted, submitting, readingTestSecondsLeft]);

  function setReadingTestCountdownFromConfig() {
    if (readingTestTotalSeconds != null) {
      setReadingTestSecondsLeft(readingTestTotalSeconds);
      setReadingTestRuntimeActive(true);
    } else {
      setReadingTestSecondsLeft(null);
      setReadingTestRuntimeActive(false);
    }
  }

  const isLockedByTeacher = useCallback((): boolean => {
    const s = normalizeStatus(liveStatus ?? "submitted");
    return s === "reviewed" || s === "approved";
  }, [liveStatus]);

  function startReadingTest() {
    if (submitted) return;
    if (submitting) return;
    if (isLockedByTeacher()) return;

    timeoutHandledRef.current = false;
    setMsg(null);
    setReadingTestFinished(false);
    setReadingTestStarted(true);
    setReadingTestCountdownFromConfig();
  }

  async function onTranslateText() {
    const base = String(lesson?.sourceText ?? lesson?.text ?? "");
    if (!base.trim()) return;

    setTranslateErr(null);
    setTranslating("text");

    try {
      const out = await translateOne(base, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
      setTranslatedText(null);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTasks() {
    if (!lesson) return;
    const tasksArr = safeTasksArray(lesson.tasks);
    if (tasksArr.length === 0) return;

    setTranslateErr(null);
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
            const m = (e as { message?: unknown })?.message;
            setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : t("translate.failed")));
          }
        }

        let translatedOptions: string[] = [];
        if (optionsOrig.length > 0) {
          translatedOptions = await Promise.all(
            optionsOrig.map(async (o) => {
              try {
                return await translateOne(String(o), targetLang);
              } catch (e: unknown) {
                const m = (e as { message?: unknown })?.message;
                setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : t("translate.failed")));
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
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : t("translate.failed"));
    } finally {
      setTranslating(null);
    }
  }

  function statusLabel(s: SubmissionStatus) {
    const v = normalizeStatus(s);
    if (v === "draft") return "Kladd";
    if (v === "needs_work") return t("status.needsWork");
    if (v === "reviewed" || v === "approved") return t("status.approved");
    if (v === "submitted") return t("status.submitted");
    return v;
  }

  function statusDesc(s: SubmissionStatus) {
    const v = normalizeStatus(s);
    if (v === "draft") return "Kladd er lagret. Du kan fortsette senere og levere når du er klar.";
    if (v === "needs_work") return t("statusDesc.needsWork");
    if (v === "reviewed" || v === "approved") return t("statusDesc.approved");
    if (v === "submitted") return t("statusDesc.submitted");
    return t("statusDesc.generic");
  }

  const saveDraft = useCallback(
    async (manual = false) => {
      if (!spaceId || !assignmentId || !uid) return;
      if (submitted) return;
      if (isLockedByTeacher()) return;
      if (isReadingTest) return;
      if (submitting) return;

      setDraftSaving(true);
      setErr(null);
      if (manual) setMsg(null);

      try {
        const subId = buildSubmissionId(spaceId, assignmentId, uid, editingSubmissionId);

        const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
        const indexRef = doc(db, "spaceSubmissions", subId);

        const isGeometryDraft = isGeometryAssignment && !!geometryWorksheet;
        const normalizedGeometryAnswers = isGeometryDraft
          ? normalizeGeometryAnswersByTaskId(answers)
          : null;

        const currentDraftStatus =
          normalizeStatus(liveStatus) === "needs_work" ? "needs_work" : "draft";

        const basePayload: Record<string, unknown> = stripUndefinedDeep({
          spaceId,
          assignmentId,
          sourceType: assignment?.sourceType ?? null,
          sourceId: assignment?.sourceId ?? null,
          title: assignment?.title ?? lesson?.title ?? null,
          level: assignment?.level ?? lesson?.level ?? null,
          language: assignment?.language ?? lesson?.language ?? null,
          uid,
          isAnon,
          status: currentDraftStatus,

          taskType: isGeometryDraft ? "math_geometry" : null,
          lessonType: isGeometryDraft ? "math_geometry" : lesson?.lessonType ?? null,
          mathWorksheet: isGeometryDraft ? geometryWorksheet : null,

          answers: isGeometryDraft ? normalizedGeometryAnswers : answers,
          answersByTaskId: isGeometryDraft ? normalizedGeometryAnswers : undefined,

          auto: null,
          aiFeedback: null,

          startedAt,
          timeSpentSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
          updatedAt: serverTimestamp(),
          auth: { isAnon, uid },
        });

        const batch = writeBatch(db);

        if (editingSubmissionId) {
          batch.set(nestedRef, basePayload, { merge: true });
          batch.set(indexRef, basePayload, { merge: true });
        } else {
          const firstPayload = { ...basePayload, createdAt: serverTimestamp() };
          batch.set(nestedRef, firstPayload, { merge: true });
          batch.set(indexRef, firstPayload, { merge: true });
        }

        await batch.commit();

        setSubmissionId(subId);
        setEditingSubmissionId(subId);
        setLiveStatus(currentDraftStatus);
        setSubmitted(false);
        setLiveAuto(null);
        setLiveGeometryAuto(null);

        if (manual) setMsg("Kladd lagret.");
      } catch (e: unknown) {
        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.submitFailed"));
        }
      } finally {
        setDraftSaving(false);
      }
    },
    [
      spaceId,
      assignmentId,
      uid,
      submitted,
      isLockedByTeacher,
      isReadingTest,
      submitting,
      assignment,
      lesson,
      isAnon,
      answers,
      startedAt,
      editingSubmissionId,
      t,
      isGeometryAssignment,
      geometryWorksheet,
      liveStatus,
    ]
  );

  const lastAutoSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!uid || !spaceId || !assignmentId) return;
    if (submitted) return;
    if (submitting) return;
    if (isLockedByTeacher()) return;
    if (isReadingTest) return;
    if (!answers || Object.keys(answers).length === 0) return;

    const now = Date.now();
    if (now - lastAutoSaveRef.current < 1200) return;

    const timer = window.setTimeout(() => {
      lastAutoSaveRef.current = Date.now();
      void saveDraft(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [answers, uid, spaceId, assignmentId, submitted, submitting, isReadingTest, isLockedByTeacher, saveDraft]);

  const submitToSpace = useCallback(
    async (mode: "manual" | "timeout" = "manual", explicitAnswers?: AnswersMap) => {
      if (!spaceId || !assignmentId || !uid) return;
      if (submitted) return;

      if ((sid || editingSubmissionId) && editingSubmissionId == null) {
        setErr(null);
        setMsg(t("messages.lockedNoChanges"));
        return;
      }

      if (isLockedByTeacher()) {
        setErr(null);
        setMsg(t("messages.lockedNoChanges"));
        return;
      }

      setSubmitting(true);
      setErr(null);
      setMsg(null);

      try {
        const finalAnswers = explicitAnswers ?? answersRef.current;
        const normalizedGeometryAnswers = isGeometryAssignment
          ? normalizeGeometryAnswersByTaskId(finalAnswers)
          : null;

        const subId = buildSubmissionId(spaceId, assignmentId, uid, editingSubmissionId);

        const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
        const indexRef = doc(db, "spaceSubmissions", subId);

        let auto: unknown = computeAutoGrade(tasksOriginal, finalAnswers);
        const aiFeedback: unknown = null;

        if (isGeometryAssignment && geometryWorksheet) {
          const geometryAuto = gradeGeometryWorksheet(
            geometryWorksheet,
            normalizedGeometryAnswers ?? {}
          );
          auto = geometryAuto;
        }

        const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

        const basePayload: Record<string, unknown> = stripUndefinedDeep({
          spaceId,
          assignmentId,
          sourceType: assignment?.sourceType ?? null,
          sourceId: assignment?.sourceId ?? null,
          title: assignment?.title ?? lesson?.title ?? null,
          level: assignment?.level ?? lesson?.level ?? null,
          language: assignment?.language ?? lesson?.language ?? null,
          uid,
          isAnon,
          status: "submitted",

          taskType: isGeometryAssignment ? "math_geometry" : null,
          lessonType: isGeometryAssignment ? "math_geometry" : lesson?.lessonType ?? null,
          mathWorksheet: isGeometryAssignment ? geometryWorksheet : null,

          answers: isGeometryAssignment ? normalizedGeometryAnswers : finalAnswers,
          answersByTaskId: isGeometryAssignment ? normalizedGeometryAnswers : undefined,

          auto,
          aiFeedback,

          startedAt,
          submittedAt: Date.now(),
          timeSpentSeconds: elapsedSeconds,

          readingTestTimeLimitSeconds: isReadingTest ? readingTestTotalSeconds : null,
          readingTestTimeUsedSeconds: isReadingTest ? elapsedSeconds : null,
          readingTestTimedOut: isReadingTest ? mode === "timeout" : false,
          readingTestSubmittedManually: isReadingTest ? mode === "manual" : false,

          updatedAt: serverTimestamp(),
          auth: { isAnon, uid },
        });

        const batch = writeBatch(db);

        if (editingSubmissionId) {
          batch.set(nestedRef, basePayload, { merge: true });
          batch.set(indexRef, basePayload, { merge: true });
        } else {
          const firstPayload = { ...basePayload, createdAt: serverTimestamp() };
          batch.set(nestedRef, firstPayload, { merge: true });
          batch.set(indexRef, firstPayload, { merge: true });
        }

        await batch.commit();

        setSubmissionId(subId);
        setEditingSubmissionId(null);
        setSubmitted(true);
        setReadingTestFinished(true);
        setReadingTestRuntimeActive(false);
        setReadingTestSecondsLeft((prev) => (mode === "timeout" ? 0 : prev));
        setLiveStatus("submitted");
        if (isGeometryAssignment) {
          setLiveGeometryAuto((auto as GeometryAutoResult) ?? null);
          setLiveAuto(null);
        } else {
          setLiveAuto(auto as AutoGrade);
          setLiveGeometryAuto(null);
        }

        if (mode === "timeout") {
          setMsg("Takk for innsatsen. Tiden er ute, og læreren har mottatt svaret ditt.");
        } else {
          setMsg(editingSubmissionId ? t("messages.resubmitted") : t("messages.submitted"));
        }
      } catch (e: unknown) {
        if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
        else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : t("errors.submitFailed"));
        }
        setSubmitted(false);
        setSubmissionId(null);
      } finally {
        setSubmitting(false);
      }
    },
    [
      spaceId,
      assignmentId,
      uid,
      submitted,
      sid,
      editingSubmissionId,
      assignment,
      lesson,
      isAnon,
      tasksOriginal,
      startedAt,
      isReadingTest,
      readingTestTotalSeconds,
      t,
      isLockedByTeacher,
      isGeometryAssignment,
      geometryWorksheet,
    ]
  );

  useEffect(() => {
    if (!isReadingTest) return;
    if (!readingTestStarted) return;
    if (!readingTestRuntimeActive) return;
    if (submitted) return;
    if (readingTestSecondsLeft !== 0) return;
    if (timeoutHandledRef.current) return;

    timeoutHandledRef.current = true;
    setReadingTestRuntimeActive(false);
    setReadingTestFinished(true);
    void submitToSpace("timeout", answersRef.current);
  }, [
    isReadingTest,
    readingTestStarted,
    readingTestRuntimeActive,
    submitted,
    readingTestSecondsLeft,
    submitToSpace,
  ]);

  const renderFollowText = (mode: "original" | "translation", segs: SentenceSeg[], fallbackText: string) => {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>{t("text.noText")}</span>;

    if (!segs || segs.length === 0) {
      return <span style={{ whiteSpace: "pre-wrap" }}>{fallbackText}</span>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map((s, i) => {
          const isActive = activeTextMode === mode && activeSentenceIndex === i;
          return (
            <span
              key={`${mode}_${i}_${s.startChar}`}
              onClick={() => (audioRef.current ? seekToSentence(mode, i) : undefined)}
              style={{
                cursor: audioRef.current ? "pointer" : "default",
                padding: "2px 6px",
                borderRadius: 8,
                background: isActive ? "rgba(255, 230, 120, 0.65)" : "transparent",
                transition: "background 120ms ease",
                lineHeight: 1.6,
              }}
              title={audioRef.current ? t("text.clickToSeek") : undefined}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  };

  function getMcqSelectedIndex(stableId: string, options: unknown[]): number | null {
    const a = answers[stableId];

    if (typeof a === "number" && Number.isFinite(a)) {
      const idx = Math.floor(a);
      return idx >= 0 && idx < options.length ? idx : null;
    }

    const s = normalizeMcq(a);
    if (!s) return null;

    const idx = options.findIndex((o) => normalizeMcq(o) === s);
    return idx >= 0 ? idx : null;
  }

  function isTrueSelected(stableId: string, v: boolean): boolean {
    const b = normalizeBool(answers[stableId]);
    return b === v;
  }

  function renderTask(tk: Task, idx: number) {
    const stableId = getStableTaskId(tk, idx);
    const type = String(tk?.type ?? "open").toLowerCase();
    const promptOrig = String(tk?.prompt ?? "");

    const tr = tMap.get(stableId);
    const showTr = isTaskTranslationVisible(stableId);

    const promptShown = showTr && tr?.translatedPrompt ? tr.translatedPrompt : promptOrig;
    const promptOther = showTr ? promptOrig : tr?.translatedPrompt;

    const promptShownClean = String(promptShown ?? "").trim();
    const promptOtherClean = String(promptOther ?? "").trim();
    const showPromptOther = promptOtherClean.length > 0 && promptOtherClean !== promptShownClean;

    const locked = isLockedByTeacher();

    return (
      <div
        key={stableId}
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ fontWeight: 800, lineHeight: 1.4 }}>{promptShownClean || t("tasks.noPrompt")}</div>

          {!!(tr?.translatedPrompt || tr?.translatedOptions?.length) && (
            <button
              type="button"
              onClick={() => toggleTaskTranslation(stableId)}
              style={{ ...btnStyle, padding: "6px 10px" }}
              title={t("translate.toggleTask")}
            >
              {showTr ? t("translate.hide") : t("translate.show")}
            </button>
          )}
        </div>

        {showPromptOther ? (
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>{promptOtherClean}</div>
        ) : null}

        <div style={{ marginTop: 10 }}>
          {type === "mcq" && Array.isArray(tk.options) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(() => {
                const opts = tk.options as unknown[];
                const selectedIdx = getMcqSelectedIndex(stableId, opts);

                return opts.map((o, oi) => {
                  const optOrig = String(o);
                  const optTr = tr?.translatedOptions?.[oi];
                  const optShown = showTr && optTr ? optTr : optOrig;
                  const checked = selectedIdx === oi;

                  return (
                    <label
                      key={`${stableId}_opt_${oi}`}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        border: checked ? "2px solid rgba(16,185,129,0.70)" : "1px solid rgba(0,0,0,0.10)",
                        borderRadius: 12,
                        padding: checked ? "9px 11px" : "10px 12px",
                        cursor: locked ? "not-allowed" : "pointer",
                        opacity: locked ? 0.7 : 1,
                        background: checked ? "rgba(16,185,129,0.10)" : "white",
                        transition: "all 120ms ease",
                      }}
                    >
                      <input
                        type="radio"
                        name={`mcq_${stableId}`}
                        checked={checked}
                        disabled={locked}
                        onChange={() => setAnswer(stableId, oi)}
                        style={{ transform: "scale(1.05)" }}
                      />
                      <span style={{ fontWeight: checked ? 800 : 600 }}>{optShown}</span>
                    </label>
                  );
                });
              })()}
            </div>
          ) : type === "truefalse" ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={locked}
                onClick={() => setAnswer(stableId, true)}
                style={{
                  ...btnStyle,
                  background: isTrueSelected(stableId, true) ? "rgba(16,185,129,0.14)" : "white",
                  borderColor: isTrueSelected(stableId, true)
                    ? "rgba(16,185,129,0.55)"
                    : "rgba(0,0,0,0.16)",
                  fontWeight: isTrueSelected(stableId, true) ? 900 : 700,
                  opacity: locked ? 0.7 : 1,
                }}
              >
                {t("tasks.true")}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setAnswer(stableId, false)}
                style={{
                  ...btnStyle,
                  background: isTrueSelected(stableId, false) ? "rgba(16,185,129,0.14)" : "white",
                  borderColor: isTrueSelected(stableId, false)
                    ? "rgba(16,185,129,0.55)"
                    : "rgba(0,0,0,0.16)",
                  fontWeight: isTrueSelected(stableId, false) ? 900 : 700,
                  opacity: locked ? 0.7 : 1,
                }}
              >
                {t("tasks.false")}
              </button>
            </div>
          ) : (
            <textarea
              value={String(answers[stableId] ?? "")}
              disabled={locked}
              onChange={(e) => setAnswer(stableId, e.target.value)}
              rows={4}
              style={{
                width: "100%",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                padding: 10,
                outline: "none",
                opacity: locked ? 0.7 : 1,
              }}
              placeholder={t("tasks.writeAnswer")}
            />
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 16 }}>{t("common.loading")}</div>;

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>
        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
            {t("actions.backToSpace")}
          </Link>
          <Link href="/join" style={{ textDecoration: "none" }}>
            {t("actions.backToJoin")}
          </Link>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <div>{t("errors.noData")}</div>
        <div style={{ marginTop: 12 }}>
          <Link href={`/student/spaces/${spaceId}`}>{t("actions.backToSpace")}</Link>
        </div>
      </div>
    );
  }

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  const showStatusCard = !!(sid || submissionId || editingSubmissionId || liveStatus);
  const effectiveStatus = normalizeStatus(liveStatus ?? (editingSubmissionId ? "draft" : sid ? "submitted" : ""));
  const theme = statusTheme(effectiveStatus);
  const lock = isLockedByTeacher();

  const mainTitle = String(assignment?.title ?? lesson.title ?? t("fallback.title") ?? "Oppgave").trim();
  const metaLine = [assignment?.level ?? lesson.level, assignment?.language ?? lesson.language, assignment?.topic ?? lesson.topic]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  const currentStatus = normalizeStatus(liveStatus ?? "");

  const isNeedsWorkStatus = currentStatus === "needs_work";
  const isSubmittedStatus = currentStatus === "submitted";
  const isApprovedLikeStatus = currentStatus === "reviewed" || currentStatus === "approved";

  const canResubmit = isNeedsWorkStatus;

  const showDraftButton =
    !isReadingTest &&
    !isApprovedLikeStatus &&
    !isSubmittedStatus;

  const showSubmitButton =
    !isApprovedLikeStatus &&
    (!isReadingTest || readingTestStarted) &&
    (!isSubmittedStatus || isNeedsWorkStatus);

  const submitLabel = submitting
    ? t("actions.saving")
    : canResubmit
      ? t("actions.resubmit")
      : isReadingTest
        ? "Lever test"
        : t("actions.submit");

  const submitDisabled =
    submitting ||
    lock ||
    !uid ||
    (isReadingTest && !readingTestStarted) ||
    (isReadingTest && readingTestFinished);

  const showGeometryAutoTop =
    isGeometryAssignment &&
    !!liveGeometryAuto &&
    (
      submitted ||
      effectiveStatus === "submitted" ||
      effectiveStatus === "reviewed" ||
      effectiveStatus === "approved" ||
      effectiveStatus === "needs_work"
    );

  function SubmitButton({ fullWidth }: { fullWidth?: boolean }) {
    if (!showSubmitButton) return null;

    return (
      <button
        type="button"
        onClick={() => submitToSpace("manual")}
        disabled={submitDisabled}
        style={{
          ...(submitDisabled ? primarySubmitStyleDisabled : primarySubmitStyle),
          width: fullWidth ? "100%" : undefined,
        }}
      >
        {submitLabel}
      </button>
    );
  }

  function DraftButton() {
    if (!showDraftButton) return null;

    const disabled = draftSaving || submitting || lock || !uid;

    return (
      <button
        type="button"
        onClick={() => saveDraft(true)}
        disabled={disabled}
        style={{
          ...btnStyle,
          background: disabled ? "rgba(255,255,255,0.85)" : "white",
          fontWeight: 900,
        }}
        title="Lagrer uten å sende til lærer"
      >
        {draftSaving ? "Lagrer kladd..." : "Lagre kladd"}
      </button>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{mainTitle}</h1>
          {metaLine ? <div style={{ marginTop: 4, opacity: 0.75 }}>{metaLine}</div> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!isReadingTest && !isGeometryAssignment && (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 800 }}>{t("translate.targetLang")}</span>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  style={{ ...btnStyle, padding: "8px 10px" }}
                >
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={onTranslateText}
                disabled={translating != null || !sourceTextSafe.trim()}
                style={{ ...btnStyle, opacity: translating != null ? 0.7 : 1 }}
              >
                {translating === "text" ? t("translate.working") : t("translate.text")}
              </button>

              <button
                type="button"
                onClick={onTranslateTasks}
                disabled={translating != null || tasksOriginal.length === 0}
                style={{ ...btnStyle, opacity: translating != null ? 0.7 : 1 }}
              >
                {translating === "tasks" ? t("translate.working") : t("translate.tasks")}
              </button>
            </>
          )}

          <DraftButton />
          {!isReadingTest ? <SubmitButton /> : null}
        </div>
      </header>

      {translateErr ? (
        <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{translateErr}</div>
      ) : null}

      {imageUrl ? (
        <div
          style={{
            marginTop: 14,
            maxHeight: 340,
            overflow: "hidden",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.10)",
          }}
        >
          <SmartImage src={imageUrl} alt={mainTitle || "Cover"} />
        </div>
      ) : null}

      {showStatusCard ? (
        <section
          style={{
            marginTop: 16,
            border: `1px solid ${theme.border}`,
            background: theme.bg,
            borderRadius: 14,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{t("status.title")}</strong>
              <Badge
                text={statusLabel(effectiveStatus)}
                kind={effectiveStatus === "needs_work" ? "warn" : "neutral"}
              />
              {!isGeometryAssignment ? (
                <AutoGradeBadge
                  auto={liveAuto}
                  labelAuto={t("autograde.label")}
                  labelDetails={(s) => t("autograde.details", { s })}
                />
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusToggleButton
                active={effectiveStatus === "needs_work"}
                label={t("status.needsWork")}
                kind="warn"
                title={statusDesc("needs_work")}
              />
              <StatusToggleButton
                active={effectiveStatus === "reviewed" || effectiveStatus === "approved"}
                label={t("status.approved")}
                kind="good"
                title={statusDesc("approved")}
              />
            </div>
          </div>

          <div style={{ marginTop: 8, opacity: 0.8 }}>{statusDesc(effectiveStatus)}</div>

          {showGeometryAutoTop ? (
            <div style={{ marginTop: 12 }}>
              <GeometryAutoCheckSummary
                auto={liveGeometryAuto}
                t={tGeometryAny}
              />
            </div>
          ) : null}

          {liveTeacherText ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 900 }}>{t("teacherFeedback.title")}</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{liveTeacherText}</div>
              {liveTeacherUpdatedAt ? (
                <div style={{ marginTop: 6, opacity: 0.7 }}>
                  {t("teacherFeedback.updatedAt", { at: liveTeacherUpdatedAt })}
                </div>
              ) : null}
            </div>
          ) : null}

          {liveUpdatedAt ? (
            <div style={{ marginTop: 10, opacity: 0.7 }}>{t("submission.updatedAt", { at: liveUpdatedAt })}</div>
          ) : null}

          {lock ? <div style={{ marginTop: 10, fontWeight: 800 }}>{t("messages.lockedByTeacher")}</div> : null}
        </section>
      ) : null}

      {!isReadingTest && !isGeometryAssignment && (
        <section style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>{t("text.title")}</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => setShowTextTranslation((v) => !v)} style={btnStyle}>
                {showTextTranslation ? t("translate.hide") : t("translate.show")}
              </button>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 800 }}>{t("tts.speed")}</span>
                <select
                  value={String(playbackRate)}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  style={{ ...btnStyle, padding: "8px 10px" }}
                >
                  {[0.75, 1.0, 1.25, 1.5].map((r) => (
                    <option key={r} value={String(r)}>
                      {r}x
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => playTTS(sourceTextSafe, originalLangForTTS, "original")}
                disabled={!sourceTextSafe.trim() || ttsBusy != null}
                style={btnStyle}
              >
                {ttsBusy === "original" ? t("tts.working") : t("tts.playOriginal")}
              </button>

              <button
                type="button"
                onClick={() => playTTS(String(translatedText ?? ""), translationLangForTTS, "translation")}
                disabled={!String(translatedText ?? "").trim() || ttsBusy != null}
                style={btnStyle}
              >
                {ttsBusy === "translation" ? t("tts.working") : t("tts.playTranslation")}
              </button>

              <button type="button" onClick={stopAudio} disabled={!audioRef.current} style={btnStyle}>
                {t("tts.stop")}
              </button>
            </div>
          </div>

          {ttsErr ? <div style={{ marginTop: 8, color: "crimson", whiteSpace: "pre-wrap" }}>{ttsErr}</div> : null}

          {audioRef.current ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button type="button" onClick={isPlaying ? pauseAudio : resumeAudio} style={btnStyle}>
                {isPlaying ? t("tts.pause") : t("tts.resume")}
              </button>
              <button type="button" onClick={prevSentence} style={btnStyle}>
                {t("tts.prev")}
              </button>
              <button type="button" onClick={replaySentence} style={btnStyle}>
                {t("tts.replay")}
              </button>
              <button type="button" onClick={nextSentence} style={btnStyle}>
                {t("tts.next")}
              </button>

              <div style={{ opacity: 0.75 }}>
                {t("tts.time", { cur: Math.round(currentTime), dur: Math.round(duration) })}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("text.original")}</div>
              <div
                style={{
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "white",
                }}
              >
                {renderFollowText("original", originalSegs, sourceTextSafe)}
              </div>
            </div>

            {showTextTranslation ? (
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("text.translation")}</div>
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                  }}
                >
                  {renderFollowText("translation", translationSegs, String(translatedText ?? ""))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section style={{ marginTop: 18 }}>
        {isReadingTest ? (
          <>
            {!readingTestStarted && !submitted && !lock ? (
              <div
                style={{
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 16,
                  background: "white",
                  padding: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900 }}>Lesetest</div>
                <div style={{ lineHeight: 1.6, opacity: 0.85 }}>
                  Teksten blir synlig når du starter testen. Når tiden er ute, blir svaret sendt automatisk til læreren.
                </div>

                {readingTestTotalSeconds != null ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Badge text={`Tid: ${formatSeconds(readingTestTotalSeconds)}`} kind="neutral" />
                    <Badge text="Tekst vises etter start" kind="neutral" />
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Badge text="Ingen tidtaker" kind="neutral" />
                    <Badge text="Tekst vises etter start" kind="neutral" />
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={startReadingTest}
                    disabled={submitting || !uid}
                    style={submitting || !uid ? primarySubmitStyleDisabled : primarySubmitStyle}
                  >
                    Start test
                  </button>

                  <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none", alignSelf: "center" }}>
                    {t("actions.backToSpace")}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {readingTestStarted && !readingTestFinished && (
                  <div
                    style={{
                      marginBottom: 12,
                      border: `1px solid ${readingTimerIsRed ? "rgba(220,38,38,0.35)" : "rgba(37,99,235,0.25)"}`,
                      background: readingTimerIsRed ? "rgba(254,242,242,1)" : "rgba(239,246,255,1)",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {readingTestRuntimeActive ? "Testen er i gang" : "Testen er startet"}
                      </div>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 18,
                          color: readingTimerIsRed ? "rgba(220,38,38,1)" : "rgba(30,64,175,1)",
                        }}
                      >
                        {readingTestSecondsLeft != null ? formatSeconds(readingTestSecondsLeft) : "Fri tid"}
                      </div>
                    </div>

                    {readingTestSecondsLeft != null && (
                      <div
                        style={{
                          width: "100%",
                          height: 12,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.9)",
                          overflow: "hidden",
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      >
                        <div
                          style={{
                            width: `${readingProgressPercent}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: readingTimerIsRed ? "rgba(220,38,38,1)" : "rgba(37,99,235,1)",
                            transition: "width 1s linear, background 120ms ease",
                          }}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 8, opacity: 0.8, lineHeight: 1.45 }}>
                      Når tiden er ute, blir testen sendt automatisk til læreren.
                    </div>
                  </div>
                )}

                <ReadingTestPlayer
                  title={mainTitle}
                  sourceText={sourceTextSafe}
                  tasks={tasksOriginal as ReadingLessonTask[]}
                  readingTestConfig={readingPlayerConfig}
                  initialAnswers={answers}
                  onAnswersChange={setAnswers}
                  disabled={lock || submitted || readingTestFinished}
                />

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {!readingTestFinished ? <SubmitButton /> : null}
                  <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
                    {t("actions.backToSpace")}
                  </Link>
                </div>
              </>
            )}
          </>
        ) : isGeometryAssignment && geometryWorksheet ? (
          <div style={{ display: "grid", gap: 16 }}>
            <GeometryWorksheetPracticeView
              worksheet={geometryWorksheet}
              t={tGeometryAny}
              tBrand={tBrandAny}
              answersByTaskId={answers as GeometryAnswersByTaskId}
              onAnswerChange={(taskId, patch) => {
                if (lock || submitted) return;

                setAnswers((prev) => {
                  const current =
                    prev[taskId] && typeof prev[taskId] === "object"
                      ? (prev[taskId] as Record<string, unknown>)
                      : { taskId };

                  return {
                    ...prev,
                    [taskId]: {
                      ...current,
                      ...patch,
                    },
                  };
                });
              }}
              showExpectedAnswers={false}
              showIdentityFields={false}
              showFigureMeta={true}
              includeHints={true}
              auto={liveGeometryAuto}
  showInlineFeedback={showGeometryAutoTop}
            />

            {showGeometryAutoTop ? (
              <GeometryAutoCheckTaskList
                worksheet={geometryWorksheet}
                auto={liveGeometryAuto}
                answersByTaskId={answers as GeometryAnswersByTaskId}
                t={tGeometryAny}
              />
            ) : null}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>{t("tasks.title")}</h2>

              <button
                type="button"
                onClick={() => setShowTaskTranslations((v) => !v)}
                style={btnStyle}
              >
                {showTaskTranslations ? t("translate.hide") : t("translate.show")}
              </button>
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
              {tasksOriginal.length === 0 ? (
                <div style={{ opacity: 0.75 }}>{t("tasks.none")}</div>
              ) : (
                tasksOriginal.map((tk, idx) => renderTask(tk, idx))
              )}
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        {msg ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 12,
              background: "rgba(0,0,0,0.04)",
            }}
          >
            {msg}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <DraftButton />
          {!isReadingTest ? <SubmitButton /> : null}

          <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
            {t("actions.backToSpace")}
          </Link>
        </div>
      </section>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  cursor: "pointer",
};

const primarySubmitStyle: React.CSSProperties = {
  ...btnStyle,
  background: "rgba(16,185,129,1)",
  border: "1px solid rgba(16,185,129,1)",
  color: "white",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: 900,
  fontSize: 15,
};

const primarySubmitStyleDisabled: React.CSSProperties = {
  ...primarySubmitStyle,
  opacity: 0.65,
  cursor: "not-allowed",
};