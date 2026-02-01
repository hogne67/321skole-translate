// app/(app)/student/lesson/[lessonId]/page.tsx
"use client";

import { SearchableSelect } from "@/components/SearchableSelect";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  setDoc,
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { LANGUAGES } from "@/lib/languages";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.label,
}));

type Lesson = {
  title: string;
  level?: string;
  topic?: string;

  // NOTE: producer/published kan være "sourceText" eller "text"
  sourceText?: string;
  text?: string;

  tasks?: any;
  status?: "draft" | "published";
  language?: string;

  coverImageUrl?: string;

  // published_lessons bruker dette i rules
  isActive?: boolean;

  // sometimes present in published docs
  lessonId?: string;
};

type AnswersMap = Record<string, any>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

function isPermissionDenied(e: any) {
  const code = String(e?.code || "").toLowerCase();
  const msg = String(e?.message || "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

/**
 * Hent published lesson på to måter:
 * 1) DocId === lessonId (hvis publisering bruker doc(db,"published_lessons", lessonId))
 * 2) Fallback: query where(lessonId == param) hvis publisering har auto-ID
 */
async function fetchPublishedLessonByEitherIdOrField(lessonId: string) {
  // 1) DocId == lessonId
  try {
    const directSnap = await getDoc(doc(db, "published_lessons", lessonId));
    if (directSnap.exists()) return { snap: directSnap, via: "docId" as const };
  } catch (e: any) {
    if (!isPermissionDenied(e)) throw e;
    // fallthrough to query
  }

  // 2) Query on field lessonId
  const q = query(collection(db, "published_lessons"), where("lessonId", "==", lessonId), limit(1));
  const qsnap = await getDocs(q);
  if (qsnap.empty) return { snap: null as any, via: "none" as const };
  return { snap: qsnap.docs[0], via: "fieldQuery" as const };
}

async function translateOne(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  const raw = await res.text();

  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Translate API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  if (data?.error) throw new Error(`Translate API error (HTTP ${res.status}): ${data.error}`);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);

  const out = (data?.translatedText ?? data?.translation ?? data?.text ?? "").toString().trim();
  if (!out) {
    throw new Error(
      `Translate returned empty (HTTP ${res.status}). Keys: ${Object.keys(data).join(", ") || "(no keys)"}`
    );
  }
  return out;
}

function safeTasksArray(tasks: any): any[] {
  if (Array.isArray(tasks)) return tasks;
  if (typeof tasks === "string") {
    try {
      const parsed = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getStableTaskId(t: any, idx: number): string {
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

// ---- Text follow (Level A): sentence segmentation + proportional timing ----
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

// ---- Small UI helpers ----
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

export default function StudentLessonPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);

  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);

  // UI toggles
  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});

  const hasAnswers = useMemo(() => Object.keys(answers).length > 0, [answers]);

  // ---- NEW: feedback translation + answer reveal ----
  const [translatedFeedback, setTranslatedFeedback] = useState<string | null>(null);
  const [feedbackTranslating, setFeedbackTranslating] = useState(false);
  const [feedbackTranslateErr, setFeedbackTranslateErr] = useState<string | null>(null);

  // image placeholder
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // showAnswers: auto-on when feedback exists, but can be toggled
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    setShowAnswers(!!feedback);
  }, [feedback]);

  // ---- TTS state ----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsBusy, setTtsBusy] = useState<null | "original" | "translation">(null);
  const [ttsErr, setTtsErr] = useState<string | null>(null);

  const [playbackRate, setPlaybackRate] = useState(1.0);

  // ---- player state ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ---- text-follow state ----
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
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`TTS API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error ? String(data.error) : `TTS error (HTTP ${res.status})`);
      }

      const url = String(data?.url || "").trim();
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
    } catch (e: any) {
      setTtsErr(e?.message ?? "TTS failed");
      setActiveSentenceIndex(null);
      setActiveTextMode(null);
    } finally {
      setTtsBusy(null);
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const sourceTextSafe = useMemo(() => {
    const t = (lesson?.sourceText ?? lesson?.text ?? "").toString();
    return t;
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
      const duration = a.duration;
      if (!duration || !isFinite(duration)) return;

      const t = a.currentTime;
      const ratio = Math.max(0, Math.min(1, t / duration));

      const segs = activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;

      if (!segs || segs.length === 0) return;

      let idx = segs.findIndex((s) => ratio >= s.startRatio && ratio < s.endRatio);
      if (idx === -1) idx = segs.length - 1;

      setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
    };

    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("timeupdate", onTime);
    };
  }, [activeTextMode, textFollow.original.segs, textFollow.translation.segs]);

  function seekToSentence(mode: "original" | "translation", idx: number) {
    const a = audioRef.current;
    if (!a) return;

    const segs = mode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs || !segs[idx]) return;

    const duration = a.duration;
    if (!duration || !isFinite(duration)) return;

    const target = segs[idx].startRatio * duration;
    a.currentTime = Math.max(0, Math.min(duration - 0.05, target));
    setActiveTextMode(mode);
    setActiveSentenceIndex(idx);

    if (a.paused) {
      a.play().catch(() => {});
    }
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

    const segs =
      activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs.length) return;

    const nextIdx = Math.max(0, (activeSentenceIndex ?? 0) - 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  function nextSentence() {
    if (!audioRef.current) return;
    if (!activeTextMode) return;

    const segs =
      activeTextMode === "translation" ? textFollow.translation.segs : textFollow.original.segs;
    if (!segs.length) return;

    const nextIdx = Math.min(segs.length - 1, (activeSentenceIndex ?? 0) + 1);
    seekToSentence(activeTextMode, nextIdx);
  }

  // Load lesson + submission
  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      if (!lessonId) {
        setError("Mangler lessonId i URL.");
        setLoading(false);
        return;
      }

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setUid(user.uid);

        const res = await fetchPublishedLessonByEitherIdOrField(lessonId);
        if (!alive) return;

        if (!res.snap) {
          setLesson(null);
          setError("Denne oppgaven er ikke publisert (eller finnes ikke).");
          setLoading(false);
          return;
        }

        const rawData = res.snap.data() as any;

        // Belt + suspenders
        if (rawData?.isActive === false) {
          setLesson(null);
          setError("Denne oppgaven er ikke publisert (eller er avpublisert).");
          setLoading(false);
          return;
        }

        const lessonData: Lesson = {
          ...(rawData as Lesson),
          sourceText: (rawData?.sourceText ?? rawData?.text ?? "") as string,
        };

        setLesson(lessonData);
        setImageUrl(lessonData.coverImageUrl ?? null);

        const stableSubId = `${user.uid}_${lessonId}`;
        const subRef = doc(db, "submissions", stableSubId);
        const subDoc = await getDoc(subRef);
        if (!alive) return;

        if (subDoc.exists()) {
          const data = subDoc.data() as any;
          setSubmissionId(subDoc.id);
          if (data?.answers && typeof data.answers === "object") setAnswers(data.answers);
          if (typeof data?.feedback === "string") setFeedback(data.feedback);
        } else {
          setSubmissionId(null);
          setAnswers({});
          setFeedback(null);
        }

        // reset translations per lesson load
        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);
        setTaskTranslationOpen({});

        // reset feedback translation
        setTranslatedFeedback(null);
        setFeedbackTranslateErr(null);

        // reset tts
        setTtsErr(null);
        setTtsBusy(null);
        stopAudio();
      } catch (e: any) {
        if (!alive) return;
        if (isPermissionDenied(e)) {
          setError("Denne oppgaven er ikke publisert (eller du har ikke tilgang).");
        } else {
          setError(e?.message ?? "Noe gikk galt");
        }
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    setTranslateErr(null);
    setFeedbackTranslateErr(null);
  }, [targetLang]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  function setAnswer(taskId: string, value: any) {
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
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "submissions", stableId);

      await setDoc(
        ref,
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

      setSubmissionId(stableId);
      flash("Saved ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function buildOppgaveString(lesson: Lesson) {
    const parts = [
      "You are a language teacher. Give short, helpful feedback adapted to the learner's CEFR level.",
      "Use simple language.",
      "Provide: (1) overall feedback, (2) 3 concrete improvements, (3) a corrected version.",
      "Keep it concise.",
    ];
    if (lesson.level) parts.push(`CEFR: ${lesson.level}.`);
    return parts.join(" ");
  }

  function buildSvarString(lesson: Lesson, answers: AnswersMap) {
    const tasksArr = safeTasksArray(lesson.tasks);
    const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
    const lines: string[] = [];

    if (sorted.length > 0) {
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const stableId = getStableTaskId(t, i);

        const order = t?.order ?? "";
        const prompt = t?.prompt ?? "";
        const type = t?.type ?? "";
        const ans = answers[stableId];

        if (ans === undefined || ans === null || ans === "") continue;

        lines.push(`Task ${order} (${type}): ${prompt}`);
        lines.push(`Answer: ${typeof ans === "string" ? ans : JSON.stringify(ans)}`);
        lines.push("");
      }
    } else {
      for (const [k, v] of Object.entries(answers)) {
        lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
    }

    return lines.join("\n").trim();
  }

  async function submitForFeedback() {
    if (!lessonId || !uid || !lesson) return;
    if (!hasAnswers) {
      flash("Answer at least one task first");
      return;
    }

    setSubmitting(true);
    setMsg(null);

    try {
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "submissions", stableId);

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

      setSubmissionId(stableId);

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
        const t = await res.text();
        throw new Error(`Feedback API error (${res.status}): ${t}`);
      }

      const data = await res.json();
      const fb = typeof data?.feedback === "string" ? data.feedback : JSON.stringify(data);

      setFeedback(fb);
      setTranslatedFeedback(null);

      await updateDoc(ref, {
        feedback: fb,
        feedbackUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      flash("Submitted ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not submit");
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
    } catch (e: any) {
      setTranslateErr(e?.message ?? "Translate failed");
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
      const sorted = tasksArr
        .slice()
        .sort((a: any, b: any) => (a?.order ?? 999) - (b?.order ?? 999));

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
          } catch (e: any) {
            setTranslateErr((prev) => prev ?? e?.message ?? "Translate failed");
          }
        }

        let translatedOptions: string[] = [];
        if (optionsOrig.length > 0) {
          translatedOptions = await Promise.all(
            optionsOrig.map(async (o: any) => {
              try {
                return await translateOne(String(o), targetLang);
              } catch (e: any) {
                setTranslateErr((prev) => prev ?? e?.message ?? "Translate failed");
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
    } catch (e: any) {
      setTranslateErr(e?.message ?? "Translate failed");
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateFeedback() {
    setFeedbackTranslateErr(null);
    setTranslatedFeedback(null);

    const text = (feedback ?? "").trim();
    if (!text) return;

    setFeedbackTranslating(true);
    try {
      const out = await translateOne(text, targetLang);
      setTranslatedFeedback(out);
    } catch (e: any) {
      setFeedbackTranslateErr(e?.message ?? "Translate feedback failed");
    } finally {
      setFeedbackTranslating(false);
    }
  }

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((t) => m.set(t.stableId, t));
    return m;
  }, [translatedTasks]);

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "crimson" }}>{error}</p>
        <Link href="/student">← Back to dashboard</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>Ingen data.</p>
        <Link href="/student">← Back to dashboard</Link>
      </div>
    );
  }

  const tasksOriginal = safeTasksArray(lesson.tasks)
    .slice()
    .sort((a: any, b: any) => (a?.order ?? 999) - (b?.order ?? 999));

  const originalLangForTTS: TtsLang = toTtsLang(lesson.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

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
        </div>
      </header>

      {msg ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12 }}>
          {msg}
        </div>
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No image yet</div>
                <div style={{ fontSize: 13 }}>This is reserved space for an uploaded image.</div>
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
            {saving ? "Saving…" : "SAVE TO DASHBOARD"}
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
              setTranslatedFeedback(null);
              setTranslateErr(null);
              setFeedbackTranslateErr(null);
              setTaskTranslationOpen({});
            }}
            style={btnStyle}
          >
            Reset translation
          </button>
        </div>

        {translateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{translateErr}</p> : null}
        {feedbackTranslateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{feedbackTranslateErr}</p> : null}
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
              title={`Play original (${originalLangForTTS})`}
            >
              {ttsBusy === "original" ? "Generating…" : "🔊 Play original"}
            </button>

            <button type="button" style={btnStyle} onClick={stopAudio} disabled={!audioRef.current} title="Stop">
              ⏹ Stop
            </button>

            {audioRef.current ? (
              <>
                <button type="button" style={btnStyle} onClick={isPlaying ? pauseAudio : resumeAudio}>
                  {isPlaying ? "⏸ Pause" : "▶️ Continue"}
                </button>

                <button type="button" style={btnStyle} onClick={replaySentence} title="Replay current sentence">
                  ⟲ Replay sentence
                </button>

                <button type="button" style={btnStyle} onClick={prevSentence} title="Previous sentence">
                  ⟵ Prev
                </button>

                <button type="button" style={btnStyle} onClick={nextSentence} title="Next sentence">
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
                    title="Scrub"
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
                title={`Play translation (${translationLangForTTS})`}
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

          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            style={btnStyle}
            title="Show correct answers (if tasks have correctAnswer)"
          >
            {showAnswers ? "Hide answers" : "Show answers"}
          </button>

          <button
            onClick={() => {
              setAnswers({});
              flash("Cleared answers");
            }}
            style={btnStyle}
          >
            Clear answers
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {(translatedTasks ?? []).length > 0 ? (
            <button type="button" style={btnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
              {showTaskTranslations ? "Hide all translations" : "Show all translations"}
            </button>
          ) : null}
        </div>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>No tasks in this lesson.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            {tasksOriginal.map((t: any, idx: number) => {
              const stableId = getStableTaskId(t, idx);
              const tr = tMap.get(stableId);

              const type = String(t?.type ?? "open");
              const prompt = String(t?.prompt ?? "");
              const options = Array.isArray(t?.options) ? t.options : [];
              const val = answers[stableId];

              const hasThisTranslation = !!tr?.translatedPrompt || (tr?.translatedOptions?.length ?? 0) > 0;
              const showThisTranslation = hasThisTranslation ? isTaskTranslationVisible(stableId) : false;

              const rawCorrect = t?.correctAnswer;

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
                      <span>Task {t?.order ?? idx + 1}</span>
                      <span>• {type}</span>

                      {showAnswers && hasCorrect && val != null ? (
                        <span style={{ marginLeft: 6 }}>
                          {isCorrect ? <Pill text="Correct" kind="good" /> : <Pill text="Wrong" kind="bad" />}
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
                      {options.map((o: any, i: number) => {
                        const opt = String(o);
                        const checked = val === opt;
                        const optT = tr?.translatedOptions?.[i] || "";

                        const isOptionCorrect = showAnswers && mcqCorrectText != null && opt === mcqCorrectText;
                        const isOptionChosenWrong =
                          showAnswers && checked && mcqCorrectText != null && opt !== mcqCorrectText;

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
                          True
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
                          False
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                    <textarea
                      value={typeof val === "string" ? val : val ?? ""}
                      onChange={(e) => setAnswer(stableId, e.target.value)}
                      placeholder="Write your answer…"
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
          <h2 style={{ marginBottom: 8 }}>Feedback</h2>

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
              title="Generate feedback again"
            >
              {submitting ? "Submitting…" : "GET ANSWER /FEEDBACK"}
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
              title="Translate feedback"
            >
              {feedbackTranslating ? "Translating…" : "TRANSLATE FEEDBACK"}
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
          {feedback ? feedback : <span style={{ opacity: 0.6 }}>No feedback yet. Submit when ready.</span>}
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
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Translated feedback</div>
            {translatedFeedback}
          </div>
        ) : null}
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
