// app/[locale]/(app)/producer/reading-tests/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGES } from "@/lib/languages";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";

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

function makeFillInWordTaskFromWordChoice(
  wordChoice: ReadingWordChoiceTask,
  prompt: string
): LessonTask {
  const blankSentence = replaceWholeWordOnce(
    wordChoice.sentence,
    wordChoice.correctAnswer,
    "_____"
  );

  return {
    id: newId(),
    type: "fill_in_word",
    prompt,
    sentence: blankSentence,
    options: [...wordChoice.options],
    correctAnswer: wordChoice.correctAnswer,
    enabled: true,
  };
}

function readingTestToLessonTasks(
  test: ReadingTestPack,
  enabledTaskTypes: ReadingTestTaskType[],
  fillInWordPrompt: string
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
    tasks.push(makeFillInWordTaskFromWordChoice(test.tasks.wordChoice, fillInWordPrompt));
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

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function resolveRoleFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "anonymous";

  const p = profile as Record<string, unknown>;

  if (p.role === "teacher" || p.role === "student" || p.role === "parent") {
    return p.role;
  }

  if (p.mode === "teacher" || p.mode === "student" || p.mode === "parent") {
    return p.mode;
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (orgRole === "teacher" || orgRole === "student" || orgRole === "parent") {
      return orgRole;
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.teacher === true) return "teacher";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return "anonymous";
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

export default function NewReadingTestPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("producer.readingTestsNew");
  const { profile } = useUserProfile();

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
  const [topic, setTopic] = useState(t("defaults.topic"));
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

  const [title, setTitle] = useState(t("defaults.title"));
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
  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const busy = loadingReadingTest || saving;

  const profileUid =
    profile && typeof profile === "object" && "uid" in profile
      ? (profile as { uid?: string }).uid
      : undefined;

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

    const role = useMemo(() => resolveRoleFromProfile(profile), [profile]);
  const plan = useMemo(() => safePlan(planValue), [planValue]);
  const billing = useMemo(() => getBillingSnapshot(profile), [profile]);

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
    if (!timerEnabled) return t("timer.noTimer");
    if (secs === 0) return t("timer.minutesOnly", { minutes: mins });
    return t("timer.minutesAndSeconds", { minutes: mins, seconds: secs });
  }, [timerEnabled, timerSeconds, t]);

  async function refreshFeatureStatus(currentUid?: string) {
    const uid = currentUid ?? getAuth().currentUser?.uid ?? profileUid;
    if (!uid) {
      setFeatureStatus(null);
      setStatusLoading(false);
      return;
    }

    try {
      const status = await getFeatureStatusFromProfile({
        uid,
        role,
        plan,
        billing,
        feature: "producer_create_reading_test",
      });
      setFeatureStatus(status);
    } catch {
      setFeatureStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }

  async function fetchQuotaForCreateLesson() {
    try {
      setQuotaLoading(true);
      const user = getAuth().currentUser;
      if (!user) {
        setQuotaInfo(null);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch(`/api/quota?feature=producer_create_reading_test`, {
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
    let active = true;

    async function loadStatus() {
      const uid = getAuth().currentUser?.uid ?? profileUid;

      if (!uid) {
        if (active) {
          setFeatureStatus(null);
          setStatusLoading(false);
        }
        return;
      }

      setStatusLoading(true);

      try {
        const status = await getFeatureStatusFromProfile({
          uid,
          role,
          plan,
          billing,
          feature: "producer_create_reading_test",
        });

        if (active) {
          setFeatureStatus(status);
        }
      } catch {
        if (active) {
          setFeatureStatus(null);
        }
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    }

    void loadStatus();
    fetchQuotaForCreateLesson();
    const tt = setTimeout(() => fetchQuotaForCreateLesson(), 600);

    return () => {
      active = false;
      clearTimeout(tt);
    };
    }, [profileUid, role, plan, billing]);

  async function generateReadingTest() {
    setLoadingReadingTest(true);
    setError(null);
    setSavedId(null);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error(t("errors.notSignedIn"));

      const token = await user.getIdToken();

      const res = await fetch("/api/reading-tests/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
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
      if (!raw) throw new Error(t("errors.emptyResponse", { status: res.status }));

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(t("errors.notJson", { status: res.status, preview: raw.slice(0, 200) }));
      }

      const data = isRecord(parsed) ? parsed : {};

      if (!res.ok) {
        const msg =
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const readingTestUnknown = data.readingTest;
      if (!isRecord(readingTestUnknown) || typeof readingTestUnknown.text !== "string") {
        throw new Error(t("errors.missingReadingText"));
      }

      const readingTest = readingTestUnknown as ReadingTestPack;

      const nextTitle =
        (typeof readingTest.title === "string" ? readingTest.title : t("defaults.title")).trim() ||
        t("defaults.title");

      const quotaUnknown = data.quota;
      if (quotaUnknown && typeof quotaUnknown === "object") {
        const q = quotaUnknown as QuotaInfo;
        if (typeof q.used === "number") {
          setQuotaInfo(q);
        }
      }

      setTitle(nextTitle);
      setSourceText(readingTest.text.trim());
      setLessonTasks(
        readingTestToLessonTasks(
          readingTest,
          enabledTaskTypes,
          t("defaults.fillInWordPrompt")
        )
      );
      setReadingPack(readingTest);
      setTasksDirty(false);

      await refreshFeatureStatus(user.uid);
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
      if (!title.trim()) throw new Error(t("errors.titleRequired"));
      if (!sourceText.trim()) throw new Error(t("errors.sourceTextEmpty"));
      if (timerEnabled && timerSeconds < 10) {
        throw new Error(t("errors.timerTooShort"));
      }

      const user = getAuth().currentUser;
      if (!user) throw new Error(t("errors.notSignedIn"));

      if (featureStatus && !featureStatus.allowed) {
        throw new Error(
          featureStatus.reason === "limit_reached"
            ? t("errors.quotaExceeded", {
                used: featureStatus.used,
                limit: featureStatus.limit,
              })
            : t("errors.notSignedIn")
        );
      }

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
          const used = typeof q.used === "number" ? q.used : featureStatus?.used ?? 15;
          const limit = typeof q.limit === "number" ? q.limit : featureStatus?.limit ?? 15;
          throw new Error(t("errors.quotaExceeded", { used, limit }));
        }

        const msg = typeof anyData["error"] === "string" ? anyData["error"] : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const id = typeof anyData["id"] === "string" ? anyData["id"].trim() : "";
      if (!id) throw new Error(t("errors.missingId"));

      setSavedId(id);

      const quota2 = anyData["quota"];
      if (quota2 && typeof quota2 === "object") {
        setQuotaInfo(quota2 as QuotaInfo);
      } else {
        fetchQuotaForCreateLesson();
      }

      await refreshFeatureStatus(user.uid);

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

    setLessonTasks((prev) => renumberOrders([...prev, baseTask]));
  }

  const quotaBlocked = featureStatus
    ? !featureStatus.allowed
    : quotaInfo
      ? quotaInfo.remaining <= 0
      : false;

  const visibleFeedbackText = useMemo(() => {
    if (!readingPack) return null;

    if (feedbackMode === "learner") {
      return `${t("feedback.forLearner")}\n${readingPack.feedback.learner}\n\n${t("feedback.nextStep")}\n${readingPack.feedback.nextStep}`;
    }

    if (feedbackMode === "adult") {
      return `${t("feedback.forAdult")}\n${readingPack.feedback.adult}\n\n${t("feedback.nextStep")}\n${readingPack.feedback.nextStep}`;
    }

    return (
      `${t("feedback.forLearner")}\n${readingPack.feedback.learner}\n\n` +
      `${t("feedback.forAdult")}\n${readingPack.feedback.adult}\n\n` +
      `${t("feedback.nextStep")}\n${readingPack.feedback.nextStep}`
    );
  }, [readingPack, feedbackMode, t]);

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
          {t("page.title")}
        </h1>
        <p style={{ marginTop: 0, marginBottom: 10, opacity: 0.8 }}>
          {t("page.subtitle")}
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
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {t("fields.languagesCount", { count: filteredLanguages.length })}
              </div>
            </div>
          </label>

          <label>
            {t("fields.audience")}
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceKey)}
              style={fieldStyle}
            >
              <option value="children">{t("audience.children")}</option>
              <option value="teenagers">{t("audience.teenagers")}</option>
              <option value="adult learners">{t("audience.adultLearners")}</option>
              <option value="learners">{t("audience.learners")}</option>
            </select>
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

          <label style={{ gridColumn: "1 / -1" }}>
            {t("fields.topic")}
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
              {t("fields.topicHelp")}
            </div>
          </label>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
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
                  {t("timer.help")}
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
          </div>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
            <strong>{t("taskTypes.title")}</strong>

            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 8, lineHeight: 1.45 }}>
              {t("taskTypes.description")} <strong>{t("taskTypes.fill_in_word")}</strong>{" "}
              {t("taskTypes.descriptionAfter")}
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
              {loadingReadingTest ? t("actions.generating") : t("actions.generate")}
            </button>

            <button
              className="actionBtn"
              onClick={saveToFirestore}
              disabled={busy || quotaBlocked || statusLoading}
              style={{
                ...buttonSecondary,
                opacity: busy || quotaBlocked || statusLoading ? 0.55 : 1,
                cursor: busy || quotaBlocked || statusLoading ? "not-allowed" : "pointer",
              }}
              title={
                featureStatus
                  ? t("quota.usedOfLimit", {
                      used: featureStatus.used,
                      limit: featureStatus.limit,
                    })
                  : quotaBlocked && quotaInfo
                    ? t("quota.usedOfLimit", { used: quotaInfo.used, limit: quotaInfo.limit })
                    : t("actions.saveDraft")
              }
            >
              {saving ? t("actions.saving") : t("actions.saveDraft")}
            </button>

            {tasksDirty && sourceText.trim() && (
              <span style={{ color: "#b45309", fontWeight: 700 }}>
                {t("messages.tasksDirty")}
              </span>
            )}

            {(quotaLoading || statusLoading) && (
              <span style={{ opacity: 0.75 }}>{t("quota.loading")}</span>
            )}

            {featureStatus ? (
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background:
                    featureStatus.remaining <= 0
                      ? "#fff1f2"
                      : featureStatus.remaining <= 2
                        ? "#fffbeb"
                        : "#f0fdf4",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {t("quota.usedOfLimit", {
                  used: featureStatus.used,
                  limit: featureStatus.limit,
                })}
                {featureStatus.remaining <= 2 ? ` ${t("quota.runningLow")}` : ""}
              </span>
            ) : quotaInfo ? (
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
                title={t("quota.periodTitle", { period: quotaInfo.period })}
              >
                {t("quota.usedOfLimit", { used: quotaInfo.used, limit: quotaInfo.limit })}
                {quotaInfo.remaining <= 2 ? ` ${t("quota.runningLow")}` : ""}
              </span>
            ) : null}

            {savedId && <span style={{ color: "green" }}>{t("messages.saved", { id: savedId })}</span>}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <h2 style={sectionTitleStyle}>{t("builder.title")}</h2>

          <label style={{ display: "block", marginTop: 10 }}>
            {t("builder.lessonTitle")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />
          </label>

          <label style={{ display: "block", marginTop: 12 }}>
            {t("builder.readingText")}
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
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("feedback.previewTitle")}</div>
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{t("builder.tasks")}</h3>

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

            {lessonTasks.length === 0 ? (
              <p style={{ opacity: 0.75, marginTop: 10 }}>{t("messages.noTasks")}</p>
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
                          {idx + 1}. {taskTypeLabels[task.type]}
                        </strong>
                        <span style={{ opacity: 0.7, fontSize: 13 }}>{t("builder.id", { id: task.id })}</span>
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
                          {t("actions.delete")}
                        </button>
                      </div>
                    </div>

                    <label style={{ display: "block", marginTop: 10 }}>
                      {t("builder.prompt")}
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
                        {task.type === "fill_in_word"
                          ? t("builder.sentenceWithBlank")
                          : t("builder.sentence")}
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
                            {t("builder.fillInWordExample")}
                          </div>
                        )}
                      </label>
                    )}

                    {task.type === "sentence_placement" && (
                      <label style={{ display: "block", marginTop: 10 }}>
                        {t("builder.textWithGap")}
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
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("builder.options")}</div>

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
                          {t("builder.correctAnswer")}
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
                          ? t("builder.shortAnswerHelp")
                          : t("builder.openHelp")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {readingPack && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer" }}>{t("debug.title")}</summary>
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