// app/[locale]/(app)/producer/reading-tests/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import { countReadingTestWords } from "@/lib/readingTests/readingSignals";
import { useUserProfile } from "@/lib/useUserProfile";

type LevelKey = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type AudienceKey = "children" | "teenagers" | "adult learners" | "learners";
type FeedbackMode = "learner" | "adult" | "both";

type ReadingTestTaskType = "mcq" | "true_false" | "best_summary";

type LessonTask = {
  id: string;
  order?: number;
  type: ReadingTestTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean;
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
  producerName?: string;
  authorName?: string;
  createdByName?: string;
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  sourceText?: string;
  wordCount?: number;
  topic?: string;
  prompt?: string;
  coverImageUrl?: string;
  imageUrl?: string;
  publish?: {
    state?: string;
  };
  readingTestConfig?: Partial<ReadingTestConfig>;
  tasks?: unknown[];
};

type CoverTemplate = {
  id: string;
  titleKey: string;
  imageUrl: string;
  tone: string;
  border: string;
};

const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "blue",
    titleKey: "coverTemplates.blue",
    imageUrl: "/reading-test-covers/blue.jpg",
    tone: "#eff6ff",
    border: "#93c5fd",
  },
  {
    id: "pink",
    titleKey: "coverTemplates.pink",
    imageUrl: "/reading-test-covers/pink.jpg",
    tone: "#fdf2f8",
    border: "#f9a8d4",
  },
  {
    id: "red",
    titleKey: "coverTemplates.red",
    imageUrl: "/reading-test-covers/red.jpg",
    tone: "#fef2f2",
    border: "#fca5a5",
  },
  {
    id: "orange",
    titleKey: "coverTemplates.orange",
    imageUrl: "/reading-test-covers/orange.jpg",
    tone: "#fff7ed",
    border: "#fdba74",
  },
  {
    id: "purple",
    titleKey: "coverTemplates.purple",
    imageUrl: "/reading-test-covers/purple.jpg",
    tone: "#faf5ff",
    border: "#d8b4fe",
  },
  {
    id: "brown",
    titleKey: "coverTemplates.brown",
    imageUrl: "/reading-test-covers/brown.jpg",
    tone: "#fefce8",
    border: "#d6d3d1",
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function readUserDisplayName(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const x = v as Record<string, unknown>;
  return (
    safeString(x.producerName).trim() ||
    safeString(x.displayName).trim() ||
    safeString(x.fullName).trim() ||
    safeString(x.name).trim() ||
    safeString(x.companyName).trim() ||
    ""
  );
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
  if (v === "true_false") return "true_false";
  if (v === "best_summary") return "best_summary";
  return "mcq";
}

function normalizeTask(task: unknown, index: number): LessonTask {
  const t = isRecord(task) ? task : {};

  const type = normalizeTaskType(t.type);

  const options =
    type === "true_false"
      ? ["True", "False"]
      : Array.isArray(t.options)
        ? t.options.map((x) => String(x ?? "").trim()).filter(Boolean)
        : ["", "", ""];

  const correctAnswerRaw = t.correctAnswer;

  let correctAnswer: string | boolean;

  if (type === "true_false") {
    if (typeof correctAnswerRaw === "boolean") {
      correctAnswer = correctAnswerRaw;
    } else if (typeof correctAnswerRaw === "string") {
      correctAnswer = correctAnswerRaw.toLowerCase() === "true";
    } else {
      correctAnswer = true;
    }
  } else if (typeof correctAnswerRaw === "string" && correctAnswerRaw.trim()) {
    correctAnswer = correctAnswerRaw.trim();
  } else {
    correctAnswer = options[0] ?? "";
  }

  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `task_${index + 1}_${newId()}`,
    order: typeof t.order === "number" && Number.isFinite(t.order) ? t.order : index + 1,
    type,
    prompt: String(t.prompt ?? "").trim(),
    options,
    correctAnswer,
    enabled: typeof t.enabled === "boolean" ? t.enabled : true,
  };
}

function renumberOrders(tasks: LessonTask[]) {
  return tasks.map((task, idx) => ({ ...task, order: idx + 1 }));
}

function normalizeEnabledTaskTypes(v: unknown): ReadingTestTaskType[] {
  if (!Array.isArray(v)) return ["mcq", "true_false", "best_summary"];

  const valid = v.filter(
    (x): x is ReadingTestTaskType =>
      x === "mcq" || x === "true_false" || x === "best_summary"
  );

  return valid.length ? Array.from(new Set(valid)) : ["mcq", "true_false", "best_summary"];
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
  const { profile } = useUserProfile();
  const lessonId = typeof params?.id === "string" ? params.id : "";

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    marginTop: 6,
    border: "1.5px solid #94a3b8",
    borderRadius: 12,
    background: "#ffffffef",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.10)",
    outline: "none",
    fontSize: 14,
  };

  const fieldStyleCompact: CSSProperties = {
    ...fieldStyle,
    padding: 8,
  };

  const cardStyle: CSSProperties = {
    border: "1.5px solid #94a3b8",
    borderRadius: 20,
    background: "#e6eef0f1",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
    padding: 18,
  };

  const buttonDark: CSSProperties = {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 850,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(15,23,42,0.16)",
    whiteSpace: "nowrap",
  };

  const buttonSmall: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1.5px solid #cbd5e1",
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
  const [uid, setUid] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [title, setTitle] = useState(t("defaults.title"));
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("nb");
  const [languageSearch, setLanguageSearch] = useState("");
  const [level, setLevel] = useState<LevelKey>("A2");
  const [status, setStatus] = useState("draft");
  const [producerName, setProducerName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState(COVER_TEMPLATES[0].imageUrl);

  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState<AudienceKey>("learners");
  const [minWords, setMinWords] = useState(120);
  const [maxWords, setMaxWords] = useState(180);

  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(2);
  const [timerExtraSeconds, setTimerExtraSeconds] = useState(0);
  const [enabledTaskTypes, setEnabledTaskTypes] = useState<ReadingTestTaskType[]>([
    "mcq",
    "true_false",
    "best_summary",
  ]);

  const [tasks, setTasks] = useState<LessonTask[]>([]);

  const taskTypeLabels: Record<ReadingTestTaskType, string> = useMemo(
    () => ({
      mcq: t("taskTypes.mcq"),
      true_false: t("taskTypes.true_false"),
      best_summary: t("taskTypes.best_summary"),
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
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      setUid(user?.uid ?? null);
      setAuthResolved(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProducerName() {
      if (!uid || producerName.trim()) return;

      const profileName = readUserDisplayName(profile);
      const authName = safeString(getAuth().currentUser?.displayName).trim();

      if (profileName) {
        setProducerName(profileName);
        return;
      }

      if (authName) {
        setProducerName(authName);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!alive) return;
        const dbName = snap.exists() ? readUserDisplayName(snap.data()) : "";
        if (dbName) setProducerName(dbName);
      } catch (err) {
        console.error("Failed to fetch producer name:", err);
      }
    }

    void loadProducerName();

    return () => {
      alive = false;
    };
  }, [uid, profile, producerName]);

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
        setDescription(safeString(data.description, ""));
        setLanguage(safeString(data.language, "nb"));
        setLevel((safeString(data.level, "A2") as LevelKey) || "A2");
        setStatus(safeString(data.status, "draft"));
        setProducerName(
          safeString(data.producerName).trim() ||
          safeString(data.authorName).trim() ||
          safeString(data.createdByName).trim()
        );
        const loadedCoverImageUrl = safeString(data.coverImageUrl || data.imageUrl, "");
        setCoverImageUrl(
          COVER_TEMPLATES.some((template) => template.imageUrl === loadedCoverImageUrl)
            ? loadedCoverImageUrl
            : COVER_TEMPLATES[0].imageUrl
        );

        setSourceText(safeString(data.sourceText, ""));
        setTopic("");
        setAudience((cfg.audience as AudienceKey) || "learners");
        setMinWords(cfg.minWords);
        setMaxWords(cfg.maxWords);

        setTimerEnabled(cfg.timerEnabled);
        const seconds = cfg.timerEnabled ? (cfg.timerSeconds ?? 120) : 120;
        setTimerMinutes(Math.floor(seconds / 60));
        setTimerExtraSeconds(seconds % 60);

        setEnabledTaskTypes(cfg.enabledTaskTypes);

        const normalizedTasks = Array.isArray(data.tasks)
          ? data.tasks
            .map(normalizeTask)
            .filter(
              (task) =>
                task.type === "mcq" ||
                task.type === "true_false" ||
                task.type === "best_summary"
            )
          : [];

        setTasks(renumberOrders(normalizedTasks));
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
  const totalWordCount = useMemo(
    () => countReadingTestWords(sourceText, tasks),
    [sourceText, tasks]
  );

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
        showQuestionsAfterReading: false,
        enabledTaskTypes,
        feedbackMode: "both",
      };

      const payload = stripUndefinedDeep({
        title: title.trim(),
        description: description.trim(),
        level,
        language,
        sourceText,
        wordCount,
        topic,
        prompt: topic,
        coverImageUrl,
        imageUrl: coverImageUrl,
        "publish.state": "draft",
        status: "draft",
        producerName: producerName.trim(),
        readingTestConfig,
        tasks: renumberOrders(tasks),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "lessons", lessonId), payload);

      setSavedMsg(t("messages.saved"));
      router.push(`/${locale}/content`);
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
      type === "true_false"
        ? {
          id: newId(),
          type: "true_false",
          prompt: t("defaults.trueFalsePrompt"),
          options: ["True", "False"],
          correctAnswer: true,
          enabled: true,
        }
        : type === "best_summary"
          ? {
            id: newId(),
            type: "best_summary",
            prompt: t("taskTypes.best_summary"),
            options: [
              t("defaults.option1"),
              t("defaults.option2"),
              t("defaults.option3"),
            ],
            correctAnswer: t("defaults.option1"),
            enabled: true,
          }
          : {
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
        maxWidth: 1180,
        margin: "0 auto",
        padding: "8px 12px 180px",
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
            <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.8 }}>
              {t("page.statusLabel")} <strong>{status}</strong>
            </p>
          </div>
        </div>

        {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}
        {savedMsg && <div style={{ color: "green", marginTop: 12 }}>{savedMsg}</div>}

        <section
          style={{
            ...cardStyle,
            marginTop: 18,
            background: "#eaedf1f3",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {t("summary.title")}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))",
              gap: 8,
              marginTop: 12,
            }}
          >
            {[
              { label: "Antall ord lesetekst", value: String(wordCount) },
              { label: "Antall ord totalt", value: String(totalWordCount) },
              { label: t("summary.level"), value: level },
              { label: t("summary.tasks"), value: String(tasks.length) },
              { label: t("summary.time"), value: timerPreview },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1.5px solid #cbd5e1",
                  borderRadius: 14,
                  padding: "10px 9px",
                  background: "#fff",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.72, fontWeight: 800, lineHeight: 1.2 }}>
                  {item.label}
                </div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, lineHeight: 1.1 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </section>

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
            {t("fields.producerName")}
            <input
              value={producerName}
              disabled
              readOnly
              style={{
                ...fieldStyle,
                background: "#f4f4f5",
              }}
              placeholder={t("fields.producerNamePlaceholder")}
              title={t("fields.producerNameHelp", { uid: uid ?? "uid" })}
            />
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              {t("fields.producerNameHelp", { uid: uid ?? "uid" })}
            </div>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            {t("fields.description")}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={fieldStyle}
            />
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

        </section>

        <section style={{ marginTop: 18, ...cardStyle }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {t("cover.title")}
            </h2>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              {t("cover.description")}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))",
              gap: 8,
              marginTop: 12,
            }}
          >
            {COVER_TEMPLATES.map((template) => {
              const selected = coverImageUrl === template.imageUrl;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setCoverImageUrl(template.imageUrl)}
                  style={{
                    border: `2px solid ${selected ? "#15803d" : template.border}`,
                    borderRadius: 12,
                    padding: 6,
                    background: selected ? "#f0fdf4" : template.tone,
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: selected
                      ? "0 0 0 3px rgba(21, 128, 61, 0.18)"
                      : "0 2px 8px rgba(15, 23, 42, 0.08)",
                  }}
                  aria-pressed={selected}
                >
                  <div
                    role="img"
                    aria-label={t(template.titleKey)}
                    style={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      display: "block",
                      borderRadius: 10,
                      border: "1px solid rgba(15, 23, 42, 0.16)",
                      backgroundColor: "#fff",
                      backgroundImage: `url("${template.imageUrl}")`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800 }}>
                    {t(template.titleKey)}
                  </div>
                  {selected && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#166534", fontWeight: 800 }}>
                      {t("cover.selected")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
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
                border: "1.5px solid #93c5fd",
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
              gridTemplateColumns: "1fr",
              gap: 14,
              marginTop: 14,
            }}
          >
            <div
              style={{
                border: "1.5px solid #cbd5e1",
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
                  {[2, 3, 5, 10].map((m) => (
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
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            {(["mcq", "true_false", "best_summary"] as ReadingTestTaskType[]).map((type) => (
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
              <button type="button" onClick={() => addTask("mcq")} style={buttonSmall}>
                {t("actions.addMcq")}
              </button>
              <button type="button" onClick={() => addTask("true_false")} style={buttonSmall}>
                {t("actions.addTrueFalse")}
              </button>
              <button type="button" onClick={() => addTask("best_summary")} style={buttonSmall}>
                {t("actions.addBestSummary")}
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
                    border: "1.5px solid #cbd5e1",
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

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("tasks.options")}</div>

                    {(task.options ?? []).map((opt, oIdx) => (
                      <input
                        key={oIdx}
                        value={opt}
                        disabled={task.type === "true_false"}
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
                        style={{
                          ...fieldStyle,
                          marginTop: 8,
                          opacity: task.type === "true_false" ? 0.7 : 1,
                        }}
                      />
                    ))}

                    <label style={{ display: "block", marginTop: 10 }}>
                      {t("tasks.correctAnswer")}

                      {task.type === "true_false" ? (
                        <select
                          value={String(task.correctAnswer)}
                          onChange={(e) => {
                            const v = e.target.value === "true";
                            setTasks((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                            );
                          }}
                          style={fieldStyle}
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <select
                          value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTasks((prev) =>
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
                      )}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="stickySaveSection"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            width: "100%",
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: "rgba(0,0,0,0.10)",
            background: "rgba(255,255,255,0.96)",
            padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
            boxShadow: "0 -10px 30px rgba(15,23,42,0.10)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1180,
              margin: "0 auto",
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 280, flex: "1 1 560px" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {t("saveBar.title")}
              </h2>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                {t("saveBar.description")}
              </div>
            </div>

            <button
              className="actionBtn"
              onClick={save}
              disabled={saving}
              style={{
                ...buttonDark,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? t("actions.saving") : t("actions.save")}
            </button>
          </div>
        </section>

        <style jsx>{`
          @media (max-width: 560px) {
            .pageWrap {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 0 190px !important;
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

            .actionBtn {
              width: 100% !important;
            }

            .stickySaveSection {
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              width: 100% !important;
              max-width: none !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
