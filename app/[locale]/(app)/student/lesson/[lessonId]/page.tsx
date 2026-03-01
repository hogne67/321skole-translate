// app/(app)/student/lesson/[lessonId]/page.tsx
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
import { useTranslations } from "next-intl";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

type Lesson = {
  title: string;
  level?: string;
  topic?: string;

  sourceText?: string;
  text?: string;

  tasks?: unknown;
  status?: "draft" | "published";
  language?: string;

  coverImageUrl?: string;

  isActive?: boolean;
};

type AnswersMap = Record<string, unknown>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

type SubmissionDoc = {
  uid?: string;
  publishedLessonId?: string;
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
  isActive?: boolean;
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
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
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
    publishedLessonId: typeof d.publishedLessonId === "string" ? d.publishedLessonId : undefined,
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

  const d = data as { error?: unknown; translatedText?: unknown; translation?: unknown; text?: unknown };

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

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

// ---- TTS helpers ----
type TtsLang = "no" | "en" | "pt-BR";
function toTtsLang(lang: string): TtsLang {
  const v = (lang || "").toLowerCase().trim();
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
  if (v === "en") return "en";
  return "no";
}

// ---- Text follow ----
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

// ---------- LOCAL STORAGE HELPERS ----------
function lsKey(lessonId: string) {
  return `321skole:answers:${lessonId}`;
}
// ------------------------------------------

export default function StudentLessonPage() {
  const t = useTranslations("studentLesson");

  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState<boolean>(true);

  const [answers, setAnswers] = useState<AnswersMap>({});

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);

  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);

  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});

  const hasAnswers = useMemo(() => Object.keys(answers).length > 0, [answers]);

  const [translatedFeedback, setTranslatedFeedback] = useState<string | null>(null);
  const [feedbackTranslating, setFeedbackTranslating] = useState(false);
  const [feedbackTranslateErr, setFeedbackTranslateErr] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => {
    setShowAnswers(!!feedback);
  }, [feedback]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsBusy, setTtsBusy] = useState<null | "original" | "translation">(null);
  const [ttsErr, setTtsErr] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [activeTextMode, setActiveTextMode] = useState<null | "original" | "translation">(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

  const stopAudio = () => {
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
  };

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

  async function playTTS(text: string, lang: TtsLang, mode: "original" | "translation") {
    if (!lessonId) return;
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

  const sourceTextSafe = useMemo(() => {
    const txt = (lesson?.sourceText ?? lesson?.text ?? "").toString();
    return txt;
  }, [lesson?.sourceText, lesson?.text]);

  const textFollow = useMemo(() => {
    const original = segmentSentences(sourceTextSafe || "");
    const translation = segmentSentences(translatedText || "");
    return { original, translation };
  }, [sourceTextSafe, translatedText]);

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

  // ---- Load lesson + answers ----
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

        // 1) Load published lesson
        let lessonSnap;
        try {
          lessonSnap = await getDoc(doc(db, "published_lessons", lessonId));
        } catch (e: unknown) {
          if (isPermissionDenied(e)) {
            setLesson(null);
            setError(t("errors.notPublished"));
            if (alive) setLoading(false);
            return;
          }
          throw e;
        }

        if (!alive) return;

        if (!lessonSnap.exists()) {
          setLesson(null);
          setError(t("errors.notFound"));
          if (alive) setLoading(false);
          return;
        }

        const rawData = asPublishedLessonDoc(lessonSnap.data());
        if (rawData?.isActive === false) {
          setLesson(null);
          setError(t("errors.notPublished"));
          if (alive) setLoading(false);
          return;
        }

        const lessonData: Lesson = {
          title: rawData.title ?? t("fallback.lessonTitle"),
          level: rawData.level,
          topic: rawData.topic,
          language: rawData.language,
          tasks: rawData.tasks,
          coverImageUrl: rawData.coverImageUrl,
          isActive: rawData.isActive,
          sourceText: (rawData.sourceText ?? rawData.text ?? "") as string,
          text: rawData.text,
          status: "published",
        };

        setLesson(lessonData);
        setImageUrl(lessonData.coverImageUrl ?? null);

        // 2) Load answers: Firestore if logged in, localStorage if anon
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

        // reset translations per lesson load
        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);
        setTaskTranslationOpen({});

        setTranslatedFeedback(null);
        setFeedbackTranslateErr(null);

        setTtsErr(null);
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

  // Auto-save to localStorage when anon
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
    setTranslateErr(null);
    setFeedbackTranslateErr(null);
  }, [targetLang]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

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

  async function saveDraft() {
  if (!lessonId || !uid) return;

  setSaving(true);
  setMsg(null);

  try {
    // Anon: local only
    if (isAnon) {
      try {
        localStorage.setItem(lsKey(lessonId), JSON.stringify({ answers, updatedAt: Date.now() }));
      } catch {
        // ignore
      }
      flash(t("flash.saved"));
      return;
    }

    const stableId = `${uid}_${lessonId}`;

    // 1) behold eksisterende praksis-lagring
    const practiceRef = doc(db, "practiceSubmissions", stableId);
    await setDoc(
      practiceRef,
      {
        uid,
        publishedLessonId: lessonId,
        answers,
        status: "draft",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 2) NYTT: skriv også til submissions slik at My content-feed ser den
    //    (feed henter submissions der uid==uid)
    const subRef = doc(db, "submissions", stableId);
    await setDoc(
      subRef,
      {
        uid,
        lessonId, // ✅ gjør det lett å linke senere
        publishedLessonId: lessonId, // behold kompat
        answers,
        status: "draft",
        kind: "practice", // valgfritt, men nyttig for filtrering senere
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    flash(t("flash.saved"));

    // ✅ viktig: behold locale i redirect
    router.push("/content");
    return;
  } catch (e: unknown) {
    const m = (e as { message?: unknown })?.message;
    setMsg(typeof m === "string" ? m : t("errors.couldNotSave"));
  } finally {
    setSaving(false);
  }
}

  function buildOppgaveString(lessonObj: Lesson) {
    const parts = [
      "You are a language teacher. Give short, helpful feedback adapted to the learner's CEFR level.",
      "Use simple language.",
      "Provide: (1) overall feedback, (2) 3 concrete improvements, (3) a corrected version.",
      "Keep it concise.",
    ];
    if (lessonObj.level) parts.push(`CEFR: ${lessonObj.level}.`);
    return parts.join(" ");
  }

  function buildSvarString(lessonObj: Lesson, answersObj: AnswersMap) {
    const tasksArr = safeTasksArray(lessonObj.tasks);
    const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
    const lines: string[] = [];

    if (sorted.length > 0) {
      for (let i = 0; i < sorted.length; i++) {
        const tt = sorted[i];
        const stableId = getStableTaskId(tt, i);

        const order = tt?.order ?? "";
        const prompt = tt?.prompt ?? "";
        const type = tt?.type ?? "";
        const ans = answersObj[stableId];

        if (ans === undefined || ans === null || ans === "") continue;

        lines.push(`Task ${order} (${String(type)}): ${String(prompt)}`);
        lines.push(`Answer: ${typeof ans === "string" ? ans : JSON.stringify(ans)}`);
        lines.push("");
      }
    } else {
      for (const [k, v] of Object.entries(answersObj)) {
        lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
    }

    return lines.join("\n").trim();
  }

  async function submitForFeedback() {
    if (!lessonId || !uid || !lesson) return;
    if (!hasAnswers) {
      flash(t("flash.answerAtLeastOne"));
      return;
    }

    if (isAnon) {
      flash(t("flash.loginToGetFeedback"));
      return;
    }

    setSubmitting(true);
    setMsg(null);

    try {
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "practiceSubmissions", stableId);

      await setDoc(
        ref,
        {
          uid,
          publishedLessonId: lessonId,
          answers,
          status: "submitted",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const lesetekst = (lesson.sourceText ?? lesson.text ?? "").trim();
      const oppgave = buildOppgaveString(lesson);
      const svar = buildSvarString(lesson, answers);

      if (!svar) throw new Error("Svar-teksten ble tom. Sjekk at task.id matcher key i answers.");

      const nivå = (lesson.level ?? "A2").toString();
      const payload = { lesetekst, oppgave, svar, nivå };

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

      flash(t("flash.submitted"));
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setMsg(typeof m === "string" ? m : t("errors.couldNotSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

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

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((tt) => m.set(tt.stableId, tt));
    return m;
  }, [translatedTasks]);

  if (loading) return <p style={{ padding: 16 }}>{t("loading")}</p>;

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "crimson" }}>{error}</p>
        <Link href="/student">← {t("nav.backToDashboard")}</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>{t("noData")}</p>
        <Link href="/student">← {t("nav.backToDashboard")}</Link>
      </div>
    );
  }

  const tasksOriginal = safeTasksArray(lesson.tasks)
    .slice()
    .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

  const originalLangForTTS: TtsLang = toTtsLang(lesson.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  const renderFollowText = (mode: "original" | "translation", segs: SentenceSeg[], fallbackText: string) => {
    if (!fallbackText.trim()) return <span style={{ opacity: 0.6 }}>{t("text.noText")}</span>;

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
              title={canSeek ? t("text.clickToSeek") : undefined}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>{lesson.title}</h1>
          <div style={{ opacity: 0.75 }}>
            {lesson.level ? <span>{lesson.level}</span> : null}
            {lesson.language ? <span> • {lesson.language.toUpperCase()}</span> : null}
            {lesson.topic ? <span> • {lesson.topic}</span> : null}
          </div>

          {isAnon ? (
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>{t("anon.savedLocally")}</div>
          ) : null}
        </div>
      </header>

      {msg ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12 }}>
          {msg}
        </div>
      ) : null}

      {/* IMAGE */}
      <section style={{ marginTop: 14 }}>
        <h2 style={{ marginBottom: 8 }}>{t("image.title")}</h2>

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
              <img src={imageUrl} alt={t("image.alt")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ textAlign: "center", padding: 16, opacity: 0.7 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("image.noImageTitle")}</div>
                <div style={{ fontSize: 13 }}>{t("image.noImageHint")}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ACTIONS + TRANSLATE */}
      <section style={{ marginTop: 18, padding: 12, border: "1px solid rgba(0, 0, 0, 0.12)", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={saveDraft}
            disabled={saving || !uid}
            style={{
              ...btnStyle,
              background: "#afc8fd",
              borderColor: "#2563eb",
              color: "black",
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t("actions.saving") : isAnon ? t("actions.saveOnDevice") : t("actions.saveToMyContent")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.75 }}>{t("translate.label")}</span>
            <SearchableSelect
              label=""
              value={targetLang}
              options={LANGUAGE_OPTIONS}
              onChange={setTargetLang}
              placeholder={t("translate.searchPlaceholder")}
            />
          </label>

          <button
            onClick={onTranslateText}
            disabled={translating === "text" || !(sourceTextSafe || "").trim()}
            style={{ ...btnStyle, opacity: translating === "text" ? 0.6 : 1 }}
          >
            {translating === "text" ? t("translate.translating") : t("translate.translateText")}
          </button>

          <button
            onClick={onTranslateTasks}
            disabled={translating === "tasks" || tasksOriginal.length === 0}
            style={{ ...btnStyle, opacity: translating === "tasks" ? 0.6 : 1 }}
          >
            {translating === "tasks" ? t("translate.translating") : t("translate.translateTasks")}
          </button>

          <button
            onClick={() => {
              setTranslatedText(null);
              setTranslatedTasks(null);
              setTranslatedFeedback(null);
              setTranslateErr(null);
              setFeedbackTranslateErr(null);
              setTaskTranslationOpen({});
            }}
            style={btnStyle}
          >
            {t("translate.reset")}
          </button>
        </div>

        {translateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{translateErr}</p> : null}
        {feedbackTranslateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{feedbackTranslateErr}</p> : null}
      </section>

      {/* TEXT */}
      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 8 }}>{t("text.title")}</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.75 }}>{t("text.speed")}</span>
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
              {ttsBusy === "original" ? t("text.generating") : t("text.playOriginal")}
            </button>

            <button type="button" style={btnStyle} onClick={stopAudio} disabled={!audioRef.current}>
              {t("text.stop")}
            </button>

            {audioRef.current ? (
              <>
                <button type="button" style={btnStyle} onClick={isPlaying ? pauseAudio : resumeAudio}>
                  {isPlaying ? t("text.pause") : t("text.continue")}
                </button>
                <button type="button" style={btnStyle} onClick={replaySentence}>
                  {t("text.replaySentence")}
                </button>
                <button type="button" style={btnStyle} onClick={prevSentence}>
                  {t("text.prev")}
                </button>
                <button type="button" style={btnStyle} onClick={nextSentence}>
                  {t("text.next")}
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
                {showTextTranslation ? t("text.hideTranslation") : t("text.showTranslation")}
              </button>
            ) : null}

            {translatedText ? (
              <button
                type="button"
                style={{ ...btnStyle, opacity: ttsBusy === "translation" ? 0.6 : 1 }}
                disabled={ttsBusy !== null || !(translatedText || "").trim()}
                onClick={() => playTTS(translatedText || "", translationLangForTTS, "translation")}
              >
                {ttsBusy === "translation" ? t("text.generating") : t("text.playTranslation")}
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
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("translate.translatedLabel")}</div>
            {renderFollowText("translation", translationSegs, translatedText)}
          </div>
        ) : null}
      </section>

      {/* TASKS */}
      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{t("tasks.title")}</h2>

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

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {(translatedTasks ?? []).length > 0 ? (
            <button type="button" style={btnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
              {showTaskTranslations ? t("tasks.hideAllTranslations") : t("tasks.showAllTranslations")}
            </button>
          ) : null}
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

              const hasThisTranslation = !!tr?.translatedPrompt || (tr?.translatedOptions?.length ?? 0) > 0;
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
                (type === "mcq" && mcqCorrectText != null) || (type === "truefalse" && tfCorrectBool != null);

              const isCorrect =
                type === "mcq"
                  ? mcqCorrectText != null && val != null && String(val) === String(mcqCorrectText)
                  : type === "truefalse"
                  ? tfCorrectBool != null && typeof val === "boolean" && val === tfCorrectBool
                  : null;

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
                      <span>
                        {t("tasks.taskLabel", {
                          n: String(tt?.order ?? idx + 1),
                        })}
                      </span>
                      <span>• {type}</span>

                      {showAnswers && hasCorrect && val != null ? (
                        <span style={{ marginLeft: 6 }}>
                          {isCorrect ? <Pill text={t("tasks.correct")} kind="good" /> : <Pill text={t("tasks.wrong")} kind="bad" />}
                        </span>
                      ) : null}
                    </div>

                    {hasThisTranslation ? (
                      <button type="button" style={btnStyle} onClick={() => toggleTaskTranslation(stableId)}>
                        {showThisTranslation ? t("tasks.hideTranslation") : t("tasks.showTranslation")}
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
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("translate.translatedLabel")}</div>
                      {tr.translatedPrompt}
                    </div>
                  ) : null}

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {options.map((o, i) => {
                        const opt = String(o);
                        const checked = val === opt;
                        const optT = tr?.translatedOptions?.[i] || "";

                        const isOptionCorrect = showAnswers && mcqCorrectText != null && opt === mcqCorrectText;
                        const isOptionChosenWrong = showAnswers && checked && mcqCorrectText != null && opt !== mcqCorrectText;

                        const borderColor = isOptionCorrect
                          ? "rgba(46, 204, 113, 0.85)"
                          : isOptionChosenWrong
                          ? "rgba(231, 76, 60, 0.85)"
                          : "rgba(0,0,0,0.12)";

                        const background = isOptionCorrect
                          ? "rgba(46, 204, 113, 0.12)"
                          : isOptionChosenWrong
                          ? "rgba(231, 76, 60, 0.12)"
                          : "white";

                        return (
                          <label
                            key={i}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                              padding: "8px 10px",
                              border: `1px solid ${borderColor}`,
                              borderRadius: 10,
                              cursor: "pointer",
                              background,
                            }}
                          >
                            <input
                              type="radio"
                              name={stableId}
                              checked={checked}
                              onChange={() => setAnswer(stableId, opt)}
                              style={{ marginTop: 3 }}
                            />

                            <div style={{ width: "100%" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                <div>{opt}</div>
                                {checked ? <Pill text={t("tasks.yourAnswer")} /> : null}
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
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setAnswer(stableId, true)}
                          aria-pressed={val === true}
                          style={{
                            ...btnStyle,
                            borderColor: val === true ? "rgba(0,0,0,0.25)" : "#ddd",
                            background: val === true ? "rgba(0,0,0,0.08)" : "white",
                            color: "black",
                            fontWeight: val === true ? 600 : 400,
                            boxShadow: "none",
                          }}
                        >
                          {t("tasks.true")}
                        </button>

                        <button
                          type="button"
                          onClick={() => setAnswer(stableId, false)}
                          aria-pressed={val === false}
                          style={{
                            ...btnStyle,
                            borderColor: val === false ? "rgba(0,0,0,0.25)" : "#ddd",
                            background: val === false ? "rgba(0,0,0,0.08)" : "white",
                            color: "black",
                            fontWeight: val === false ? 600 : 400,
                            boxShadow: "none",
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
                      rows={4}
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.2)",
                        resize: "vertical",
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FEEDBACK */}
      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 8 }}>{t("feedback.title")}</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={submitForFeedback}
              disabled={submitting || !uid}
              style={{
                ...btnStyle,
                background: "#bef7c0",
                borderColor: "#2563eb",
                color: "black",
                fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
              }}
              title={isAnon ? t("feedback.loginToGetFeedback") : t("feedback.generate")}
            >
              {submitting ? t("feedback.submitting") : isAnon ? t("feedback.loginForFeedback") : t("feedback.getFeedback")}
            </button>

            <button
              onClick={onTranslateFeedback}
              disabled={feedbackTranslating || !(feedback || "").trim()}
              style={{
                ...btnStyle,
                background: "#eaf3b6",
                borderColor: "#2563eb",
                color: "black",
                fontWeight: 600,
                opacity: feedbackTranslating ? 0.6 : 1,
              }}
              title={t("feedback.translateButtonTitle")}
            >
              {feedbackTranslating ? t("feedback.translating") : t("feedback.translateFeedback")}
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            minHeight: 80,
          }}
        >
          {feedback ? (
            feedback
          ) : (
            <span style={{ opacity: 0.6 }}>{isAnon ? t("feedback.anonHint") : t("feedback.noFeedbackYet")}</span>
          )}
        </div>

        {translatedFeedback ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("feedback.translatedFeedbackLabel")}</div>
            {translatedFeedback}
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 18 }}>
        <Link href={`/lesson/${lessonId}`} style={{ textDecoration: "none" }}>
          ← {t("nav.backToPreview")}
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