"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import type { SpaceDoc } from "@/lib/spacesClient";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

type AssignmentDoc = {
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

type Task = {
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

type ParentReviewDoc = {
  uid?: string;
  comment?: string;
  stars?: number;
  updatedAt?: unknown;
};

type SubmissionDoc = {
  uid?: string;
  role?: string;
  answers?: Record<string, string | boolean>;
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

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

type TtsLang = "no" | "en" | "pt-BR";

type SentenceSeg = {
  text: string;
  startChar: number;
  endChar: number;
  startRatio: number;
  endRatio: number;
};

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
  return `${spaceId}_${assignmentId}_${uid}`;
}

function kindLabel(
  kind: string | null,
  t: ReturnType<typeof useTranslations<"parent.assignmentDetail">>
) {
  if (kind === "family") return t("kinds.family");
  if (kind === "parent_group") return t("kinds.parentGroup");
  return t("kinds.other");
}

function firstLongText(d: AssignmentDoc): string | null {
  const candidates = [
    d.sourceText,
    d.text,
    d.description,
    d.instructions,
    d.summary,
    d.subtitle,
  ];
  for (const c of candidates) {
    const s = safeString(c);
    if (s) return s;
  }
  return null;
}

function coerceTopics(a: AssignmentDoc): string[] {
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

function pickImageUrl(a: AssignmentDoc): string | null {
  const cover = safeString(a.coverImageUrl);
  if (cover) return cover;
  const img = safeString(a.imageUrl);
  if (img) return img;
  return null;
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

function sortTasksByOrder(a: Task, b: Task) {
  const ao = typeof a.order === "number" ? a.order : 999;
  const bo = typeof b.order === "number" ? b.order : 999;
  return ao - bo;
}

function getStableTaskId(t: Task, idx: number): string {
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

function taskPrompt(t: Task): string {
  return (
    safeString(t.prompt) ??
    safeString(t.question) ??
    safeString(t.text) ??
    safeString(t.sentence) ??
    ""
  );
}

function taskType(t: Task): "mcq" | "truefalse" | "open" {
  const raw = (safeString(t.type) ?? "open").toLowerCase();
  if (raw === "mcq" || raw === "multiplechoice" || raw === "multiple_choice") return "mcq";
  if (raw === "truefalse" || raw === "true_false" || raw === "boolean") return "truefalse";
  return "open";
}

function taskOptions(t: Task): string[] {
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

function looksLikeLibraryAssignment(a: AssignmentDoc | null): boolean {
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

function evaluateAnswers(tasks: Task[], answers: Record<string, string | boolean>) {
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
        typeof expectedRaw === "boolean"
          ? expectedRaw
          : normalizeAnswerString(expectedRaw) === "true";

      const actual =
        typeof answer === "boolean"
          ? answer
          : normalizeAnswerString(answer) === "true";

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

function renderAutoSummary(auto: SubmissionDoc["auto"]): string | null {
  if (!auto) return null;

  const score = safeNumber(auto.score);
  const maxScore = safeNumber(auto.maxScore);
  if (score !== null && maxScore !== null && maxScore > 0) return `${score} / ${maxScore}`;

  const correct = safeNumber(auto.correctCount);
  const total = safeNumber(auto.totalAutoGraded);
  if (correct !== null && total !== null && total > 0) return `${correct} / ${total}`;

  return null;
}

function starsLabel(value: number) {
  return value === 1 ? "1 stjerne" : `${value} stjerner`;
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
  if (!out) throw new Error("Translate returned empty");

  return out;
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

function buildAutoResultatForParent(
  assignmentObj: AssignmentDoc,
  answersObj: Record<string, string | boolean>
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
          `- Oppgave ${order} (MCQ): "${prompt}" | Svar: "${String(val)}" | Fasit: "${String(mcqCorrectText)}"`
        );
      } else {
        wrongLines.push(
          `- Oppgave ${order} (True/False): "${prompt}" | Svar: ${String(val)} | Fasit: ${String(tfCorrectBool)}`
        );
      }
    }
  }

  if (total === 0) return "";

  lines.push(`Lukkede oppgaver (MCQ/True-False): ${correct}/${total} riktige.`);
  if (wrongLines.length) {
    lines.push("");
    lines.push("Feil/misforståelser:");
    lines.push(...wrongLines.slice(0, 8));
  }

  return lines.join("\n").trim();
}

function buildOppgaveStringForParent(assignmentObj: AssignmentDoc): string {
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

    openPrompts.push(`- Oppgave ${order}: ${prompt}`);
  }

  const level = (assignmentObj.level ?? "A2").toString();
  const target = "C1";

  return (
    `Vurder åpne svar i forhold til CEFR ${level}, og gi råd for progresjon mot ${target}.\n` +
    (openPrompts.length ? `Åpne oppgaver:\n${openPrompts.join("\n")}\n` : "")
  ).trim();
}

function buildSvarStringForParent(
  assignmentObj: AssignmentDoc,
  answersObj: Record<string, string | boolean>
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

    const ansText =
      typeof ans === "string" ? ans.trim() : ans == null ? "" : String(ans).trim();

    if (!ansText) continue;

    const order = tt.order ?? i + 1;
    const prompt = taskPrompt(tt).trim();

    lines.push(`Oppgave ${order} (åpen): ${prompt}`);
    lines.push(`Svar: ${ansText}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export default function ParentAssignmentDetailPage() {
  const { spaceId, assignmentId } = useParams<{ spaceId: string; assignmentId: string }>();
  const t = useTranslations("parent.assignmentDetail");

  const [user, setUser] = useState<User | null>(null);

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);

  const [spaceMissing, setSpaceMissing] = useState(false);
  const [assignmentMissing, setAssignmentMissing] = useState(false);

  const [spaceErr, setSpaceErr] = useState<string | null>(null);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);

  const [review, setReview] = useState<ParentReviewDoc | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  const [submission, setSubmission] = useState<SubmissionDoc | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

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

  const backHref = `/parent/spaces/${spaceId}`;
  const boardHref = `/parent/spaces/${spaceId}/board`;

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    setSpaceErr(null);
    setSpaceMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId),
        (snap) => {
          if (!snap.exists()) {
            setSpace(null);
            setSpaceMissing(true);
            return;
          }
          setSpaceMissing(false);
          setSpace(snap.data() as SpaceDoc);
        },
        (e: unknown) => setSpaceErr(errMessage(e, t("errors.readSpace")))
      );
    } catch (e: unknown) {
      setSpaceErr(errMessage(e, t("errors.listenSpaceStart")));
    }

    return () => unsub?.();
  }, [spaceId, t]);

  useEffect(() => {
    setAssignmentErr(null);
    setAssignmentMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId),
        (snap) => {
          if (!snap.exists()) {
            setAssignment(null);
            setAssignmentMissing(true);
            return;
          }
          setAssignmentMissing(false);
          setAssignment(snap.data() as AssignmentDoc);
        },
        (e: unknown) => setAssignmentErr(errMessage(e, t("errors.readAssignment")))
      );
    } catch (e: unknown) {
      setAssignmentErr(errMessage(e, t("errors.listenAssignmentStart")));
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, t]);

  useEffect(() => {
    if (!user?.uid) return;

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        (snap) => {
          if (!snap.exists()) {
            setReview(null);
            setReviewComment("");
            setReviewStars(0);
            return;
          }

          const data = snap.data() as ParentReviewDoc;
          setReview(data);
          setReviewComment(safeString(data.comment) ?? "");
          setReviewStars(safeNumber(data.stars) ?? 0);
        }
      );
    } catch {
      // ignore
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
        (snap) => {
          if (!snap.exists()) {
            setSubmission(null);
            setAiFeedback(null);
            return;
          }

          const data = snap.data() as SubmissionDoc;
          setSubmission(data);

          if (isRecord(data.answers)) {
            const next: Record<string, string | boolean> = {};
            for (const [k, v] of Object.entries(data.answers)) {
              if (typeof v === "string" || typeof v === "boolean") next[k] = v;
            }
            setAnswers(next);
          }

          setAiFeedback(safeString(data.aiFeedback));
        }
      );
    } catch {
      // ignore
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, user?.uid]);

  useEffect(() => {
    setTranslateErr(null);
  }, [targetLang]);

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceTitle = safeString(spaceRec.title) ?? t("header.defaultSpaceTitle");
  const spaceKind = safeString(spaceRec.kind);

  const assignmentTitle =
    safeString(assignment?.title) ?? t("header.defaultAssignmentTitle");

  const topics = useMemo(() => (assignment ? coerceTopics(assignment) : []), [assignment]);
  const img = useMemo(() => (assignment ? pickImageUrl(assignment) : null), [assignment]);
  const sourceTextSafe = useMemo(() => (assignment ? firstLongText(assignment) ?? "" : ""), [assignment]);

  const tasksOriginal = useMemo(() => {
    const arr = safeTasksArray(assignment?.tasks);
    return arr.slice().sort(sortTasksByOrder);
  }, [assignment?.tasks]);

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((x) => m.set(x.stableId, x));
    return m;
  }, [translatedTasks]);

  const level = safeString(assignment?.level);
  const language = safeString(assignment?.language);
  const sourceType = safeString(assignment?.sourceType);
  const sourceId = safeString(assignment?.sourceId);
  const archived =
    assignment?.archived === true ||
    String(assignment?.status ?? "").toLowerCase() === "archived";

  const libraryAssignment = looksLikeLibraryAssignment(assignment);
  const autoSummary = renderAutoSummary(submission?.auto);

  const textFollow = useMemo(() => {
    const original = segmentSentences(sourceTextSafe || "");
    const translation = segmentSentences(translatedText || "");
    return { original, translation };
  }, [sourceTextSafe, translatedText]);

  const originalLangForTTS: TtsLang = toTtsLang(language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  function setAnswer(taskId: string, value: string | boolean) {
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
    if (!audioRef.current || !activeTextMode) return;

    const segs = activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs.length) return;

    const nextIdx = Math.max(0, (activeSentenceIndex ?? 0) - 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  function nextSentence() {
    if (!audioRef.current || !activeTextMode) return;

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
      setTtsErr(typeof m === "string" ? m : "TTS feilet.");
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

  async function onTranslateText() {
    if (!sourceTextSafe.trim()) return;

    setTranslateErr(null);
    setTranslating("text");

    try {
      const out = await translateOne(sourceTextSafe, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setTranslateErr(typeof m === "string" ? m : "Oversettelse feilet.");
      setTranslatedText(null);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTasks() {
    if (!assignment) return;
    const tasksArr = safeTasksArray(assignment.tasks);
    if (tasksArr.length === 0) return;

    setTranslateErr(null);
    setTranslating("tasks");

    try {
      const sorted = tasksArr.slice().sort(sortTasksByOrder);
      const out: TranslatedTask[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const tt = sorted[i];
        const stableId = getStableTaskId(tt, i);

        const promptOrig = taskPrompt(tt);
        const optionsOrig = taskOptions(tt);

        let translatedPrompt = "";
        if (promptOrig) {
          try {
            translatedPrompt = await translateOne(promptOrig, targetLang);
          } catch (e: unknown) {
            const m = (e as { message?: unknown })?.message;
            setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : "Oversettelse feilet."));
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
                setTranslateErr((prev) => prev ?? (typeof m === "string" ? m : "Oversettelse feilet."));
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
      setTranslateErr(typeof m === "string" ? m : "Oversettelse feilet.");
    } finally {
      setTranslating(null);
    }
  }

  async function saveParentReview() {
    if (!user?.uid) {
      setReviewMsg("Du må være innlogget for å lagre kommentar.");
      return;
    }

    setSavingReview(true);
    setReviewMsg(null);

    try {
      const dbx = requireDb(db);
      await setDoc(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        {
          uid: user.uid,
          comment: reviewComment.trim(),
          stars: reviewStars,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setReviewMsg("Kommentar lagret.");
    } catch (e: unknown) {
      setReviewMsg(errMessage(e, "Kunne ikke lagre kommentar."));
    } finally {
      setSavingReview(false);
    }
  }

  async function submitAssignment() {
  if (!assignment || !user?.uid) {
    setSubmitMsg("Du må være innlogget for å sende inn.");
    return;
  }

  setSubmitting(true);
  setSubmitMsg(null);

  try {
    const dbx = requireDb(db);
    const auto = evaluateAnswers(tasksOriginal, answers);

    let nextAiFeedback: string | null = null;

    if (libraryAssignment) {
      try {
        const lesetekst = (assignment.sourceText ?? assignment.text ?? assignment.description ?? "").trim();
        const oppgave = buildOppgaveStringForParent(assignment);
        const svar = buildSvarStringForParent(assignment, answers);
        const autoResultat = buildAutoResultatForParent(assignment, answers);
        const nivå = `${String(assignment.level ?? "A2")} (mål: C1)`;

        if (svar || autoResultat) {
          const response = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lesetekst,
              oppgave,
              svar,
              nivå,
              autoResultat,
              locale: "no",
            }),
          });

          if (response.ok) {
            const data: unknown = await response.json();
            const d = data as { feedback?: unknown };
            nextAiFeedback = typeof d?.feedback === "string" ? d.feedback : null;
          }
        }
      } catch {
        nextAiFeedback = null;
      }
    }

    const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

    const nestedRef = doc(
      dbx,
      "spaces",
      spaceId,
      "lessons",
      assignmentId,
      "submissions",
      submissionId
    );

    const indexRef = doc(dbx, "spaceSubmissions", submissionId);

    const payload = {
      spaceId,
      assignmentId,
      uid: user.uid,

      status: "submitted",
      title: assignmentTitle,

      answers,
      auto,
      aiFeedback: nextAiFeedback,

      sourceType: assignment.sourceType ?? null,
      sourceId: assignment.sourceId ?? null,
      level: assignment.level ?? null,
      language: assignment.language ?? null,

      role: "parent",
      isParentFlow: true,

      parentCommentSnapshot: reviewComment.trim(),
      parentStarsSnapshot: reviewStars,

      submittedAt: Date.now(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const batch = writeBatch(dbx);
    batch.set(nestedRef, payload, { merge: true });
    batch.set(indexRef, payload, { merge: true });
    await batch.commit();

    setAiFeedback(nextAiFeedback);
    setSubmitMsg("Besvarelse lagret.");
  } catch (e: unknown) {
    setSubmitMsg(errMessage(e, "Kunne ikke sende inn oppgaven."));
  } finally {
    setSubmitting(false);
  }
}

  function renderFollowText(
    mode: "original" | "translation",
    segs: SentenceSeg[],
    fallbackText: string
  ) {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>{t("content.none")}</span>;

    if (!segs || segs.length === 0) {
      return <span style={{ whiteSpace: "pre-wrap" }}>{fallbackText}</span>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map((s, i) => {
          const isActive = activeTextMode === mode && activeSentenceIndex === i;
          const canSeek = !!audioRef.current;

          return (
            <span
              key={`${mode}_${i}_${s.startChar}`}
              onClick={() => (canSeek ? seekToSentence(mode, i) : undefined)}
              style={{
                cursor: canSeek ? "pointer" : "default",
                padding: "2px 6px",
                borderRadius: 8,
                background: isActive ? "rgba(255, 230, 120, 0.65)" : "transparent",
                transition: "background 120ms ease",
                lineHeight: 1.6,
              }}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  }

  if (spaceMissing || assignmentMissing) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("missing.title")}</h1>
        <div style={{ opacity: 0.75 }}>{t("missing.subtitle")}</div>
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{t("actions.backToSpace")}</Link>
        </div>
      </div>
    );
  }

  if (spaceErr || assignmentErr) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("error.title")}</h1>
        {spaceErr ? <div style={{ color: "crimson", marginTop: 8 }}>{spaceErr}</div> : null}
        {assignmentErr ? <div style={{ color: "crimson", marginTop: 8 }}>{assignmentErr}</div> : null}
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{t("actions.backToSpace")}</Link>
        </div>
      </div>
    );
  }

  if (!space || !assignment) {
    return <div style={{ padding: 16 }}>{t("loading")}</div>;
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <section
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 14,
          background: "white",
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Foreldrevurdering</div>

        <div style={{ opacity: 0.8, lineHeight: 1.5, marginBottom: 12 }}>
          Her kan du skrive en kommentar og gi stjerner til hvordan oppgaven fungerte hjemme.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n <= reviewStars;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setReviewStars(n)}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  background: active ? "#111" : "#fff",
                  color: active ? "#fff" : "#111",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                ★ {n}
              </button>
            );
          })}

          {reviewStars > 0 ? (
            <div style={{ alignSelf: "center", opacity: 0.7, fontSize: 13 }}>
              {starsLabel(reviewStars)}
            </div>
          ) : null}
        </div>

        <textarea
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
          rows={4}
          placeholder="Skriv en kommentar …"
          style={{
            width: "100%",
            border: "1px solid rgba(0,0,0,0.14)",
            borderRadius: 12,
            padding: 12,
            resize: "vertical",
            font: "inherit",
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={saveParentReview}
            disabled={savingReview}
            style={darkBtn}
          >
            {savingReview ? "Lagrer …" : "Lagre kommentar"}
          </button>

          {review ? <span style={{ opacity: 0.7, fontSize: 13 }}>Tidligere vurdering funnet.</span> : null}
          {reviewMsg ? <span style={{ opacity: 0.8, fontSize: 13 }}>{reviewMsg}</span> : null}
        </div>
      </section>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ opacity: 0.72, marginBottom: 6 }}>
            {spaceTitle} • {kindLabel(spaceKind, t)}
          </div>

          <h1 style={{ margin: "0 0 6px" }}>{assignmentTitle}</h1>

          <div style={{ opacity: 0.75, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {level ? <span>{level}</span> : null}
            {language ? <span>• {language.toUpperCase()}</span> : null}
            {topics.length ? <span>• {topics.slice(0, 3).join(" • ")}</span> : null}
            {libraryAssignment ? <span>• bibliotek</span> : null}
            {archived ? <span>• arkivert</span> : null}
          </div>

          {assignment.description ? (
            <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.85, lineHeight: 1.45 }}>
              {assignment.description}
            </p>
          ) : null}

          {(sourceType || sourceId) ? (
            <div style={{ marginTop: 10, opacity: 0.68, fontSize: 13 }}>
              {sourceType ? `sourceType: ${sourceType}` : null}
              {sourceType && sourceId ? " • " : null}
              {sourceId ? `sourceId: ${sourceId}` : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link href={boardHref} style={darkLinkBtn}>
            {t("actions.openBoard")}
          </Link>

          <Link href={backHref} style={secondaryBtn}>
            {t("actions.backToSpace")}
          </Link>
        </div>
      </header>

      <section style={{ marginTop: 14 }}>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            overflow: "hidden",
            background: "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={assignmentTitle}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ opacity: 0.65 }}>Ingen cover</div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 18, padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ opacity: 0.75, fontWeight: 700 }}>Oversett til</span>
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
            onClick={onTranslateText}
            disabled={translating === "text" || !sourceTextSafe.trim()}
            style={{ ...btnStyle, opacity: translating === "text" ? 0.6 : 1 }}
          >
            {translating === "text" ? "Oversetter …" : "Oversett tekst"}
          </button>

          <button
            onClick={onTranslateTasks}
            disabled={translating === "tasks" || tasksOriginal.length === 0}
            style={{ ...btnStyle, opacity: translating === "tasks" ? 0.6 : 1 }}
          >
            {translating === "tasks" ? "Oversetter …" : "Oversett oppgaver"}
          </button>

          <button
            onClick={() => {
              setTranslatedText(null);
              setTranslatedTasks(null);
              setTranslateErr(null);
              setTaskTranslationOpen({});
            }}
            style={btnStyle}
          >
            Nullstill
          </button>
        </div>

        {translateErr ? <div style={{ marginTop: 10, color: "crimson" }}>{translateErr}</div> : null}
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 8 }}>Text</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.75 }}>Fart</span>
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
              disabled={ttsBusy !== null || !sourceTextSafe.trim()}
              onClick={() => playTTS(sourceTextSafe, originalLangForTTS, "original")}
            >
              {ttsBusy === "original" ? "Lager lyd …" : "Spill original"}
            </button>

            <button type="button" style={btnStyle} onClick={stopAudio} disabled={!audioRef.current}>
              Stopp
            </button>

            {audioRef.current ? (
              <>
                <button type="button" style={btnStyle} onClick={isPlaying ? pauseAudio : resumeAudio}>
                  {isPlaying ? "Pause" : "Fortsett"}
                </button>
                <button type="button" style={btnStyle} onClick={replaySentence}>
                  Spill setning igjen
                </button>
                <button type="button" style={btnStyle} onClick={prevSentence}>
                  Forrige
                </button>
                <button type="button" style={btnStyle} onClick={nextSentence}>
                  Neste
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
                {showTextTranslation ? "Skjul oversettelse" : "Vis oversettelse"}
              </button>
            ) : null}

            {translatedText ? (
              <button
                type="button"
                style={{ ...btnStyle, opacity: ttsBusy === "translation" ? 0.6 : 1 }}
                disabled={ttsBusy !== null || !translatedText.trim()}
                onClick={() => playTTS(translatedText, translationLangForTTS, "translation")}
              >
                {ttsBusy === "translation" ? "Lager lyd …" : "Spill oversettelse"}
              </button>
            ) : null}
          </div>
        </div>

        {ttsErr ? <div style={{ marginTop: 8, color: "crimson" }}>{ttsErr}</div> : null}

        <div style={panel}>
          {renderFollowText("original", textFollow.original.segs, sourceTextSafe)}
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
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Oversatt tekst</div>
            {renderFollowText("translation", textFollow.translation.segs, translatedText)}
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ marginBottom: 8 }}>Tasks</h2>

          {(translatedTasks ?? []).length > 0 ? (
            <button type="button" style={btnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
              {showTaskTranslations ? "Skjul alle oversettelser" : "Vis alle oversettelser"}
            </button>
          ) : null}
        </div>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No tasks in this lesson.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tasksOriginal.map((task, idx) => {
              const stableId = getStableTaskId(task, idx);
              const type = taskType(task);
              const prompt = taskPrompt(task);
              const options = taskOptions(task);
              const current = answers[stableId];
              const taskAuto = submission?.auto?.byTask?.[stableId];
              const tr = tMap.get(stableId);
              const showThisTranslation = isTaskTranslationVisible(stableId);
              const translatedPrompt = tr?.translatedPrompt ?? "";
              const translatedOptions = tr?.translatedOptions ?? [];

              return (
                <div key={stableId} style={taskCard}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      opacity: 0.8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <strong>Oppgave {typeof task.order === "number" ? task.order : idx + 1}</strong>
                      <span style={{ marginLeft: 8 }}>• {type}</span>
                    </div>

                    {(translatedPrompt || translatedOptions.length > 0) ? (
                      <button
                        type="button"
                        style={btnStyle}
                        onClick={() => toggleTaskTranslation(stableId)}
                      >
                        {showThisTranslation ? "Skjul oversettelse" : "Vis oversettelse"}
                      </button>
                    ) : null}
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10 }}>
                    {prompt}
                  </div>

                  {showThisTranslation && translatedPrompt ? (
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
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Oversatt oppgave</div>
                      {translatedPrompt}
                    </div>
                  ) : null}

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {options.map((opt, i) => {
                        const checked = current === opt;
                        const optT = translatedOptions[i] || "";

                        return (
                          <label
                            key={`${stableId}-${i}`}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 8,
                              padding: "8px 10px",
                              border: "1px solid rgba(0,0,0,0.10)",
                              borderRadius: 10,
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name={stableId}
                              checked={checked}
                              onChange={() => setAnswer(stableId, opt)}
                            />
                            <div>
                              <div>{opt}</div>
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
                        onClick={() => setAnswer(stableId, true)}
                        style={{
                          ...pillButton,
                          background: current === true ? "#111" : "rgba(0,0,0,0.04)",
                          color: current === true ? "#fff" : "#111",
                        }}
                      >
                        True
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnswer(stableId, false)}
                        style={{
                          ...pillButton,
                          background: current === false ? "#111" : "rgba(0,0,0,0.04)",
                          color: current === false ? "#fff" : "#111",
                        }}
                      >
                        False
                      </button>
                    </div>
                  ) : null}

                  {type === "open" ? (
                    <textarea
                      value={typeof current === "string" ? current : ""}
                      onChange={(e) => setAnswer(stableId, e.target.value)}
                      rows={4}
                      placeholder="Skriv svaret her …"
                      style={{
                        width: "100%",
                        border: "1px solid rgba(0,0,0,0.14)",
                        borderRadius: 12,
                        padding: 12,
                        resize: "vertical",
                        font: "inherit",
                      }}
                    />
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {typeof current !== "undefined" ? (
                      <span style={{ fontSize: 13, opacity: 0.75 }}>Svar registrert</span>
                    ) : (
                      <span style={{ fontSize: 13, opacity: 0.55 }}>Ikke besvart ennå</span>
                    )}

                    {typeof taskAuto?.correct === "boolean" ? (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: taskAuto.correct ? "green" : "crimson",
                        }}
                      >
                        {taskAuto.correct ? "Riktig" : "Ikke riktig"}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={submitAssignment}
          disabled={submitting}
          style={startBtn}
        >
          {submitting ? "Sender inn …" : "SEND INN"}
        </button>

        <Link href={backHref} style={secondaryBtn}>
          {t("actions.backToSpace")}
        </Link>
      </section>

      {(autoSummary || aiFeedback || submitMsg) ? (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 8 }}>Tilbakemelding</h2>
          <div style={panel}>
            {submitMsg ? <div style={{ marginBottom: 10, opacity: 0.82 }}>{submitMsg}</div> : null}

            {autoSummary ? (
              <div style={{ marginBottom: aiFeedback ? 12 : 0 }}>
                <div style={{ fontWeight: 800 }}>Autoresultat</div>
                <div style={{ opacity: 0.84 }}>{autoSummary}</div>
              </div>
            ) : null}

            {aiFeedback ? (
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>AI-feedback</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{aiFeedback}</div>
              </div>
            ) : libraryAssignment ? (
              <div style={{ opacity: 0.68 }}>Ingen AI-feedback lagret ennå.</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const panel: React.CSSProperties = {
  padding: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  lineHeight: 1.55,
  background: "white",
};

const taskCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: 12,
  background: "white",
};

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  cursor: "pointer",
};

const startBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "rgba(190,247,192,1)",
  color: "black",
  fontWeight: 800,
  letterSpacing: 0.2,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "white",
  color: "black",
};

const darkBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const darkLinkBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
};

const pillButton: React.CSSProperties = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.14)",
  cursor: "pointer",
  fontWeight: 700,
};