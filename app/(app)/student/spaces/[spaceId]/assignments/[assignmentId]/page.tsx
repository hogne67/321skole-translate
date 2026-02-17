// app/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { SearchableSelect } from "@/components/SearchableSelect";
import { LANGUAGES } from "@/lib/languages";
import { onAuthStateChanged, type User } from "firebase/auth";

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

  // ✅ for UI/visning (og for å holde type i sync med lagring)
  title?: string | null;

  teacherFeedback?: TeacherFeedback | null;
  updatedAt?: unknown;
  createdAt?: unknown;
  answers?: AnswersMap | unknown;

  // ✅ saved auto-grading
  auto?: AutoGrade | unknown;
};

/* =========================
   Helpers
========================= */

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

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
  const promptPart =
    typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function toTtsLang(lang: string): TtsLang {
  const v = (lang || "").toLowerCase().trim();
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
  if (v === "en") return "en";
  return "no";
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
    throw new Error(
      `Translate API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`
    );
  }

  const d = data as {
    error?: unknown;
    translatedText?: unknown;
    translation?: unknown;
    text?: unknown;
  };
  if (d?.error)
    throw new Error(
      `Translate API error (HTTP ${res.status}): ${String(d.error)}`
    );
  if (!res.ok)
    throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);

  const out = String(d?.translatedText ?? d?.translation ?? d?.text ?? "").trim();
  if (!out) throw new Error("Translate returned empty");
  return out;
}

/* ---- Auth helpers ---- */

async function waitForUser(): Promise<User> {
  const current = auth.currentUser;
  if (current) return current;

  return await new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      if (u) resolve(u);
      else
        reject(
          new Error("Kunne ikke bekrefte innlogging (auth.currentUser er null).")
        );
    });
  });
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

  tasks.forEach((t, idx) => {
    const stableId = getStableTaskId(t, idx);
    const type = String(t?.type ?? "open").toLowerCase();

    if (type !== "mcq" && type !== "truefalse") return;

    totalAuto += 1;

    const student = answersMap[stableId];
    const correct = t?.correctAnswer;

    if (type === "mcq") {
      const s = normalizeMcq(student);
      const c = normalizeMcq(correct);

      if (s == null) {
        unansweredAuto += 1;
        byTask[stableId] = { type: "mcq", isCorrect: false, studentAnswer: student, correctAnswer: correct };
        return;
      }

      const isCorrect = c != null && s === c;
      if (isCorrect) correctAuto += 1;
      else wrongAuto += 1;

      byTask[stableId] = { type: "mcq", isCorrect, studentAnswer: student, correctAnswer: correct };
      return;
    }

    // truefalse
    const sB = normalizeBool(student);
    const cB = normalizeBool(correct);

    if (sB == null) {
      unansweredAuto += 1;
      byTask[stableId] = { type: "truefalse", isCorrect: false, studentAnswer: student, correctAnswer: correct };
      return;
    }

    const isCorrect = cB != null && sB === cB;
    if (isCorrect) correctAuto += 1;
    else wrongAuto += 1;

    byTask[stableId] = { type: "truefalse", isCorrect, studentAnswer: student, correctAnswer: correct };
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

/* ---- Text follow ---- */

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

function fmtTime(sec: number) {
  if (!sec || !isFinite(sec)) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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

function statusLabel(s: SubmissionStatus) {
  const v = normalizeStatus(s);
  if (v === "needs_work") return "Needs work";
  if (v === "reviewed" || v === "approved") return "Approved";
  if (v === "submitted") return "Sent";
  return v;
}

function statusDesc(s: SubmissionStatus) {
  const v = normalizeStatus(s);
  if (v === "needs_work") return "Lærer har bedt deg forbedre besvarelsen og levere på nytt.";
  if (v === "reviewed" || v === "approved") return "Lærer har godkjent innleveringen. Den kan ikke endres nå.";
  if (v === "submitted") return "Innleveringen er sendt og venter på lærer.";
  return "Status oppdatert.";
}

function statusTheme(s: SubmissionStatus): { border: string; bg: string } {
  const v = normalizeStatus(s);
  if (v === "needs_work") return { border: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.10)" };
  if (v === "reviewed" || v === "approved") return { border: "rgba(46,204,113,0.45)", bg: "rgba(46,204,113,0.10)" };
  return { border: "rgba(0,0,0,0.14)", bg: "rgba(0,0,0,0.02)" };
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

function AutoGradeBadge({ auto }: { auto: AutoGrade | null }) {
  if (!auto) return null;

  const pct = auto.percentAuto;
  const main = `Auto: ${auto.correctAuto}/${auto.totalAuto}${pct != null ? ` (${pct}%)` : ""}`;

  const kind =
    pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";

  const details = `Riktig: ${auto.correctAuto} · Feil: ${auto.wrongAuto} · Ikke besvart: ${auto.unansweredAuto}`;

  return <Badge text={main} kind={kind} title={details} />;
}

function StatusToggleButton({
  active,
  label,
  kind,
}: {
  active: boolean;
  label: string;
  kind: "warn" | "good";
}) {
  const bg = active
    ? kind === "good"
      ? "rgba(46,204,113,0.18)"
      : "rgba(245,158,11,0.16)"
    : "white";
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
      title="Dette settes av lærer"
    >
      {label}
    </button>
  );
}

/* =========================
   Page
========================= */

export default function StudentAssignmentPage() {
  const router = useRouter();
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

  // ✅ auto grade from live doc
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
    (translatedTasks ?? []).forEach((t) => m.set(t.stableId, t));
    return m;
  }, [translatedTasks]);

  const sourceTextSafe = useMemo(() => {
    const t = (lesson?.sourceText ?? lesson?.text ?? "").toString();
    return t;
  }, [lesson?.sourceText, lesson?.text]);

  const imageUrl = useMemo(() => {
    const u = (lesson?.coverImageUrl ?? "").toString().trim();
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
      setTtsErr(typeof m === "string" ? m : "TTS failed");
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

      const t = a.currentTime;
      const ratio = Math.max(0, Math.min(1, t / d));

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

  /* =========================
     Load assignment + lesson
  ========================= */

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!spaceId || !assignmentId) {
          setErr("Mangler spaceId/assignmentId i URL.");
          return;
        }

        let user: User;
        try {
          user = await waitForUser();
        } catch {
          user = await ensureAnonymousUser();
        }
        if (!alive) return;

        setUid(user.uid);
        setIsAnon(!!user.isAnonymous);

        const memberId = `${spaceId}_${user.uid}`;
        const memberSnap = await getDoc(doc(db, "spaceMembers", memberId));
        if (!memberSnap.exists()) {
          throw new Error("Du er ikke registrert som medlem i denne klassen. Gå tilbake og trykk Join.");
        }

        const aSnap = await getDoc(doc(db, "spaces", spaceId, "lessons", assignmentId));
        if (!alive) return;

        if (!aSnap.exists()) {
          setErr("Fant ikke oppgaven i klassen.");
          setLesson(null);
          setAssignment(null);
          return;
        }

        const aDoc = (aSnap.data() as AssignmentDoc) ?? {};
        setAssignment(aDoc);

        const srcType = (aDoc.sourceType ?? "library") as SourceType;
        const srcId = String(aDoc.sourceId ?? "").trim();

        if (!srcId) {
          setErr("Oppgaven mangler innhold (sourceId).");
          setLesson(null);
          return;
        }

        const lSnap =
          srcType === "library"
            ? await getDoc(doc(db, "published_lessons", srcId))
            : await getDoc(doc(db, "lessons", srcId));

        if (!alive) return;

        if (!lSnap.exists()) {
          setErr("Fant ikke oppgaveteksten (kilden finnes ikke).");
          setLesson(null);
          return;
        }

        const d = lSnap.data() as Lesson;

        if (srcType === "library") {
          const isInactive = d?.isActive === false;
          const isArchived = typeof d?.status === "string" && d.status.toLowerCase() === "archived";
          if (isInactive || isArchived) {
            setErr("Denne oppgaven er avpublisert/arkivert.");
            setLesson(null);
            return;
          }
        }

        setLesson(d);

        // reset translation / audio
        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);
        setTaskTranslationOpen({});
        setTtsErr(null);
        setTtsBusy(null);
        stopAudio();

        // reset submit state
        setSubmitted(false);
        setSubmissionId(null);
        setMsg(null);
        setAnswers({});

        // reset live feedback
        setLiveStatus(null);
        setLiveTeacherText(null);
        setLiveTeacherUpdatedAt(null);
        setLiveUpdatedAt(null);
        setLiveAuto(null);

        // sid preload (optional)
        if (sid) {
          const sRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", sid);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const sd = (sSnap.data() as SubmissionDoc) ?? {};
            const owner = typeof sd.uid === "string" ? sd.uid : null;
            if (owner && owner !== user.uid) throw new Error("Du har ikke tilgang til denne innleveringen.");

            const sStatus = normalizeStatus(sd.status);
            setLiveStatus(sStatus);
            setLiveTeacherText(sd.teacherFeedback?.text ? String(sd.teacherFeedback.text).trim() : null);
            setLiveTeacherUpdatedAt(toDateString(sd.teacherFeedback?.updatedAt) ?? null);
            setLiveUpdatedAt(toDateString(sd.updatedAt) ?? null);
            setLiveAuto(readAutoGrade(sd));

            if (sStatus === "needs_work") {
              const a = sd.answers as unknown;
              const nextAnswers = a && typeof a === "object" && !Array.isArray(a) ? (a as AnswersMap) : {};
              setAnswers(nextAnswers);
              setEditingSubmissionId(sid);
            } else {
              setEditingSubmissionId(null);
            }
          } else {
            setMsg("Fant ikke innleveringen du prøver å åpne.");
            setEditingSubmissionId(null);
          }
        } else {
          setEditingSubmissionId(null);
        }
      } catch (e: unknown) {
        if (!alive) return;

        if (isPermissionDenied(e)) {
          setErr("Missing or insufficient permissions.");
        } else {
          const m = (e as { message?: unknown })?.message;
          setErr(typeof m === "string" ? m : "Noe gikk galt");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };

  }, [spaceId, assignmentId, sid]);

  /* =========================
     Live listener for status/teacherFeedback/auto
  ========================= */

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

        if (sStatus === "needs_work") {
          setEditingSubmissionId(activeSubId);
        } else if (activeSubId === sid) {
          setEditingSubmissionId(null);
        }
      },
      () => {}
    );

    return () => unsub();
  }, [spaceId, assignmentId, uid, sid, submissionId, editingSubmissionId]);

  /* =========================
     Translate
  ========================= */

  useEffect(() => {
    setTranslateErr(null);
  }, [targetLang]);

  async function onTranslateText() {
    const base = (lesson?.sourceText ?? lesson?.text ?? "").toString();
    if (!base.trim()) return;

    setTranslateErr(null);
    setTranslating("text");

    try {
      const out = await translateOne(base, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : "Translate failed");
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
        const t = sorted[i];
        const stableId = getStableTaskId(t, i);

        const promptOrig = typeof t?.prompt === "string" ? t.prompt : "";
        const optionsOrig = Array.isArray(t?.options) ? t.options : [];

        let translatedPrompt = "";
        if (promptOrig) {
          try {
            translatedPrompt = await translateOne(promptOrig, targetLang);
          } catch (e: unknown) {
            const m = (e as { message?: unknown })?.message;
            setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : "Translate failed"));
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
                setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : "Translate failed"));
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
      setTranslateErr(typeof m === "string" ? m : "Translate failed");
    } finally {
      setTranslating(null);
    }
  }

  /* =========================
     Submit
  ========================= */

  function buildSubmissionId(currentUid: string) {
    if (editingSubmissionId) return editingSubmissionId;
    return `${spaceId}_${assignmentId}_${currentUid}`;
  }

  function isLockedByTeacher(): boolean {
    const s = normalizeStatus(liveStatus ?? "submitted");
    return s === "reviewed" || s === "approved";
  }

  async function submitToSpace() {
    if (!spaceId || !assignmentId || !uid) return;
    if (submitted) return;

    if ((sid || editingSubmissionId) && editingSubmissionId == null) {
      setErr(null);
      setMsg("Denne innleveringen kan ikke endres nå (status er ikke needs_work).");
      return;
    }

    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      const subId = buildSubmissionId(uid);

      const nestedRef = doc(db, "spaces", spaceId, "lessons", assignmentId, "submissions", subId);
      const indexRef = doc(db, "spaceSubmissions", subId);

      // ✅ compute auto grade from current answers + tasks
      const auto = computeAutoGrade(tasksOriginal, answers);

      const basePayload: Record<string, unknown> = {
        spaceId,
        assignmentId,
        sourceType: assignment?.sourceType ?? null,
        sourceId: assignment?.sourceId ?? null,

        // ✅ Denormalisert metadata for rask listing
        title: assignment?.title ?? lesson?.title ?? null,
        level: assignment?.level ?? lesson?.level ?? null,
        language: assignment?.language ?? lesson?.language ?? null,

        uid,
        isAnon,
        status: "submitted",
        answers,

        // ✅ auto grading saved for teacher + student to see same
        auto,

        updatedAt: serverTimestamp(),
        auth: { isAnon, uid },
      };

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
      setMsg(editingSubmissionId ? "Oppdatert og levert på nytt ✅" : "Takk! Innleveringen er sendt ✅");
      setLiveStatus("submitted");
      setLiveAuto(auto);
    } catch (e: unknown) {
      if (isPermissionDenied(e)) {
        setErr("Missing or insufficient permissions.");
      } else {
        const m = (e as { message?: unknown })?.message;
        setErr(typeof m === "string" ? m : "Could not submit");
      }
      setSubmitted(false);
      setSubmissionId(null);
    } finally {
      setSaving(false);
    }
  }

  /* =========================
     UI
  ========================= */

  const renderFollowText = (mode: "original" | "translation", segs: SentenceSeg[], fallbackText: string) => {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>No text</span>;

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
              title={audioRef.current ? "Klikk for å hoppe i lyden" : undefined}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>

        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
            ← Tilbake til Mine klasser
          </Link>
          <Link href="/join" style={{ textDecoration: "none" }}>
            ← Join
          </Link>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <div>Ingen data.</div>
        <div style={{ marginTop: 12 }}>
          <Link href={`/student/spaces/${spaceId}`}>← Tilbake til Mine klasser</Link>
        </div>
      </div>
    );
  }

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  const showStatusCard = !!(sid || submissionId || editingSubmissionId || liveStatus);
  const effectiveStatus = normalizeStatus(
    liveStatus ?? (editingSubmissionId ? "needs_work" : sid ? "submitted" : "submitted")
  );
  const theme = statusTheme(effectiveStatus);
  const lock = isLockedByTeacher();

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: "100%" }}>
          <h1 style={{ margin: "0 0 6px" }}>{lesson.title ?? assignment?.title ?? "Lesson"}</h1>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={btnStyle} onClick={() => router.push(`/student/spaces/${spaceId}`)}>
              ← Tilbake til klassen
            </button>
            <button type="button" style={btnStyle} onClick={() => router.back()} title="Gå tilbake til forrige side">
              ← Forrige side
            </button>
          </div>
        </div>
      </header>

      {msg ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12 }}>
          {msg}
        </div>
      ) : null}

      {/* STATUS + TEACHER FEEDBACK CARD */}
      {showStatusCard ? (
        <section
          style={{
            marginTop: 12,
            padding: 12,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            background: theme.bg,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Pill
                    text={`Status: ${statusLabel(effectiveStatus)}`}
                    kind={
                        effectiveStatus === "needs_work"
                        ? "bad"
                        : effectiveStatus === "reviewed" || effectiveStatus === "approved"
                        ? "good"
                        : "neutral"
                    }
                    />
                    <span style={{ opacity: 0.8, fontSize: 13 }}>{statusDesc(effectiveStatus)}</span>

                    {/* ✅ Auto score badge */}
                    <AutoGradeBadge auto={liveAuto} />
                </div>

                {/* ✅ Mini-UX forklaring */}
                {liveAuto?.totalAuto ? (
                    <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
                    Flervalg og true/false blir rettet automatisk når du leverer. Åpne svar vurderes av lærer.
                    </div>
                ) : (
                    <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
                    Åpne svar vurderes av lærer.
                    </div>
                )}
                </div>
              

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, opacity: 0.75 }}>
                {liveUpdatedAt ? <span>Oppdatert: {liveUpdatedAt}</span> : null}
                {liveTeacherUpdatedAt ? <span>• Lærerkommentar: {liveTeacherUpdatedAt}</span> : null}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <StatusToggleButton active={effectiveStatus === "needs_work"} label="Needs work" kind="warn" />
              <StatusToggleButton
                active={effectiveStatus === "reviewed" || effectiveStatus === "approved"}
                label="Approved"
                kind="good"
              />
            </div>
          </div>

          {liveTeacherText ? (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "white",
                whiteSpace: "pre-wrap",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Kommentar fra lærer</div>
              {liveTeacherText}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Ingen kommentar enda{effectiveStatus === "submitted" ? " (venter på lærer)." : "."}
            </div>
          )}

          {lock ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Denne innleveringen kan ikke endres nå (status er ikke needs_work).
            </div>
          ) : null}
        </section>
      ) : null}

      {/* IMAGE */}
      <section style={{ marginTop: 14 }}>
        <h2 style={{ marginBottom: 8 }}>Image</h2>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 12,
              border: "1px dashed rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "white",
            }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Lesson" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ textAlign: "center", padding: 16, opacity: 0.7 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No image</div>
                <div style={{ fontSize: 13 }}>This lesson has no cover image.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ACTIONS + TRANSLATE */}
      <section style={{ marginTop: 18, padding: 12, border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={submitToSpace}
            disabled={saving || !uid || submitted || (lock && !!(sid || editingSubmissionId))}
            style={{
              ...btnStyle,
              background:
                effectiveStatus === "needs_work"
                  ? "rgba(245,158,11,0.14)"
                  : submitted
                  ? "rgba(46, 204, 113, 0.18)"
                  : "#bef7c0",
              borderColor: submitted ? "rgba(0,0,0,0.16)" : "#2563eb",
              color: "black",
              fontWeight: 800,
              opacity: saving ? 0.6 : 1,
              cursor: submitted ? "default" : "pointer",
            }}
            title={isAnon ? "Anon kan også sende inn (via anonymous auth)" : "Submit"}
          >
            {saving
              ? "Submitting…"
              : submitted
              ? "Submitted ✅"
              : editingSubmissionId || effectiveStatus === "needs_work"
              ? "RESUBMIT (Needs work)"
              : "SUBMIT TO SPACE"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.75 }}>Translate to</span>
            <SearchableSelect
              label=""
              value={targetLang}
              options={LANGUAGE_OPTIONS}
              onChange={setTargetLang}
              placeholder="Søk språk…"
            />
          </label>

          <button
            onClick={onTranslateText}
            disabled={translating === "text" || !(sourceTextSafe || "").trim()}
            style={{ ...btnStyle, opacity: translating === "text" ? 0.6 : 1 }}
          >
            {translating === "text" ? "Translating…" : "Translate text"}
          </button>

          <button
            onClick={onTranslateTasks}
            disabled={translating === "tasks" || tasksOriginal.length === 0}
            style={{ ...btnStyle, opacity: translating === "tasks" ? 0.6 : 1 }}
          >
            {translating === "tasks" ? "Translating…" : "Translate tasks"}
          </button>

          <button
            onClick={() => {
              setTranslatedText(null);
              setTranslatedTasks(null);
              setTranslateErr(null);
              setTaskTranslationOpen({});
              stopAudio();
              setTtsErr(null);
            }}
            style={btnStyle}
          >
            Reset translation
          </button>
        </div>

        {translateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{translateErr}</p> : null}
      </section>

      {/* TEXT */}
      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 8 }}>Text</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.75 }}>Speed</span>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
              />
              <span style={{ width: 46, textAlign: "right" }}>{playbackRate.toFixed(2)}x</span>
            </label>

            <button
              type="button"
              style={{ ...btnStyle, opacity: ttsBusy === "original" ? 0.6 : 1 }}
              disabled={ttsBusy !== null || !(sourceTextSafe || "").trim()}
              onClick={() => playTTS(sourceTextSafe || "", originalLangForTTS, "original")}
            >
              {ttsBusy === "original" ? "Generating…" : "🔊 Play original"}
            </button>

            <button type="button" style={btnStyle} onClick={stopAudio} disabled={!audioRef.current}>
              ⏹ Stop
            </button>

            {audioRef.current ? (
              <>
                <button type="button" style={btnStyle} onClick={isPlaying ? pauseAudio : resumeAudio}>
                  {isPlaying ? "⏸ Pause" : "▶️ Continue"}
                </button>
                <button type="button" style={btnStyle} onClick={replaySentence}>
                  ⟲ Replay sentence
                </button>
                <button type="button" style={btnStyle} onClick={prevSentence}>
                  ⟵ Prev
                </button>
                <button type="button" style={btnStyle} onClick={nextSentence}>
                  Next ⟶
                </button>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, opacity: 0.75, width: 48 }}>{fmtTime(currentTime)}</span>
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
                    style={{ width: 240 }}
                  />
                  <span style={{ fontSize: 12, opacity: 0.75, width: 48 }}>{fmtTime(duration)}</span>
                </div>
              </>
            ) : null}

            {translatedText ? (
              <button type="button" style={btnStyle} onClick={() => setShowTextTranslation((v) => !v)}>
                {showTextTranslation ? "Hide translation" : "Show translation"}
              </button>
            ) : null}

            {translatedText ? (
              <button
                type="button"
                style={{ ...btnStyle, opacity: ttsBusy === "translation" ? 0.6 : 1 }}
                disabled={ttsBusy !== null || !(translatedText || "").trim()}
                onClick={() => playTTS(translatedText || "", translationLangForTTS, "translation")}
              >
                {ttsBusy === "translation" ? "Generating…" : "🔊 Play translation"}
              </button>
            ) : null}
          </div>
        </div>

        {ttsErr ? <div style={{ marginTop: 8, color: "crimson" }}>{ttsErr}</div> : null}

        <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, lineHeight: 1.55 }}>
          {renderFollowText("original", originalSegs, (sourceTextSafe ?? "").trim())}
        </div>

        {translatedText && showTextTranslation ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              lineHeight: 1.55,
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Translated</div>
            {renderFollowText("translation", translationSegs, translatedText)}
          </div>
        ) : null}
      </section>

      {/* TASKS */}
      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Tasks</h2>

          {(translatedTasks ?? []).length > 0 ? (
            <button type="button" style={btnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
              {showTaskTranslations ? "Hide all translations" : "Show all translations"}
            </button>
          ) : (
            <span />
          )}
        </div>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>No tasks in this lesson.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            {tasksOriginal.map((t, idx) => {
              const stableId = getStableTaskId(t, idx);
              const tr = tMap.get(stableId);

              const type = String(t?.type ?? "open").toLowerCase();
              const prompt = String(t?.prompt ?? "");
              const options = Array.isArray(t?.options) ? (t.options as unknown[]) : [];
              const val = answers[stableId];

              const hasThisTranslation = !!tr?.translatedPrompt || (tr?.translatedOptions?.length ?? 0) > 0;
              const showThisTranslation = hasThisTranslation ? isTaskTranslationVisible(stableId) : false;

              const inputsDisabled = submitted || lock;

              // ✅ show auto mark per task if present in liveAuto
              const entry = liveAuto?.byTask?.[stableId];
              const showAutoMark = !!entry && (type === "mcq" || type === "truefalse");

              return (
                <div key={stableId} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 8,
                      opacity: 0.85,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9, alignItems: "center" }}>
                      <span>Task {t?.order ?? idx + 1}</span>
                      <span>• {type}</span>

                      {showAutoMark ? (
                        entry?.isCorrect ? (
                          <Badge text="Auto: ✅ riktig" kind="good" />
                        ) : (
                          <Badge
                            text={val == null ? "Auto: ⏳ ikke besvart" : "Auto: ❌ feil"}
                            kind={val == null ? "neutral" : "bad"}
                          />
                        )
                      ) : null}

                      {lock ? (
                        <span style={{ marginLeft: 6 }}>
                          <Pill text="Locked" />
                        </span>
                      ) : null}
                    </div>

                    {hasThisTranslation ? (
                      <button type="button" style={btnStyle} onClick={() => toggleTaskTranslation(stableId)}>
                        {showThisTranslation ? "Hide translation" : "Show translation"}
                      </button>
                    ) : null}
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10 }}>{prompt}</div>

                  {showThisTranslation && tr?.translatedPrompt ? (
                    <div
                      style={{
                        marginTop: -4,
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.10)",
                        background: "rgba(0,0,0,0.02)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Translated</div>
                      {tr.translatedPrompt}
                    </div>
                  ) : null}

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {options.map((o, i) => {
                        const opt = String(o);
                        const checked = val === opt;
                        const optT = tr?.translatedOptions?.[i] || "";

                        return (
                          <label
                            key={i}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                              padding: "8px 10px",
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: 10,
                              cursor: inputsDisabled ? "default" : "pointer",
                              background: "white",
                              opacity: inputsDisabled ? 0.9 : 1,
                            }}
                          >
                            <input
                              type="radio"
                              name={stableId}
                              checked={checked}
                              disabled={inputsDisabled}
                              onChange={() => setAnswer(stableId, opt)}
                              style={{ marginTop: 3 }}
                            />

                            <div style={{ width: "100%" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                <div>{opt}</div>
                                {checked ? <Pill text="Your answer" /> : null}
                              </div>

                              {showThisTranslation && optT ? (
                                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{optT}</div>
                              ) : null}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {type === "truefalse" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={inputsDisabled}
                        onClick={() => setAnswer(stableId, true)}
                        aria-pressed={val === true}
                        style={{
                          ...btnStyle,
                          borderColor: val === true ? "rgba(0,0,0,0.25)" : "#ddd",
                          background: val === true ? "rgba(0,0,0,0.08)" : "white",
                          color: "black",
                          fontWeight: val === true ? 700 : 500,
                          boxShadow: "none",
                          opacity: inputsDisabled ? 0.9 : 1,
                          cursor: inputsDisabled ? "default" : "pointer",
                        }}
                      >
                        True
                      </button>

                      <button
                        type="button"
                        disabled={inputsDisabled}
                        onClick={() => setAnswer(stableId, false)}
                        aria-pressed={val === false}
                        style={{
                          ...btnStyle,
                          borderColor: val === false ? "rgba(0,0,0,0.25)" : "#ddd",
                          background: val === false ? "rgba(0,0,0,0.08)" : "white",
                          color: "black",
                          fontWeight: val === false ? 700 : 500,
                          boxShadow: "none",
                          opacity: inputsDisabled ? 0.9 : 1,
                          cursor: inputsDisabled ? "default" : "pointer",
                        }}
                      >
                        False
                      </button>
                    </div>
                  ) : null}

                  {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                    <textarea
                      value={typeof val === "string" ? val : val == null ? "" : String(val)}
                      onChange={(e) => setAnswer(stableId, e.target.value)}
                      disabled={inputsDisabled}
                      placeholder="Write your answer…"
                      rows={4}
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.2)",
                        resize: "vertical",
                        opacity: inputsDisabled ? 0.95 : 1,
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
          ← Back to Mine klasser
        </Link>
      </section>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  cursor: "pointer",
};