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

type QuotaInfo = {
  feature: string;
  limit: number;
  used: number;
  remaining: number;
  period: string;
};

type ReadingMcqTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingTrueFalseTask = {
  prompt: string;
  correctAnswer: boolean;
};

type ReadingBestSummaryTask = {
  prompt: string;
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
    mcq: ReadingMcqTask[];
    trueFalse: ReadingTrueFalseTask[];
    bestSummary: ReadingBestSummaryTask;
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

function readingTestToLessonTasks(test: ReadingTestPack): LessonTask[] {
  const tasks: LessonTask[] = [];

  for (const item of test.tasks.mcq) {
    tasks.push({
      id: newId(),
      type: "mcq",
      prompt: item.prompt,
      options: [...item.options],
      correctAnswer: item.correctAnswer,
      enabled: true,
    });
  }

  for (const item of test.tasks.trueFalse) {
    tasks.push({
      id: newId(),
      type: "true_false",
      prompt: item.prompt,
      options: ["True", "False"],
      correctAnswer: item.correctAnswer,
      enabled: true,
    });
  }

  tasks.push({
    id: newId(),
    type: "best_summary",
    prompt: test.tasks.bestSummary.prompt,
    options: [...test.tasks.bestSummary.options],
    correctAnswer: test.tasks.bestSummary.correctAnswer,
    enabled: true,
  });

  return renumberOrders(tasks);
}

const LEVEL_DEFAULTS: Record<LevelKey, { minWords: number; maxWords: number }> = {
  A1: { minWords: 60, maxWords: 80 },
  A2: { minWords: 100, maxWords: 150 },
  B1: { minWords: 150, maxWords: 220 },
  B2: { minWords: 220, maxWords: 320 },
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
  const t = useTranslations("readingTestsNew");
  const { profile } = useUserProfile();

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

  const mutedCardStyle: CSSProperties = {
    ...cardStyle,
    opacity: 0.68,
    background: "#e3e4d8f3",
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

  const buttonSuccess: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #14532d",
    background: "#15803d",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
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

  const stepBadgeStyle = (active: boolean, done: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    border: "1px solid #cbd5e1",
    background: done ? "#deede3" : active ? "#dbeafe" : "#f8fafc",
    color: "#0f172a",
  });

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
  const [audience] = useState<AudienceKey>("learners");
  const [minWords, setMinWords] = useState<number>(LEVEL_DEFAULTS.A2.minWords);
  const [maxWords, setMaxWords] = useState<number>(LEVEL_DEFAULTS.A2.maxWords);

  const [feedbackMode] = useState<FeedbackMode>("both");

  const [enabledTaskTypes, setEnabledTaskTypes] = useState<ReadingTestTaskType[]>([
    "mcq",
    "true_false",
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
  const partnerAccess = profile?.partnerAccess === true;
  const partnerStatus = profile?.partnerStatus ?? null;
  const schoolId = profile?.schoolId ?? null;
  const schoolRole = profile?.schoolRole ?? null;
  const schoolStatus = profile?.schoolStatus ?? null;

  const taskTypeLabels: Record<ReadingTestTaskType, string> = useMemo(
    () => ({
      mcq: t("taskTypes.mcq"),
      true_false: t("taskTypes.true_false"),
      best_summary: t("taskTypes.best_summary"),
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
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
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
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as QuotaInfo) : null;

      if (res.ok && data && typeof data.used === "number") {
        setQuotaInfo(data);
      }
    } catch {
      //
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
          partnerAccess,
          partnerStatus,
          schoolId,
          schoolRole,
          schoolStatus,
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

    return () => {
      active = false;
    };
  }, [
    profileUid,
    role,
    plan,
    billing,
    partnerAccess,
    partnerStatus,
    schoolId,
    schoolRole,
    schoolStatus,
  ]);

  async function generateReadingTest() {
    setLoadingReadingTest(true);
    setError(null);

    try {
      const user = getAuth().currentUser;

      if (!user) {
        throw new Error(t("errors.notSignedIn"));
      }

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

      if (!raw) {
        throw new Error("Empty response");
      }

      const parsed = JSON.parse(raw);

      if (!res.ok) {
        throw new Error(parsed.error || `HTTP ${res.status}`);
      }

      const readingTest = parsed.readingTest as ReadingTestPack;

      setTitle(readingTest.title);
      setSourceText(readingTest.text);
      setLessonTasks(readingTestToLessonTasks(readingTest));
      setReadingPack(readingTest);

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

    try {
      const user = getAuth().currentUser;

      if (!user) {
        throw new Error(t("errors.notSignedIn"));
      }

      const token = await user.getIdToken();

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
          readingTestConfig: {
            cefrLevel: level,
            audience,
            topic,
            minWords,
            maxWords,
            timerEnabled: true,
            timerSeconds: 120,
            showQuestionsAfterReading: false,
            enabledTaskTypes,
            feedbackMode,
          },
        }),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const id = typeof data.id === "string" ? data.id : "";

      if (!id) {
        throw new Error("Missing id");
      }

      setSavedId(id);

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

      if (to < 0 || to >= prev.length) {
        return prev;
      }

      const copy = [...prev];
      const tmp = copy[index];

      copy[index] = copy[to];
      copy[to] = tmp;

      return renumberOrders(copy);
    });
  }

  function addTask(type: ReadingTestTaskType) {
    const baseTask: LessonTask =
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

    setLessonTasks((prev) => renumberOrders([...prev, baseTask]));
  }

  const sourceWordCount = useMemo(() => {
    return sourceText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }, [sourceText]);

  const quotaBlocked = featureStatus ? !featureStatus.allowed : false;
  const quotaBadgeText = featureStatus
    ? t("quota.usedOfLimit", { used: featureStatus.used, limit: featureStatus.limit })
    : quotaInfo
      ? t("quota.usedOfLimit", { used: quotaInfo.used, limit: quotaInfo.limit })
      : null;

  const hasText = sourceText.trim().length > 0;
  const hasTasks = lessonTasks.length > 0;
  const step1Done = hasText;
  const step2Active = hasText;
  const step2Done = hasTasks;
  const step3Active = hasText && hasTasks;

  const stepStatus = !hasText
    ? {
      title: t("stepStatus.step1Title"),
      body: t("stepStatus.step1Body"),
      tone: "#eff6ff",
      border: "#bfdbfe",
    }
    : !hasTasks
      ? {
        title: t("stepStatus.textReadyTitle"),
        body: t("stepStatus.textReadyBody"),
        tone: "#fffbeb",
        border: "#fde68a",
      }
      : {
        title: t("stepStatus.tasksReadyTitle"),
        body: t("stepStatus.tasksReadyBody"),
        tone: "#ecfdf5",
        border: "#86efac",
      };

  return (
    <main
      className="pageWrap"
      style={{
        width: "100%",
        maxWidth: 1180,
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
            ...cardStyle,
            marginBottom: 16,
            background: "#eaedf1f3",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <div
              style={{
                border: "1.5px solid #cbd5e1",
                borderRadius: 16,
                padding: 12,
                background: "#eaeddbf2",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
                <strong>{t("steps.text")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step1Done ? t("steps.ready") : t("steps.generateReadingTest")}
              </div>
            </div>

            <div
              style={{
                border: "1.5px solid #cbd5e1",
                borderRadius: 16,
                padding: 12,
                background: "#eee4e4f4",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
                <strong>{t("steps.tasks")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step2Done
                  ? t("steps.ready")
                  : step2Active
                    ? t("steps.nextStep")
                    : t("steps.lockedUntilTextReady")}
              </div>
            </div>

            <div
              style={{
                border: "1.5px solid #cbd5e1",
                borderRadius: 16,
                padding: 12,
                background: "#e5e6eff5",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step3Active, false)}>3</span>
                <strong>{t("steps.finishing")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step3Active ? t("steps.readyForFinalSetup") : t("steps.lockedUntilTasksReady")}
              </div>
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${stepStatus.border}`,
              background: stepStatus.tone,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{stepStatus.title}</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{stepStatus.body}</div>
          </div>
        </section>

        <section style={{ marginTop: 14 }}>
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.generateReadingTestTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.generateReadingTestBody")}
                </div>
              </div>
            </div>

            <div
              style={{
                border: "1.5px solid #cbd5e1",
                borderRadius: 16,
                padding: 14,
                background: "#e2e8eef8",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
                {t("fields.sharedSettingsTitle")}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <label>
                  {t("fields.cefrLevel")}

                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as LevelKey)}
                    style={fieldStyle}
                  >
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

                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      style={fieldStyle}
                    >
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
                  {t("fields.minimumWords")}

                  <input
                    type="number"
                    value={minWords}
                    onChange={(e) => setMinWords(Number(e.target.value))}
                    style={fieldStyle}
                  />
                </label>

                <label>
                  {t("fields.maximumWords")}

                  <input
                    type="number"
                    value={maxWords}
                    onChange={(e) => setMaxWords(Number(e.target.value))}
                    style={fieldStyle}
                  />
                </label>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1.5px solid #93c5fd",
                  borderRadius: 16,
                  padding: 14,
                  background: "#f8fbff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("sections.generateAiTextTitle")}
                </h3>

                <label style={{ display: "block" }}>
                  {t("fields.promptInstructions")}

                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={5}
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 110,
                      lineHeight: 1.35,
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    {t("fields.topicHelp")}
                  </div>
                </label>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    {t("taskTypes.title")}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
                      gap: 10,
                    }}
                  >
                    {(["mcq", "true_false", "best_summary"] as ReadingTestTaskType[]).map(
                      (type) => (
                        <label
                          key={type}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            border: "1.5px solid #cbd5e1",
                            borderRadius: 12,
                            padding: 10,
                            background: "#fff",
                          }}
                        >
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
                      )
                    )}
                  </div>
                </div>

                <button
                  className="actionBtn"
                  onClick={generateReadingTest}
                  disabled={busy}
                  style={{
                    ...buttonPrimary,
                    width: isNarrow ? "100%" : "auto",
                    marginTop: 14,
                    opacity: busy ? 0.7 : 1,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {loadingReadingTest
                    ? t("actions.generating")
                    : t("actions.generate")}
                </button>
              </div>

              <div
                style={{
                  border: "1.5px solid #cbd5e1",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("builder.readingText")}
                </h3>

                <label style={{ display: "block" }}>
                  {t("builder.lessonTitle")}

                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={fieldStyle}
                  />
                </label>

                <label style={{ display: "block", marginTop: 10 }}>
                  {t("builder.pasteText")}

                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    rows={14}
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                    }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      fontSize: 12,
                      opacity: 0.75,
                    }}
                  >
                    <span>{t("builder.textHelp")}</span>
                    <span>{t("builder.wordCount", { count: sourceWordCount })}</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <div style={{ ...(hasText ? cardStyle : mutedCardStyle) }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.reviewTasksTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.reviewTasksBody")}
                </div>
              </div>
            </div>

            {!hasText && (
              <div
                style={{
                  border: "1px dashed #cbd5e1",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff",
                  fontSize: 14,
                  opacity: 0.8,
                }}
              >
                {t("sections.enableTaskEditorFirst")}
              </div>
            )}

            {hasText && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                    {t("builder.tasks")}
                  </h3>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => addTask("mcq")}
                      style={buttonSmall}
                    >
                      {t("actions.addMcq")}
                    </button>

                    <button
                      type="button"
                      onClick={() => addTask("true_false")}
                      style={buttonSmall}
                    >
                      {t("actions.addTrueFalse")}
                    </button>

                    <button
                      type="button"
                      onClick={() => addTask("best_summary")}
                      style={buttonSmall}
                    >
                      {t("actions.addBestSummary")}
                    </button>
                  </div>
                </div>

                {lessonTasks.length === 0 ? (
                  <p style={{ opacity: 0.75, marginTop: 10 }}>
                    {t("messages.noTasks")}
                  </p>
                ) : lessonTasks.map((task, idx) => (
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
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <strong style={{ minWidth: 150 }}>
                          {idx + 1}. {taskTypeLabels[task.type]}
                        </strong>
                        <span style={{ opacity: 0.7, fontSize: 13 }}>
                          {t("builder.id", { id: task.id })}
                        </span>
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

                        <button
                          type="button"
                          onClick={() => deleteTask(idx)}
                          style={buttonSmall}
                        >
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
                            prev.map((x, i) =>
                              i === idx ? { ...x, prompt: v } : x
                            )
                          );
                        }}
                        style={fieldStyle}
                      />
                    </label>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        {t("builder.options")}
                      </div>

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

                                return {
                                  ...x,
                                  options: opts,
                                };
                              })
                            );
                          }}
                          style={{
                            ...fieldStyle,
                            marginTop: 8,
                          }}
                        />
                      ))}

                      <label style={{ display: "block", marginTop: 10 }}>
                        {t("builder.correctAnswer")}

                        {task.type === "true_false" ? (
                          <select
                            value={String(task.correctAnswer)}
                            onChange={(e) => {
                              const v = e.target.value === "true";

                              setLessonTasks((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                      ...x,
                                      correctAnswer: v,
                                    }
                                    : x
                                )
                              );
                            }}
                            style={fieldStyle}
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <select
                            value={
                              typeof task.correctAnswer === "string"
                                ? task.correctAnswer
                                : ""
                            }
                            onChange={(e) => {
                              const v = e.target.value;

                              setLessonTasks((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                      ...x,
                                      correctAnswer: v,
                                    }
                                    : x
                                )
                              );
                            }}
                            style={fieldStyle}
                          >
                            {(task.options ?? []).map((opt, optIdx) => (
                              <option key={optIdx} value={opt}>
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
          </div>
        </section>

        {(hasTasks || hasText) && (
          <section
            className="stickyFinishSection"
            style={{
              marginTop: 22,
              position: "sticky",
              bottom: 12,
              zIndex: 20,
            }}
          >
            <div style={{ ...(hasTasks ? cardStyle : mutedCardStyle) }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={stepBadgeStyle(step3Active, false)}>3</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                      {t("sections.goToFinishingTitle")}
                    </h2>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {t("sections.goToFinishingBody")}
                    </div>
                  </div>
                </div>

                <button
                  className="actionBtn"
                  onClick={saveToFirestore}
                  disabled={busy || statusLoading || quotaBlocked || !hasTasks}
                  style={{
                    ...buttonSuccess,
                    opacity: busy || statusLoading || quotaBlocked || !hasTasks ? 0.55 : 1,
                    cursor: busy || statusLoading || quotaBlocked || !hasTasks ? "not-allowed" : "pointer",
                  }}
                  title={
                    quotaBlocked && featureStatus
                      ? t("quota.usedOfLimit", {
                        used: featureStatus.used,
                        limit: featureStatus.limit,
                      })
                      : t("actions.goToFinishing")
                  }
                >
                  {saving ? t("actions.saving") : t("actions.goToFinishing")}
                </button>
              </div>

              {!hasTasks && (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fff",
                    fontSize: 14,
                    opacity: 0.8,
                    marginTop: 12,
                  }}
                >
                  {t("sections.readyToFinishBody")}
                </div>
              )}
            </div>
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <div
            className="actionRow"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {quotaLoading && <span style={{ opacity: 0.75 }}>{t("quota.loading")}</span>}
            {statusLoading && <span style={{ opacity: 0.75 }}>{t("quota.loading")}</span>}

            {quotaBadgeText && (
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background:
                    (featureStatus?.remaining ?? quotaInfo?.remaining ?? 0) <= 0
                      ? "#fff1f2"
                      : (featureStatus?.remaining ?? quotaInfo?.remaining ?? 0) <= 2
                        ? "#fffbeb"
                        : "#f0fdf4",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {quotaBadgeText}
                {(featureStatus?.remaining ?? quotaInfo?.remaining ?? 0) <= 2 &&
                  (featureStatus?.remaining ?? quotaInfo?.remaining ?? 0) > 0
                  ? ` ${t("quota.runningLow")}`
                  : ""}
              </span>
            )}

            {savedId && (
              <span style={{ color: "green" }}>
                {t("messages.saved", { id: savedId })}
              </span>
            )}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </section>

        {readingPack && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>{t("debug.title")}</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#ead9d9ed",
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

            .stickyFinishSection {
              bottom: 0 !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
