// app/[locale]/(app)/teacher/spaces/[spaceId]/board/display/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";
import { Check, ChevronLeft, ChevronRight, Clock, Eye, EyeOff, Maximize2, Minimize2, MonitorUp, PauseCircle, Pencil, Play, RotateCcw, Timer, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type WordwallEnergy = "calm" | "live" | "energy";
type QuizAutomationPhase = "question" | "answer" | "result" | "next" | "finished";
type BoardQuizQuestion = {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  seconds?: number;
};

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: BoardMode | string;
  endsAt?: number | null;
  timerStartedAt?: number | null;
  timerTotalSec?: number | null;
  timerVisible?: boolean;
  clearedAt?: number | null;
  data?: {
    title?: string;
    prompt?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    wordwallPrompt?: string;
    wordwallPinned?: string[];
    wordwallFeatured?: string | null;
    wordwallEnergy?: WordwallEnergy;
    imagePrompt?: string;
    imageUrl?: string;
    imagePinned?: string[];
    imageFeatured?: string | null;
    clockTitle?: string;
    clockGoals?: string;
    clockTodos?: string;
    stopwatchStartedAt?: number | null;
    stopwatchElapsedMs?: number;
    stopwatchRunning?: boolean;
    quizTitle?: string;
    quizDescription?: string;
    quizQuestions?: BoardQuizQuestion[];
    quizCurrentIndex?: number;
    quizStarted?: boolean;
    quizShowAnswer?: boolean;
    quizShowScoreboard?: boolean;
    quizFinished?: boolean;
    quizQuestionStartedAtByIndex?: Record<string, number>;
    quizAutomationRunning?: boolean;
    quizAutomationPaused?: boolean;
    quizAutomationPhase?: QuizAutomationPhase;
    quizAutomationPhaseEndsAt?: number | null;
    quizAutomationAnswerSec?: number;
    quizAutomationFasitSec?: number;
    quizAutomationResultSec?: number;
    quizAutomationNextSec?: number;
  };
};

type BoardResponse = {
  sessionId?: string;
  uid?: string | null;
  displayName?: string | null;
  groupName?: string | null;
  emoji?: string | null;
  text?: string;
  responseType?: string;
  noteColor?: NoteColor | string;
  pollChoice?: string;
  quizQuestionIndex?: number;
  quizChoice?: string;
  quizResponseMs?: number;
  quizResponseLimitMs?: number;
  wordwallWord?: string;
  createdAt?: unknown;
};

type WordwallItem = {
  key: string;
  word: string;
  count: number;
  latest: number;
  pinned?: boolean;
};

const DISPLAY_STAGE_WIDTH = 1920;
const DISPLAY_STAGE_HEIGHT = 1080;
const DEFAULT_AUTO_ANSWER_SEC = 30;
const DEFAULT_AUTO_FASIT_SEC = 20;
const DEFAULT_AUTO_RESULT_SEC = 20;
const DEFAULT_AUTO_NEXT_SEC = 5;

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isTimestampLike(v: unknown): v is { toMillis: () => number } {
  return !!v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis?: unknown }).toMillis === "function";
}

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function stripLegacyClockDefault(value: string | null) {
  if (!value) return "";
  const normalized = value.trim().replace(/\r\n/g, "\n");
  if (normalized === "Vi kan beskrive hva vi ser.\nVi kan bruke hele setninger.") return "";
  if (normalized === "Se på bildet\nSkriv en setning\nDel med klassen") return "";
  if (normalized === "We can describe what we see.\nWe can use full sentences.") return "";
  if (normalized === "Look at the image\nWrite a sentence\nShare with the class") return "";
  if (normalized === "Podemos descrever o que vemos.\nPodemos usar frases completas.") return "";
  if (normalized === "Observar a imagem\nEscrever uma frase\nCompartilhar com a turma") return "";
  return value;
}

function toMillis(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (isTimestampLike(v)) {
    const ms = v.toMillis();
    return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function isNoteColor(v: unknown): v is NoteColor {
  return v === "amber" || v === "emerald" || v === "sky" || v === "rose" || v === "violet";
}

function accentFromNoteColor(c: NoteColor) {
  switch (c) {
    case "amber":
      return "bg-amber-100 border-amber-200 text-amber-950";
    case "emerald":
      return "bg-emerald-100 border-emerald-200 text-emerald-950";
    case "sky":
      return "bg-sky-100 border-sky-200 text-sky-950";
    case "rose":
      return "bg-rose-100 border-rose-200 text-rose-950";
    case "violet":
      return "bg-violet-100 border-violet-200 text-violet-950";
  }
}

function pickStickyAccent(seed: string) {
  const accents = [
    "bg-amber-100 border-amber-200 text-amber-950",
    "bg-emerald-100 border-emerald-200 text-emerald-950",
    "bg-sky-100 border-sky-200 text-sky-950",
    "bg-rose-100 border-rose-200 text-rose-950",
    "bg-violet-100 border-violet-200 text-violet-950",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return accents[h % accents.length];
}

function normalizeWordwallWord(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[.,!?;:()[\]{}"'«»]+|[.,!?;:()[\]{}"'«»]+$/g, "");
}

function displayWordwallWord(input: string): string {
  if (!input) return "";
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function wordwallTextSize(count: number) {
  if (count >= 8) return "text-8xl";
  if (count >= 5) return "text-7xl";
  if (count >= 3) return "text-6xl";
  if (count >= 2) return "text-5xl";
  return "text-4xl";
}

function isWordwallEnergy(v: unknown): v is WordwallEnergy {
  return v === "calm" || v === "live" || v === "energy";
}

function wordwallPositionStyle(index: number, pinned?: boolean, energy: WordwallEnergy = "live"): CSSProperties {
  const positions = [
    { left: "2%", top: "24%" },
    { left: "31%", top: "42%" },
    { left: "63%", top: "24%" },
    { left: "14%", top: "60%" },
    { left: "76%", top: "55%" },
    { left: "43%", top: "68%" },
    { left: "-3%", top: "76%" },
    { left: "84%", top: "34%" },
    { left: "52%", top: "14%" },
    { left: "23%", top: "14%" },
    { left: "68%", top: "76%" },
    { left: "5%", top: "44%" },
  ];
  const base = positions[index % positions.length];
  return {
    left: base.left,
    top: base.top,
    zIndex: pinned ? 20 : 5 + (index % 10),
    animationDelay: `${(index % 10) * 120}ms`,
    animationDuration:
      energy === "calm"
        ? `${5.4 + (index % 5) * 0.35}s`
        : energy === "energy"
          ? `${2.5 + (index % 5) * 0.2}s`
          : `${3.4 + (index % 5) * 0.3}s`,
  };
}

export default function TeacherBoardDisplayPage() {
  const t = useTranslations("teacherBoard");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);
  const [loading, setLoading] = useState(true);
  const screenRef = useRef<HTMLElement | null>(null);
  const handledQuizTimerRef = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [stageScale, setStageScale] = useState(1);
  const [selectedAutoAnswerSec, setSelectedAutoAnswerSec] = useState(DEFAULT_AUTO_ANSWER_SEC);
  const [selectedAutoFasitSec, setSelectedAutoFasitSec] = useState(DEFAULT_AUTO_FASIT_SEC);
  const [selectedAutoResultSec, setSelectedAutoResultSec] = useState(DEFAULT_AUTO_RESULT_SEC);
  const [selectedAutoNextSec, setSelectedAutoNextSec] = useState(DEFAULT_AUTO_NEXT_SEC);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null), [dbx, spaceId]);
  const responsesCol = useMemo(() => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null), [dbx, spaceId]);

  useEffect(() => {
    if (!stateRef) return;
    setLoading(true);
    return onSnapshot(
      stateRef,
      (snap) => {
        setState((snap.data() as BoardState | undefined) ?? null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [stateRef]);

  useEffect(() => {
    if (!responsesCol) return;
    return onSnapshot(responsesCol, (snap) => {
      setResponses(snap.docs.map((d) => ({ id: d.id, data: d.data() as BoardResponse })));
    });
  }, [responsesCol]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function updateStageScale() {
      const width = window.innerWidth || DISPLAY_STAGE_WIDTH;
      const height = window.innerHeight || DISPLAY_STAGE_HEIGHT;
      setStageScale(Math.min(width / DISPLAY_STAGE_WIDTH, height / DISPLAY_STAGE_HEIGHT) * 0.94);
    }

    updateStageScale();
    window.addEventListener("resize", updateStageScale);
    window.visualViewport?.addEventListener("resize", updateStageScale);
    return () => {
      window.removeEventListener("resize", updateStageScale);
      window.visualViewport?.removeEventListener("resize", updateStageScale);
    };
  }, []);

  async function toggleFullscreen() {
    const el = screenRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      //
    }
  }

  async function closeDisplay() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      //
    }

    if (window.opener && !window.opener.closed) {
      window.close();
      window.setTimeout(() => {
        if (!window.closed && spaceId) {
          router.replace(`/${locale}/teacher/spaces/${spaceId}/board`);
        }
      }, 120);
      return;
    }

    if (spaceId) {
      router.replace(`/${locale}/teacher/spaces/${spaceId}/board`);
    }
  }

  const active = state?.active === true;
  const activeSessionId = safeString(state?.sessionId);
  const clearedAt = typeof state?.clearedAt === "number" ? state.clearedAt : null;
  const rawMode = typeof state?.mode === "string" ? state.mode.trim().toLowerCase() : "";
  const mode: BoardMode = rawMode === "poll" ? "poll" : rawMode === "wordwall" ? "wordwall" : rawMode === "image" ? "image" : rawMode === "clock" ? "clock" : rawMode === "quiz" ? "quiz" : "text";

  const filteredResponses = useMemo(() => {
    if (!activeSessionId) return [];
    return responses
      .filter((r) => r.data.sessionId === activeSessionId)
      .filter((r) => {
        if (!clearedAt) return true;
        return (toMillis(r.data.createdAt) ?? 0) >= clearedAt;
      })
      .sort((a, b) => (toMillis(b.data.createdAt) ?? 0) - (toMillis(a.data.createdAt) ?? 0));
  }, [activeSessionId, clearedAt, responses]);

  const textResponses = useMemo(
    () => filteredResponses.filter((r) => safeString(r.data.text) && r.data.responseType !== "image"),
    [filteredResponses]
  );
  const pollResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.pollChoice)), [filteredResponses]);
  const quizResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.quizChoice)), [filteredResponses]);
  const wordwallResponses = useMemo(() => filteredResponses.filter((r) => safeString(r.data.wordwallWord)), [filteredResponses]);
  const imageResponses = useMemo(
    () => filteredResponses.filter((r) => safeString(r.data.text) && r.data.responseType === "image"),
    [filteredResponses]
  );

  const pollOptions = Array.isArray(state?.data?.pollOptions) ? state.data.pollOptions.filter((x) => safeString(x)) : [];
  const pollCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pollResponses) {
      const choice = safeString(r.data.pollChoice);
      if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    }
    return counts;
  }, [pollResponses]);

  const wordwallItems = useMemo<WordwallItem[]>(() => {
    const pinned = new Set(
      (Array.isArray(state?.data?.wordwallPinned) ? state.data.wordwallPinned : [])
        .map((v) => normalizeWordwallWord(String(v)))
        .filter(Boolean)
    );
    const map = new Map<string, WordwallItem>();
    for (const r of wordwallResponses) {
      const raw = safeString(r.data.wordwallWord);
      if (!raw) continue;
      const key = normalizeWordwallWord(raw);
      if (!key) continue;
      const latest = toMillis(r.data.createdAt) ?? 0;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (latest > existing.latest) existing.latest = latest;
      } else {
        map.set(key, { key, word: displayWordwallWord(key), count: 1, latest });
      }
    }
    return Array.from(map.values()).map((item) => ({ ...item, pinned: pinned.has(item.key) })).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.count !== a.count ? b.count - a.count : b.latest - a.latest;
    });
  }, [state?.data?.wordwallPinned, wordwallResponses]);

  const title = safeString(state?.data?.title) ?? t("defaults.title");
  const prompt = safeString(state?.data?.prompt) ?? "";
  const pollQuestion = safeString(state?.data?.pollQuestion) ?? t("defaults.pollQuestion");
  const wordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? t("defaults.wordwallPrompt");
  const imagePrompt = safeString(state?.data?.imagePrompt) ?? t("defaults.imagePrompt");
  const imageUrl = safeString(state?.data?.imageUrl) ?? "";
  const clockTitle = safeString(state?.data?.clockTitle) ?? t("defaults.clockTitle");
  const clockGoals = stripLegacyClockDefault(safeString(state?.data?.clockGoals));
  const clockTodos = stripLegacyClockDefault(safeString(state?.data?.clockTodos));
  const stopwatchElapsed = typeof state?.data?.stopwatchElapsedMs === "number" ? state.data.stopwatchElapsedMs : 0;
  const stopwatchStartedAt = typeof state?.data?.stopwatchStartedAt === "number" ? state.data.stopwatchStartedAt : null;
  const stopwatchMs = state?.data?.stopwatchRunning === true && stopwatchStartedAt ? stopwatchElapsed + Math.max(0, now - stopwatchStartedAt) : stopwatchElapsed;
  const quizQuestions = useMemo(
    () => (Array.isArray(state?.data?.quizQuestions) ? state.data.quizQuestions : []),
    [state?.data?.quizQuestions]
  );
  const quizIndex = Math.max(0, Math.min(quizQuestions.length - 1, typeof state?.data?.quizCurrentIndex === "number" ? state.data.quizCurrentIndex : 0));
  const quizQuestion = quizQuestions[quizIndex] ?? null;
  const quizStarted = state?.data?.quizStarted === true;
  const quizShowAnswer = state?.data?.quizShowAnswer === true;
  const quizShowScoreboard = state?.data?.quizShowScoreboard === true;
  const quizFinished = state?.data?.quizFinished === true;
  const quizAutomationRunning = state?.data?.quizAutomationRunning === true;
  const quizAutomationPaused = state?.data?.quizAutomationPaused === true;
  const quizAutomationPhase = state?.data?.quizAutomationPhase;
  const quizAutomationPhaseEndsAt = typeof state?.data?.quizAutomationPhaseEndsAt === "number" ? state.data.quizAutomationPhaseEndsAt : null;
  const quizAutomationAnswerSec = typeof state?.data?.quizAutomationAnswerSec === "number" ? state.data.quizAutomationAnswerSec : DEFAULT_AUTO_ANSWER_SEC;
  const quizAutomationFasitSec = typeof state?.data?.quizAutomationFasitSec === "number" ? state.data.quizAutomationFasitSec : DEFAULT_AUTO_FASIT_SEC;
  const quizAutomationResultSec = typeof state?.data?.quizAutomationResultSec === "number" ? state.data.quizAutomationResultSec : DEFAULT_AUTO_RESULT_SEC;
  const quizAutomationNextSec = typeof state?.data?.quizAutomationNextSec === "number" ? state.data.quizAutomationNextSec : DEFAULT_AUTO_NEXT_SEC;
  const quizCurrentResponses = quizResponses.filter((r) => r.data.quizQuestionIndex === quizIndex);
  const quizCounts = new Map<string, number>();
  for (const r of quizCurrentResponses) {
    const choice = safeString(r.data.quizChoice);
    if (choice) quizCounts.set(choice, (quizCounts.get(choice) ?? 0) + 1);
  }
  const quizScores = useMemo(() => {
    const map = new Map<string, { key: string; name: string; emoji: string; score: number; correct: number; answered: number; totalMs: number; latest: number }>();
    for (const response of quizResponses) {
      const questionIndex = typeof response.data.quizQuestionIndex === "number" ? response.data.quizQuestionIndex : -1;
      const question = quizQuestions[questionIndex];
      if (!question || !Array.isArray(question.options)) continue;
      const choice = safeString(response.data.quizChoice);
      if (!choice) continue;
      const name = safeString(response.data.displayName) ?? safeString(response.data.groupName) ?? "Elev";
      const emoji = safeString(response.data.emoji) ?? "";
      const key = safeString(response.data.uid) ?? name.toLocaleLowerCase();
      const existing = map.get(key) ?? { key, name, emoji, score: 0, correct: 0, answered: 0, totalMs: 0, latest: 0 };
      existing.name = name;
      existing.emoji = emoji;
      existing.answered += 1;
      existing.latest = Math.max(existing.latest, toMillis(response.data.createdAt) ?? 0);
      const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : -1;
      const correctOption = correctIndex >= 0 ? safeString(question.options[correctIndex]) : null;
      const responseMs = typeof response.data.quizResponseMs === "number" ? response.data.quizResponseMs : null;
      if (responseMs !== null) existing.totalMs += responseMs;
      if (correctOption && choice === correctOption) {
        const limitMs =
          typeof response.data.quizResponseLimitMs === "number" && response.data.quizResponseLimitMs > 0
            ? response.data.quizResponseLimitMs
            : typeof question.seconds === "number" && question.seconds > 0
              ? question.seconds * 1000
              : 60000;
        const speedBonus = responseMs !== null ? Math.max(0, Math.round(500 * (1 - Math.min(responseMs, limitMs) / limitMs))) : 0;
        existing.correct += 1;
        existing.score += 1000 + speedBonus;
      }
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score || b.correct - a.correct || a.totalMs - b.totalMs || b.answered - a.answered || b.latest - a.latest).slice(0, 8);
  }, [quizQuestions, quizResponses]);
  const timerEndsAtMs = typeof state?.endsAt === "number" ? state.endsAt : null;
  const displayTimerActive = timerEndsAtMs !== null && timerEndsAtMs > now;
  const wordwallEnergy = isWordwallEnergy(state?.data?.wordwallEnergy) ? state.data.wordwallEnergy : "live";
  const answersHidden = clearedAt !== null;
  const pinnedWordKeys = useMemo(() => {
    const arr = Array.isArray(state?.data?.wordwallPinned) ? state.data.wordwallPinned : [];
    return new Set(arr.map((v) => normalizeWordwallWord(String(v))).filter(Boolean));
  }, [state?.data?.wordwallPinned]);
  const featuredWordKey = safeString(state?.data?.wordwallFeatured);
  const featuredWord = featuredWordKey ? wordwallItems.find((item) => item.key === normalizeWordwallWord(featuredWordKey)) : null;
  const pinnedImageResponseIds = useMemo(() => {
    const arr = Array.isArray(state?.data?.imagePinned) ? state.data.imagePinned : [];
    return new Set(arr.map((v) => String(v)).filter(Boolean));
  }, [state?.data?.imagePinned]);
  const featuredImageResponseId = safeString(state?.data?.imageFeatured);
  const featuredImageResponse = featuredImageResponseId ? imageResponses.find((r) => r.id === featuredImageResponseId) : null;

  useEffect(() => {
    if (quizAutomationRunning) return;
    if (!stateRef || mode !== "quiz" || !quizStarted || !activeSessionId || !timerEndsAtMs || timerEndsAtMs > now || quizShowAnswer) return;
    const timerKey = `${activeSessionId}:${quizIndex}:${timerEndsAtMs}`;
    if (handledQuizTimerRef.current === timerKey) return;
    handledQuizTimerRef.current = timerKey;
    void updateDoc(stateRef, {
      "data.quizShowAnswer": true,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }, [activeSessionId, mode, now, quizAutomationRunning, quizIndex, quizShowAnswer, quizStarted, stateRef, timerEndsAtMs]);

  useEffect(() => {
    if (!stateRef || mode !== "quiz" || !quizStarted || !activeSessionId || !quizAutomationRunning || quizAutomationPaused || !quizAutomationPhaseEndsAt || quizAutomationPhaseEndsAt > now) return;

    const nextStartedAt = Date.now();
    if (quizAutomationPhase === "question") {
      void updateDoc(stateRef, {
        "data.quizShowAnswer": true,
        "data.quizShowScoreboard": false,
        "data.quizAutomationPhase": "answer",
        "data.quizAutomationPhaseEndsAt": nextStartedAt + quizAutomationFasitSec * 1000,
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        updatedAt: serverTimestamp(),
      });
    } else if (quizAutomationPhase === "answer") {
      if (quizIndex >= quizQuestions.length - 1) {
        void updateDoc(stateRef, {
          "data.quizShowScoreboard": true,
          "data.quizFinished": true,
          "data.quizAutomationRunning": false,
          "data.quizAutomationPaused": false,
          "data.quizAutomationPhase": "finished",
          "data.quizAutomationPhaseEndsAt": null,
          endsAt: null,
          timerStartedAt: null,
          timerTotalSec: null,
          updatedAt: serverTimestamp(),
        });
      } else {
        void updateDoc(stateRef, {
          "data.quizShowScoreboard": true,
          "data.quizFinished": false,
          "data.quizAutomationPhase": "result",
          "data.quizAutomationPhaseEndsAt": nextStartedAt + quizAutomationResultSec * 1000,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (quizAutomationPhase === "result") {
      if (quizIndex >= quizQuestions.length - 1) {
        void updateDoc(stateRef, {
          "data.quizShowScoreboard": true,
          "data.quizFinished": true,
          "data.quizAutomationRunning": false,
          "data.quizAutomationPaused": false,
          "data.quizAutomationPhase": "finished",
          "data.quizAutomationPhaseEndsAt": null,
          endsAt: null,
          timerStartedAt: null,
          timerTotalSec: null,
          updatedAt: serverTimestamp(),
        });
      } else {
        void updateDoc(stateRef, {
          "data.quizAutomationPhase": "next",
          "data.quizAutomationPhaseEndsAt": nextStartedAt + quizAutomationNextSec * 1000,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (quizAutomationPhase === "next") {
      const nextIndex = quizIndex + 1;
      void updateDoc(stateRef, {
        "data.quizCurrentIndex": nextIndex,
        "data.quizShowAnswer": false,
        "data.quizShowScoreboard": false,
        "data.quizFinished": false,
        [`data.quizQuestionStartedAtByIndex.${nextIndex}`]: nextStartedAt,
        "data.quizAutomationPhase": "question",
        "data.quizAutomationPhaseEndsAt": nextStartedAt + quizAutomationAnswerSec * 1000,
        endsAt: nextStartedAt + quizAutomationAnswerSec * 1000,
        timerStartedAt: nextStartedAt,
        timerTotalSec: quizAutomationAnswerSec,
        timerVisible: true,
        updatedAt: serverTimestamp(),
      });
    }
  }, [
    activeSessionId,
    mode,
    now,
    quizAutomationAnswerSec,
    quizAutomationFasitSec,
    quizAutomationNextSec,
    quizAutomationPaused,
    quizAutomationPhase,
    quizAutomationPhaseEndsAt,
    quizAutomationResultSec,
    quizAutomationRunning,
    quizIndex,
    quizQuestions.length,
    quizStarted,
    stateRef,
  ]);

  async function togglePinnedWord(key: string) {
    if (!stateRef) return;
    const normalized = normalizeWordwallWord(key);
    if (!normalized) return;
    const current = Array.from(pinnedWordKeys);
    const next = pinnedWordKeys.has(normalized)
      ? current.filter((item) => item !== normalized)
      : [normalized, ...current].slice(0, 12);
    await updateDoc(stateRef, { "data.wordwallPinned": next, updatedAt: serverTimestamp() });
  }

  async function featureWordwallWord(key: string) {
    if (!stateRef) return;
    const normalized = normalizeWordwallWord(key);
    if (!normalized) return;
    await updateDoc(stateRef, { "data.wordwallFeatured": normalized, updatedAt: serverTimestamp() });
  }

  async function clearFeaturedWord() {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.wordwallFeatured": null, updatedAt: serverTimestamp() });
  }

  async function togglePinnedImageResponse(id: string) {
    if (!stateRef) return;
    const current = Array.from(pinnedImageResponseIds);
    const next = pinnedImageResponseIds.has(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, 12);
    await updateDoc(stateRef, { "data.imagePinned": next, updatedAt: serverTimestamp() });
  }

  async function featureImageResponse(id: string) {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.imageFeatured": id, updatedAt: serverTimestamp() });
  }

  async function clearFeaturedImageResponse() {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.imageFeatured": null, updatedAt: serverTimestamp() });
  }

  async function saveImageResponseText(id: string, nextText: string) {
    if (!spaceId) return;
    const cleanText = safeString(nextText);
    if (!cleanText) return;
    const responseRef = doc(dbx, "spaces", spaceId, "boardResponses", id);
    await updateDoc(responseRef, { text: cleanText, editedAt: serverTimestamp() });
  }

  function currentStopwatchMs() {
    return stopwatchMs;
  }

  async function saveClockContent(next: { title: string; goals: string; todos: string }) {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.clockTitle": safeString(next.title) ?? t("defaults.clockTitle"),
      "data.clockGoals": next.goals,
      "data.clockTodos": next.todos,
      updatedAt: serverTimestamp(),
    });
  }

  async function startStopwatch() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.stopwatchStartedAt": Date.now(),
      "data.stopwatchElapsedMs": currentStopwatchMs(),
      "data.stopwatchRunning": true,
      updatedAt: serverTimestamp(),
    });
  }

  async function pauseStopwatch() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.stopwatchStartedAt": null,
      "data.stopwatchElapsedMs": currentStopwatchMs(),
      "data.stopwatchRunning": false,
      updatedAt: serverTimestamp(),
    });
  }

  async function resetStopwatch() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.stopwatchStartedAt": null,
      "data.stopwatchElapsedMs": 0,
      "data.stopwatchRunning": false,
      updatedAt: serverTimestamp(),
    });
  }

  async function startCountdown(seconds = 60) {
    if (!stateRef) return;
    const startedAt = Date.now();
    await updateDoc(stateRef, {
      endsAt: startedAt + seconds * 1000,
      timerStartedAt: startedAt,
      timerTotalSec: seconds,
      timerVisible: true,
      updatedAt: serverTimestamp(),
    });
  }

  async function clearCountdown() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function setQuizQuestion(index: number) {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.quizCurrentIndex": index,
      "data.quizStarted": true,
      "data.quizShowAnswer": false,
      "data.quizShowScoreboard": false,
      "data.quizFinished": false,
      "data.quizAutomationRunning": false,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": null,
      "data.quizAutomationPhaseEndsAt": null,
      [`data.quizQuestionStartedAtByIndex.${index}`]: Date.now(),
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function setQuizShowAnswer(show: boolean) {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.quizShowAnswer": show,
      "data.quizShowScoreboard": false,
      "data.quizAutomationRunning": false,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": null,
      "data.quizAutomationPhaseEndsAt": null,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function setQuizShowScoreboard(show: boolean) {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.quizShowScoreboard": show,
      "data.quizFinished": false,
      "data.quizAutomationRunning": false,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": null,
      "data.quizAutomationPhaseEndsAt": null,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function finishQuiz() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.quizShowScoreboard": true,
      "data.quizStarted": true,
      "data.quizFinished": true,
      "data.quizAutomationRunning": false,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": "finished",
      "data.quizAutomationPhaseEndsAt": null,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function startQuizManual() {
    if (!stateRef || !quizQuestion) return;
    const startedAt = Date.now();
    await updateDoc(stateRef, {
      "data.quizCurrentIndex": quizIndex,
      "data.quizStarted": true,
      "data.quizShowAnswer": false,
      "data.quizShowScoreboard": false,
      "data.quizFinished": false,
      "data.quizAutomationRunning": false,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": null,
      "data.quizAutomationPhaseEndsAt": null,
      [`data.quizQuestionStartedAtByIndex.${quizIndex}`]: startedAt,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function startQuizAutomation() {
    if (!stateRef || !quizQuestion) return;
    const startedAt = Date.now();
    await updateDoc(stateRef, {
      "data.quizShowAnswer": false,
      "data.quizStarted": true,
      "data.quizShowScoreboard": false,
      "data.quizFinished": false,
      [`data.quizQuestionStartedAtByIndex.${quizIndex}`]: startedAt,
      "data.quizAutomationRunning": true,
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhase": "question",
      "data.quizAutomationPhaseEndsAt": startedAt + selectedAutoAnswerSec * 1000,
      "data.quizAutomationAnswerSec": selectedAutoAnswerSec,
      "data.quizAutomationFasitSec": selectedAutoFasitSec,
      "data.quizAutomationResultSec": selectedAutoResultSec,
      "data.quizAutomationNextSec": selectedAutoNextSec,
      endsAt: startedAt + selectedAutoAnswerSec * 1000,
      timerStartedAt: startedAt,
      timerTotalSec: selectedAutoAnswerSec,
      timerVisible: true,
      updatedAt: serverTimestamp(),
    });
  }

  async function pauseQuizAutomation() {
    if (!stateRef) return;
    await updateDoc(stateRef, {
      "data.quizAutomationPaused": true,
      endsAt: null,
      timerStartedAt: null,
      timerTotalSec: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function resumeQuizAutomation() {
    if (!stateRef || !quizAutomationPhase) return;
    const startedAt = Date.now();
    const seconds =
      quizAutomationPhase === "question"
        ? quizAutomationAnswerSec
        : quizAutomationPhase === "answer"
          ? quizAutomationFasitSec
          : quizAutomationPhase === "result"
            ? quizAutomationResultSec
            : quizAutomationNextSec;
    await updateDoc(stateRef, {
      "data.quizAutomationPaused": false,
      "data.quizAutomationPhaseEndsAt": startedAt + seconds * 1000,
      ...(quizAutomationPhase === "question"
        ? {
            endsAt: startedAt + seconds * 1000,
            timerStartedAt: startedAt,
            timerTotalSec: seconds,
            timerVisible: true,
          }
        : {}),
      updatedAt: serverTimestamp(),
    });
  }

  const stageOuterStyle: CSSProperties = {
    width: DISPLAY_STAGE_WIDTH * stageScale,
    height: DISPLAY_STAGE_HEIGHT * stageScale,
  };
  const stageInnerStyle: CSSProperties = {
    width: DISPLAY_STAGE_WIDTH,
    height: DISPLAY_STAGE_HEIGHT,
    transform: `scale(${stageScale})`,
    transformOrigin: "top left",
  };

  return (
    <AuthGate>
      <main ref={screenRef} className="flex h-screen items-center justify-center overflow-hidden bg-zinc-950 text-white">
        <div className="relative" style={stageOuterStyle}>
          <div className="absolute left-0 top-0 box-border flex flex-col px-20 py-10" style={stageInnerStyle}>
          <header className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">{t("display.brand")}</div>
              <div className="mt-2 text-xl text-zinc-300">{active ? t("display.live") : t("display.waitingStatus")}</div>
            </div>
            {active && mode === "quiz" && quizStarted && quizQuestion ? (
              <div className="absolute left-1/2 top-9 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/90 p-2 shadow-2xl shadow-black/30 backdrop-blur">
                {quizAutomationRunning ? (
                  quizAutomationPaused ? (
                    <button
                      type="button"
                      onClick={resumeQuizAutomation}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-300 px-4 text-sm font-black text-zinc-950 hover:bg-violet-200"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Fortsett
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pauseQuizAutomation}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white ring-1 ring-white/15 hover:bg-zinc-800"
                    >
                      <PauseCircle className="h-4 w-4" aria-hidden="true" />
                      Pause
                    </button>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setQuizQuestion(Math.max(0, quizIndex - 1))}
                      disabled={quizIndex <= 0}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Forrige
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuizShowAnswer(!quizShowAnswer)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-black text-zinc-950 hover:bg-emerald-200"
                    >
                      {quizShowAnswer ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      {quizShowAnswer ? "Skjul svar" : "Vis svar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuizShowScoreboard(!quizShowScoreboard)}
                      className={[
                        "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-black",
                        quizShowScoreboard ? "bg-violet-300 text-zinc-950 hover:bg-violet-200" : "border border-white/10 bg-white/5 text-white hover:bg-white/10",
                      ].join(" ")}
                    >
                      Resultat
                    </button>
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                      <Timer className="ml-2 h-4 w-4 text-emerald-300" aria-hidden="true" />
                      {[
                        { label: "15 sek", seconds: 15 },
                        { label: "30 sek", seconds: 30 },
                        { label: "1 min", seconds: 60 },
                      ].map((item) => (
                        <button
                          key={item.seconds}
                          type="button"
                          onClick={() => startCountdown(item.seconds)}
                          className="h-9 rounded-lg bg-zinc-950 px-3 text-sm font-bold text-white ring-1 ring-white/15 hover:bg-zinc-800"
                        >
                          {item.label}
                        </button>
                      ))}
                      {displayTimerActive ? (
                        <button
                          type="button"
                          onClick={clearCountdown}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-zinc-100 ring-1 ring-white/15 hover:bg-zinc-800"
                          title="Stopp timer"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => (quizIndex >= quizQuestions.length - 1 ? finishQuiz() : setQuizQuestion(Math.min(quizQuestions.length - 1, quizIndex + 1)))}
                      className={[
                        "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold",
                        quizIndex >= quizQuestions.length - 1 ? "bg-violet-300 text-zinc-950 hover:bg-violet-200" : "border border-white/10 bg-white/5 text-white hover:bg-white/10",
                      ].join(" ")}
                    >
                      {quizIndex >= quizQuestions.length - 1 ? "Sluttresultat" : "Neste"}
                      {quizIndex >= quizQuestions.length - 1 ? null : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </>
                )}
              </div>
            ) : null}
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                title={isFullscreen ? t("display.exitFullscreen") : t("display.fullscreen")}
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={closeDisplay}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                title={t("display.close")}
                aria-label={t("display.close")}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <section className="flex flex-1 items-start pt-6 pb-8">
            {loading ? (
              <WaitingDisplay title={t("display.loading")} text={t("display.waitingText")} />
            ) : !active ? (
              <WaitingDisplay title={t("display.waitingTitle")} text={t("display.waitingText")} />
            ) : mode === "poll" ? (
              <PollDisplay
                question={pollQuestion}
                options={pollOptions}
                counts={pollCounts}
                total={pollResponses.length}
                answersHidden={answersHidden}
                hiddenText={t("display.previousAnswersHidden")}
                noOptionsText={t("display.noOptions")}
              />
            ) : mode === "quiz" && !quizStarted ? (
              <QuizStartDisplay
                title={safeString(state?.data?.quizTitle) ?? "Quiz"}
                description={safeString(state?.data?.quizDescription) ?? ""}
                totalQuestions={quizQuestions.length}
                answerSec={selectedAutoAnswerSec}
                fasitSec={selectedAutoFasitSec}
                resultSec={selectedAutoResultSec}
                nextSec={selectedAutoNextSec}
                onAnswerSecChange={setSelectedAutoAnswerSec}
                onFasitSecChange={setSelectedAutoFasitSec}
                onResultSecChange={setSelectedAutoResultSec}
                onNextSecChange={setSelectedAutoNextSec}
                onStartManual={startQuizManual}
                onStartAuto={startQuizAutomation}
              />
            ) : mode === "quiz" && quizShowScoreboard ? (
              <QuizScoreboardDisplay title={safeString(state?.data?.quizTitle) ?? "Quiz"} scores={quizScores} totalQuestions={quizQuestions.length} finished={quizFinished} />
            ) : mode === "quiz" && quizQuestion ? (
              <QuizDisplay
                title={safeString(state?.data?.quizTitle) ?? "Quiz"}
                question={safeString(quizQuestion.question) ?? ""}
                options={Array.isArray(quizQuestion.options) ? quizQuestion.options : []}
                correctIndex={typeof quizQuestion.correctIndex === "number" ? quizQuestion.correctIndex : 0}
                explanation={safeString(quizQuestion.explanation) ?? ""}
                showAnswer={quizShowAnswer}
                counts={quizCounts}
                total={quizCurrentResponses.length}
                index={quizIndex}
                totalQuestions={quizQuestions.length}
              />
            ) : mode === "wordwall" ? (
              <WordwallDisplay
                prompt={wordwallPrompt}
                items={wordwallItems}
                answersHidden={answersHidden}
                hiddenText={t("display.previousWordsHidden")}
                noWordsText={t("display.noWords")}
                onTogglePinned={togglePinnedWord}
                onFeatureWord={featureWordwallWord}
                pinText={t("wordwall.pinWord")}
                unpinText={t("wordwall.unpinWord")}
                clearFeaturedText={t("wordwall.clearFeatured")}
                onClearFeatured={clearFeaturedWord}
                featuredWord={featuredWord}
                energy={wordwallEnergy}
              />
            ) : mode === "image" ? (
              <ImageSentenceDisplay
                prompt={imagePrompt}
                imageUrl={imageUrl}
                responses={imageResponses}
                pinnedIds={pinnedImageResponseIds}
                featuredResponse={featuredImageResponse}
                onTogglePinned={togglePinnedImageResponse}
                onFeature={featureImageResponse}
                onClearFeatured={clearFeaturedImageResponse}
                onSaveResponseText={saveImageResponseText}
                pinText={t("image.pinSentence")}
                unpinText={t("image.unpinSentence")}
                clearFeaturedText={t("image.clearFeatured")}
                editText={t("image.editSentence")}
                saveEditText={t("image.saveEdit")}
                savingEditText={t("image.savingEdit")}
                cancelEditText={t("image.cancelEdit")}
                editFailedText={t("image.editFailed")}
                noResponsesText={t("image.noneYet")}
                hiddenText={t("display.previousAnswersHidden")}
                answersHidden={answersHidden}
                unknownStudentText={t("display.unknownStudent")}
              />
            ) : mode === "clock" ? (
              <ClockDisplay
                title={clockTitle}
                goals={clockGoals}
                todos={clockTodos}
                now={now}
                stopwatchMs={stopwatchMs}
                stopwatchRunning={state?.data?.stopwatchRunning === true}
                endsAt={state?.endsAt}
                timerStartedAt={state?.timerStartedAt}
                timerTotalSec={state?.timerTotalSec}
                locale={locale}
                onSaveContent={saveClockContent}
                onStartStopwatch={startStopwatch}
                onPauseStopwatch={pauseStopwatch}
                onResetStopwatch={resetStopwatch}
                onStartCountdown={startCountdown}
                onClearCountdown={clearCountdown}
                labels={{
                  week: t("clock.week"),
                  goals: t("clock.goalsTitle"),
                  todos: t("clock.todosTitle"),
                  stopwatch: t("clock.stopwatchTitle"),
                  noGoals: t("clock.noGoals"),
                  noTodos: t("clock.noTodos"),
                  editLive: t("clock.editLive"),
                  saveLive: t("clock.saveLive"),
                  cancelLive: t("clock.cancelLive"),
                  startStopwatch: t("clock.startStopwatch"),
                  pauseStopwatch: t("clock.pauseStopwatch"),
                  resetStopwatch: t("clock.resetStopwatch"),
                  countdown: t("clock.countdownTitle"),
                  playCountdown: t("clock.playCountdown"),
                  stopCountdown: t("clock.stopCountdown"),
                  minutes: t("clock.minutes"),
                  countdownDone: t("clock.countdownDone"),
                }}
              />
            ) : (
              <TextDisplay
                title={title}
                prompt={prompt}
                responses={textResponses}
                answersHidden={answersHidden}
                hiddenText={t("display.previousAnswersHidden")}
                noResponsesText={t("display.noResponses")}
                unknownStudentText={t("display.unknownStudent")}
              />
            )}
          </section>
          {state?.timerVisible !== false && mode !== "clock" && displayTimerActive ? (
            <div className="absolute bottom-8 left-20 right-20 z-20">
              <DisplayTimer endsAt={state?.endsAt} startedAt={state?.timerStartedAt} totalSec={state?.timerTotalSec} />
            </div>
          ) : null}
          {quizAutomationRunning && !quizAutomationPaused && quizAutomationPhase === "next" && quizAutomationPhaseEndsAt ? (
            <NextQuestionCountdown endsAt={quizAutomationPhaseEndsAt} />
          ) : null}
          </div>
        </div>
      </main>
    </AuthGate>
  );
}

function WaitingDisplay({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
        <MonitorUp className="h-12 w-12 text-emerald-300" aria-hidden="true" />
      </div>
      <h1 className="mt-8 text-5xl font-semibold leading-tight md:text-7xl">{title}</h1>
      <p className="mt-6 text-2xl leading-relaxed text-zinc-300">{text}</p>
    </div>
  );
}

function TextDisplay({
  title,
  prompt,
  responses,
  answersHidden,
  hiddenText,
  noResponsesText,
  unknownStudentText,
}: {
  title: string;
  prompt: string;
  responses: Array<{ id: string; data: BoardResponse }>;
  answersHidden: boolean;
  hiddenText: string;
  noResponsesText: string;
  unknownStudentText: string;
}) {
  return (
    <div className="w-full">
      <div className="max-w-5xl">
        <div className="text-lg font-semibold uppercase tracking-[0.16em] text-amber-300">{title}</div>
        <h1 className="mt-4 whitespace-pre-wrap text-4xl font-semibold leading-tight md:text-6xl">{prompt}</h1>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {responses.length === 0 ? (
          <EmptyLiveState text={answersHidden ? hiddenText : noResponsesText} />
        ) : (
          responses.slice(0, 12).map((r) => {
            const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? unknownStudentText;
            const text = safeString(r.data.text) ?? "";
            const accent = isNoteColor(r.data.noteColor) ? accentFromNoteColor(r.data.noteColor) : pickStickyAccent(r.id);
            return (
              <div key={r.id} className={["rounded-3xl border p-6 shadow-sm", accent].join(" ")}>
                <div className="text-lg font-semibold">{name}</div>
                <div className="mt-4 whitespace-pre-wrap text-2xl leading-relaxed">{text}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PollDisplay({
  question,
  options,
  counts,
  total,
  answersHidden,
  hiddenText,
  noOptionsText,
}: {
  question: string;
  options: string[];
  counts: Map<string, number>;
  total: number;
  answersHidden: boolean;
  hiddenText: string;
  noOptionsText: string;
}) {
  return (
    <div className="w-full">
      <h1 className="max-w-6xl text-5xl font-semibold leading-tight md:text-7xl">{question}</h1>
      {answersHidden ? <div className="mt-6 inline-flex rounded-full bg-amber-400/15 px-5 py-2 text-xl font-semibold text-amber-200">{hiddenText}</div> : null}
      <div className="mt-12 grid gap-5">
        {options.length === 0 ? (
          <div className="text-3xl text-zinc-300">{noOptionsText}</div>
        ) : (
          options.map((opt) => {
            const count = counts.get(opt) ?? 0;
            const pct = Math.round((count / (total || 1)) * 100);
            return (
              <div key={opt} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-end justify-between gap-6">
                  <div className="text-3xl font-semibold md:text-4xl">{opt}</div>
                  <div className="text-3xl font-semibold tabular-nums text-emerald-300">
                    {count} · {pct}%
                  </div>
                </div>
                <div className="mt-5 h-6 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function QuizStartDisplay({
  title,
  description,
  totalQuestions,
  answerSec,
  fasitSec,
  resultSec,
  nextSec,
  onAnswerSecChange,
  onFasitSecChange,
  onResultSecChange,
  onNextSecChange,
  onStartManual,
  onStartAuto,
}: {
  title: string;
  description: string;
  totalQuestions: number;
  answerSec: number;
  fasitSec: number;
  resultSec: number;
  nextSec: number;
  onAnswerSecChange: (seconds: number) => void;
  onFasitSecChange: (seconds: number) => void;
  onResultSecChange: (seconds: number) => void;
  onNextSecChange: (seconds: number) => void;
  onStartManual: () => void;
  onStartAuto: () => void;
}) {
  return (
    <div className="flex min-h-[760px] w-full items-center justify-center">
      <div className="max-w-6xl text-center">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Quiz klar</div>
        <h1 className="mt-5 text-5xl font-black leading-tight md:text-7xl">{title}</h1>
        {description ? <p className="mx-auto mt-6 max-w-3xl text-2xl leading-relaxed text-zinc-300">{description}</p> : null}
        <div className="mt-8 inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xl font-semibold text-zinc-200">
          {totalQuestions} spørsmål
        </div>
        <div className="mx-auto mt-8 grid max-w-5xl gap-3 rounded-[2rem] border border-white/10 bg-white/5 p-5 text-left md:grid-cols-2">
          <QuizStartTimeGroup label="Svarfrist" value={answerSec} options={[15, 30, 60]} onChange={onAnswerSecChange} />
          <QuizStartTimeGroup label="Fasit" value={fasitSec} options={[10, 20, 30]} onChange={onFasitSecChange} />
          <QuizStartTimeGroup label="Resultat" value={resultSec} options={[10, 20, 30]} onChange={onResultSecChange} />
          <QuizStartTimeGroup label="Nedtelling" value={nextSec} options={[5, 10]} onChange={onNextSecChange} />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onStartManual}
            className="inline-flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-8 text-2xl font-black text-white hover:bg-white/15"
          >
            <Play className="h-7 w-7" aria-hidden="true" />
            Start manuelt
          </button>
          <button
            type="button"
            onClick={onStartAuto}
            className="inline-flex min-h-16 items-center gap-3 rounded-2xl bg-violet-300 px-8 text-2xl font-black text-zinc-950 hover:bg-violet-200"
          >
            <Timer className="h-7 w-7" aria-hidden="true" />
            Start auto
          </button>
        </div>
        <p className="mt-8 text-xl text-zinc-400">Deltakerne kan gjøre seg klare på egen skjerm.</p>
      </div>
    </div>
  );
}

function QuizStartTimeGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (seconds: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-zinc-950/70 p-4">
      <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-zinc-400">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((seconds) => (
          <button
            key={seconds}
            type="button"
            onClick={() => onChange(seconds)}
            className={[
              "min-h-11 rounded-xl px-4 text-base font-black",
              value === seconds ? "bg-emerald-300 text-zinc-950" : "border border-white/10 bg-white/5 text-white hover:bg-white/10",
            ].join(" ")}
          >
            {seconds >= 60 ? `${seconds / 60} min` : `${seconds} sek`}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuizDisplay({
  title,
  question,
  options,
  correctIndex,
  explanation,
  showAnswer,
  counts,
  total,
  index,
  totalQuestions,
}: {
  title: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  showAnswer: boolean;
  counts: Map<string, number>;
  total: number;
  index: number;
  totalQuestions: number;
}) {
  return (
      <div className="w-full">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">{title}</div>
        <div className="mt-2 text-xl text-zinc-400">Spørsmål {index + 1} av {totalQuestions} · {total} svar</div>
      <h1 className="mt-6 max-w-6xl text-5xl font-semibold leading-tight md:text-6xl">{question}</h1>
      <div className="mt-10 grid gap-4">
        {options.map((opt, optionIndex) => {
          const count = counts.get(opt) ?? 0;
          const pct = Math.round((count / (total || 1)) * 100);
          const correct = showAnswer && optionIndex === correctIndex;
          return (
            <div key={`${opt}-${optionIndex}`} className={["rounded-3xl border px-6 py-5 transition", correct ? "border-emerald-300 bg-emerald-300 text-zinc-950 shadow-2xl shadow-emerald-950/20" : showAnswer ? "border-white/10 bg-white/[0.03] text-zinc-400" : "border-white/10 bg-white/5"].join(" ")}>
              <div className="flex items-end justify-between gap-6">
                <div className="flex min-w-0 items-center gap-4">
                  {correct ? <span className="rounded-full bg-zinc-950 px-3 py-1 text-lg font-black text-white">Riktig</span> : null}
                  <div className="text-3xl font-semibold">{opt}</div>
                </div>
                <div className={["text-3xl font-semibold tabular-nums", correct ? "text-zinc-950" : "text-violet-200"].join(" ")}>
                  {count} · {pct}%
                </div>
              </div>
              <div className={["mt-4 h-5 overflow-hidden rounded-full", correct ? "bg-black/15" : "bg-white/10"].join(" ")}>
                <div className={["h-full rounded-full transition-[width]", correct ? "bg-zinc-950" : "bg-violet-400"].join(" ")} style={{ width: `${pct}%` }} />
              </div>
              {correct && explanation ? (
                <div className="mt-4 max-w-5xl border-t border-zinc-950/15 pt-4 text-xl font-semibold leading-relaxed text-zinc-950">
                  {explanation}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizScoreboardDisplay({
  title,
  scores,
  totalQuestions,
  finished,
}: {
  title: string;
  scores: Array<{ key: string; name: string; emoji: string; score: number; correct: number; answered: number; totalMs: number }>;
  totalQuestions: number;
  finished: boolean;
}) {
  const topThree = scores.slice(0, 3);
  const maxScore = Math.max(1, ...scores.map((score) => score.score));
  const podiumOrder = [topThree[1], topThree[0], topThree[2]].filter(Boolean);
  const podiumClasses = finished ? ["mt-24 min-h-[230px]", "mt-0 min-h-[330px] ring-4 ring-emerald-300/40", "mt-36 min-h-[190px]"] : ["mt-20 min-h-[210px]", "mt-0 min-h-[280px]", "mt-32 min-h-[170px]"];
  const podiumLabels = ["2", "1", "3"];

  return (
    <div className="w-full">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">{title}</div>
      <h1 className={["mt-5 font-semibold leading-tight", finished ? "text-6xl md:text-8xl" : "text-5xl md:text-7xl"].join(" ")}>
        {finished ? "Quizen er ferdig!" : "Resultat så langt"}
      </h1>
      {finished ? <div className="mt-5 text-3xl font-semibold text-emerald-200">Sluttresultat · takk for innsatsen!</div> : null}
      {scores.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-10 text-3xl text-zinc-300">Ingen svar ennå.</div>
      ) : (
        <>
          <div className="mt-12 grid min-h-[360px] items-end gap-6 md:grid-cols-3">
            {podiumOrder.map((score, index) => (
              <div key={score.key} className={["flex flex-col justify-end rounded-[2rem] border border-white/10 bg-white/5 p-6 text-center shadow-2xl shadow-black/20", podiumClasses[index]].join(" ")}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-300 text-3xl font-black text-zinc-950">{podiumLabels[index]}</div>
                <div className="mt-6 flex min-w-0 items-center justify-center gap-3">
                  {score.emoji ? <span className="text-5xl leading-none">{score.emoji}</span> : null}
                  <span className="truncate text-4xl font-black">{score.name}</span>
                </div>
                <div className="mt-3 text-5xl font-black text-emerald-300">{score.score}</div>
                <div className="mt-1 text-xl font-semibold text-zinc-400">{score.correct} riktige av {totalQuestions}</div>
                {score.totalMs > 0 && score.answered > 0 ? (
                  <div className="mt-2 text-lg font-semibold text-violet-200">snitt {Math.max(1, Math.round(score.totalMs / score.answered / 1000))}s</div>
                ) : null}
              </div>
            ))}
          </div>

          {scores.length ? (
            <div className="mt-10 grid gap-4">
              {scores.slice(0, 3).map((score, index) => {
                const pct = Math.round((score.score / maxScore) * 100);
                return (
                  <div key={score.key} className="rounded-3xl border border-white/10 bg-white/5 px-6 py-4">
                    <div className="flex items-center justify-between gap-6">
                      <div className="truncate text-2xl font-black">
                        {index + 1}. {score.emoji ? `${score.emoji} ` : ""}{score.name}
                      </div>
                      <div className="text-2xl font-black text-emerald-300">{score.score} poeng</div>
                    </div>
                    <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function NextQuestionCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/45 backdrop-blur-[2px]">
      <div className="rounded-[2rem] border border-white/10 bg-zinc-950/90 px-16 py-12 text-center shadow-2xl shadow-black/40">
        <div className="text-xl font-black uppercase tracking-[0.18em] text-emerald-300">Neste spørsmål</div>
        <div className="mt-4 font-mono text-8xl font-black tabular-nums text-white">{seconds}</div>
      </div>
    </div>
  );
}

function WordwallDisplay({
  prompt,
  items,
  answersHidden,
  hiddenText,
  noWordsText,
  onTogglePinned,
  onFeatureWord,
  pinText,
  unpinText,
  clearFeaturedText,
  onClearFeatured,
  featuredWord,
  energy,
}: {
  prompt: string;
  items: WordwallItem[];
  answersHidden: boolean;
  hiddenText: string;
  noWordsText: string;
  onTogglePinned?: (key: string) => void;
  onFeatureWord?: (key: string) => void;
  pinText: string;
  unpinText: string;
  clearFeaturedText: string;
  onClearFeatured?: () => void;
  featuredWord?: WordwallItem | null;
  energy: WordwallEnergy;
}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  function scheduleTogglePinnedWord(key: string) {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onTogglePinned?.(key);
      clickTimerRef.current = null;
    }, 220);
  }

  function handleFeatureWord(key: string) {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onFeatureWord?.(key);
  }

  return (
    <div className="relative w-full">
      <h1 className="max-w-5xl text-4xl font-semibold leading-tight md:text-6xl">{prompt}</h1>
      {answersHidden ? <div className="mt-6 inline-flex rounded-full bg-amber-400/15 px-5 py-2 text-xl font-semibold text-amber-200">{hiddenText}</div> : null}
      {featuredWord ? (
        <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-amber-200 px-12 py-9 text-zinc-950 shadow-2xl ring-8 ring-amber-300/40">
          <button
            type="button"
            onClick={onClearFeatured}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white shadow-lg hover:bg-zinc-800"
            title={clearFeaturedText}
            aria-label={clearFeaturedText}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="text-7xl font-black leading-none md:text-9xl">{featuredWord.word}</div>
        </div>
      ) : null}
      <div className="relative mt-8 min-h-[560px] w-full overflow-hidden">
        {items.length === 0 ? (
          <EmptyLiveState text={answersHidden ? hiddenText : noWordsText} />
        ) : (
          items.slice(0, 30).map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => scheduleTogglePinnedWord(item.key)}
              onDoubleClick={() => handleFeatureWord(item.key)}
              title={item.pinned ? unpinText : pinText}
              className={[
                "absolute rounded-3xl px-7 py-5 text-left text-zinc-950 shadow-sm transition hover:scale-105",
                index % 2 === 0 ? "wordwall-display-word-a" : "wordwall-display-word-b",
                item.pinned ? "bg-amber-200 ring-4 ring-amber-300/60" : "bg-white",
              ].join(" ")}
              style={wordwallPositionStyle(index, item.pinned, energy)}
            >
              <span className={[wordwallTextSize(item.count), "font-bold leading-none"].join(" ")}>{item.word}</span>
            </button>
          ))
        )}
      </div>
      <style jsx global>{`
        .wordwall-display-word-a {
          animation: wordwallDisplayFloatA 3.8s ease-in-out infinite;
        }

        .wordwall-display-word-b {
          animation: wordwallDisplayFloatB 4.2s ease-in-out infinite;
        }

        @keyframes wordwallDisplayFloatA {
          0%,
          100% {
            transform: translateX(-46px) translateY(8px) rotate(-0.8deg);
          }
          50% {
            transform: translateX(58px) translateY(-18px) rotate(0.9deg);
          }
        }

        @keyframes wordwallDisplayFloatB {
          0%,
          100% {
            transform: translateX(54px) translateY(-6px) rotate(0.7deg);
          }
          50% {
            transform: translateX(-66px) translateY(17px) rotate(-1deg);
          }
        }
      `}</style>
    </div>
  );
}

function ImageSentenceDisplay({
  prompt,
  imageUrl,
  responses,
  pinnedIds,
  featuredResponse,
  onTogglePinned,
  onFeature,
  onClearFeatured,
  onSaveResponseText,
  pinText,
  unpinText,
  clearFeaturedText,
  editText,
  saveEditText,
  savingEditText,
  cancelEditText,
  editFailedText,
  noResponsesText,
  hiddenText,
  answersHidden,
  unknownStudentText,
}: {
  prompt: string;
  imageUrl: string;
  responses: Array<{ id: string; data: BoardResponse }>;
  pinnedIds: Set<string>;
  featuredResponse?: { id: string; data: BoardResponse } | null;
  onTogglePinned: (id: string) => void;
  onFeature: (id: string) => void;
  onClearFeatured: () => void;
  onSaveResponseText: (id: string, nextText: string) => Promise<void>;
  pinText: string;
  unpinText: string;
  clearFeaturedText: string;
  editText: string;
  saveEditText: string;
  savingEditText: string;
  cancelEditText: string;
  editFailedText: string;
  noResponsesText: string;
  hiddenText: string;
  answersHidden: boolean;
  unknownStudentText: string;
}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingFeatured, setEditingFeatured] = useState(false);
  const [featuredDraft, setFeaturedDraft] = useState("");
  const [savingFeatured, setSavingFeatured] = useState(false);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setEditingFeatured(false);
    setFeaturedDraft(safeString(featuredResponse?.data.text) ?? "");
  }, [featuredResponse?.id, featuredResponse?.data.text]);

  function scheduleToggle(id: string) {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onTogglePinned(id);
      clickTimerRef.current = null;
    }, 220);
  }

  function feature(id: string) {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onFeature(id);
  }

  async function saveFeaturedEdit() {
    if (!featuredResponse || savingFeatured) return;
    const cleanText = safeString(featuredDraft);
    if (!cleanText) return;

    setSavingFeatured(true);
    try {
      await onSaveResponseText(featuredResponse.id, cleanText);
      setEditingFeatured(false);
    } catch {
      window.alert(editFailedText);
    } finally {
      setSavingFeatured(false);
    }
  }

  return (
    <div className="relative grid w-full gap-8 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.05fr)]">
      <div>
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">{prompt}</h1>
        {answersHidden ? <div className="mt-6 inline-flex rounded-full bg-amber-400/15 px-5 py-2 text-xl font-semibold text-amber-200">{hiddenText}</div> : null}
        <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center text-2xl text-zinc-400">{prompt}</div>
          )}
        </div>
      </div>

      <div className="relative min-h-[620px]">
        {featuredResponse ? (
          <div className="absolute inset-x-8 top-1/2 z-30 -translate-y-1/2 rounded-[2rem] bg-amber-200 px-10 py-8 text-zinc-950 shadow-2xl ring-8 ring-amber-300/40">
            <button
              type="button"
              onClick={() => setEditingFeatured(true)}
              className="absolute right-16 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg hover:bg-amber-50"
              title={editText}
              aria-label={editText}
            >
              <Pencil className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClearFeatured}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white shadow-lg hover:bg-zinc-800"
              title={clearFeaturedText}
              aria-label={clearFeaturedText}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            {editingFeatured ? (
              <div className="max-w-[90%] space-y-5">
                <textarea
                  value={featuredDraft}
                  onChange={(e) => setFeaturedDraft(e.target.value)}
                  className="min-h-[220px] w-full rounded-3xl border-4 border-amber-300 bg-white px-7 py-6 text-4xl font-black leading-tight text-zinc-950 shadow-inner outline-none md:text-5xl"
                  autoFocus
                />
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    onClick={saveFeaturedEdit}
                    disabled={!safeString(featuredDraft) || savingFeatured}
                    className="inline-flex items-center gap-3 rounded-full bg-emerald-600 px-6 py-3 text-2xl font-bold text-white shadow-lg hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
                  >
                    <Check className="h-7 w-7" aria-hidden="true" />
                    {savingFeatured ? savingEditText : saveEditText}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFeaturedDraft(safeString(featuredResponse.data.text) ?? "");
                      setEditingFeatured(false);
                    }}
                    className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-2xl font-bold text-zinc-950 shadow-lg hover:bg-amber-50"
                  >
                    <X className="h-7 w-7" aria-hidden="true" />
                    {cancelEditText}
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-[90%] whitespace-pre-wrap text-4xl font-black leading-tight md:text-6xl">
                {safeString(featuredResponse.data.text)}
              </div>
            )}
          </div>
        ) : null}

        {responses.length === 0 ? (
          <EmptyLiveState text={answersHidden ? hiddenText : noResponsesText} />
        ) : (
          <div className="grid gap-4">
            {responses.slice(0, 12).map((r) => {
              const pinned = pinnedIds.has(r.id);
              const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? unknownStudentText;
              const text = safeString(r.data.text) ?? "";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => scheduleToggle(r.id)}
                  onDoubleClick={() => feature(r.id)}
                  title={pinned ? unpinText : pinText}
                  className={[
                    "rounded-3xl border p-6 text-left shadow-sm transition hover:scale-[1.01]",
                    pinned ? "border-amber-300 bg-amber-200 text-amber-950 ring-4 ring-amber-300/50" : "border-white/10 bg-white text-zinc-950",
                  ].join(" ")}
                >
                  <div className="text-lg font-semibold opacity-70">{name}</div>
                  <div className="mt-3 whitespace-pre-wrap text-3xl font-bold leading-snug">{text}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalogClock({ now }: { now: number }) {
  const date = new Date(now);
  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours() % 12;
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  return (
    <div className="relative aspect-square w-full rounded-full border-[14px] border-white/20 bg-white/10 shadow-2xl">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((tick) => (
        <div key={tick} className="absolute left-1/2 top-1/2 h-[46%] w-1 origin-bottom" style={{ transform: `translate(-50%, -100%) rotate(${tick * 30}deg)` }}>
          <div className={["mx-auto rounded-full bg-white/85", tick % 3 === 0 ? "h-7 w-2.5" : "h-4 w-1.5"].join(" ")} />
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 h-[26%] w-4 origin-bottom rounded-full bg-white" style={{ transform: `translate(-50%, -100%) rotate(${hourDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[36%] w-3 origin-bottom rounded-full bg-white" style={{ transform: `translate(-50%, -100%) rotate(${minuteDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[39%] w-1 origin-bottom rounded-full bg-rose-400" style={{ transform: `translate(-50%, -100%) rotate(${secondDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-400 ring-8 ring-zinc-950" />
    </div>
  );
}

function ClockDisplay({
  title,
  goals,
  todos,
  now,
  stopwatchMs,
  stopwatchRunning,
  endsAt,
  timerStartedAt,
  timerTotalSec,
  locale,
  onSaveContent,
  onStartStopwatch,
  onPauseStopwatch,
  onResetStopwatch,
  onStartCountdown,
  onClearCountdown,
  labels,
}: {
  title: string;
  goals: string;
  todos: string;
  now: number;
  stopwatchMs: number;
  stopwatchRunning: boolean;
  endsAt: unknown;
  timerStartedAt: unknown;
  timerTotalSec: unknown;
  locale: string;
  onSaveContent: (next: { title: string; goals: string; todos: string }) => Promise<void>;
  onStartStopwatch: () => Promise<void>;
  onPauseStopwatch: () => Promise<void>;
  onResetStopwatch: () => Promise<void>;
  onStartCountdown: (seconds?: number) => Promise<void>;
  onClearCountdown: () => Promise<void>;
  labels: {
    week: string;
    goals: string;
    todos: string;
    stopwatch: string;
    noGoals: string;
    noTodos: string;
    editLive: string;
    saveLive: string;
    cancelLive: string;
    startStopwatch: string;
    pauseStopwatch: string;
    resetStopwatch: string;
    countdown: string;
    playCountdown: string;
    stopCountdown: string;
    minutes: string;
    countdownDone: string;
  };
}) {
  const [editingBox, setEditingBox] = useState<"goals" | "todos" | null>(null);
  const [draftGoals, setDraftGoals] = useState(goals);
  const [draftTodos, setDraftTodos] = useState(todos);
  const [saving, setSaving] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState(1);
  const [timeTool, setTimeTool] = useState<"countdown" | "stopwatch">("countdown");
  const previousRemainingRef = useRef<number | null>(null);
  const date = new Date(now);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const fullDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const week = isoWeekNumber(date);
  const goalLines = goals.split("\n").map((line) => line.trim()).filter(Boolean);
  const todoLines = todos.split("\n").map((line) => line.trim()).filter(Boolean);
  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof timerStartedAt === "number" ? timerStartedAt : null;
  const totalSeconds = typeof timerTotalSec === "number" && timerTotalSec > 0 ? timerTotalSec : null;
  const remainingMs = endsAtMs ? Math.max(0, endsAtMs - now) : null;
  const remainingSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
  const elapsedMs = startedAtMs ? Math.max(0, now - startedAtMs) : 0;
  const countdownPct = totalSeconds ? Math.max(0, Math.min(100, (elapsedMs / (totalSeconds * 1000)) * 100)) : 0;
  const countdownDone = endsAtMs !== null && remainingMs === 0;

  useEffect(() => {
    if (!editingBox) setDraftGoals(goals);
  }, [editingBox, goals]);

  useEffect(() => {
    if (!editingBox) setDraftTodos(todos);
  }, [editingBox, todos]);

  useEffect(() => {
    const previous = previousRemainingRef.current;
    if (previous !== null && previous > 0 && countdownDone) {
      try {
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          const ctx = new AudioContextCtor();
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.frequency.value = 880;
          gain.gain.value = 0.08;
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.25);
        }
      } catch {
        //
      }
    }
    previousRemainingRef.current = remainingMs;
  }, [countdownDone, remainingMs]);

  async function saveLiveEdit() {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveContent({ title, goals: draftGoals, todos: draftTodos });
      setEditingBox(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={["grid w-full items-center gap-8 xl:grid-cols-[340px_minmax(0,1fr)]", countdownDone ? "animate-pulse" : ""].join(" ")}>
      <div className="mx-auto w-full max-w-[340px]">
        <AnalogClock now={now} />
      </div>
      <div>
        <div className="text-xl font-semibold uppercase tracking-[0.18em] text-emerald-300">{title}</div>
        <div className="mt-3 font-mono text-8xl font-black leading-none md:text-[8.2rem]">{time}</div>
        <div className="mt-3 text-3xl font-semibold capitalize text-zinc-200">
          {day} · {fullDate} · {labels.week} {week}
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold uppercase tracking-wide text-blue-300">{labels.goals}</div>
              <button type="button" onClick={() => setEditingBox("goals")} className="rounded-full bg-white/10 p-2 hover:bg-white/15" aria-label={labels.editLive} title={labels.editLive}>
                <Pencil className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {editingBox === "goals" ? (
              <EditableClockBox value={draftGoals} onChange={setDraftGoals} onSave={saveLiveEdit} onCancel={() => setEditingBox(null)} saving={saving} labels={labels} />
            ) : (
              <div className="mt-5 space-y-3">
                {(goalLines.length ? goalLines : [labels.noGoals]).map((line, index) => (
                  <div key={`${line}-${index}`} className="text-2xl font-bold leading-snug">{line}</div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold uppercase tracking-wide text-emerald-300">{labels.todos}</div>
              <button type="button" onClick={() => setEditingBox("todos")} className="rounded-full bg-white/10 p-2 hover:bg-white/15" aria-label={labels.editLive} title={labels.editLive}>
                <Pencil className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {editingBox === "todos" ? (
              <EditableClockBox value={draftTodos} onChange={setDraftTodos} onSave={saveLiveEdit} onCancel={() => setEditingBox(null)} saving={saving} labels={labels} />
            ) : (
              <div className="mt-5 space-y-3">
                {(todoLines.length ? todoLines : [labels.noTodos]).map((line, index) => (
                  <div key={`${line}-${index}`} className="text-2xl font-bold leading-snug">{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-5">
          <div className="mb-4 inline-flex rounded-full border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setTimeTool("countdown")}
              className={["rounded-full px-4 py-1.5 text-base font-bold", timeTool === "countdown" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"].join(" ")}
            >
              {labels.countdown}
            </button>
            <button
              type="button"
              onClick={() => setTimeTool("stopwatch")}
              className={["rounded-full px-4 py-1.5 text-base font-bold", timeTool === "stopwatch" ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10"].join(" ")}
            >
              {labels.stopwatch}
            </button>
          </div>

          {timeTool === "stopwatch" ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-base font-bold uppercase tracking-wide text-amber-300">{labels.stopwatch}</div>
                <div className="mt-2 font-mono text-6xl font-black">{formatDuration(stopwatchMs)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={stopwatchRunning ? onPauseStopwatch : onStartStopwatch}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-500"
                >
                  {stopwatchRunning ? <PauseCircle className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
                  {stopwatchRunning ? labels.pauseStopwatch : labels.startStopwatch}
                </button>
                <button
                  type="button"
                  onClick={onResetStopwatch}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-base font-bold text-zinc-100 hover:bg-white/15"
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  {labels.resetStopwatch}
                </button>
              </div>
            </div>
          ) : (
            <div className={["rounded-[1.5rem] border p-5", countdownDone ? "border-amber-300 bg-amber-300 text-zinc-950" : "border-white/10 bg-white/5"].join(" ")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={["text-base font-bold uppercase tracking-wide", countdownDone ? "text-zinc-950" : "text-blue-300"].join(" ")}>{labels.countdown}</div>
                  <div className="mt-2 font-mono text-6xl font-black">{remainingSeconds !== null ? formatDuration(remainingMs ?? 0) : `${countdownMinutes} min`}</div>
                  {countdownDone ? <div className="mt-2 text-2xl font-black">{labels.countdownDone}</div> : null}
                </div>
              <div className="min-w-[300px] max-w-md flex-1">
                  <div className="flex items-center justify-between gap-3 text-base font-bold">
                    <span>0</span>
                    <span>{countdownMinutes} {labels.minutes}</span>
                    <span>60</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={countdownMinutes}
                    onChange={(e) => setCountdownMinutes(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-400"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onStartCountdown(Math.max(1, countdownMinutes) * 60)}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-500/90 px-4 py-2.5 text-base font-bold text-white hover:bg-blue-500"
                  >
                    <Play className="h-5 w-5" aria-hidden="true" />
                    {labels.playCountdown}
                  </button>
                  <button
                    type="button"
                    onClick={onClearCountdown}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-base font-bold text-zinc-100 hover:bg-white/15"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                    {labels.stopCountdown}
                  </button>
                </div>
              </div>
              {remainingSeconds !== null ? (
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
                  <div className={["h-full transition-[width]", countdownDone ? "bg-zinc-950" : "bg-blue-400"].join(" ")} style={{ width: `${countdownPct}%` }} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableClockBox({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  labels: { saveLive: string; cancelLive: string };
}) {
  return (
    <div className="mt-5 space-y-4">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[190px] w-full rounded-3xl border border-slate-300 bg-white px-6 py-5 text-3xl font-bold leading-snug text-zinc-950 caret-zinc-950 shadow-inner outline-none [color-scheme:light] placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/35"
        style={{ backgroundColor: "#ffffff", color: "#0f172a", WebkitTextFillColor: "#0f172a" }}
        autoFocus
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          {labels.saveLive}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-lg font-bold text-white hover:bg-white/15"
        >
          <X className="h-5 w-5" aria-hidden="true" />
          {labels.cancelLive}
        </button>
      </div>
    </div>
  );
}

function EmptyLiveState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-2xl text-zinc-300">
      {text}
    </div>
  );
}

function DisplayTimer({
  endsAt,
  startedAt,
  totalSec,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof startedAt === "number" ? startedAt : null;
  const total = typeof totalSec === "number" && totalSec > 0 ? totalSec : null;

  if (!endsAtMs) return null;

  const remainingMs = Math.max(0, endsAtMs - now);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const pct =
    startedAtMs && total
      ? Math.max(0, Math.min(100, ((now - startedAtMs) / (total * 1000)) * 100))
      : 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/80 px-6 py-4 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-3 text-sm font-black uppercase tracking-[0.16em] text-zinc-300">
          <Clock className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          Tid igjen
        </div>
        <div className="font-mono text-4xl font-black tabular-nums">{secondsLeft}s</div>
      </div>
      <div className="relative h-5 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(90deg, #34d399 0%, #34d399 50%, #fbbf24 50%, #fbbf24 75%, #fb7185 75%, #fb7185 100%)",
          }}
        />
        <div className="absolute bottom-0 top-0 bg-zinc-800/90 transition-[left]" style={{ left: `${pct}%`, right: 0 }} />
        <div className="absolute bottom-0 top-0 w-1 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)] transition-[left]" style={{ left: `calc(${pct}% - 2px)` }} />
      </div>
    </div>
  );
}
