// app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { LANGUAGES } from "@/lib/languages";
import Image from "next/image";

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

  // snapshot fields stored inside the room assignment
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
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

type SubmissionStatus = "draft" | "submitted" | "needs_work" | "reviewed" | "approved" | "rejected" | string;

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
  auto?: AutoGrade | unknown;
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
  return hasText || hasTasks || hasImage;
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
  };
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

/* ---- Auth helpers ---- */

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

/* ---- Auto grade helpers ---- */

function normalizeBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
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

    if (type !== "mcq" && type !== "truefalse") return;

    totalAuto += 1;

    const student = answersMap[stableId];
    const correct = t?.correctAnswer;

    if (type === "mcq") {
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
  return { totalAuto, correctAuto, wrongAuto, unansweredAuto, percentAuto, byTask };
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

/* ---- Text follow (sentence segments) ---- */

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
  return typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate?: unknown }).toDate === "function";
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
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return "submitted";
  return v as SubmissionStatus;
}

function statusTheme(s: SubmissionStatus): { border: string; bg: string } {
  const v = normalizeStatus(s);
  if (v === "needs_work") return { border: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.10)" };
  if (v === "reviewed" || v === "approved") return { border: "rgba(46,204,113,0.45)", bg: "rgba(46,204,113,0.10)" };
  if (v === "draft") return { border: "rgba(99,102,241,0.45)", bg: "rgba(99,102,241,0.08)" };
  return { border: "rgba(0,0,0,0.14)", bg: "rgba(0,0,0,0.02)" };
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
  const bg = active ? (kind === "good" ? "rgba(46,204,113,0.18)" : "rgba(245,158,11,0.16)") : "white";
  const border = active
    ? kind === "good"
      ? "rgba(46,204,113,0.55)"
      : "rgba(245,158,11,0.55)"
    : "rgba(0,0,0,0.14)";

  return (
    <button
      type="button"
      disabled
      aria-pressed={active}
      style={{
        ...btnStyle,
        cursor: "default",
        borderColor: border,
        background: bg,
        fontWeight: active ? 800 : 600,
        opacity: active ? 1 : 0.8,
      }}
      title={title}
    >
      {label}
    </button>
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
  const t = useTranslations("student.assignment");

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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [liveStatus, setLiveStatus] = useState<SubmissionStatus | null>(null);
  const [liveTeacherText, setLiveTeacherText] = useState<string | null>(null);
  const [liveTeacherUpdatedAt, setLiveTeacherUpdatedAt] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveAuto, setLiveAuto] = useState<AutoGrade | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);
  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
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

  const tasksOriginal = useMemo(
    () =>
      safeTasksArray(lesson?.tasks)
        .slice()
        .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999)),
    [lesson?.tasks]
  );

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((x) => m.set(x.stableId, x));
    return m;
  }, [translatedTasks]);

  const sourceTextSafe = useMemo(() => String(lesson?.sourceText ?? lesson?.text ?? ""), [lesson?.sourceText, lesson?.text]);

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
          };
        }

        setLesson(resolvedLesson);

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

        setLiveStatus(null);
        setLiveTeacherText(null);
        setLiveTeacherUpdatedAt(null);
        setLiveUpdatedAt(null);
        setLiveAuto(null);

        if (sid) {
          const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", sid);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const sd = (sSnap.data() as SubmissionDoc) ?? {};
            const owner = typeof sd.uid === "string" ? sd.uid : null;
            if (owner && owner !== user.uid) throw new Error(t("errors.noAccessSubmission"));

            const sStatus = normalizeStatus(sd.status);
            setLiveStatus(sStatus);
            setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
            setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
            setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);
            setLiveAuto(readAutoGrade(sd));

            if (sStatus === "needs_work" || sStatus === "draft") {
              const a = sd.answers as unknown;
              const nextAnswers = a && typeof a === "object" && !Array.isArray(a) ? (a as AnswersMap) : {};
              setAnswers(nextAnswers);
              setEditingSubmissionId(sid);
            } else {
              setEditingSubmissionId(null);
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

    // Helt normalt for ny oppgave:
    // det finnes ingen lagret kladd ennå.
    sSnap = null;
  }

  if (sSnap && sSnap.exists()) {
    const sd = (sSnap.data() as SubmissionDoc) ?? {};
    const owner = typeof sd.uid === "string" ? sd.uid : null;
    if (owner && owner !== user.uid) throw new Error(t("errors.noAccessSubmission"));

    const sStatus = normalizeStatus(sd.status);
    setLiveStatus(sStatus);
    setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
    setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
    setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);
    setLiveAuto(readAutoGrade(sd));

    if (sStatus === "draft" || sStatus === "needs_work") {
      const a = sd.answers as unknown;
      const nextAnswers = a && typeof a === "object" && !Array.isArray(a) ? (a as AnswersMap) : {};
      setAnswers(nextAnswers);
      setEditingSubmissionId(autoId);
    } else {
      setEditingSubmissionId(null);
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
  }, [spaceId, assignmentId, sid, t]);

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

        const tText = sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : "";
        setLiveTeacherText(tText ? tText : null);

        setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
        setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);

        setLiveAuto(readAutoGrade(sd));

        if (sStatus === "needs_work" || sStatus === "draft") setEditingSubmissionId(activeSubId);
        else if (activeSubId === sid) setEditingSubmissionId(null);
      },
      () => {}
    );

    return () => unsub();
  }, [spaceId, assignmentId, uid, sid, submissionId, editingSubmissionId]);

  useEffect(() => {
    setTranslateErr(null);
  }, [targetLang]);

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

  function buildSubmissionId(currentUid: string) {
    if (editingSubmissionId) return editingSubmissionId;
    return `${spaceId}_${assignmentId}_${currentUid}`;
  }

  function isLockedByTeacher(): boolean {
    const s = normalizeStatus(liveStatus ?? "submitted");
    return s === "reviewed" || s === "approved";
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

  async function saveDraft(manual = false) {
    if (!spaceId || !assignmentId || !uid) return;
    if (submitted) return;
    if (isLockedByTeacher()) return;

    setSaving(true);
    setErr(null);
    if (manual) setMsg(null);

    try {
      const subId = buildSubmissionId(uid);

      const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
      const indexRef = doc(db, "spaceSubmissions", subId);

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
  status: "draft",
  answers,
  auto: null,
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
setLiveStatus("draft");
setLiveAuto(null);

if (manual) setMsg("Kladd lagret.");
    } catch (e: unknown) {
      if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
      else {
        const m = (e as { message?: unknown })?.message;
        setErr(typeof m === "string" ? m : t("errors.submitFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  const lastAutoSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!uid || !spaceId || !assignmentId) return;
    if (submitted) return;
    if (isLockedByTeacher()) return;

    if (!answers || Object.keys(answers).length === 0) return;

    const now = Date.now();
    if (now - lastAutoSaveRef.current < 1200) return;

    const timer = window.setTimeout(() => {
      lastAutoSaveRef.current = Date.now();
      void saveDraft(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [answers, uid, spaceId, assignmentId, submitted, liveStatus]);

  async function submitToSpace() {
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

    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      const subId = buildSubmissionId(uid);

      const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
      const indexRef = doc(db, "spaceSubmissions", subId);

      const auto = computeAutoGrade(tasksOriginal, answers);

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
        answers,
        auto,
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
      setSubmitted(true);
      setMsg(editingSubmissionId ? t("messages.resubmitted") : t("messages.submitted"));
      setLiveStatus("submitted");
      setLiveAuto(auto);
    } catch (e: unknown) {
      if (isPermissionDenied(e)) setErr(t("errors.permissionDenied"));
      else {
        const m = (e as { message?: unknown })?.message;
        setErr(typeof m === "string" ? m : t("errors.submitFailed"));
      }
      setSubmitted(false);
      setSubmissionId(null);
    } finally {
      setSaving(false);
    }
  }

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
                  borderColor: isTrueSelected(stableId, true) ? "rgba(16,185,129,0.55)" : "rgba(0,0,0,0.16)",
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
                  borderColor: isTrueSelected(stableId, false) ? "rgba(16,185,129,0.55)" : "rgba(0,0,0,0.16)",
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
  const effectiveStatus = normalizeStatus(
    liveStatus ?? (editingSubmissionId ? "draft" : sid ? "submitted" : "submitted")
  );
  const theme = statusTheme(effectiveStatus);
  const lock = isLockedByTeacher();

  const mainTitle = String(assignment?.title ?? lesson.title ?? t("fallback.title") ?? "Oppgave").trim();
  const metaLine = [assignment?.level ?? lesson.level, assignment?.language ?? lesson.language, assignment?.topic ?? lesson.topic]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  const currentStatus = normalizeStatus(liveStatus ?? "");
const isRealResubmit = currentStatus === "needs_work" || currentStatus === "submitted";

const submitLabel = saving
  ? t("actions.saving")
  : isRealResubmit
    ? t("actions.resubmit")
    : t("actions.submit");
  const submitDisabled = saving || lock || !uid;

  function SubmitButton({ fullWidth }: { fullWidth?: boolean }) {
    return (
      <button
        type="button"
        onClick={submitToSpace}
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
    const disabled = saving || lock || !uid;
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
        Lagre kladd
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
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 800 }}>{t("translate.targetLang")}</span>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={{ ...btnStyle, padding: "8px 10px" }}>
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

          <DraftButton />
          <SubmitButton />
        </div>
      </header>

      {translateErr ? <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{translateErr}</div> : null}

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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{t("status.title")}</strong>
              <Badge text={statusLabel(effectiveStatus)} kind={effectiveStatus === "needs_work" ? "warn" : "neutral"} />
              <AutoGradeBadge auto={liveAuto} labelAuto={t("autograde.label")} labelDetails={(s) => t("autograde.details", { s })} />
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

          {liveTeacherText ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 900 }}>{t("teacherFeedback.title")}</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{liveTeacherText}</div>
              {liveTeacherUpdatedAt ? (
                <div style={{ marginTop: 6, opacity: 0.7 }}>{t("teacherFeedback.updatedAt", { at: liveTeacherUpdatedAt })}</div>
              ) : null}
            </div>
          ) : null}

          {liveUpdatedAt ? <div style={{ marginTop: 10, opacity: 0.7 }}>{t("submission.updatedAt", { at: liveUpdatedAt })}</div> : null}

          {lock ? <div style={{ marginTop: 10, fontWeight: 800 }}>{t("messages.lockedByTeacher")}</div> : null}
        </section>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("text.title")}</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => setShowTextTranslation((v) => !v)} style={btnStyle}>
              {showTextTranslation ? t("translate.hide") : t("translate.show")}
            </button>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>{t("tts.speed")}</span>
              <select value={String(playbackRate)} onChange={(e) => setPlaybackRate(Number(e.target.value))} style={{ ...btnStyle, padding: "8px 10px" }}>
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
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

            <div style={{ opacity: 0.75 }}>{t("tts.time", { cur: Math.round(currentTime), dur: Math.round(duration) })}</div>
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("text.original")}</div>
            <div style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12, background: "white" }}>
              {renderFollowText("original", originalSegs, sourceTextSafe)}
            </div>
          </div>

          {showTextTranslation ? (
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{t("text.translation")}</div>
              <div style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12, background: "white" }}>
                {renderFollowText("translation", translationSegs, String(translatedText ?? ""))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("tasks.title")}</h2>

          <button type="button" onClick={() => setShowTaskTranslations((v) => !v)} style={btnStyle}>
            {showTaskTranslations ? t("translate.hide") : t("translate.show")}
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {tasksOriginal.length === 0 ? <div style={{ opacity: 0.75 }}>{t("tasks.none")}</div> : tasksOriginal.map((tk, idx) => renderTask(tk, idx))}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        {msg ? <div style={{ marginBottom: 10, padding: 10, borderRadius: 12, background: "rgba(0,0,0,0.04)" }}>{msg}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <DraftButton />
          <SubmitButton />

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