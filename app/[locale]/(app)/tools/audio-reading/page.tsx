"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { collection, doc as firestoreDoc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import {
  ClipboardPaste,
  FileText,
  Save,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Volume2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { authedPost } from "@/lib/authedPost";
import { useUserProfile } from "@/lib/useUserProfile";

type RecorderStatus = "idle" | "recording" | "paused" | "ready";
type SourceMode = "paste" | "lesson";

type LessonOption = {
  id: string;
  title: string;
  sourceText: string;
  level?: string;
  language?: string;
};

type SaveAudioReadingResponse = {
  ok?: boolean;
  id?: string;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function lessonTextFromData(data: Record<string, unknown>) {
  return safeString(data.sourceText).trim() || safeString(data.text).trim();
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateReadSeconds(words: number) {
  if (words <= 0) return 0;
  return Math.max(15, Math.round((words / 115) * 60));
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export default function AudioReadingToolPage() {
  const t = useTranslations("audioReadingTool");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUserProfile();
  const activityId = searchParams.get("activityId")?.trim() || "";
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState(activityId);
  const [loadingSavedActivity, setLoadingSavedActivity] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const textAudioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  const words = useMemo(() => countWords(text), [text]);
  const estimatedSeconds = useMemo(() => estimateReadSeconds(words), [words]);
  const canRecord = text.trim().length > 0;
  const canPlayText = text.trim().length > 0;
  const hasRecording = Boolean(audioUrl);
  const canLoadLessons = Boolean(user && !user.isAnonymous);
  const selectedLesson = lessons.find((item) => item.id === selectedLessonId) ?? null;

  useEffect(() => {
    setSavedId(activityId);
  }, [activityId]);

  useEffect(() => {
    if (!activityId || !user || user.isAnonymous) return;

    let cancelled = false;

    async function loadSavedActivity() {
      setLoadingSavedActivity(true);
      setSaveError(null);

      try {
        const snap = await getDoc(firestoreDoc(db, "lessons", activityId));
        if (cancelled) return;
        if (!snap.exists()) {
          setSaveError(t("save.notFound"));
          return;
        }

        const data = snap.data();
        const loadedText = lessonTextFromData(data);
        setTitle(safeString(data.title).trim() || t("fields.titlePlaceholder"));
        updateText(loadedText);
        setSourceMode("paste");
        setSavedId(snap.id);
        clearRecording();
      } catch {
        if (!cancelled) setSaveError(t("save.loadFailed"));
      } finally {
        if (!cancelled) setLoadingSavedActivity(false);
      }
    }

    void loadSavedActivity();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, user?.uid, user?.isAnonymous]);

  async function loadLessons() {
    if (!user || user.isAnonymous) {
      setLessonError(t("source.signIn"));
      setLessons([]);
      setLessonsLoaded(true);
      return;
    }

    setLessonsLoading(true);
    setLessonError(null);

    try {
      const qy = query(collection(db, "lessons"), where("ownerId", "==", user.uid));
      const snap = await getDocs(qy);
      const rows = snap.docs
        .map((docSnap): LessonOption | null => {
          const data = docSnap.data();
          if (!isRecord(data)) return null;
          const sourceText = lessonTextFromData(data);
          if (!sourceText) return null;
          return {
            id: docSnap.id,
            title: safeString(data.title).trim() || t("source.untitled"),
            sourceText,
            level: safeString(data.level).trim() || undefined,
            language: safeString(data.language).trim() || undefined,
          };
        })
        .filter((row): row is LessonOption => row !== null)
        .sort((a, b) => a.title.localeCompare(b.title));

      setLessons(rows);
      setLessonsLoaded(true);
    } catch {
      setLessonError(t("source.loadFailed"));
      setLessons([]);
      setLessonsLoaded(true);
    } finally {
      setLessonsLoading(false);
    }
  }

  function choosePasteMode() {
    setSourceMode("paste");
    setLessonError(null);
  }

  function updateText(nextText: string) {
    if (textAudioRef.current) {
      stopTextAudio();
      textAudioRef.current = null;
    }
    setText(nextText);
  }

  async function chooseLessonMode() {
    setSourceMode("lesson");
    if (!lessonsLoaded && !lessonsLoading) {
      await loadLessons();
    }
  }

  function applyLesson(lessonId: string) {
    setSelectedLessonId(lessonId);
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    setTitle(lesson.title);
    updateText(lesson.sourceText);
    clearRecording();
    setSaveMessage(null);
    setSaveError(null);
  }

  async function saveActivity() {
    setSaveBusy(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await authedPost<SaveAudioReadingResponse>("/api/tools/audio-reading/save", {
        id: savedId || undefined,
        title: title.trim() || t("title"),
        sourceText: text,
        sourceMode,
        sourceLessonId: sourceMode === "lesson" ? selectedLessonId : "",
        sourceLessonTitle: sourceMode === "lesson" ? selectedLesson?.title ?? "" : "",
      });

      if (!response.id) throw new Error(response.error || t("save.failed"));
      setSavedId(response.id);
      setSaveMessage(t("save.saved"));
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : t("save.failed"));
    } finally {
      setSaveBusy(false);
    }
  }

  useEffect(() => {
    if (status !== "recording" || startedAtRef.current == null) return;

    const interval = window.setInterval(() => {
      const activeMs = Date.now() - (startedAtRef.current ?? Date.now());
      setElapsedSeconds(Math.floor((accumulatedMsRef.current + activeMs) / 1000));
    }, 250);

    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      textAudioRef.current?.pause();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  function stopTextAudio() {
    const audio = textAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setTtsPlaying(false);
  }

  function pauseTextAudio() {
    textAudioRef.current?.pause();
    setTtsPlaying(false);
  }

  function resumeTextAudio() {
    const audio = textAudioRef.current;
    if (!audio) return;
    audio.play().catch(() => setTtsError(t("listen.failed")));
  }

  async function playTextAudio() {
    const clean = text.trim();
    if (!clean) {
      setTtsError(t("errors.missingText"));
      return;
    }

    setTtsBusy(true);
    setTtsError(null);

    try {
      stopTextAudio();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: savedId || activityId || "audio-reading-beta",
          lang: selectedLesson?.language || locale,
          text: clean,
          voice: "marin",
        }),
      });

      const raw = await res.text();
      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`TTS API returned non-JSON (HTTP ${res.status})`);
      }

      const result = data as { error?: unknown; url?: unknown };
      if (!res.ok) throw new Error(result.error ? String(result.error) : t("listen.failed"));

      const url = typeof result.url === "string" ? result.url.trim() : "";
      if (!url) throw new Error(t("listen.failed"));

      const audio = new Audio(url);
      textAudioRef.current = audio;
      audio.addEventListener("play", () => setTtsPlaying(true));
      audio.addEventListener("pause", () => setTtsPlaying(false));
      audio.addEventListener("ended", () => setTtsPlaying(false));
      await audio.play();
    } catch (error: unknown) {
      setTtsError(error instanceof Error ? error.message : t("listen.failed"));
      setTtsPlaying(false);
    } finally {
      setTtsBusy(false);
    }
  }

  function clearRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setElapsedSeconds(0);
    setStatus("idle");
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
  }

  function cancelActiveRecorder() {
    const recorder = recorderRef.current;
    if (!recorder) return;

    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function startRecording() {
    setError(null);
    stopTextAudio();

    if (!canRecord) {
      setError(t("errors.missingText"));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("errors.unsupported"));
      return;
    }

    try {
      clearRecording();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioUrl(URL.createObjectURL(blob));
        setStatus("ready");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        startedAtRef.current = null;
      };

      recorder.start();
      startedAtRef.current = Date.now();
      accumulatedMsRef.current = 0;
      setElapsedSeconds(0);
      setStatus("recording");
    } catch (e: unknown) {
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" ? t("errors.permission") : t("errors.default"));
      setStatus("idle");
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    accumulatedMsRef.current += Date.now() - (startedAtRef.current ?? Date.now());
    startedAtRef.current = null;
    recorder.pause();
    setStatus("paused");
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;

    recorder.resume();
    startedAtRef.current = Date.now();
    setStatus("recording");
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    if (startedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      setElapsedSeconds(Math.floor(accumulatedMsRef.current / 1000));
    }

    recorder.stop();
  }

  function resetAll() {
    cancelActiveRecorder();
    clearRecording();
    setError(null);
  }

  const durationSignal =
    hasRecording && estimatedSeconds > 0
      ? elapsedSeconds < estimatedSeconds * 0.55
        ? t("review.signals.short")
        : elapsedSeconds > estimatedSeconds * 1.8
          ? t("review.signals.long")
          : t("review.signals.ok")
      : t("review.signals.pending");

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-4 sm:py-8">
      <section className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            {t("eyebrow")}
          </span>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
            {t("beta")}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {t("subtitle")}
        </p>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5">
          {loadingSavedActivity ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600 shadow-sm">
              {t("save.loadingActivity")}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-extrabold text-slate-950">{t("source.title")}</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={choosePasteMode}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-bold ${
                  sourceMode === "paste"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                <ClipboardPaste size={18} aria-hidden />
                {t("source.paste")}
              </button>
              <button
                type="button"
                onClick={chooseLessonMode}
                disabled={userLoading}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                  sourceMode === "lesson"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                <FileText size={18} aria-hidden />
                {t("source.lesson")}
              </button>
              <button
                type="button"
                disabled
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-400"
              >
                <Sparkles size={18} aria-hidden />
                {t("source.generate")}
              </button>
            </div>

            {sourceMode === "lesson" ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {t("source.lessonPickerTitle")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {t("source.lessonPickerHelp")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadLessons}
                    disabled={lessonsLoading || !canLoadLessons}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {lessonsLoading ? t("source.loading") : t("source.refresh")}
                  </button>
                </div>

                {lessonError ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    {lessonError}
                  </p>
                ) : null}

                {lessonsLoaded && lessons.length === 0 && !lessonError ? (
                  <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    {t("source.empty")}
                  </p>
                ) : null}

                {lessons.length > 0 ? (
                  <label className="mt-3 block">
                    <span className="text-sm font-bold text-slate-700">
                      {t("source.selectLesson")}
                    </span>
                    <select
                      value={selectedLessonId}
                      onChange={(event) => applyLesson(event.target.value)}
                      className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
                    >
                      <option value="">{t("source.selectPlaceholder")}</option>
                      {lessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {lesson.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            <label className="mt-5 block">
              <span className="text-sm font-bold text-slate-700">{t("fields.title")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("fields.titlePlaceholder")}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-700">{t("fields.text")}</span>
              <textarea
                value={text}
                onChange={(event) => updateText(event.target.value)}
                placeholder={t("fields.textPlaceholder")}
                rows={12}
                className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 outline-none focus:border-slate-900"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{t("listen.title")}</h2>
                <p className="mt-1 text-sm text-slate-600">{t("listen.subtitle")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!ttsPlaying ? (
                <button
                  type="button"
                  onClick={textAudioRef.current ? resumeTextAudio : playTextAudio}
                  disabled={ttsBusy || !canPlayText}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Volume2 size={18} aria-hidden />
                  {ttsBusy ? t("listen.loading") : textAudioRef.current ? t("listen.resume") : t("listen.play")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pauseTextAudio}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
                >
                  <Pause size={18} aria-hidden />
                  {t("listen.pause")}
                </button>
              )}

              <button
                type="button"
                onClick={stopTextAudio}
                disabled={!textAudioRef.current}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Square size={18} aria-hidden />
                {t("listen.stop")}
              </button>
            </div>

            {ttsError ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {ttsError}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{t("record.title")}</h2>
                <p className="mt-1 text-sm text-slate-600">{t("record.subtitle")}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-lg font-black text-slate-950">
                {formatDuration(elapsedSeconds)}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {status === "idle" || status === "ready" ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={!canRecord}
                  className="inline-flex items-center gap-2 rounded-md border border-rose-700 bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mic size={18} aria-hidden />
                  {t("record.start")}
                </button>
              ) : null}

              {status === "recording" ? (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
                >
                  <Pause size={18} aria-hidden />
                  {t("record.pause")}
                </button>
              ) : null}

              {status === "paused" ? (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                >
                  <Play size={18} aria-hidden />
                  {t("record.resume")}
                </button>
              ) : null}

              {status === "recording" || status === "paused" ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
                >
                  <Square size={18} aria-hidden />
                  {t("record.stop")}
                </button>
              ) : null}

              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
              >
                <RotateCcw size={18} aria-hidden />
                {t("record.reset")}
              </button>
            </div>

            {error ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            ) : null}

            {audioUrl ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-900">{t("record.preview")}</div>
                  <button
                    type="button"
                    onClick={clearRecording}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                  >
                    <Trash2 size={16} aria-hidden />
                    {t("record.delete")}
                  </button>
                </div>
                <audio controls src={audioUrl} className="mt-3 w-full" />
              </div>
            ) : null}
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950">{t("save.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("save.subtitle")}</p>
            <button
              type="button"
              onClick={saveActivity}
              disabled={saveBusy || !text.trim() || !user || user.isAnonymous}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} aria-hidden />
              {saveBusy ? t("save.saving") : savedId ? t("save.update") : t("save.action")}
            </button>
            {!user || user.isAnonymous ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {t("save.signIn")}
              </p>
            ) : null}
            {saveMessage ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                {saveMessage}{" "}
                <Link href={`/${locale}/content`} className="underline">
                  {t("save.openContent")}
                </Link>
              </div>
            ) : null}
            {saveError ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {saveError}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950">{t("stats.title")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  {t("stats.words")}
                </dt>
                <dd className="mt-1 text-2xl font-black text-slate-950">{words}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  {t("stats.estimate")}
                </dt>
                <dd className="mt-1 text-2xl font-black text-slate-950">
                  {formatDuration(estimatedSeconds)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950">{t("review.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("review.subtitle")}</p>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {t("review.duration")}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900">{durationSignal}</div>
            </div>
            <ul className="mt-4 grid gap-2 text-sm text-slate-700">
              <li>{t("review.checks.one")}</li>
              <li>{t("review.checks.two")}</li>
              <li>{t("review.checks.three")}</li>
            </ul>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
              <UploadCloud size={18} aria-hidden />
              {t("next.title")}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("next.body")}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
