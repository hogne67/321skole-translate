// app/(app)/space/[spaceId]/lesson/[lessonId]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { SearchableSelect } from "@/components/SearchableSelect";
import { LANGUAGES } from "@/lib/languages";

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

/* =========================
   Page
========================= */

export default function SpaceLessonPage() {
  const params = useParams<{ spaceId: string; lessonId: string }>();
  const spaceId = params?.spaceId;
  const lessonId = params?.lessonId;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState(true);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // translations
  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);
  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);
  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});

  // tts
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
    () => safeTasksArray(lesson?.tasks).slice().sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999)),
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

  const originalLangForTTS: TtsLang = toTtsLang(lesson?.language || "no");
  const translationLangForTTS: TtsLang = toTtsLang(targetLang);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
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
    a.play().catch(() => {
      /* ignore */
    });
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

    if (a.paused) {
      a.play().catch(() => {
        /* ignore */
      });
    }
  }

  function replaySentence() {
    const a = audioRef.current;
    if (!a) return;

    if (activeTextMode && activeSentenceIndex != null) {
      seekToSentence(activeTextMode, activeSentenceIndex);
    } else {
      a.currentTime = Math.max(0, a.currentTime - 2.0);
      a.play().catch(() => {
        /* ignore */
      });
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
     Load lesson
  ========================= */

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!spaceId || !lessonId) {
          setErr("Mangler spaceId/lessonId i URL.");
          return;
        }

        const user = auth.currentUser ?? (await ensureAnonymousUser());
        if (!alive) return;

        setUid(user.uid);
        setIsAnon(!!user.isAnonymous);

        // Read published lesson (space-lesson expects published id)
        const snap = await getDoc(doc(db, "published_lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr("Fant ikke lesson. (Sjekk at lenken bruker published lessonId.)");
          setLesson(null);
          return;
        }

        const d = snap.data() as Lesson;

        if (d?.isActive === false) {
          setErr("Denne oppgaven er avpublisert.");
          setLesson(null);
          return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, lessonId]);

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
     Submit to space
  ========================= */

  async function submitToSpace() {
    if (!spaceId || !lessonId || !uid) return;

    setSaving(true);
    setMsg(null);

    try {
      await addDoc(collection(db, `spaces/${spaceId}/lessons/${lessonId}/submissions`), {
        spaceId,
        lessonId,
        status: "new",
        answers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        auth: {
          isAnon: isAnon,
          uid: uid,
        },
      });

      flash("Submitted ✅");
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setErr(typeof m === "string" ? m : "Could not submit");
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
        <div style={{ marginTop: 12 }}>
          <Link href="/join">← Til Join</Link>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <div>Ingen data.</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/join">← Til Join</Link>
        </div>
      </div>
    );
  }

  const originalSegs = textFollow.original.segs;
  const translationSegs = textFollow.translation.segs;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>{lesson.title ?? "Lesson"}</h1>
          <div style={{ opacity: 0.75 }}>
            {lesson.level ? <span>{lesson.level}</span> : null}
            {lesson.language ? <span> • {String(lesson.language).toUpperCase()}</span> : null}
            {lesson.topic ? <span> • {lesson.topic}</span> : null}
            {isAnon ? <span> • anon</span> : <span> • logged in</span>}
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
            disabled={saving || !uid}
            style={{
              ...btnStyle,
              background: "#bef7c0",
              borderColor: "#2563eb",
              color: "black",
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
            title={isAnon ? "Anon kan også sende inn (via anonymous auth)" : "Submit"}
          >
            {saving ? "Submitting…" : "SUBMIT TO SPACE"}
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

              const type = String(t?.type ?? "open");
              const prompt = String(t?.prompt ?? "");
              const options = Array.isArray(t?.options) ? (t.options as unknown[]) : [];
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

                      {hasCorrect && val != null ? (
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
                              cursor: "pointer",
                              background: "white",
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
                  ) : null}

                  {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                    <textarea
                      value={typeof val === "string" ? val : val == null ? "" : String(val)}
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

      <section style={{ marginTop: 18 }}>
        <Link href={`/space/${spaceId}`} style={{ textDecoration: "none" }}>
          ← Back to space
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