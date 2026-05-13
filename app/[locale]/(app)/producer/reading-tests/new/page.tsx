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
  const t = useTranslations("readingTestsNew");
  const { profile } = useUserProfile();

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    marginTop: 6,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffffe0",
    fontSize: 14,
  };

  const cardStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 20,
    background: "#ede5e5f4",
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
    background: "#318a5d",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSmall: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 600,
    cursor: "pointer",
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

  const [, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [, setQuotaLoading] = useState(false);
  const [, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [, setStatusLoading] = useState(false);

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
  }, [profileUid, role, plan, billing]);

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

  return (
    <main
      style={{
        width: "100%",
        maxWidth: 980,
        margin: "0 auto",
        padding: "8px 12px 60px",
      }}
    >
      <div style={{ ...cardStyle, padding: 20 }}>
        <h1>{t("page.title")}</h1>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
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

            <input
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              placeholder={t("fields.searchLanguage")}
              style={fieldStyle}
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

          <label style={{ gridColumn: "1 / -1" }}>
            {t("fields.topic")}

            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              style={{
                ...fieldStyle,
                resize: "vertical",
              }}
            />
          </label>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
            <strong>{t("taskTypes.title")}</strong>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
                gap: 12,
                marginTop: 12,
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

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={generateReadingTest}
              disabled={busy}
              style={buttonPrimary}
            >
              {loadingReadingTest
                ? t("actions.generating")
                : t("actions.generate")}
            </button>

            <button
              onClick={saveToFirestore}
              disabled={busy}
              style={buttonSecondary}
            >
              {saving ? t("actions.saving") : t("actions.saveDraft")}
            </button>

            {error && <span style={{ color: "crimson" }}>{error}</span>}

            {savedId && (
              <span style={{ color: "green" }}>
                {t("messages.saved", { id: savedId })}
              </span>
            )}
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <label style={{ display: "block", marginTop: 10 }}>
            {t("builder.lessonTitle")}

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 12 }}>
            {t("builder.readingText")}

            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={10}
              style={{
                ...fieldStyle,
                resize: "vertical",
              }}
            />
          </label>

          <div style={{ marginTop: 18, ...cardStyle }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <h3>{t("builder.tasks")}</h3>

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
                  {t("taskTypes.best_summary")}
                </button>
              </div>
            </div>

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
                    <strong>
                      {idx + 1}. {taskTypeLabels[task.type]}
                    </strong>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => moveTask(idx, -1)}
                        style={buttonSmall}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => moveTask(idx, 1)}
                        style={buttonSmall}
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
          </div>
        </section>
      </div>
    </main>
  );
}