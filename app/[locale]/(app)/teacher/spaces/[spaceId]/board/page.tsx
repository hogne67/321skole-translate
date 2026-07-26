// app/[locale]/(app)/teacher/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { auth, db, storage } from "@/lib/firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Check, Clock, Download, ExternalLink, MonitorUp, PauseCircle, Pencil, Play, RotateCcw, Send, Square, Users, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";
type TabKey = "question" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type WordwallEnergy = "calm" | "live" | "energy";

type BoardQuizQuestion = {
  type?: "multiple_choice" | "true_false";
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
    quizShowAnswer?: boolean;
    quizFinished?: boolean;
    quizQuestionStartedAtByIndex?: Record<string, number>;
  };
  updatedAt?: unknown;
};

type BoardResponse = {
  sessionId?: string;

  uid?: string | null;
  displayName?: string | null;
  groupName?: string | null;
  text?: string;
  responseType?: string;
  noteColor?: NoteColor | string;

  pollChoice?: string;
  quizQuestionIndex?: number;
  quizChoice?: string;
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

type SpaceLite = {
  title?: string;
  name?: string;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function newSessionId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isTimestampLike(v: unknown): v is { toMillis: () => number } {
  return !!v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis?: unknown }).toMillis === "function";
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
      return "bg-amber-50 border-amber-200";
    case "emerald":
      return "bg-emerald-50 border-emerald-200";
    case "sky":
      return "bg-sky-50 border-sky-200";
    case "rose":
      return "bg-rose-50 border-rose-200";
    case "violet":
      return "bg-violet-50 border-violet-200";
  }
}

function pickStickyAccent(seed: string) {
  const accents = [
    "bg-amber-50 border-amber-200",
    "bg-emerald-50 border-emerald-200",
    "bg-sky-50 border-sky-200",
    "bg-rose-50 border-rose-200",
    "bg-violet-50 border-violet-200",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return accents[h % accents.length];
}

function normalizeOptions(raw: string): string[] {
  const s = raw.replace(/\r\n/g, "\n");
  const parts = s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 10);
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

function safeStorageName(input: string) {
  return input.replace(/[^\w.-]+/g, "_").slice(0, 90) || "image";
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

function cleanClockField(value: string | null) {
  return stripLegacyClockDefault(value);
}

function isWordwallEnergy(v: unknown): v is WordwallEnergy {
  return v === "calm" || v === "live" || v === "energy";
}

function wordwallSizeClass(count: number, present: boolean): string {
  if (present) {
    if (count >= 8) return "text-6xl font-bold leading-tight";
    if (count >= 6) return "text-5xl font-bold leading-tight";
    if (count >= 4) return "text-4xl font-bold leading-tight";
    if (count >= 2) return "text-3xl font-semibold leading-tight";
    return "text-2xl font-semibold leading-tight";
  }

  if (count >= 8) return "text-5xl font-bold leading-tight";
  if (count >= 6) return "text-4xl font-bold leading-tight";
  if (count >= 4) return "text-3xl font-bold leading-tight";
  if (count >= 2) return "text-2xl font-semibold leading-tight";
  return "text-xl font-semibold leading-tight";
}

export default function TeacherBoardPage() {
  const t = useTranslations("teacherBoard");
  const locale = useLocale();

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("question");

  const present = false;
  const [showTimer, setShowTimer] = useState(true);

  const [title, setTitle] = useState<string>(() => t("defaults.title"));
  const [prompt, setPrompt] = useState<string>(() => t("defaults.prompt"));

  const [pollQuestion, setPollQuestion] = useState<string>(() => t("defaults.pollQuestion"));
  const [pollOptionsRaw, setPollOptionsRaw] = useState<string>(() => t("defaults.pollOptions"));

  const [wordwallPrompt, setWordwallPrompt] = useState<string>(() => t("defaults.wordwallPrompt"));
  const [wordwallPdfBusy, setWordwallPdfBusy] = useState(false);
  const [space, setSpace] = useState<SpaceLite | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string>(() => t("defaults.imagePrompt"));
  const [imageUrl, setImageUrl] = useState("");
  const [imageAiPrompt, setImageAiPrompt] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageToolMessage, setImageToolMessage] = useState<string | null>(null);
  const [editingImageResponseId, setEditingImageResponseId] = useState<string | null>(null);
  const [editingImageText, setEditingImageText] = useState("");
  const [savingImageEdit, setSavingImageEdit] = useState(false);
  const [imagePdfBusy, setImagePdfBusy] = useState(false);
  const [clockTitle, setClockTitle] = useState<string>(() => t("defaults.clockTitle"));
  const [clockGoals, setClockGoals] = useState<string>(() => t("defaults.clockGoals"));
  const [clockTodos, setClockTodos] = useState<string>(() => t("defaults.clockTodos"));
  const [now, setNow] = useState(() => Date.now());

  const [responses, setResponses] = useState<Array<{ id: string; data: BoardResponse }>>([]);

  const dbx = useMemo(() => requireDb(db), []);
  const spaceRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId) : null), [dbx, spaceId]);
  const stateRef = useMemo(() => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null), [dbx, spaceId]);
  const responsesCol = useMemo(() => (spaceId ? collection(dbx, "spaces", spaceId, "boardResponses") : null), [dbx, spaceId]);
  const wordClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirtyRef = useRef({ title: false, prompt: false, poll: false, wordwall: false, image: false, clock: false });

  useEffect(() => {
    if (!dirtyRef.current.title) setTitle(t("defaults.title"));
    if (!dirtyRef.current.prompt) setPrompt(t("defaults.prompt"));
    if (!dirtyRef.current.poll) {
      setPollQuestion(t("defaults.pollQuestion"));
      setPollOptionsRaw(t("defaults.pollOptions"));
    }
    if (!dirtyRef.current.wordwall) setWordwallPrompt(t("defaults.wordwallPrompt"));
    if (!dirtyRef.current.image) setImagePrompt(t("defaults.imagePrompt"));
    if (!dirtyRef.current.clock) {
      setClockTitle(t("defaults.clockTitle"));
      setClockGoals("");
      setClockTodos("");
    }
  }, [t]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!spaceRef) return;

    return onSnapshot(
      spaceRef,
      (snap) => setSpace(snap.exists() ? (snap.data() as SpaceLite) : null),
      () => setSpace(null)
    );
  }, [spaceRef]);

  useEffect(() => {
    if (!stateRef) return;

    setLoading(true);
    const unsub = onSnapshot(
      stateRef,
      (snap) => {
        const data = (snap.data() as BoardState | undefined) ?? null;
        setState(data);
        setErr(null);
        setLoading(false);

        if (!dirtyRef.current.title && data?.data?.title) setTitle(data.data.title);
        if (!dirtyRef.current.prompt && data?.data?.prompt) setPrompt(data.data.prompt);

        if (!dirtyRef.current.poll) {
          if (data?.data?.pollQuestion) setPollQuestion(data.data.pollQuestion);
          if (Array.isArray(data?.data?.pollOptions) && data.data.pollOptions.length > 0) {
            setPollOptionsRaw(data.data.pollOptions.join(", "));
          }
        }

        if (!dirtyRef.current.wordwall && data?.data?.wordwallPrompt) {
          setWordwallPrompt(data.data.wordwallPrompt);
        }
        if (!dirtyRef.current.image) {
          if (data?.data?.imagePrompt) setImagePrompt(data.data.imagePrompt);
          if (data?.data?.imageUrl) setImageUrl(data.data.imageUrl);
        }
        if (!dirtyRef.current.clock) {
          setClockTitle(safeString(data?.data?.clockTitle) ?? t("defaults.clockTitle"));
          setClockGoals(cleanClockField(safeString(data?.data?.clockGoals)));
          setClockTodos(cleanClockField(safeString(data?.data?.clockTodos)));
        }
        if (typeof data?.timerVisible === "boolean") setShowTimer(data.timerVisible);
      },
      (e: unknown) => {
        const msg =
          e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message ?? "") : "";
        setErr(msg || t("errors.fetchState"));
        setLoading(false);
      }
    );

    return () => unsub();
  }, [stateRef, t]);

  useEffect(() => {
    const rawMode = typeof state?.mode === "string" ? state.mode.trim().toLowerCase() : "";
    if (rawMode === "quiz") setTab("quiz");
  }, [state?.mode, state?.sessionId]);

  useEffect(() => {
    if (!responsesCol) return;

    const unsub = onSnapshot(
      responsesCol,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as BoardResponse }));
        setResponses(docs);
      },
      () => {}
    );

    return () => unsub();
  }, [responsesCol]);

  useEffect(() => {
    return () => {
      if (wordClickTimerRef.current) clearTimeout(wordClickTimerRef.current);
      if (imageClickTimerRef.current) clearTimeout(imageClickTimerRef.current);
    };
  }, []);

  const activeSessionId = safeString(state?.sessionId);
  const active = state?.active === true;
  const clearedAt = typeof state?.clearedAt === "number" ? state.clearedAt : null;
  const filteredResponses = useMemo(() => {
    if (!activeSessionId) return [];
    const list = responses.filter((r) => r.data?.sessionId === activeSessionId);

    return list
      .filter((r) => {
        if (!clearedAt) return true;
        const ms = toMillis(r.data?.createdAt) ?? 0;
        return ms >= clearedAt;
      })
      .sort((a, b) => {
        const ams = toMillis(a.data?.createdAt) ?? 0;
        const bms = toMillis(b.data?.createdAt) ?? 0;
        return bms - ams;
      });
  }, [responses, activeSessionId, clearedAt]);

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
  const pinnedWordKeys = useMemo(() => {
    const arr = Array.isArray(state?.data?.wordwallPinned) ? state.data.wordwallPinned : [];
    return new Set(arr.map((v) => normalizeWordwallWord(String(v))).filter(Boolean));
  }, [state?.data?.wordwallPinned]);

  const pollCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of pollResponses) {
      const c = safeString(r.data.pollChoice);
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [pollResponses]);

  const wordwallItems = useMemo<WordwallItem[]>(() => {
    const map = new Map<string, WordwallItem>();

    for (const r of wordwallResponses) {
      const raw = safeString(r.data.wordwallWord);
      if (!raw) continue;

      const key = normalizeWordwallWord(raw);
      if (!key) continue;

      const created = toMillis(r.data.createdAt) ?? 0;
      const existing = map.get(key);

      if (existing) {
        existing.count += 1;
        if (created > existing.latest) existing.latest = created;
      } else {
        map.set(key, {
          key,
          word: displayWordwallWord(key),
          count: 1,
          latest: created,
        });
      }
    }

    return Array.from(map.values()).map((item) => ({ ...item, pinned: pinnedWordKeys.has(item.key) })).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return b.latest - a.latest;
    });
  }, [pinnedWordKeys, wordwallResponses]);

  async function startLiveNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "text",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: { title: safeString(title) ?? t("fallbacks.question"), prompt: safeString(prompt) ?? "" },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function stopLive() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      { active: false, endsAt: null, timerStartedAt: null, timerTotalSec: null, timerVisible: showTimer, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function pushTextSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "text",
        timerVisible: showTimer,
        data: { title: safeString(title) ?? t("fallbacks.question"), prompt: safeString(prompt) ?? "" },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pushPollSameSession() {
    if (!stateRef) return;
    const opts = normalizeOptions(pollOptionsRaw);
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "poll",
        timerVisible: showTimer,
        data: {
          pollQuestion: safeString(pollQuestion) ?? t("defaults.pollTitle"),
          pollOptions: opts,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startPollNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();
    const opts = normalizeOptions(pollOptionsRaw);

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "poll",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          pollQuestion: safeString(pollQuestion) ?? t("defaults.pollTitle"),
          pollOptions: opts,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pushWordwallSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "wordwall",
        timerVisible: showTimer,
        data: {
          wordwallPrompt: safeString(wordwallPrompt) ?? t("defaults.wordwallShortPrompt"),
          wordwallEnergy: isWordwallEnergy(state?.data?.wordwallEnergy) ? state.data.wordwallEnergy : "live",
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startWordwallNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "wordwall",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          wordwallPrompt: safeString(wordwallPrompt) ?? t("defaults.wordwallShortPrompt"),
          wordwallPinned: [],
          wordwallFeatured: null,
          wordwallEnergy: isWordwallEnergy(state?.data?.wordwallEnergy) ? state.data.wordwallEnergy : "live",
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startTimer(seconds: number) {
    if (!stateRef) return;
    const startedAt = Date.now();
    const endsAtMs = startedAt + seconds * 1000;
    await setDoc(
      stateRef,
      { endsAt: endsAtMs, timerStartedAt: startedAt, timerTotalSec: seconds, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function clearTimer() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      { endsAt: null, timerStartedAt: null, timerTotalSec: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function pushImageSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "image",
        timerVisible: showTimer,
        data: {
          imagePrompt: safeString(imagePrompt) ?? t("defaults.imagePrompt"),
          imageUrl: safeString(imageUrl) ?? "",
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startImageNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();

    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "image",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          imagePrompt: safeString(imagePrompt) ?? t("defaults.imagePrompt"),
          imageUrl: safeString(imageUrl) ?? "",
          imagePinned: [],
          imageFeatured: null,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pushClockSameSession() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        active: true,
        mode: "clock",
        timerVisible: showTimer,
        data: {
          clockTitle: safeString(clockTitle) ?? t("defaults.clockTitle"),
          clockGoals: cleanClockField(safeString(clockGoals)),
          clockTodos: cleanClockField(safeString(clockTodos)),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function startClockNewSession() {
    if (!stateRef) return;
    const sessionId = newSessionId();
    await setDoc(
      stateRef,
      {
        active: true,
        sessionId,
        mode: "clock",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: showTimer,
        clearedAt: null,
        data: {
          clockTitle: safeString(clockTitle) ?? t("defaults.clockTitle"),
          clockGoals: cleanClockField(safeString(clockGoals)),
          clockTodos: cleanClockField(safeString(clockTodos)),
          stopwatchStartedAt: null,
          stopwatchElapsedMs: 0,
          stopwatchRunning: false,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function resetClockActivity() {
    if (!stateRef) return;
    const nextTitle = t("defaults.clockTitle");
    dirtyRef.current.clock = false;
    setClockTitle(nextTitle);
    setClockGoals("");
    setClockTodos("");
    await setDoc(
      stateRef,
      {
        mode: "clock",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        data: {
          clockTitle: nextTitle,
          clockGoals: "",
          clockTodos: "",
          stopwatchStartedAt: null,
          stopwatchElapsedMs: 0,
          stopwatchRunning: false,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  function currentStopwatchMs() {
    const elapsed = typeof state?.data?.stopwatchElapsedMs === "number" ? state.data.stopwatchElapsedMs : 0;
    const startedAt = typeof state?.data?.stopwatchStartedAt === "number" ? state.data.stopwatchStartedAt : null;
    const running = state?.data?.stopwatchRunning === true;
    return running && startedAt ? elapsed + Math.max(0, now - startedAt) : elapsed;
  }

  async function startStopwatch() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        data: {
          stopwatchStartedAt: Date.now(),
          stopwatchElapsedMs: currentStopwatchMs(),
          stopwatchRunning: true,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function pauseStopwatch() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        data: {
          stopwatchStartedAt: null,
          stopwatchElapsedMs: currentStopwatchMs(),
          stopwatchRunning: false,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function resetStopwatch() {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        data: {
          stopwatchStartedAt: null,
          stopwatchElapsedMs: 0,
          stopwatchRunning: false,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function publishImageUrl(nextUrl: string) {
    setImageUrl(nextUrl);
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        data: {
          imagePrompt: safeString(imagePrompt) ?? t("defaults.imagePrompt"),
          imageUrl: nextUrl,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function uploadBoardImage(file: File | null) {
    if (!file || !spaceId) return;
    setImageToolMessage(null);
    setImageUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error(t("image.errors.loginUpload"));
      if (!file.type.startsWith("image/")) throw new Error(t("image.errors.imageOnly"));
      if (file.size > 8 * 1024 * 1024) throw new Error(t("image.errors.tooLarge"));

      const fileRef = ref(storage, `board-images/${user.uid}/${spaceId}/${Date.now()}-${safeStorageName(file.name)}`);
      await uploadBytes(fileRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });
      const url = await getDownloadURL(fileRef);
      await publishImageUrl(url);
      setImageToolMessage(t("image.uploaded"));
    } catch (e: unknown) {
      setImageToolMessage(e instanceof Error ? e.message : t("image.errors.uploadFailed"));
    } finally {
      setImageUploading(false);
    }
  }

  async function generateBoardImage() {
    if (!spaceId || imageGenerating) return;
    setImageToolMessage(null);
    setImageGenerating(true);
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error(t("image.errors.loginGenerate"));
      const customPrompt = safeString(imageAiPrompt);
      if (!customPrompt) throw new Error(t("image.errors.promptRequired"));

      const token = await user.getIdToken();
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonId: `board-${spaceId}`,
          format: "16:9",
          style: "illustration",
          promptMode: "custom",
          customPrompt,
          title: t("image.aiTitle"),
          language: locale,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { imageUrl?: unknown; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t("image.errors.generateFailed"));
      const nextUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
      if (!nextUrl) throw new Error(t("image.errors.noImage"));
      await publishImageUrl(nextUrl);
      setImageToolMessage(t("image.generated"));
    } catch (e: unknown) {
      setImageToolMessage(e instanceof Error ? e.message : t("image.errors.generateFailed"));
    } finally {
      setImageGenerating(false);
    }
  }

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

  function scheduleTogglePinnedWord(key: string) {
    if (wordClickTimerRef.current) clearTimeout(wordClickTimerRef.current);
    wordClickTimerRef.current = setTimeout(() => {
      void togglePinnedWord(key);
      wordClickTimerRef.current = null;
    }, 220);
  }

  async function featureWordwallWord(key: string) {
    if (!stateRef) return;
    const normalized = normalizeWordwallWord(key);
    if (!normalized) return;
    await updateDoc(stateRef, { "data.wordwallFeatured": normalized, updatedAt: serverTimestamp() });
  }

  function handleFeatureWordwallWord(key: string) {
    if (wordClickTimerRef.current) {
      clearTimeout(wordClickTimerRef.current);
      wordClickTimerRef.current = null;
    }
    void featureWordwallWord(key);
  }

  async function clearFeaturedWord() {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.wordwallFeatured": null, updatedAt: serverTimestamp() });
  }

  const pinnedImageResponseIds = useMemo(() => {
    const arr = Array.isArray(state?.data?.imagePinned) ? state.data.imagePinned : [];
    return new Set(arr.map((v) => String(v)).filter(Boolean));
  }, [state?.data?.imagePinned]);

  async function togglePinnedImageResponse(id: string) {
    if (!stateRef) return;
    const current = Array.from(pinnedImageResponseIds);
    const next = pinnedImageResponseIds.has(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, 12);
    await updateDoc(stateRef, { "data.imagePinned": next, updatedAt: serverTimestamp() });
  }

  function scheduleTogglePinnedImageResponse(id: string) {
    if (imageClickTimerRef.current) clearTimeout(imageClickTimerRef.current);
    imageClickTimerRef.current = setTimeout(() => {
      void togglePinnedImageResponse(id);
      imageClickTimerRef.current = null;
    }, 220);
  }

  async function featureImageResponse(id: string) {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.imageFeatured": id, updatedAt: serverTimestamp() });
  }

  function handleFeatureImageResponse(id: string) {
    if (imageClickTimerRef.current) {
      clearTimeout(imageClickTimerRef.current);
      imageClickTimerRef.current = null;
    }
    void featureImageResponse(id);
  }

  async function clearFeaturedImageResponse() {
    if (!stateRef) return;
    await updateDoc(stateRef, { "data.imageFeatured": null, updatedAt: serverTimestamp() });
  }

  function startEditingImageResponse(response: { id: string; data: BoardResponse }) {
    if (imageClickTimerRef.current) {
      clearTimeout(imageClickTimerRef.current);
      imageClickTimerRef.current = null;
    }
    setEditingImageResponseId(response.id);
    setEditingImageText(safeString(response.data.text) ?? "");
  }

  function cancelEditingImageResponse() {
    setEditingImageResponseId(null);
    setEditingImageText("");
  }

  async function saveEditedImageResponse() {
    if (!spaceId || !editingImageResponseId || savingImageEdit) return;
    const nextText = safeString(editingImageText);
    if (!nextText) return;

    setSavingImageEdit(true);
    try {
      const responseRef = doc(dbx, "spaces", spaceId, "boardResponses", editingImageResponseId);
      await updateDoc(responseRef, { text: nextText, editedAt: serverTimestamp() });
      cancelEditingImageResponse();
    } catch {
      window.alert(t("image.editFailed"));
    } finally {
      setSavingImageEdit(false);
    }
  }

  async function updateWordwallEnergy(next: WordwallEnergy) {
    if (!stateRef) return;
    await setDoc(stateRef, { data: { wordwallEnergy: next }, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function copyWordwallSummary() {
    const lines = wordwallItems.map((item) => `${item.word}${item.count > 1 ? ` x${item.count}` : ""}`);
    await navigator.clipboard?.writeText([boardWordwallPrompt, "", ...lines].join("\n"));
  }

  async function downloadWordwallPdf() {
    if (wordwallPdfBusy) return;
    setWordwallPdfBusy(true);
    try {
      const featuredKey = featuredWord?.key ?? null;
      const res = await fetch("/api/pdf/board-wordwall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            title: t("wordwall.pdfTitle"),
            subtitle: t("wordwall.pdfSubtitle"),
            prompt: boardWordwallPrompt,
            generatedAt: new Date().toLocaleString(locale),
            responseCount: wordwallResponses.length,
            spaceLabel,
            words: wordwallItems.map((item) => ({
              word: item.word,
              count: item.count,
              pinned: item.pinned === true,
              featured: item.key === featuredKey,
            })),
            labels: {
              generatedAt: t("wordwall.pdf.generatedAt"),
              prompt: t("wordwall.pdf.prompt"),
              responses: t("wordwall.pdf.responses"),
              space: t("wordwall.pdf.space"),
              featured: t("wordwall.pdf.featured"),
              pinned: t("wordwall.pdf.pinned"),
              allWords: t("wordwall.pdf.allWords"),
              noWords: t("wordwall.pdf.noWords"),
              site: t("wordwall.pdf.site"),
            },
          },
        }),
      });

      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "321skole-ordsamling.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(t("wordwall.pdfError"));
    } finally {
      setWordwallPdfBusy(false);
    }
  }

  async function downloadImagePdf() {
    if (imagePdfBusy) return;
    setImagePdfBusy(true);
    try {
      const featuredId = featuredImageResponse?.id ?? null;
      const res = await fetch("/api/pdf/board-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            title: t("image.pdfTitle"),
            subtitle: t("image.pdfSubtitle"),
            prompt: boardImagePrompt,
            imageUrl: boardImageUrl,
            generatedAt: new Date().toLocaleString(locale),
            responseCount: imageResponses.length,
            spaceLabel,
            sentences: imageResponses.map((r) => ({
              id: r.id,
              name: safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? t("responses.unknown"),
              text: safeString(r.data.text) ?? "",
              pinned: pinnedImageResponseIds.has(r.id),
              featured: r.id === featuredId,
            })),
            labels: {
              generatedAt: t("image.pdf.generatedAt"),
              prompt: t("image.pdf.prompt"),
              responses: t("image.pdf.responses"),
              space: t("image.pdf.space"),
              featured: t("image.pdf.featured"),
              pinned: t("image.pdf.pinned"),
              allSentences: t("image.pdf.allSentences"),
              noSentences: t("image.pdf.noSentences"),
              site: t("image.pdf.site"),
            },
          },
        }),
      });

      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "321skole-bildeaktivitet.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(t("image.pdfError"));
    } finally {
      setImagePdfBusy(false);
    }
  }

  async function toggleTimerVisibility() {
    const next = !showTimer;
    setShowTimer(next);
    if (!stateRef) return;
    await setDoc(stateRef, { timerVisible: next, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function clearAnswersSoft() {
    if (!stateRef) return;
    await setDoc(stateRef, { clearedAt: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
  }

  async function showAnswersAgain() {
    if (!stateRef) return;
    await setDoc(stateRef, { clearedAt: null, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function setQuizQuestion(index: number) {
    if (!stateRef) return;
    await setDoc(
      stateRef,
      {
        data: {
          quizCurrentIndex: index,
          quizShowAnswer: false,
          quizFinished: false,
          quizQuestionStartedAtByIndex: {
            ...(state?.data?.quizQuestionStartedAtByIndex ?? {}),
            [index]: Date.now(),
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function setQuizShowAnswer(show: boolean) {
    if (!stateRef) return;
    await setDoc(stateRef, { data: { quizShowAnswer: show }, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function pushQuizSameSession() {
    if (!stateRef || !boardQuizQuestion) return;
    await setDoc(stateRef, { active: true, mode: "quiz", timerVisible: false, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function startQuizNewSession() {
    if (!stateRef || boardQuizQuestions.length === 0) return;
    const startedAt = Date.now();
    await setDoc(
      stateRef,
      {
        active: true,
        sessionId: newSessionId(),
        mode: "quiz",
        endsAt: null,
        timerStartedAt: null,
        timerTotalSec: null,
        timerVisible: false,
        clearedAt: null,
        data: {
          quizTitle: safeString(state?.data?.quizTitle) ?? "Quiz",
          quizDescription: safeString(state?.data?.quizDescription) ?? "",
          quizQuestions: boardQuizQuestions,
          quizCurrentIndex: 0,
          quizShowAnswer: false,
          quizFinished: false,
          quizQuestionStartedAtByIndex: { 0: startedAt },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  const boardTitle = safeString(state?.data?.title) ?? title;
  const boardPrompt = safeString(state?.data?.prompt) ?? prompt;
  const boardWordwallPrompt = safeString(state?.data?.wordwallPrompt) ?? wordwallPrompt;
  const boardWordwallEnergy = isWordwallEnergy(state?.data?.wordwallEnergy) ? state.data.wordwallEnergy : "live";
  const featuredWordKey = safeString(state?.data?.wordwallFeatured);
  const featuredWord = featuredWordKey ? wordwallItems.find((item) => item.key === normalizeWordwallWord(featuredWordKey)) : null;
  const spaceLabel = safeString(space?.title) ?? safeString(space?.name) ?? spaceId ?? "";
  const boardImagePrompt = safeString(state?.data?.imagePrompt) ?? imagePrompt;
  const boardImageUrl = safeString(state?.data?.imageUrl) ?? safeString(imageUrl) ?? "";
  const featuredImageResponseId = safeString(state?.data?.imageFeatured);
  const featuredImageResponse = featuredImageResponseId ? imageResponses.find((r) => r.id === featuredImageResponseId) : null;
  const boardClockTitle = safeString(state?.data?.clockTitle) ?? safeString(clockTitle) ?? t("defaults.clockTitle");
  const boardClockGoals = stripLegacyClockDefault(safeString(state?.data?.clockGoals) ?? safeString(clockGoals));
  const boardClockTodos = stripLegacyClockDefault(safeString(state?.data?.clockTodos) ?? safeString(clockTodos));
  const stopwatchMs = currentStopwatchMs();
  const stopwatchRunning = state?.data?.stopwatchRunning === true;
  const boardQuizQuestions = Array.isArray(state?.data?.quizQuestions) ? state.data.quizQuestions : [];
  const boardQuizIndex = Math.max(0, Math.min(boardQuizQuestions.length - 1, typeof state?.data?.quizCurrentIndex === "number" ? state.data.quizCurrentIndex : 0));
  const boardQuizQuestion = boardQuizQuestions[boardQuizIndex] ?? null;
  const boardQuizShowAnswer = state?.data?.quizShowAnswer === true;
  const boardQuizResponses = quizResponses.filter((r) => r.data.quizQuestionIndex === boardQuizIndex);
  const boardQuizCounts = new Map<string, number>();
  for (const r of boardQuizResponses) {
    const choice = safeString(r.data.quizChoice);
    if (choice) boardQuizCounts.set(choice, (boardQuizCounts.get(choice) ?? 0) + 1);
  }
  const boardQuizCorrectOption =
    boardQuizQuestion && Array.isArray(boardQuizQuestion.options) && typeof boardQuizQuestion.correctIndex === "number"
      ? safeString(boardQuizQuestion.options[boardQuizQuestion.correctIndex])
      : null;
  const boardQuizCorrectResponses = boardQuizCorrectOption
    ? boardQuizResponses.filter((r) => safeString(r.data.quizChoice) === boardQuizCorrectOption)
    : [];
  const boardQuizCorrectPct = Math.round((boardQuizCorrectResponses.length / (boardQuizResponses.length || 1)) * 100);

  const noteCardClass = present
    ? "rounded-2xl border p-6 shadow-sm transition-transform hover:-translate-y-0.5"
    : "rounded-xl border p-3 shadow-sm transition-transform hover:-translate-y-0.5";

  const noteNameClass = present ? "text-base font-semibold" : "text-sm font-semibold";
  const noteTextClass = present ? "mt-3 whitespace-pre-wrap text-lg leading-relaxed" : "mt-2 whitespace-pre-wrap text-sm leading-relaxed";

  const responseGridClass = present ? "grid gap-6 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
  const tabLabel =
    tab === "poll" ? t("tabs.poll") : tab === "wordwall" ? t("tabs.wordwall") : tab === "image" ? t("tabs.image") : tab === "clock" ? t("tabs.clock") : tab === "quiz" ? t("tabs.quiz") : t("tabs.question");
  const liveModeLabel = state?.mode === "quiz" ? "Quiz" : tabLabel;
  const previewMode: BoardMode = tab === "poll" ? "poll" : tab === "wordwall" ? "wordwall" : tab === "image" ? "image" : tab === "clock" ? "clock" : tab === "quiz" ? "quiz" : "text";
  const liveAction =
    tab === "poll" ? pushPollSameSession : tab === "wordwall" ? pushWordwallSameSession : tab === "image" ? pushImageSameSession : tab === "clock" ? pushClockSameSession : tab === "quiz" ? pushQuizSameSession : pushTextSameSession;
  const newRoundAction =
    tab === "poll" ? startPollNewSession : tab === "wordwall" ? startWordwallNewSession : tab === "image" ? startImageNewSession : tab === "clock" ? startClockNewSession : tab === "quiz" ? startQuizNewSession : startLiveNewSession;
  const responseCount = tab === "quiz" ? boardQuizResponses.length : tab === "poll" ? pollResponses.length : tab === "wordwall" ? wordwallResponses.length : tab === "image" ? imageResponses.length : textResponses.length;
  const answersHidden = clearedAt !== null;
  const displayHref = spaceId ? `/${locale}/teacher/spaces/${spaceId}/board/display` : "#";

  return (
    <AuthGate>
      <div className={present ? "min-h-screen bg-zinc-950 text-zinc-50" : "min-h-screen bg-slate-50 text-foreground"}>
        <div className={present ? "mx-auto max-w-[1500px] p-5 pb-60 md:pb-32" : "mx-auto max-w-[1500px] p-4 pb-60 md:p-6 md:pb-32"}>
          <div
            className={[
              "sticky top-0 z-10 -mx-4 border-b px-4 py-4 backdrop-blur md:-mx-6 md:px-6",
              present ? "border-white/10 bg-zinc-950/90" : "border-blue-100 bg-white/95 shadow-sm",
            ].join(" ")}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold">{t("header.title")}</h1>
                  <span className={present ? "rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200" : "rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"}>
                    {present ? t("surface.live") : t("surface.work")}
                  </span>
                  {!loading ? (
                    <span
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
                        present ? "border-white/15 bg-white/5 text-zinc-300" : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                    >
                      <span className={["h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                      {active ? t("status.live") : t("status.notLive")}
                      {active ? ` • ${liveModeLabel}` : ""}
                    </span>
                  ) : null}
                </div>

                {!present ? <div className="mt-2 max-w-2xl text-sm text-slate-600">{t("surface.workHint")}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <TabButton active={tab === "question"} onClick={() => setTab("question")}>
                    {t("tabs.question")}
                  </TabButton>
                  <TabButton active={tab === "poll"} onClick={() => setTab("poll")}>
                    {t("tabs.poll")}
                  </TabButton>
                  <TabButton active={tab === "wordwall"} onClick={() => setTab("wordwall")}>
                    {t("tabs.wordwall")}
                  </TabButton>
                  <TabButton active={tab === "image"} onClick={() => setTab("image")}>
                    {t("tabs.image")}
                  </TabButton>
                  <TabButton active={tab === "clock"} onClick={() => setTab("clock")}>
                    {t("tabs.clock")}
                  </TabButton>
                  {state?.mode === "quiz" ? (
                    <TabButton active={tab === "quiz"} onClick={() => setTab("quiz")}>
                      {t("tabs.quiz")}
                    </TabButton>
                  ) : null}
                </div>
              </div>

              {!present ? (
                <div className="hidden xl:block">
                  <StudentScreenPreview
                    active={active}
                    mode={previewMode}
                    title={boardTitle}
                    prompt={boardPrompt}
                    pollQuestion={safeString(state?.data?.pollQuestion) ?? pollQuestion}
                    pollOptions={state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)}
                    wordwallPrompt={boardWordwallPrompt}
                    imagePrompt={boardImagePrompt}
                    imageUrl={boardImageUrl}
                    clockTitle={boardClockTitle}
                    quizTitle={safeString(state?.data?.quizTitle) ?? "Quiz"}
                    quizQuestion={safeString(boardQuizQuestion?.question) ?? ""}
                    quizOptions={Array.isArray(boardQuizQuestion?.options) ? boardQuizQuestion.options : []}
                    now={now}
                    stopwatchMs={stopwatchMs}
                    compact
                  />
                </div>
              ) : null}
            </div>

            {showTimer ? (
              <div className="mt-3">
                <TimerBar
                  endsAt={state?.endsAt}
                  startedAt={state?.timerStartedAt}
                  totalSec={state?.timerTotalSec}
                  teacher
                  onStart={startTimer}
                  onClear={clearTimer}
                />
              </div>
            ) : null}
          </div>

          {err && <div className="mt-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          {tab === "quiz" && state?.mode === "quiz" && boardQuizQuestion ? (
            <section className="mt-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Live quiz</div>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">{safeString(state.data?.quizTitle) ?? "Quiz"}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Spørsmål {boardQuizIndex + 1} av {boardQuizQuestions.length} · {boardQuizResponses.length} svar
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setQuizQuestion(Math.max(0, boardQuizIndex - 1))} disabled={boardQuizIndex <= 0} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-40">
                    Forrige
                  </button>
                  <button type="button" onClick={() => setQuizShowAnswer(!boardQuizShowAnswer)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100">
                    {boardQuizShowAnswer ? "Skjul fasit" : "Vis fasit"}
                  </button>
                  <button type="button" onClick={() => setQuizQuestion(Math.min(boardQuizQuestions.length - 1, boardQuizIndex + 1))} disabled={boardQuizIndex >= boardQuizQuestions.length - 1} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
                    Neste
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <div className="text-lg font-black text-slate-950">{boardQuizQuestion.question}</div>
                  <div className="mt-4 grid gap-2">
                    {(boardQuizQuestion.options ?? []).map((option, index) => {
                      const isCorrect = boardQuizShowAnswer && index === boardQuizQuestion.correctIndex;
                      return (
                        <div key={`${option}-${index}`} className={["rounded-xl border px-4 py-3 text-sm font-bold", isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-900"].join(" ")}>
                          {option}
                        </div>
                      );
                    })}
                  </div>
                  {boardQuizShowAnswer && safeString(boardQuizQuestion.explanation) ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">{boardQuizQuestion.explanation}</div>
                  ) : null}
                  {boardQuizShowAnswer ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div className="text-sm font-black text-emerald-950">
                        {boardQuizCorrectResponses.length} av {boardQuizResponses.length} svarte riktig ({boardQuizCorrectPct}%)
                      </div>
                      {boardQuizCorrectResponses.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {boardQuizCorrectResponses.slice(0, 12).map((response) => {
                            const name = safeString(response.data.displayName) ?? safeString(response.data.groupName) ?? "Elev";
                            return (
                              <span key={response.id} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-900">
                                {name}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-black text-slate-950">{boardQuizShowAnswer ? "Resultat" : "Svar nå"}</div>
                  <div className="mt-3 space-y-2">
                    {(boardQuizQuestion.options ?? []).map((option, index) => {
                      const count = boardQuizCounts.get(option) ?? 0;
                      const pct = Math.round((count / (boardQuizResponses.length || 1)) * 100);
                      const isCorrect = boardQuizShowAnswer && index === boardQuizQuestion.correctIndex;
                      return (
                        <div key={`${option}-result-${index}`} className={["rounded-lg px-3 py-2 text-sm", isCorrect ? "bg-emerald-100 text-emerald-950" : "bg-white"].join(" ")}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">{option}</span>
                            <span className={["rounded-full px-2 py-1 text-xs font-black", isCorrect ? "bg-emerald-200" : "bg-slate-100"].join(" ")}>
                              {count} · {pct}%
                            </span>
                          </div>
                          <div className={["mt-2 h-1.5 overflow-hidden rounded-full", isCorrect ? "bg-emerald-200" : "bg-slate-100"].join(" ")}>
                            <div className={["h-full rounded-full", isCorrect ? "bg-emerald-600" : "bg-violet-500"].join(" ")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "quiz" ? null : tab === "poll" ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              {!present ? (
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-amber-950">{t("poll.setupTitle")}</div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("poll.questionLabel")}</label>
                        <input
                          value={pollQuestion}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollQuestion(e.target.value);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("poll.questionPlaceholder")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("poll.optionsLabel")}</label>
                        <textarea
                          value={pollOptionsRaw}
                          onChange={(e) => {
                            dirtyRef.current.poll = true;
                            setPollOptionsRaw(e.target.value);
                          }}
                          className="min-h-[110px] w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("poll.optionsPlaceholder")}
                        />
                        <div className="mt-1 text-xs text-muted-foreground">{t("poll.optionsHint")}</div>
                      </div>

                        <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-900">{t("poll.anonymousHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "overflow-hidden rounded-xl border border-emerald-200 bg-background shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-emerald-300">{t("tabs.poll")}</div>
                      <div className="mt-2 text-3xl font-semibold leading-tight">{safeString(state?.data?.pollQuestion) ?? pollQuestion}</div>
                    </div>
                  ) : null}
                  <div className={present ? "mb-2 flex items-center justify-between" : "mb-2 flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-4"}>
                    <div className={present ? "text-base font-medium text-zinc-200" : "text-sm font-semibold text-emerald-950"}>{t("poll.resultsTitle")}</div>
                    <div className={present ? "text-sm text-zinc-400" : "rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900"}>
                      {activeSessionId ? t("poll.responsesCount", { count: pollResponses.length }) : t("poll.noSession")}
                    </div>
                  </div>

                  {activeSessionId ? (
                    <div className={present ? "space-y-2" : "space-y-2 p-5"}>
                      {(state?.data?.pollOptions ?? normalizeOptions(pollOptionsRaw)).map((opt) => {
                        const count = pollCounts.get(opt) ?? 0;
                        const total = pollResponses.length || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={opt} className={present ? "rounded-2xl border border-white/10 bg-white/5 p-4" : "rounded-lg border p-3"}>
                            <div className="flex items-center justify-between gap-2">
                              <div className={present ? "text-xl font-semibold" : "text-sm font-medium"}>{opt}</div>
                              <div className={present ? "text-lg tabular-nums text-zinc-300" : "text-sm tabular-nums text-muted-foreground"}>
                                {count} ({pct}%)
                              </div>
                            </div>
                            <div className={present ? "mt-3 h-4 w-full overflow-hidden rounded-full bg-white/10" : "mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"}>
                              <div className={present ? "h-full bg-emerald-400" : "h-full bg-black"} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 text-sm text-muted-foreground">{t("poll.startHint")}</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "wordwall" ? (
            <div className={present ? "mt-4" : "mt-4 grid gap-4 xl:grid-cols-12"}>
              {!present ? (
                <div className="space-y-4 xl:col-span-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-950">{t("wordwall.setupTitle")}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{t("wordwall.setupText")}</div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("wordwall.promptLabel")}</label>
                        <textarea
                          value={wordwallPrompt}
                          onChange={(e) => {
                            dirtyRef.current.wordwall = true;
                            setWordwallPrompt(e.target.value);
                          }}
                          className="min-h-[150px] w-full rounded-xl border px-3 py-2 text-sm leading-6"
                          placeholder={t("wordwall.promptPlaceholder")}
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium">{t("wordwall.energyTitle")}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {(["calm", "live", "energy"] as const).map((energy) => (
                            <button
                              key={energy}
                              type="button"
                              onClick={() => updateWordwallEnergy(energy)}
                              className={[
                                "rounded-full border px-3 py-2 text-sm font-semibold transition",
                                boardWordwallEnergy === energy
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-amber-200 bg-white/80 text-slate-800 hover:bg-white",
                              ].join(" ")}
                            >
                              {t(`wordwall.energy.${energy}`)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-900">{t("wordwall.anonymousHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "xl:col-span-8"}>
                <div className={present ? "" : "overflow-hidden rounded-xl border border-sky-200 bg-background shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-sky-300">{t("tabs.wordwall")}</div>
                      <div className="mt-2 text-3xl font-semibold leading-tight">{boardWordwallPrompt}</div>
                    </div>
                  ) : (
                    <div className="border-b border-sky-100 bg-sky-50/70 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-sky-950">{t("wordwall.liveTitle")}</div>
                          <div className="mt-1 max-w-3xl text-lg font-semibold leading-7 text-slate-950">{boardWordwallPrompt}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sky-900">
                            {t("common.answers", { count: wordwallResponses.length })}
                          </div>
                          <button
                            type="button"
                            onClick={copyWordwallSummary}
                            disabled={wordwallItems.length === 0}
                            className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {t("wordwall.copySummary")}
                          </button>
                          <button
                            type="button"
                            onClick={downloadWordwallPdf}
                            disabled={wordwallItems.length === 0 || wordwallPdfBusy}
                            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            {wordwallPdfBusy ? t("wordwall.pdfBusy") : t("wordwall.downloadPdf")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!activeSessionId ? (
                    <div className={present ? "text-sm text-muted-foreground" : "p-5 text-sm text-muted-foreground"}>{t("wordwall.noSession")}</div>
                  ) : wordwallItems.length === 0 ? (
                    <div className={present ? "text-sm text-muted-foreground" : "flex min-h-[360px] items-center justify-center p-5 text-center text-sm text-muted-foreground"}>{t("wordwall.noneYet")}</div>
                  ) : (
                    <div className={present ? "" : "max-h-[calc(100vh-300px)] min-h-[360px] overflow-auto bg-sky-50/40 p-6"}>
                      {featuredWord ? (
                        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-100 p-5 text-amber-950 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">{t("wordwall.featuredTitle")}</div>
                              <div className="mt-2 text-4xl font-bold leading-none">{featuredWord.word}</div>
                            </div>
                            <button
                              type="button"
                              onClick={clearFeaturedWord}
                              className="rounded-full border border-amber-300 bg-white/70 px-3 py-1.5 text-sm font-semibold hover:bg-white"
                            >
                              {t("wordwall.clearFeatured")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className={present ? "space-y-5" : "flex min-h-[300px] flex-wrap items-center justify-center gap-4"}>
                        {wordwallItems.map((item, index) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => scheduleTogglePinnedWord(item.key)}
                            onDoubleClick={() => handleFeatureWordwallWord(item.key)}
                            title={item.pinned ? t("wordwall.unpinWord") : t("wordwall.pinWord")}
                            className={
                              present
                                ? "rounded-2xl border border-white/10 bg-white px-6 py-5 text-left text-zinc-950 shadow-sm"
                                : [
                                    "inline-flex items-center gap-2 rounded-2xl border px-5 py-4 text-left text-slate-950 shadow-sm transition hover:-translate-y-0.5",
                                    index % 2 === 0 ? "wordwall-live-word-a" : "wordwall-live-word-b",
                                    item.pinned
                                      ? "border-amber-300 bg-amber-100 ring-2 ring-amber-300/70"
                                      : "border-sky-100 bg-white hover:border-sky-200",
                                  ].join(" ")
                            }
                            style={{
                              animationDelay: `${(index % 8) * 120}ms`,
                              animationDuration:
                                boardWordwallEnergy === "calm"
                                  ? `${5.2 + (index % 4) * 0.4}s`
                                  : boardWordwallEnergy === "energy"
                                    ? `${2.4 + (index % 4) * 0.25}s`
                                    : `${3.2 + (index % 4) * 0.35}s`,
                            }}
                          >
                            <div className={wordwallSizeClass(item.count, present)}>{item.word}</div>
                            {!present && item.pinned ? (
                              <div className="rounded-full bg-amber-300 px-2.5 py-1 text-xs font-bold text-amber-950">{t("wordwall.pinned")}</div>
                            ) : null}
                            {!present && item.count > 1 ? (
                              <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">x{item.count}</div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "image" ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-slate-950">{t("image.setupTitle")}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">{t("image.setupText")}</div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("image.uploadLabel")}</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          void uploadBoardImage(e.target.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                        className="block w-full rounded-xl border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                        disabled={imageUploading || imageGenerating}
                      />
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-white/80 p-3">
                      <label className="mb-1 block text-sm font-medium">{t("image.aiPromptLabel")}</label>
                      <textarea
                        value={imageAiPrompt}
                        onChange={(e) => setImageAiPrompt(e.target.value)}
                        className="min-h-[92px] w-full rounded-lg border px-3 py-2 text-sm leading-6"
                        placeholder={t("image.aiPromptPlaceholder")}
                      />
                      <button
                        type="button"
                        onClick={generateBoardImage}
                        disabled={!safeString(imageAiPrompt) || imageUploading || imageGenerating}
                        className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                      >
                        {imageGenerating ? t("image.generating") : t("image.generate")}
                      </button>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("image.urlLabel")}</label>
                      <input
                        value={imageUrl}
                        onChange={(e) => {
                          dirtyRef.current.image = true;
                          setImageUrl(e.target.value);
                        }}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder={t("image.urlPlaceholder")}
                      />
                    </div>

                    {imageToolMessage ? (
                      <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-900">{imageToolMessage}</div>
                    ) : null}

                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("image.promptLabel")}</label>
                      <textarea
                        value={imagePrompt}
                        onChange={(e) => {
                          dirtyRef.current.image = true;
                          setImagePrompt(e.target.value);
                        }}
                        className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm leading-6"
                        placeholder={t("image.promptPlaceholder")}
                      />
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-900">{t("image.hint")}</div>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8">
                <div className="overflow-hidden rounded-xl border border-violet-200 bg-background shadow-sm">
                  <div className="border-b border-violet-100 bg-violet-50/70 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-violet-950">{t("image.liveTitle")}</div>
                        <div className="mt-1 max-w-3xl text-lg font-semibold leading-7 text-slate-950">{boardImagePrompt}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={downloadImagePdf}
                          disabled={imagePdfBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-sm font-semibold text-violet-900 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          {imagePdfBusy ? t("image.pdfBusy") : t("image.downloadPdf")}
                        </button>
                        <div className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-violet-900">
                          {t("common.answers", { count: imageResponses.length })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-0 bg-violet-50/25 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]">
                    <div className="border-b border-violet-100 p-5 lg:border-b-0 lg:border-r">
                      {boardImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={boardImageUrl} alt="" className="aspect-video w-full rounded-2xl border border-violet-100 object-cover shadow-sm" />
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-white text-center text-sm text-slate-500">
                          {t("image.noImage")}
                        </div>
                      )}
                    </div>

                    <div className="min-h-[420px] p-5">
                      {featuredImageResponse ? (
                        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-100 p-5 text-amber-950 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">{t("image.featuredTitle")}</div>
                              <div className="mt-2 whitespace-pre-wrap text-2xl font-bold leading-snug">{safeString(featuredImageResponse.data.text)}</div>
                            </div>
                            <button
                              type="button"
                              onClick={clearFeaturedImageResponse}
                              className="rounded-full border border-amber-300 bg-white/70 px-3 py-1.5 text-sm font-semibold hover:bg-white"
                            >
                              {t("image.clearFeatured")}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {!activeSessionId ? (
                        <div className="text-sm text-muted-foreground">{t("image.noSession")}</div>
                      ) : imageResponses.length === 0 ? (
                        <div className="flex min-h-[280px] items-center justify-center text-center text-sm text-muted-foreground">{t("image.noneYet")}</div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {imageResponses.map((r) => {
                            const pinned = pinnedImageResponseIds.has(r.id);
                            const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? t("responses.unknown");
                            const editing = editingImageResponseId === r.id;
                            return (
                              <div
                                key={r.id}
                                className={[
                                  "rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5",
                                  pinned ? "border-amber-300 bg-amber-100 ring-2 ring-amber-300/60" : "border-violet-100 bg-white hover:border-violet-200",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-sm font-semibold text-slate-950">{name}</div>
                                  {pinned ? <div className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950">{t("image.pinned")}</div> : null}
                                </div>
                                {editing ? (
                                  <div className="mt-3 space-y-3">
                                    <textarea
                                      value={editingImageText}
                                      onChange={(e) => setEditingImageText(e.target.value)}
                                      className="min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base leading-7 text-slate-900 shadow-inner"
                                      autoFocus
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={saveEditedImageResponse}
                                        disabled={!safeString(editingImageText) || savingImageEdit}
                                        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                                      >
                                        <Check className="h-4 w-4" aria-hidden="true" />
                                        {savingImageEdit ? t("image.savingEdit") : t("image.saveEdit")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditingImageResponse}
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                                      >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                        {t("image.cancelEdit")}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-800">{safeString(r.data.text)}</div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => startEditingImageResponse(r)}
                                        className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50"
                                      >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                        {t("image.editSentence")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => scheduleTogglePinnedImageResponse(r.id)}
                                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {pinned ? t("image.unpinSentence") : t("image.pinSentence")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFeatureImageResponse(r.id)}
                                        className="inline-flex items-center rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                                      >
                                        {t("image.featureSentence")}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "clock" ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-slate-950">{t("clock.setupTitle")}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">{t("clock.setupText")}</div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("clock.titleLabel")}</label>
                      <input
                        value={clockTitle}
                        onChange={(e) => {
                          dirtyRef.current.clock = true;
                          setClockTitle(e.target.value);
                        }}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder={t("clock.titlePlaceholder")}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("clock.goalsLabel")}</label>
                      <textarea
                        value={clockGoals}
                        onChange={(e) => {
                          dirtyRef.current.clock = true;
                          setClockGoals(e.target.value);
                        }}
                        className="min-h-[130px] w-full rounded-xl border px-3 py-2 text-sm leading-6"
                        placeholder={t("clock.goalsPlaceholder")}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">{t("clock.todosLabel")}</label>
                      <textarea
                        value={clockTodos}
                        onChange={(e) => {
                          dirtyRef.current.clock = true;
                          setClockTodos(e.target.value);
                        }}
                        className="min-h-[130px] w-full rounded-xl border px-3 py-2 text-sm leading-6"
                        placeholder={t("clock.todosPlaceholder")}
                      />
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-white/70 px-3 py-2 text-xs text-blue-900">{t("clock.hint")}</div>
                    <button
                      type="button"
                      onClick={resetClockActivity}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {t("clock.resetActivity")}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-950">{t("clock.stopwatchTitle")}</div>
                  <div className="mt-3 rounded-2xl bg-slate-950 px-5 py-4 font-mono text-4xl font-bold text-white">{formatDuration(stopwatchMs)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={stopwatchRunning ? pauseStopwatch : startStopwatch}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      {stopwatchRunning ? <PauseCircle className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                      {stopwatchRunning ? t("clock.pauseStopwatch") : t("clock.startStopwatch")}
                    </button>
                    <button
                      type="button"
                      onClick={resetStopwatch}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {t("clock.resetStopwatch")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8">
                <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
                  <ClockActivitySurface
                    title={boardClockTitle}
                    goals={boardClockGoals}
                    todos={boardClockTodos}
                    now={now}
                    stopwatchMs={stopwatchMs}
                    locale={locale}
                    labels={{
                      week: t("clock.week"),
                      goals: t("clock.goalsTitle"),
                      todos: t("clock.todosTitle"),
                      stopwatch: t("clock.stopwatchTitle"),
                      noGoals: t("clock.noGoals"),
                      noTodos: t("clock.noTodos"),
                    }}
                    compact={false}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {tab === "question" ? (
            <div className={present ? "mt-4" : "mt-4 grid gap-4 lg:grid-cols-12"}>
              {!present ? (
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("fields.title.label")}</label>
                        <input
                          value={title}
                          onChange={(e) => {
                            dirtyRef.current.title = true;
                            setTitle(e.target.value);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("fields.title.placeholder")}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("fields.prompt.label")}</label>
                        <textarea
                          value={prompt}
                          onChange={(e) => {
                            dirtyRef.current.prompt = true;
                            setPrompt(e.target.value);
                          }}
                          className="min-h-[160px] w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder={t("fields.prompt.placeholder")}
                        />
                      </div>

                      <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-900">{t("control.contentHint")}</div>
                    </div>
                  </div>

                </div>
              ) : null}

              <div className={present ? "" : "lg:col-span-7"}>
                <div className={present ? "" : "rounded-xl border border-rose-200 bg-white p-4 shadow-sm"}>
                  {present ? (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-sm font-medium uppercase tracking-wide text-amber-300">{boardTitle}</div>
                      <div className="mt-2 whitespace-pre-wrap text-3xl font-semibold leading-tight">{boardPrompt}</div>
                    </div>
                  ) : null}
                  {!activeSessionId ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noSession")}</div>
                  ) : textResponses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("responses.noneYet")}</div>
                  ) : (
                    <div className={present ? "" : "lg:max-h-[calc(100vh-360px)] lg:overflow-auto"}>
                      <div className={responseGridClass}>
                        {textResponses.map((r) => {
                          const name = safeString(r.data.displayName) ?? safeString(r.data.groupName) ?? t("responses.unknown");
                          const text = safeString(r.data.text) ?? "";
                          const chosen = isNoteColor(r.data.noteColor) ? r.data.noteColor : null;
                          const accent = chosen ? accentFromNoteColor(chosen) : pickStickyAccent(r.id);

                          return (
                            <div key={r.id} className={[noteCardClass, accent].join(" ")}>
                              <div className="flex items-start justify-between gap-2">
                                <div className={noteNameClass}>{name}</div>
                                {!present ? <div className="text-[11px] text-muted-foreground">{r.id.slice(-8)}</div> : null}
                              </div>
                              <div className={noteTextClass}>{text}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20">
          <div
            className={[
              "flex w-full flex-col gap-3 border-t p-3 shadow-2xl backdrop-blur md:flex-row md:items-center md:justify-between md:px-6",
              present ? "border-white/10 bg-zinc-900/95 text-zinc-50" : "border-slate-200 bg-white/95 text-slate-950",
            ].join(" ")}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                  active ? "bg-emerald-600 text-white" : present ? "bg-white/10 text-zinc-200" : "bg-slate-100 text-slate-700",
                ].join(" ")}
              >
                <span className={["h-2.5 w-2.5 rounded-full", active ? "bg-white" : "bg-slate-400"].join(" ")} />
                {active ? t("status.live") : t("status.notLive")}
              </div>

              <div className="min-w-0">
                <div className={present ? "text-xs font-medium uppercase tracking-wide text-zinc-400" : "text-xs font-medium uppercase tracking-wide text-slate-500"}>
                  {t("control.title")}
                </div>
                <div className="truncate text-sm font-medium">
                  {tabLabel} · {t("common.answers", { count: responseCount })}
                </div>
              </div>

              {answersHidden ? (
                <div className={present ? "rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-200" : "rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"}>
                  {t("control.answersHidden")}
                </div>
              ) : null}
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              {!active ? (
                <button
                  onClick={newRoundAction}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {t("actions.startLive")}
                </button>
              ) : (
                <button
                  onClick={stopLive}
                  className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  {t("actions.stop")}
                </button>
              )}

              <button
                onClick={liveAction}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("actions.updateBoard")}
              </button>

              <button
                onClick={newRoundAction}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("actions.newRound")}
              </button>

              <button
                onClick={answersHidden ? showAnswersAgain : clearAnswersSoft}
                disabled={!activeSessionId}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"}
              >
                {answersHidden ? <Users className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
                {answersHidden ? t("actions.showAnswers") : t("actions.clearAnswers")}
              </button>

              <button
                onClick={toggleTimerVisibility}
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10" : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"}
                title={t("timer.toggleTitle")}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                {showTimer ? t("actions.hideTimer") : t("actions.showTimer")}
              </button>

              <Link
                href={displayHref}
                target="_blank"
                rel="noreferrer"
                className={present ? "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200" : "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t("actions.display")}
              </Link>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .wordwall-live-word-a {
          animation: wordwallFloatA 3.4s ease-in-out infinite;
        }

        .wordwall-live-word-b {
          animation: wordwallFloatB 3.8s ease-in-out infinite;
        }

        @keyframes wordwallFloatA {
          0%,
          100% {
            transform: translateX(-8px) translateY(2px) rotate(-0.3deg);
          }
          50% {
            transform: translateX(12px) translateY(-7px) rotate(0.4deg);
          }
        }

        @keyframes wordwallFloatB {
          0%,
          100% {
            transform: translateX(10px) translateY(-2px) rotate(0.25deg);
          }
          50% {
            transform: translateX(-14px) translateY(6px) rotate(-0.35deg);
          }
        }
      `}</style>
    </AuthGate>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-black bg-black text-white" : "bg-background hover:bg-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function AnalogClock({ now, light = false }: { now: number; light?: boolean }) {
  const date = new Date(now);
  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours() % 12;
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  return (
    <div className={["relative aspect-square w-full rounded-full border-8 shadow-sm", light ? "border-white/30 bg-white/10" : "border-slate-200 bg-white"].join(" ")}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((tick) => (
        <div key={tick} className="absolute left-1/2 top-1/2 h-[46%] w-0.5 origin-bottom" style={{ transform: `translate(-50%, -100%) rotate(${tick * 30}deg)` }}>
          <div className={["mx-auto rounded-full", tick % 3 === 0 ? "h-4 w-1.5" : "h-2.5 w-1", light ? "bg-white/80" : "bg-slate-400"].join(" ")} />
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 h-[26%] w-2 origin-bottom rounded-full bg-slate-950" style={{ transform: `translate(-50%, -100%) rotate(${hourDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[36%] w-1.5 origin-bottom rounded-full bg-slate-950" style={{ transform: `translate(-50%, -100%) rotate(${minuteDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-[39%] w-0.5 origin-bottom rounded-full bg-rose-500" style={{ transform: `translate(-50%, -100%) rotate(${secondDeg}deg)` }} />
      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 ring-4 ring-white" />
    </div>
  );
}

function ClockActivitySurface({
  title,
  goals,
  todos,
  now,
  stopwatchMs,
  locale,
  labels,
  compact,
  dark = false,
}: {
  title: string;
  goals: string;
  todos: string;
  now: number;
  stopwatchMs: number;
  locale: string;
  labels: {
    week: string;
    goals: string;
    todos: string;
    stopwatch: string;
    noGoals: string;
    noTodos: string;
  };
  compact: boolean;
  dark?: boolean;
}) {
  const date = new Date(now);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const fullDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
  const week = isoWeekNumber(date);
  const goalLines = goals.split("\n").map((line) => line.trim()).filter(Boolean);
  const todoLines = todos.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className={dark ? "bg-zinc-950 p-5 text-white" : "bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 text-slate-950"}>
      <div className={compact ? "space-y-4" : "grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]"}>
        <div className="mx-auto w-full max-w-[260px]">
          <AnalogClock now={now} light={dark} />
        </div>
        <div className="min-w-0">
          <div className={compact ? "text-sm font-semibold text-zinc-300" : dark ? "text-lg font-semibold uppercase tracking-[0.14em] text-emerald-300" : "text-sm font-semibold uppercase tracking-[0.14em] text-blue-700"}>
            {title}
          </div>
          <div className={compact ? "mt-1 font-mono text-4xl font-black leading-none" : "mt-3 font-mono text-7xl font-black leading-none md:text-8xl"}>{time}</div>
          <div className={compact ? "mt-2 text-sm font-medium capitalize text-zinc-300" : dark ? "mt-4 text-2xl font-semibold capitalize text-zinc-200" : "mt-4 text-2xl font-semibold capitalize text-slate-700"}>
            {day} · {fullDate} · {labels.week} {week}
          </div>
          <div className={compact ? "mt-4 grid gap-3" : "mt-8 grid gap-4 md:grid-cols-2"}>
            <div className={dark ? "rounded-3xl border border-white/10 bg-white/10 p-5" : "rounded-3xl border border-blue-100 bg-white/80 p-5 shadow-sm"}>
              <div className="text-sm font-bold uppercase tracking-wide text-blue-500">{labels.goals}</div>
              <div className="mt-3 space-y-2">
                {(goalLines.length ? goalLines : [labels.noGoals]).map((line, index) => (
                  <div key={`${line}-${index}`} className={compact ? "text-sm font-semibold" : "text-xl font-semibold leading-snug"}>{line}</div>
                ))}
              </div>
            </div>
            <div className={dark ? "rounded-3xl border border-white/10 bg-white/10 p-5" : "rounded-3xl border border-emerald-100 bg-white/80 p-5 shadow-sm"}>
              <div className="text-sm font-bold uppercase tracking-wide text-emerald-500">{labels.todos}</div>
              <div className="mt-3 space-y-2">
                {(todoLines.length ? todoLines : [labels.noTodos]).map((line, index) => (
                  <div key={`${line}-${index}`} className={compact ? "text-sm font-semibold" : "text-xl font-semibold leading-snug"}>{line}</div>
                ))}
              </div>
            </div>
          </div>
          <div className={dark ? "mt-6 rounded-3xl border border-white/10 bg-white/10 p-5" : "mt-6 rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm"}>
            <div className="text-sm font-bold uppercase tracking-wide text-emerald-300">{labels.stopwatch}</div>
            <div className={compact ? "mt-2 font-mono text-3xl font-black" : "mt-2 font-mono text-6xl font-black"}>{formatDuration(stopwatchMs)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentClockPreview({
  title,
  now,
  stopwatchMs,
  locale,
  weekLabel,
  stopwatchLabel,
}: {
  title: string;
  now: number;
  stopwatchMs: number;
  locale: string;
  weekLabel: string;
  stopwatchLabel: string;
}) {
  const date = new Date(now);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(date);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{title}</div>
      <div className="mt-2 font-mono text-4xl font-black leading-none">{time}</div>
      <div className="mt-2 text-xs font-medium text-zinc-300">
        {day} · {weekLabel} {isoWeekNumber(date)}
      </div>
      <div className="mt-3 rounded-lg bg-white/10 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{stopwatchLabel}</div>
        <div className="mt-1 font-mono text-xl font-bold">{formatDuration(stopwatchMs)}</div>
      </div>
    </div>
  );
}

function StudentScreenPreview({
  active,
  mode,
  title,
  prompt,
  pollQuestion,
  pollOptions,
  wordwallPrompt,
  imagePrompt,
  imageUrl,
  clockTitle,
  quizTitle,
  quizQuestion,
  quizOptions,
  now,
  stopwatchMs,
  compact = false,
}: {
  active: boolean;
  mode: BoardMode;
  title: string;
  prompt: string;
  pollQuestion: string;
  pollOptions: string[];
  wordwallPrompt: string;
  imagePrompt: string;
  imageUrl: string;
  clockTitle: string;
  quizTitle: string;
  quizQuestion: string;
  quizOptions: string[];
  now: number;
  stopwatchMs: number;
  compact?: boolean;
}) {
  const t = useTranslations("teacherBoard");
  const locale = useLocale();

  return (
    <div className={compact ? "rounded-xl border bg-background p-2 text-left shadow-sm" : "rounded-xl border bg-background p-4 shadow-sm"}>
      <div className="overflow-hidden rounded-xl border bg-slate-950 text-white shadow-inner">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="truncate text-[11px] font-semibold text-zinc-200">{t("studentPreview.title")}</div>
          </div>
          <div className={active ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-200" : "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300"}>
            {active ? t("studentPreview.live") : t("studentPreview.notLive")}
          </div>
        </div>

        <div className={compact ? "min-h-[116px] p-3" : "min-h-[210px] p-4"}>
          {!active ? (
            <div className={compact ? "flex min-h-[92px] items-center gap-3" : "flex min-h-[178px] flex-col items-center justify-center text-center"}>
              <MonitorUp className={compact ? "h-6 w-6 shrink-0 text-zinc-400" : "h-8 w-8 text-zinc-400"} aria-hidden="true" />
              <div className={compact ? "min-w-0" : ""}>
                <div className={compact ? "truncate text-sm font-semibold" : "mt-4 text-base font-semibold"}>{t("studentPreview.waitingTitle")}</div>
                <div className={compact ? "mt-1 line-clamp-2 text-xs leading-5 text-zinc-400" : "mt-2 max-w-[260px] text-xs leading-5 text-zinc-400"}>{t("studentPreview.waitingText")}</div>
              </div>
            </div>
          ) : mode === "poll" ? (
            <div>
              <div className={compact ? "line-clamp-2 text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{pollQuestion}</div>
              <div className={compact ? "mt-3 grid gap-1.5" : "mt-4 grid gap-2"}>
                {pollOptions.slice(0, compact ? 3 : 4).map((opt) => (
                  <div key={opt} className={compact ? "truncate rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs" : "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"}>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ) : mode === "wordwall" ? (
            <div>
              <div className={compact ? "line-clamp-2 text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{wordwallPrompt}</div>
              <div className={compact ? "mt-3 truncate rounded-md border border-white/15 bg-white px-2 py-1.5 text-xs text-slate-400" : "mt-5 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-400"}>{t("studentPreview.wordPlaceholder")}</div>
              <div className={compact ? "mt-2 inline-flex rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white" : "mt-4 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"}>{t("studentPreview.sendWord")}</div>
            </div>
          ) : mode === "image" ? (
            <div>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className={compact ? "mb-2 aspect-video w-full rounded-lg object-cover" : "mb-3 aspect-video w-full rounded-xl object-cover"} />
              ) : null}
              <div className={compact ? "line-clamp-2 text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{imagePrompt}</div>
              <div className={compact ? "mt-3 truncate rounded-md border border-white/15 bg-white px-2 py-1.5 text-xs text-slate-400" : "mt-5 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-400"}>{t("studentPreview.imagePlaceholder")}</div>
              <div className={compact ? "mt-2 inline-flex rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white" : "mt-4 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"}>{t("studentPreview.sendText")}</div>
            </div>
          ) : mode === "clock" ? (
            <StudentClockPreview title={clockTitle} now={now} stopwatchMs={stopwatchMs} locale={locale} weekLabel={t("clock.week")} stopwatchLabel={t("clock.stopwatchTitle")} />
          ) : mode === "quiz" ? (
            <div>
              <div className={compact ? "truncate text-xs font-bold uppercase tracking-wide text-violet-300" : "text-xs font-bold uppercase tracking-wide text-violet-300"}>{quizTitle}</div>
              <div className={compact ? "mt-2 line-clamp-2 text-sm font-semibold leading-snug" : "mt-2 text-base font-semibold leading-snug"}>{quizQuestion || "Quiz"}</div>
              <div className={compact ? "mt-3 grid gap-1.5" : "mt-4 grid gap-2"}>
                {quizOptions.slice(0, compact ? 3 : 4).map((opt) => (
                  <div key={opt} className={compact ? "truncate rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs" : "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"}>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className={compact ? "truncate text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>{title}</div>
              <div className={compact ? "mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-zinc-300" : "mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300"}>{prompt}</div>
              <div className={compact ? "mt-3 truncate rounded-md border border-white/15 bg-white px-2 py-1.5 text-xs text-slate-400" : "mt-5 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-400"}>{t("studentPreview.textPlaceholder")}</div>
              <div className={compact ? "mt-2 inline-flex rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white" : "mt-4 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"}>{t("studentPreview.sendText")}</div>
            </div>
          )}
        </div>
      </div>

      {!compact ? <div className="mt-2 text-xs text-muted-foreground">{t("studentPreview.hint")}</div> : null}
    </div>
  );
}

function TimerBar({
  endsAt,
  startedAt,
  totalSec,
  teacher,
  onStart,
  onClear,
}: {
  endsAt: unknown;
  startedAt: unknown;
  totalSec: unknown;
  teacher?: boolean;
  onStart?: (seconds: number) => void;
  onClear?: () => void;
}) {
  const t = useTranslations("teacherBoard");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  const startedAtMs = typeof startedAt === "number" ? startedAt : null;
  const total = typeof totalSec === "number" && totalSec > 0 ? totalSec : null;

  const remainingMs = endsAtMs ? Math.max(0, endsAtMs - now) : 0;
  const secondsLeft = endsAtMs ? Math.ceil(remainingMs / 1000) : 0;

  let pct: number | null = null;
  if (endsAtMs && startedAtMs && total) {
    const elapsed = Math.max(0, now - startedAtMs);
    const totalMs = total * 1000;
    pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
  }

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{t("timer.title")}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{endsAtMs ? `${secondsLeft}s` : "—"}</div>
        </div>

        {teacher ? (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onStart?.(30)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              30s
            </button>
            <button onClick={() => onStart?.(60)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              60s
            </button>
            <button onClick={() => onStart?.(120)} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              120s
            </button>
            <button onClick={() => onClear?.()} className="rounded-md border px-2.5 py-1.5 text-xs font-medium">
              {t("timer.stop")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        {endsAtMs ? <div className="h-full bg-black transition-[width]" style={{ width: `${pct ?? 0}%` }} /> : <div className="h-full w-0" />}
      </div>
    </div>
  );
}
