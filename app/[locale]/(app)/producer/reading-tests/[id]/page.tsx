// app\[locale]\(app)\producer\reading-tests\[id]\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
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

type ReadingTestConfig = {
  cefrLevel: string;
  audience: string;
  topic: string;
  minWords: number;
  maxWords: number;
  timerEnabled: boolean;
  timerSeconds: number | null;
  showQuestionsAfterReading: boolean;
  enabledTaskTypes: ReadingTestTaskType[];
  feedbackMode: FeedbackMode;
};

type LessonDoc = {
  ownerId: string;
  status?: string;
  lessonType?: string;
  title?: string;
  level?: string;
  language?: string;
  sourceText?: string;
  wordCount?: number;
  topic?: string;
  prompt?: string;
  readingTestConfig?: Partial<ReadingTestConfig>;
  tasks?: LessonTask[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function safeNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function countWords(text: string) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeTaskType(v: unknown): ReadingTestTaskType {
  switch (v) {
    case "word_choice":
    case "sentence_placement":
    case "best_summary":
    case "mcq":
    case "true_false":
    case "fill_in_word":
    case "short_answer":
    case "open":
      return v;
    default:
      return "mcq";
  }
}

function normalizeTask(task: unknown, index: number): LessonTask {
  const t = isRecord(task) ? task : {};

  const options = Array.isArray(t.options)
    ? t.options.map((x) => String(x ?? "").trim()).filter(Boolean)
    : undefined;

  const correctAnswerRaw = t.correctAnswer;
  let correctAnswer: string | boolean | string[] | undefined;

  if (typeof correctAnswerRaw === "string") correctAnswer = correctAnswerRaw.trim();
  else if (typeof correctAnswerRaw === "boolean") correctAnswer = correctAnswerRaw;
  else if (Array.isArray(correctAnswerRaw)) {
    correctAnswer = correctAnswerRaw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }

  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `task_${index + 1}_${newId()}`,
    order: typeof t.order === "number" && Number.isFinite(t.order) ? t.order : index + 1,
    type: normalizeTaskType(t.type),
    prompt: String(t.prompt ?? "").trim(),
    options,
    correctAnswer,
    sentence: typeof t.sentence === "string" && t.sentence.trim() ? t.sentence.trim() : undefined,
    textWithGap:
      typeof t.textWithGap === "string" && t.textWithGap.trim() ? t.textWithGap.trim() : undefined,
    enabled: typeof t.enabled === "boolean" ? t.enabled : true,
  };
}

function renumberOrders(tasks: LessonTask[]) {
  return tasks.map((task, idx) => ({ ...task, order: idx + 1 }));
}

function normalizeEnabledTaskTypes(v: unknown): ReadingTestTaskType[] {
  if (!Array.isArray(v)) return ["word_choice", "sentence_placement", "best_summary"];

  const valid = v.filter(
    (x): x is ReadingTestTaskType =>
      x === "word_choice" ||
      x === "sentence_placement" ||
      x === "best_summary" ||
      x === "mcq" ||
      x === "true_false" ||
      x === "fill_in_word" ||
      x === "short_answer" ||
      x === "open"
  );

  return valid.length
    ? Array.from(new Set(valid))
    : ["word_choice", "sentence_placement", "best_summary"];
}

function normalizeFeedbackMode(v: unknown): FeedbackMode {
  return v === "learner" || v === "adult" || v === "both" ? v : "both";
}

function normalizeReadingTestConfig(cfg: unknown, levelFallback: string): ReadingTestConfig {
  const c = isRecord(cfg) ? cfg : {};
  const timerEnabled = c.timerEnabled === true;
  const timerSecondsRaw = safeNullableNumber(c.timerSeconds);

  return {
    cefrLevel: safeString(c.cefrLevel, levelFallback || "A2"),
    audience: safeString(c.audience, "learners"),
    topic: safeString(c.topic, ""),
    minWords: safeNumber(c.minWords, 120),
    maxWords: safeNumber(c.maxWords, 180),
    timerEnabled,
    timerSeconds: timerEnabled ? (timerSecondsRaw ?? 300) : null,
    showQuestionsAfterReading: c.showQuestionsAfterReading === true,
    enabledTaskTypes: normalizeEnabledTaskTypes(c.enabledTaskTypes),
    feedbackMode: normalizeFeedbackMode(c.feedbackMode),
  };
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === null) return value;
  if (value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }

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

export default function ReadingTestEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("readingTestsEditor");
  const lessonId = typeof params?.id === "string" ? params.id : "";

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
    border: "1px solid #97aac0",
    borderRadius: 20,
    background: "#d8c7c7e4",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.10)",
    padding: 18,
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
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
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
  const [authResolved, setAuthResolved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [title, setTitle] = useState(t("defaults.title"));
  const [language, setLanguage] = useState("nb");
  const [languageSearch, setLanguageSearch] = useState("");
  const [level, setLevel] = useState<LevelKey>("A2");
  const [status, setStatus] = useState("draft");

  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState<AudienceKey>("learners");
  const [minWords, setMinWords] = useState(120);
  const [maxWords, setMaxWords] = useState(180);

  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerExtraSeconds, setTimerExtraSeconds] = useState(0);
  const [showQuestionsAfterReading, setShowQuestionsAfterReading] = useState(true);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("both");
  const [enabledTaskTypes, setEnabledTaskTypes] = useState<ReadingTestTaskType[]>([
    "word_choice",
    "sentence_placement",
    "best_summary",
  ]);

  const [tasks, setTasks] = useState<LessonTask[]>([]);

  const taskTypeLabels: Record<ReadingTestTaskType, string> = useMemo(
    () => ({
      word_choice: t("taskTypes.word_choice"),
      sentence_placement: t("taskTypes.sentence_placement"),
      best_summary: t("taskTypes.best_summary"),
      mcq: t("taskTypes.mcq"),
      true_false: t("taskTypes.true_false"),
      fill_in_word: t("taskTypes.fill_in_word"),
      short_answer: t("taskTypes.short_answer"),
      open: t("taskTypes.open"),
    }),
    [t]
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), () => {
      setAuthResolved(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!lessonId) {
          setError(t("errors.missingLessonId"));
          return;
        }

        const currentUid = getAuth().currentUser?.uid;
        if (!currentUid) {
          setError(t("errors.notSignedIn"));
          return;
        }

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!snap.exists()) {
          setError(t("errors.notFound"));
          return;
        }

        const data = snap.data() as LessonDoc;

        if (data.ownerId !== currentUid) {
          setError(t("errors.noAccess"));
          return;
        }

        if (data.lessonType !== "reading_test") {
          setError(t("errors.notReadingTest"));
          return;
        }

        const cfg = normalizeReadingTestConfig(data.readingTestConfig, safeString(data.level, "A2"));

        setTitle(safeString(data.title, t("defaults.title")));
        setLanguage(safeString(data.language, "nb"));
        setLevel((safeString(data.level, "A2") as LevelKey) || "A2");
        setStatus(safeString(data.status, "draft"));

        setSourceText(safeString(data.sourceText, ""));
        setTopic(safeString(data.topic, cfg.topic || safeString(data.prompt, "")));
        setAudience((cfg.audience as AudienceKey) || "learners");
        setMinWords(cfg.minWords);
        setMaxWords(cfg.maxWords);

        setTimerEnabled(cfg.timerEnabled);
        const seconds = cfg.timerEnabled ? (cfg.timerSeconds ?? 300) : 300;
        setTimerMinutes(Math.floor(seconds / 60));
        setTimerExtraSeconds(seconds % 60);

        setShowQuestionsAfterReading(cfg.showQuestionsAfterReading);
        setFeedbackMode(cfg.feedbackMode);
        setEnabledTaskTypes(cfg.enabledTaskTypes);

        setTasks(Array.isArray(data.tasks) ? renumberOrders(data.tasks.map(normalizeTask)) : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }

    if (!authResolved) return;
    void load();
  }, [lessonId, authResolved, t]);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter((l) => `${l.label} ${l.code}`.toLowerCase().includes(q));
  }, [languageSearch]);

  const wordCount = useMemo(() => countWords(sourceText), [sourceText]);

  const timerSeconds = useMemo(() => {
    const mins = Number.isFinite(timerMinutes) ? timerMinutes : 0;
    const secs = Number.isFinite(timerExtraSeconds) ? timerExtraSeconds : 0;
    return clamp(mins, 0, 120) * 60 + clamp(secs, 0, 59);
  }, [timerMinutes, timerExtraSeconds]);

  const timerPreview = useMemo(() => {
    if (!timerEnabled) return t("timer.noTimer");
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    if (secs === 0) return t("timer.minutesOnly", { minutes: mins });
    return t("timer.minutesAndSeconds", { minutes: mins, seconds: secs });
  }, [timerEnabled, timerSeconds, t]);

  async function save() {
    try {
      setSaving(true);
      setSavedMsg(null);
      setError(null);

      if (!lessonId) throw new Error(t("errors.missingLessonId"));
      if (!title.trim()) throw new Error(t("errors.titleRequired"));
      if (!sourceText.trim()) throw new Error(t("errors.sourceTextEmpty"));
      if (timerEnabled && timerSeconds < 10) throw new Error(t("errors.timerTooShort"));

      const readingTestConfig: ReadingTestConfig = {
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

      const payload = stripUndefinedDeep({
        title: title.trim(),
        level,
        language,
        sourceText,
        wordCount,
        topic,
        prompt: topic,
        readingTestConfig,
        tasks: renumberOrders(tasks),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "lessons", lessonId), payload);

      setSavedMsg(t("messages.saved"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function deleteTask(index: number) {
    setTasks((prev) => renumberOrders(prev.filter((_, i) => i !== index)));
  }

  function moveTask(index: number, dir: -1 | 1) {
    setTasks((prev) => {
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
    const nextTask: LessonTask =
      type === "mcq"
        ? {
            id: newId(),
            type: "mcq",
            prompt: t("defaults.newMcqPrompt"),
            options: [
              t("defaults.option1"),
              t("defaults.option2"),
              t("defaults.option3"),
            ],
            correctAnswer: t("defaults.option1"),
            enabled: true,
          }
        : type === "true_false"
        ? {
            id: newId(),
            type: "true_false",
            prompt: t("defaults.trueFalsePrompt"),
            options: [t("common.true"), t("common.false")],
            correctAnswer: t("common.true"),
            enabled: true,
          }
        : type === "fill_in_word"
        ? {
            id: newId(),
            type: "fill_in_word",
            prompt: t("defaults.fillInWordPrompt"),
            sentence: t("defaults.fillInWordSentence"),
            options: [
              t("defaults.fillInWordOption1"),
              t("defaults.fillInWordOption2"),
              t("defaults.fillInWordOption3"),
            ],
            correctAnswer: t("defaults.fillInWordOption1"),
            enabled: true,
          }
        : type === "short_answer"
        ? {
            id: newId(),
            type: "short_answer",
            prompt: t("defaults.shortAnswerPrompt"),
            enabled: true,
          }
        : {
            id: newId(),
            type: "open",
            prompt: t("defaults.openPrompt"),
            enabled: true,
          };

    setTasks((prev) => renumberOrders([...prev, nextTask]));
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px 12px 60px" }}>
        {t("loading")}
      </main>
    );
  }

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
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{t("page.title")}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              {t("page.statusLabel")} <strong>{status}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{ ...buttonPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? t("actions.saving") : t("actions.save")}
            </button>
            <button
              onClick={() => router.push(`/${locale}/producer/reading-tests/new`)}
              style={buttonSecondary}
            >
              {t("actions.newReadingTest")}
            </button>
          </div>
        </div>

        {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}
        {savedMsg && <div style={{ color: "green", marginTop: 12 }}>{savedMsg}</div>}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 12,
            marginTop: 18,
          }}
        >
          <label>
            {t("fields.title")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />
          </label>

          <label>
            {t("fields.cefrLevel")}
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
            {t("fields.language")}
            <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
              <input
                value={languageSearch}
                onChange={(e) => setLanguageSearch(e.target.value)}
                placeholder={t("fields.searchLanguage")}
                style={fieldStyleCompact}
              />
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={fieldStyle}>
                {filteredLanguages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label>
            {t("fields.audience")}
            <select value={audience} onChange={(e) => setAudience(e.target.value as AudienceKey)} style={fieldStyle}>
              <option value="children">{t("audience.children")}</option>
              <option value="teenagers">{t("audience.teenagers")}</option>
              <option value="adult learners">{t("audience.adultLearners")}</option>
              <option value="learners">{t("audience.learners")}</option>
            </select>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            {t("fields.topic")}
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical", minHeight: 80 }}
            />
          </label>

          <label>
            {t("fields.minimumWords")}
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
            {t("fields.maximumWords")}
            <input
              type="number"
              value={maxWords}
              onChange={(e) => setMaxWords(Number(e.target.value))}
              style={fieldStyle}
              min={40}
              max={500}
            />
          </label>
        </section>

        <section style={{ marginTop: 18, ...cardStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{t("flow.title")}</strong>
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
            {t("flow.description")}
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
                {t("timer.enable")}
              </label>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  {t("timer.quickPresets")}
                </div>
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
                      {t("timer.minutesOnly", { minutes: m })}
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
                  {t("timer.minutes")}
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
                  {t("timer.extraSeconds")}
                  <input
                    type="number"
                    value={timerExtraSeconds}
                    onChange={(e) => setTimerExtraSeconds(clamp(Number(e.target.value || 0), 0, 59))}
                    style={fieldStyle}
                    min={0}
                    max={59}
                    disabled={!timerEnabled}
                  />
                </label>
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
                  <strong>{t("flow.showQuestionsAfterReading")}</strong>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    {t("flow.showQuestionsAfterReadingHelp")}
                  </div>
                </span>
              </label>

              <label style={{ display: "block", marginTop: 14 }}>
                {t("fields.feedbackMode")}
                <select
                  value={feedbackMode}
                  onChange={(e) => setFeedbackMode(e.target.value as FeedbackMode)}
                  style={fieldStyle}
                >
                  <option value="learner">{t("feedbackMode.learner")}</option>
                  <option value="adult">{t("feedbackMode.adult")}</option>
                  <option value="both">{t("feedbackMode.both")}</option>
                </select>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  {t("fields.feedbackModeHelp")}
                </div>
              </label>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 18, ...cardStyle }}>
          <strong>{t("taskTypes.enabledTitle")}</strong>

          <div style={{ fontSize: 12, opacity: 0.78, marginTop: 8, lineHeight: 1.45 }}>
            {t("taskTypes.enabledDescription")}
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
                {taskTypeLabels[type]}
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("text.title")}</h2>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
            {t("text.wordCount", { count: wordCount })}
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={12}
            style={{ ...fieldStyle, resize: "vertical", marginTop: 10 }}
          />
        </section>

        <section style={{ marginTop: 18, ...cardStyle }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("tasks.title")}</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => addTask("fill_in_word")} style={buttonSmall}>
                {t("actions.addFillInWord")}
              </button>
              <button type="button" onClick={() => addTask("mcq")} style={buttonSmall}>
                {t("actions.addMcq")}
              </button>
              <button type="button" onClick={() => addTask("true_false")} style={buttonSmall}>
                {t("actions.addTrueFalse")}
              </button>
              <button type="button" onClick={() => addTask("short_answer")} style={buttonSmall}>
                {t("actions.addShortAnswer")}
              </button>
              <button type="button" onClick={() => addTask("open")} style={buttonSmall}>
                {t("actions.addOpen")}
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <p style={{ opacity: 0.75, marginTop: 10 }}>{t("messages.noTasks")}</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {tasks.map((task, idx) => (
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
                        {idx + 1}. {taskTypeLabels[task.type]}
                      </strong>
                      <span style={{ opacity: 0.7, fontSize: 13 }}>{t("tasks.id", { id: task.id })}</span>
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
                        disabled={idx === tasks.length - 1}
                        style={{
                          ...buttonSmall,
                          opacity: idx === tasks.length - 1 ? 0.5 : 1,
                          cursor: idx === tasks.length - 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => deleteTask(idx)} style={buttonSmall}>
                        {t("actions.delete")}
                      </button>
                    </div>
                  </div>

                  <label style={{ display: "block", marginTop: 10 }}>
                    {t("tasks.prompt")}
                    <input
                      value={task.prompt}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                      }}
                      style={fieldStyle}
                    />
                  </label>

                  {(task.type === "word_choice" || task.type === "fill_in_word") && (
                    <label style={{ display: "block", marginTop: 10 }}>
                      {task.type === "fill_in_word" ? t("tasks.sentenceWithBlank") : t("tasks.sentence")}
                      <textarea
                        value={task.sentence ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, sentence: v } : x)));
                        }}
                        rows={3}
                        style={{ ...fieldStyle, resize: "vertical" }}
                      />
                    </label>
                  )}

                  {task.type === "sentence_placement" && (
                    <label style={{ display: "block", marginTop: 10 }}>
                      {t("tasks.textWithGap")}
                      <textarea
                        value={task.textWithGap ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, textWithGap: v } : x)));
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
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("tasks.options")}</div>

                      {(task.options ?? []).map((opt, oIdx) => (
                        <input
                          key={oIdx}
                          value={opt}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTasks((prev) =>
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
                        {t("tasks.correctAnswer")}
                        {(task.options ?? []).length > 0 ? (
                          <select
                            value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
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
                              setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
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
                        ? t("tasks.shortAnswerHelp")
                        : t("tasks.openHelp")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <style jsx>{`
          @media (max-width: 560px) {
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