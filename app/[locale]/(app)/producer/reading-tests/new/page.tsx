// app/[locale]/(app)/producer/reading-tests/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { LANGUAGES } from "@/lib/languages";

type LevelKey = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type AudienceKey = "children" | "teenagers" | "adult learners" | "learners";
type FeedbackMode = "learner" | "adult" | "both";

type ReadingTestTaskType =
  | "word_choice"
  | "sentence_placement"
  | "best_summary"
  | "mcq"
  | "true_false"
  | "fill_in_word"
  | "short_answer"
  | "open";

type LessonTask = {
  id: string;
  order?: number;
  type: ReadingTestTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean | string[];
  sentence?: string;
  textWithGap?: string;
  enabled?: boolean;
};

type QuotaInfo = {
  feature: string;
  limit: number;
  used: number;
  remaining: number;
  period: string;
};

type ReadingWordChoiceTask = {
  prompt: string;
  sentence: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingSentencePlacementTask = {
  prompt: string;
  textWithGap: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingBestSummaryTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingFillInWordTask = {
  prompt: string;
  sentence: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingTestPack = {
  title: string;
  cefrLevel: string;
  language: string;
  topic: string;
  wordCount: number;
  text: string;
  tasks: {
    wordChoice: ReadingWordChoiceTask;
    sentencePlacement: ReadingSentencePlacementTask;
    bestSummary: ReadingBestSummaryTask;
    fillInWord?: ReadingFillInWordTask;
  };
  feedback: {
    learner: string;
    adult: string;
    nextStep: string;
  };
};

type GenerateReadingTestResp = ReadingTestPack & {
  error?: string;
  raw?: string;
};

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function renumberOrders(tasks: LessonTask[]) {
  return tasks.map((task, idx) => ({ ...task, order: idx + 1 }));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function replaceWholeWordOnce(sentence: string, word: string, replacement: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`);
  if (re.test(sentence)) return sentence.replace(re, replacement);
  return sentence.replace(word, replacement);
}

function makeFillInWordTaskFromWordChoice(wordChoice: ReadingWordChoiceTask): LessonTask {
  const blankSentence = replaceWholeWordOnce(
    wordChoice.sentence,
    wordChoice.correctAnswer,
    "_____"
  );

  return {
    id: newId(),
    type: "fill_in_word",
    prompt: "Choose the correct word for the blank.",
    sentence: blankSentence,
    options: [...wordChoice.options],
    correctAnswer: wordChoice.correctAnswer,
    enabled: true,
  };
}

function readingTestToLessonTasks(
  test: ReadingTestPack,
  enabledTaskTypes: ReadingTestTaskType[]
): LessonTask[] {
  const tasks: LessonTask[] = [];

  if (enabledTaskTypes.includes("word_choice")) {
    tasks.push({
      id: newId(),
      type: "word_choice",
      prompt: test.tasks.wordChoice.prompt,
      sentence: test.tasks.wordChoice.sentence,
      options: [...test.tasks.wordChoice.options],
      correctAnswer: test.tasks.wordChoice.correctAnswer,
      enabled: true,
    });
  }

  if (enabledTaskTypes.includes("fill_in_word")) {
    tasks.push(makeFillInWordTaskFromWordChoice(test.tasks.wordChoice));
  }

  if (enabledTaskTypes.includes("sentence_placement")) {
    tasks.push({
      id: newId(),
      type: "sentence_placement",
      prompt: test.tasks.sentencePlacement.prompt,
      textWithGap: test.tasks.sentencePlacement.textWithGap,
      options: [...test.tasks.sentencePlacement.options],
      correctAnswer: test.tasks.sentencePlacement.correctAnswer,
      enabled: true,
    });
  }

  if (enabledTaskTypes.includes("best_summary")) {
    tasks.push({
      id: newId(),
      type: "best_summary",
      prompt: test.tasks.bestSummary.prompt,
      options: [...test.tasks.bestSummary.options],
      correctAnswer: test.tasks.bestSummary.correctAnswer,
      enabled: true,
    });
  }

  return renumberOrders(tasks);
}

const LEVEL_DEFAULTS: Record<LevelKey, { minWords: number; maxWords: number }> = {
  A1: { minWords: 60, maxWords: 90 },
  A2: { minWords: 120, maxWords: 180 },
  B1: { minWords: 120, maxWords: 180 },
  B2: { minWords: 150, maxWords: 220 },
  C1: { minWords: 180, maxWords: 260 },
  C2: { minWords: 180, maxWords: 260 },
};

const TASK_TYPE_LABELS: Record<ReadingTestTaskType, string> = {
  word_choice: "Word choice",
  sentence_placement: "Sentence placement",
  best_summary: "Best summary",
  mcq: "MCQ",
  true_false: "True / false",
  fill_in_word: "Fill in word",
  short_answer: "Short answer",
  open: "Open",
};

export default function NewReadingTestPage() {
  const router = useRouter();
  const locale = useLocale();

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    marginTop: 6,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffffe0",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    outline: "none",
    fontSize: 14,
  };

  const fieldStyleCompact: CSSProperties = {
    ...fieldStyle,
    padding: 8,
  };

  const cardStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 20,
    background: "#ede5e5f4",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.10)",
    padding: 18,
  };

  const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  };

  const buttonPrimary: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #0f172a",
    background: "#214db4",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#318a5d",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  };

  const buttonSmall: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  };

  const timerPresetButton: CSSProperties = {
    ...buttonSmall,
    borderRadius: 999,
    padding: "7px 12px",
  };

  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [level, setLevel] = useState<LevelKey>("A2");
  const [language, setLanguage] = useState("nb");
  const [languageSearch, setLanguageSearch] = useState("");
  const [topic, setTopic] = useState(
    "A short everyday text about family, school, nature or daily life."
  );
  const [audience, setAudience] = useState<AudienceKey>("learners");
  const [minWords, setMinWords] = useState<number>(LEVEL_DEFAULTS.A2.minWords);
  const [maxWords, setMaxWords] = useState<number>(LEVEL_DEFAULTS.A2.maxWords);

  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number>(5);
  const [timerExtraSeconds, setTimerExtraSeconds] = useState<number>(0);
  const [showQuestionsAfterReading, setShowQuestionsAfterReading] = useState(true);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("both");
  const [enabledTaskTypes, setEnabledTaskTypes] = useState<ReadingTestTaskType[]>([
    "word_choice",
    "sentence_placement",
    "best_summary",
  ]);

  const [title, setTitle] = useState("Lesetest");
  const [sourceText, setSourceText] = useState("");
  const [lessonTasks, setLessonTasks] = useState<LessonTask[]>([]);
  const [readingPack, setReadingPack] = useState<ReadingTestPack | null>(null);

  const [loadingReadingTest, setLoadingReadingTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [tasksDirty, setTasksDirty] = useState(false);

  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const busy = loadingReadingTest || saving;

  useEffect(() => {
    const d = LEVEL_DEFAULTS[level];
    setMinWords(d.minWords);
    setMaxWords(d.maxWords);
  }, [level]);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.trim().toLowerCase();
    if (!q) return LANGUAGES;

    return LANGUAGES.filter((l) => {
      const hay = `${l.label} ${l.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [languageSearch]);

  const timerSeconds = useMemo(() => {
    const minutes = Number.isFinite(timerMinutes) ? timerMinutes : 0;
    const extra = Number.isFinite(timerExtraSeconds) ? timerExtraSeconds : 0;
    return clamp(minutes, 0, 120) * 60 + clamp(extra, 0, 59);
  }, [timerMinutes, timerExtraSeconds]);

  const timerPreview = useMemo(() => {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    if (!timerEnabled) return "No timer";
    if (secs === 0) return `${mins} min`;
    return `${mins} min ${secs} sec`;
  }, [timerEnabled, timerSeconds]);

  async function fetchQuotaForCreateLesson() {
    try {
      setQuotaLoading(true);
      const user = getAuth().currentUser;
      if (!user) {
        setQuotaInfo(null);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch(`/api/quota?feature=producer_create_lesson`, {
        headers: { authorization: `Bearer ${token}` },
      });

      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as QuotaInfo) : null;

      if (res.ok && data && typeof data.used === "number") {
        setQuotaInfo(data);
      }
    } catch {
      // silent
    } finally {
      setQuotaLoading(false);
    }
  }

  useEffect(() => {
    fetchQuotaForCreateLesson();
    const tt = setTimeout(() => fetchQuotaForCreateLesson(), 600);
    return () => clearTimeout(tt);
  }, []);

  async function generateReadingTest() {
    setLoadingReadingTest(true);
    setError(null);
    setSavedId(null);

    try {
      const res = await fetch("/api/reading-tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  level,
  language,
  topic,
  audience,
  minWords,
  maxWords,
  enabledTaskTypes,
}),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateReadingTestResp;
      try {
        data = JSON.parse(raw) as GenerateReadingTestResp;
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.text?.trim()) throw new Error("Missing reading text in response.");

      const nextTitle = (data.title || "Lesetest").trim() || "Lesetest";

      setTitle(nextTitle);
      setSourceText(data.text.trim());
      setLessonTasks(readingTestToLessonTasks(data, enabledTaskTypes));
      setReadingPack(data);
      setTasksDirty(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingReadingTest(false);
    }
  }

  async function saveToFirestore() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      if (!title.trim()) throw new Error("Title is required.");
      if (!sourceText.trim()) throw new Error("Source text is empty.");
      if (timerEnabled && timerSeconds < 10) {
        throw new Error("Timer must be at least 10 seconds.");
      }

      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in. Please log in as teacher/producer.");

      const token = await user.getIdToken();

      const readingTestConfig = {
        cefrLevel: level,
        audience,
        topic,
        minWords,
        maxWords,
        timerEnabled,
        timerSeconds: timerEnabled ? timerSeconds : null,
        showQuestionsAfterReading,
        enabledTaskTypes,
        feedbackMode,
      };

      const res = await fetch("/api/producer/create-reading-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          level,
          language,
          sourceText,
          wordCount: readingPack?.wordCount ?? 0,
          tasks: renumberOrders(lessonTasks),
          readingTestConfig,
        }),
      });

      const raw = await res.text();

      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // ignore
      }

      const anyData: Record<string, unknown> = isRecord(data) ? data : {};

      if (!res.ok) {
        const quotaUnknown = anyData["quota"];
        if (res.status === 429 && quotaUnknown && typeof quotaUnknown === "object") {
          const q = quotaUnknown as Partial<QuotaInfo>;
          const used = typeof q.used === "number" ? q.used : 15;
          const limit = typeof q.limit === "number" ? q.limit : 15;
          throw new Error(`Du har brukt ${used} av ${limit} denne måneden. Du kan ikke lage flere nå.`);
        }

        const msg = typeof anyData["error"] === "string" ? anyData["error"] : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const id = typeof anyData["id"] === "string" ? anyData["id"].trim() : "";
      if (!id) throw new Error("Missing id from server.");

      setSavedId(id);

      const quota2 = anyData["quota"];
      if (quota2 && typeof quota2 === "object") {
        setQuotaInfo(quota2 as QuotaInfo);
      } else {
        fetchQuotaForCreateLesson();
      }

      router.push(`/${locale}/producer/reading-tests/${id}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function deleteTask(index: number) {
    setLessonTasks((prev) => renumberOrders(prev.filter((_, i) => i !== index)));
  }

  function moveTask(index: number, dir: -1 | 1) {
    setLessonTasks((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[to];
      copy[to] = tmp;
      return renumberOrders(copy);
    });
  }

  function addTask(type: ReadingTestTaskType) {
    const baseTask: LessonTask =
      type === "mcq"
        ? {
            id: newId(),
            type: "mcq",
            prompt: "New multiple choice question",
            options: ["Option 1", "Option 2", "Option 3"],
            correctAnswer: "Option 1",
            enabled: true,
          }
        : type === "true_false"
        ? {
            id: newId(),
            type: "true_false",
            prompt: "Write true or false",
            options: ["True", "False"],
            correctAnswer: "True",
            enabled: true,
          }
        : type === "fill_in_word"
        ? {
            id: newId(),
            type: "fill_in_word",
            prompt: "Choose the correct word for the blank.",
            sentence: "Barna så en svart _____ som sa mjau.",
            options: ["katt", "hest", "hund"],
            correctAnswer: "katt",
            enabled: true,
          }
        : type === "short_answer"
        ? {
            id: newId(),
            type: "short_answer",
            prompt: "Write a short answer.",
            enabled: true,
          }
        : {
            id: newId(),
            type: "open",
            prompt: "New open question",
            enabled: true,
          };

    setLessonTasks((prev) => renumberOrders([...prev, baseTask]));
  }

  const quotaBlocked = quotaInfo ? quotaInfo.remaining <= 0 : false;

  const visibleFeedbackText = useMemo(() => {
    if (!readingPack) return null;

    if (feedbackMode === "learner") {
      return `For learner:\n${readingPack.feedback.learner}\n\nNext step:\n${readingPack.feedback.nextStep}`;
    }

    if (feedbackMode === "adult") {
      return `For teacher / parent:\n${readingPack.feedback.adult}\n\nNext step:\n${readingPack.feedback.nextStep}`;
    }

    return (
      `For learner:\n${readingPack.feedback.learner}\n\n` +
      `For teacher / parent:\n${readingPack.feedback.adult}\n\n` +
      `Next step:\n${readingPack.feedback.nextStep}`
    );
  }, [readingPack, feedbackMode]);

  return (
    <main
      className="pageWrap"
      style={{
        width: "100%",
        maxWidth: 980,
        margin: "0 auto",
        padding: "8px 12px 60px",
        boxSizing: "border-box",
      }}
    >
      <div className="pageCard" style={{ ...cardStyle, padding: 20 }}>
        <h1 style={{ marginTop: 0, marginBottom: 6, fontSize: 26, fontWeight: 800 }}>
          Lesetest-generator
        </h1>
        <p style={{ marginTop: 0, marginBottom: 10, opacity: 0.8 }}>
          Lag en lesetest med tekst og oppgavetyper som passer til nivå og tema.
        </p>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 12,
            marginTop: 14,
          }}
        >
          <label>
            CEFR level
            <select value={level} onChange={(e) => setLevel(e.target.value as LevelKey)} style={fieldStyle}>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </label>

          <label>
            Language
            <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
              <input
                value={languageSearch}
                onChange={(e) => setLanguageSearch(e.target.value)}
                placeholder="Search language"
                style={fieldStyleCompact}
              />
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={fieldStyle}>
                {filteredLanguages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{filteredLanguages.length} languages</div>
            </div>
          </label>

          <label>
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceKey)}
              style={fieldStyle}
            >
              <option value="children">children</option>
              <option value="teenagers">teenagers</option>
              <option value="adult learners">adult learners</option>
              <option value="learners">learners</option>
            </select>
          </label>

          <label>
            Minimum words
            <input
              type="number"
              value={minWords}
              onChange={(e) => setMinWords(Number(e.target.value))}
              style={fieldStyle}
              min={40}
              max={500}
            />
          </label>

          <label>
            Maximum words
            <input
              type="number"
              value={maxWords}
              onChange={(e) => setMaxWords(Number(e.target.value))}
              style={fieldStyle}
              min={40}
              max={500}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Topic / prompt
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              style={{
                ...fieldStyle,
                resize: "vertical",
                minHeight: 90,
                lineHeight: 1.35,
                fontFamily: "inherit",
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Example: A short text about school, football, nature, family life or daily activities.
            </div>
          </label>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <strong>Reading flow and timing</strong>
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: timerEnabled ? "#eff6ff" : "#f8fafc",
                  border: "1px solid #dbeafe",
                  fontWeight: 700,
                }}
              >
                {timerPreview}
              </span>
            </div>

            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 8, lineHeight: 1.45 }}>
              These settings are saved in the reading test config. They describe the intended student flow,
              but they do not yet override the full teacher submission flow everywhere in the app.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "1.2fr 1fr",
                gap: 14,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={timerEnabled}
                    onChange={(e) => setTimerEnabled(e.target.checked)}
                  />
                  Enable timer
                </label>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Quick presets</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[2, 3, 5, 10, 15, 20].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setTimerEnabled(true);
                          setTimerMinutes(m);
                          setTimerExtraSeconds(0);
                        }}
                        style={{
                          ...timerPresetButton,
                          background: timerMinutes === m && timerExtraSeconds === 0 ? "#dbeafe" : "#fff",
                        }}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <label>
                    Minutes
                    <input
                      type="number"
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(clamp(Number(e.target.value || 0), 0, 120))}
                      style={fieldStyle}
                      min={0}
                      max={120}
                      disabled={!timerEnabled}
                    />
                  </label>

                  <label>
                    Extra seconds
                    <input
                      type="number"
                      value={timerExtraSeconds}
                      onChange={(e) =>
                        setTimerExtraSeconds(clamp(Number(e.target.value || 0), 0, 59))
                      }
                      style={fieldStyle}
                      min={0}
                      max={59}
                      disabled={!timerEnabled}
                    />
                  </label>
                </div>

                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                  Easier for teachers: set most timers in minutes, and adjust seconds only when needed.
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showQuestionsAfterReading}
                    onChange={(e) => setShowQuestionsAfterReading(e.target.checked)}
                  />
                  <span>
                    <strong>Show questions after reading</strong>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      Student reads first, then gets the tasks.
                    </div>
                  </span>
                </label>

                <label style={{ display: "block", marginTop: 14 }}>
                  Feedback mode
                  <select
                    value={feedbackMode}
                    onChange={(e) => setFeedbackMode(e.target.value as FeedbackMode)}
                    style={fieldStyle}
                  >
                    <option value="learner">Learner only</option>
                    <option value="adult">Teacher / parent only</option>
                    <option value="both">Both</option>
                  </select>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    This controls which generated guidance is shown here in the builder. Today the teacher
                    still receives the full submission regardless.
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
            <strong>Task types</strong>

            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 8, lineHeight: 1.45 }}>
              The generator currently creates the classic reading-test tasks first. You can also include
              <strong> fill in word</strong> right away, and add more task types manually below.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "repeat(4, 1fr)",
                gap: 12,
                marginTop: 12,
              }}
            >
              {(
                [
                  "word_choice",
                  "fill_in_word",
                  "sentence_placement",
                  "best_summary",
                  "mcq",
                  "true_false",
                  "short_answer",
                  "open",
                ] as ReadingTestTaskType[]
              ).map((type) => (
                <label key={type} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={enabledTaskTypes.includes(type)}
                    onChange={(e) => {
                      setEnabledTaskTypes((prev) =>
                        e.target.checked
                          ? Array.from(new Set([...prev, type]))
                          : prev.filter((x) => x !== type)
                      );
                    }}
                  />
                  {TASK_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>

          <div
            className="actionRow"
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <button
              className="actionBtn"
              onClick={generateReadingTest}
              disabled={busy}
              style={{
                ...buttonPrimary,
                opacity: busy ? 0.7 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {loadingReadingTest ? "Generating reading test..." : "Generate reading test"}
            </button>

            <button
              className="actionBtn"
              onClick={saveToFirestore}
              disabled={busy || quotaBlocked}
              style={{
                ...buttonSecondary,
                opacity: busy || quotaBlocked ? 0.55 : 1,
                cursor: busy || quotaBlocked ? "not-allowed" : "pointer",
              }}
              title={
                quotaBlocked && quotaInfo
                  ? `Du har brukt ${quotaInfo.used} av ${quotaInfo.limit} denne måneden.`
                  : "Save draft"
              }
            >
              {saving ? "Saving..." : "Save draft"}
            </button>

            {tasksDirty && sourceText.trim() && (
              <span style={{ color: "#b45309", fontWeight: 700 }}>
                Text has changed. Check tasks before saving.
              </span>
            )}

            {quotaLoading && <span style={{ opacity: 0.75 }}>Loading quota…</span>}

            {quotaInfo && (
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background:
                    quotaInfo.remaining <= 0
                      ? "#fff1f2"
                      : quotaInfo.remaining <= 2
                      ? "#fffbeb"
                      : "#f0fdf4",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
                title={`Period: ${quotaInfo.period}`}
              >
                {`Du har brukt ${quotaInfo.used} av ${quotaInfo.limit} denne måneden`}
                {quotaInfo.remaining <= 2 ? " (snart tomt)" : ""}
              </span>
            )}

            {savedId && <span style={{ color: "green" }}>Saved: {savedId}</span>}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <h2 style={sectionTitleStyle}>Lesson builder</h2>

          <label style={{ display: "block", marginTop: 10 }}>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />
          </label>

          <label style={{ display: "block", marginTop: 12 }}>
            Reading text
            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value);
                if (lessonTasks.length > 0) setTasksDirty(true);
              }}
              rows={10}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>

          {readingPack && visibleFeedbackText && (
            <div style={{ marginTop: 16, ...cardStyle }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Generated guidance preview</div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  lineHeight: 1.45,
                  fontSize: 14,
                }}
              >
                {visibleFeedbackText}
              </pre>
            </div>
          )}

          <div style={{ marginTop: 18, ...cardStyle }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Tasks</h3>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => addTask("fill_in_word")} style={buttonSmall}>
                  Add fill in word
                </button>
                <button type="button" onClick={() => addTask("mcq")} style={buttonSmall}>
                  Add MCQ
                </button>
                <button type="button" onClick={() => addTask("true_false")} style={buttonSmall}>
                  Add true/false
                </button>
                <button type="button" onClick={() => addTask("short_answer")} style={buttonSmall}>
                  Add short answer
                </button>
                <button type="button" onClick={() => addTask("open")} style={buttonSmall}>
                  Add open
                </button>
              </div>
            </div>

            {lessonTasks.length === 0 ? (
              <p style={{ opacity: 0.75, marginTop: 10 }}>
                No tasks yet. Generate a reading test first.
              </p>
            ) : (
              <div style={{ marginTop: 12 }}>
                {lessonTasks.map((task, idx) => (
                  <div
                    key={task.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                      background: "#fff",
                      boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ minWidth: 110 }}>
                          {idx + 1}. {TASK_TYPE_LABELS[task.type]}
                        </strong>
                        <span style={{ opacity: 0.7, fontSize: 13 }}>ID: {task.id}</span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => moveTask(idx, -1)}
                          disabled={idx === 0}
                          style={{
                            ...buttonSmall,
                            opacity: idx === 0 ? 0.5 : 1,
                            cursor: idx === 0 ? "not-allowed" : "pointer",
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(idx, 1)}
                          disabled={idx === lessonTasks.length - 1}
                          style={{
                            ...buttonSmall,
                            opacity: idx === lessonTasks.length - 1 ? 0.5 : 1,
                            cursor: idx === lessonTasks.length - 1 ? "not-allowed" : "pointer",
                          }}
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => deleteTask(idx)} style={buttonSmall}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <label style={{ display: "block", marginTop: 10 }}>
                      Prompt
                      <input
                        value={task.prompt}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLessonTasks((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x))
                          );
                        }}
                        style={fieldStyle}
                      />
                    </label>

                    {(task.type === "word_choice" || task.type === "fill_in_word") && (
                      <label style={{ display: "block", marginTop: 10 }}>
                        {task.type === "fill_in_word" ? "Sentence with blank" : "Sentence"}
                        <textarea
                          value={task.sentence ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLessonTasks((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, sentence: v } : x))
                            );
                          }}
                          rows={3}
                          style={{ ...fieldStyle, resize: "vertical" }}
                        />
                        {task.type === "fill_in_word" && (
                          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>
                            Example: Barna så en svart _____ som sa mjau.
                          </div>
                        )}
                      </label>
                    )}

                    {task.type === "sentence_placement" && (
                      <label style={{ display: "block", marginTop: 10 }}>
                        Text with gap
                        <textarea
                          value={task.textWithGap ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLessonTasks((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, textWithGap: v } : x))
                            );
                          }}
                          rows={5}
                          style={{ ...fieldStyle, resize: "vertical" }}
                        />
                      </label>
                    )}

                    {(task.type === "mcq" ||
                      task.type === "word_choice" ||
                      task.type === "fill_in_word" ||
                      task.type === "sentence_placement" ||
                      task.type === "best_summary" ||
                      task.type === "true_false") && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Options</div>

                        {(task.options ?? []).map((opt, oIdx) => (
                          <input
                            key={oIdx}
                            value={opt}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const opts = [...(x.options ?? [])];
                                  opts[oIdx] = v;

                                  const currentCorrect = x.correctAnswer;
                                  const nextCorrect =
                                    typeof currentCorrect === "string" && opts.includes(currentCorrect)
                                      ? currentCorrect
                                      : opts[0] ?? "";

                                  return { ...x, options: opts, correctAnswer: nextCorrect };
                                })
                              );
                            }}
                            style={{ ...fieldStyle, marginTop: 8 }}
                          />
                        ))}

                        <label style={{ display: "block", marginTop: 10 }}>
                          Correct answer
                          {(task.options ?? []).length > 0 ? (
                            <select
                              value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLessonTasks((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                                );
                              }}
                              style={fieldStyle}
                            >
                              {(task.options ?? []).map((opt, optIdx) => (
                                <option key={`${task.id}_${optIdx}`} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLessonTasks((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                                );
                              }}
                              style={fieldStyle}
                            />
                          )}
                        </label>
                      </div>
                    )}

                    {(task.type === "short_answer" || task.type === "open") && (
                      <p style={{ marginTop: 10, opacity: 0.75, marginBottom: 0 }}>
                        {task.type === "short_answer"
                          ? "Short written response from the student."
                          : "Open task / notes field."}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {readingPack && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer" }}>Debug / raw reading test</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#f7f7f742",
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 10,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(readingPack, null, 2)}
              </pre>
            </details>
          )}
        </section>

        <style jsx>{`
          @media (max-width: 560px) {
            .actionRow {
              flex-direction: column !important;
              align-items: stretch !important;
              flex-wrap: nowrap !important;
              margin-top: 0 !important;
            }

            .actionBtn {
              width: 100% !important;
            }

            .pageWrap {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 0 60px !important;
              overflow-x: hidden !important;
              box-sizing: border-box !important;
            }

            .pageCard {
              width: 100% !important;
              padding: 12px 10px !important;
              border-radius: 0 !important;
              border-left: 0 !important;
              border-right: 0 !important;
              box-sizing: border-box !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}