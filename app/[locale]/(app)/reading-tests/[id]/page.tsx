// app\[locale]\(app)\reading-tests\[id]\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";

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
  visibility?: string;
  publishVisibility?: string;
  showInLibrary?: boolean;
  tasks?: LessonTask[];
  readingTestConfig?: Partial<ReadingTestConfig>;
};

type AnswersState = Record<string, string | boolean>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `task_${index + 1}`,
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

function formatSeconds(total: number) {
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function normalizeTextAnswer(v: string) {
  return v.trim().toLowerCase();
}

function isAutoGradable(task: LessonTask) {
  return (
    task.type === "word_choice" ||
    task.type === "sentence_placement" ||
    task.type === "best_summary" ||
    task.type === "mcq" ||
    task.type === "true_false" ||
    task.type === "fill_in_word"
  );
}

function isCorrect(task: LessonTask, answer: string | boolean | undefined) {
  const correct = task.correctAnswer;

  if (typeof correct === "boolean") {
    return typeof answer === "boolean" && answer === correct;
  }

  if (typeof correct === "string") {
    if (typeof answer !== "string") return false;
    return normalizeTextAnswer(answer) === normalizeTextAnswer(correct);
  }

  if (Array.isArray(correct)) {
    if (typeof answer !== "string") return false;
    return correct.map(normalizeTextAnswer).includes(normalizeTextAnswer(answer));
  }

  return false;
}

function canViewReadingTest(docData: LessonDoc, currentUid: string | null) {
  if (!docData) return false;
  if (docData.ownerId && currentUid && docData.ownerId === currentUid) return true;

  const visibility = safeString(docData.visibility, "").toLowerCase();
  const publishVisibility = safeString(docData.publishVisibility, "").toLowerCase();

  if (visibility === "public" || visibility === "unlisted") return true;
  if (publishVisibility === "public" || publishVisibility === "unlisted") return true;

  return false;
}

function renderCorrectAnswer(task: LessonTask, t: (key: string) => string) {
  if (typeof task.correctAnswer === "boolean") {
    return task.correctAnswer ? t("questions.true") : t("questions.false");
  }
  if (typeof task.correctAnswer === "string") {
    return task.correctAnswer;
  }
  if (Array.isArray(task.correctAnswer)) {
    return task.correctAnswer.join(", ");
  }
  return "—";
}

export default function ReadingTestPlayPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("readingTestPlayer");
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

  const cardStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 20,
    background: "#f8fafc",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
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
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
  };

  const [authResolved, setAuthResolved] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("nb");
  const [level, setLevel] = useState("A2");
  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState("");
  const [tasks, setTasks] = useState<LessonTask[]>([]);
  const [config, setConfig] = useState<ReadingTestConfig | null>(null);

  const [started, setStarted] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      setUid(user?.uid ?? null);
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

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!snap.exists()) {
          setError(t("errors.notFound"));
          return;
        }

        const data = snap.data() as LessonDoc;

        if (data.lessonType !== "reading_test") {
          setError(t("errors.notReadingTest"));
          return;
        }

        if (!canViewReadingTest(data, uid)) {
          setError(t("errors.noAccess"));
          return;
        }

        const nextConfig = normalizeReadingTestConfig(
          data.readingTestConfig,
          safeString(data.level, "A2")
        );

        setTitle(safeString(data.title, t("fallback.title")));
        setLanguage(safeString(data.language, "nb"));
        setLevel(safeString(data.level, "A2"));
        setSourceText(safeString(data.sourceText, ""));
        setTopic(safeString(data.topic, safeString(data.prompt, "")));
        setTasks(Array.isArray(data.tasks) ? renumberOrders(data.tasks.map(normalizeTask)) : []);
        setConfig(nextConfig);

        if (!nextConfig.showQuestionsAfterReading) {
          setShowQuestions(true);
        }

        if (nextConfig.timerEnabled && typeof nextConfig.timerSeconds === "number") {
          setTimeLeft(nextConfig.timerSeconds);
        } else {
          setTimeLeft(null);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }

    if (!authResolved) return;
    void load();
  }, [lessonId, authResolved, uid, t]);

  useEffect(() => {
    if (!started || submitted || timeLeft == null) return;
    if (timeLeft <= 0) {
      setSubmitted(true);
      setShowQuestions(true);
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [started, submitted, timeLeft]);

  const wordCount = useMemo(() => countWords(sourceText), [sourceText]);

  const autoGradableTasks = useMemo(() => tasks.filter(isAutoGradable), [tasks]);

  const score = useMemo(() => {
    let correct = 0;
    for (const task of autoGradableTasks) {
      const answer = answers[task.id];
      if (isCorrect(task, answer)) correct += 1;
    }
    return {
      correct,
      total: autoGradableTasks.length,
    };
  }, [autoGradableTasks, answers]);

  const answeredCount = useMemo(() => {
    return tasks.filter((task) => {
      const value = answers[task.id];
      if (typeof value === "boolean") return true;
      if (typeof value === "string") return value.trim().length > 0;
      return false;
    }).length;
  }, [tasks, answers]);

  const feedbackText = useMemo(() => {
    if (!config) return "";

    if (config.feedbackMode === "learner") {
      return t("feedback.learner");
    }

    if (config.feedbackMode === "adult") {
      return t("feedback.adult");
    }

    return t("feedback.both");
  }, [config, t]);

  function startTest() {
    setStarted(true);
    if (config?.showQuestionsAfterReading === false) {
      setShowQuestions(true);
    }
  }

  function revealQuestions() {
    setShowQuestions(true);
  }

  function submitTest() {
    setSubmitted(true);
    setShowQuestions(true);
  }

  function resetTest() {
    setAnswers({});
    setSubmitted(false);
    setStarted(false);
    setShowQuestions(config?.showQuestionsAfterReading === false);
    if (config?.timerEnabled && typeof config.timerSeconds === "number") {
      setTimeLeft(config.timerSeconds);
    } else {
      setTimeLeft(null);
    }
  }

  function setAnswer(taskId: string, value: string | boolean) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px 12px 60px" }}>
        {t("loading")}
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px 12px 60px" }}>
        <div style={{ color: "crimson" }}>{error}</div>
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
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{title}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              {level} · {language} · {wordCount} {t("meta.words")}
            </p>
            {topic ? <p style={{ marginTop: 6, opacity: 0.82 }}>{topic}</p> : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!started ? (
              <button onClick={startTest} style={buttonPrimary}>
                {t("actions.startTest")}
              </button>
            ) : !submitted ? (
              <button onClick={submitTest} style={buttonPrimary}>
                {t("actions.submit")}
              </button>
            ) : (
              <button onClick={resetTest} style={buttonSecondary}>
                {t("actions.tryAgain")}
              </button>
            )}
          </div>
        </div>

        <section style={{ marginTop: 18, ...cardStyle }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <strong>{t("readingText.title")}</strong>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {config?.timerEnabled && timeLeft != null ? (
                <span
                  style={{
                    fontSize: 13,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: timeLeft <= 30 ? "#fff1f2" : "#eff6ff",
                    border: "1px solid #dbeafe",
                    fontWeight: 700,
                  }}
                >
                  {t("readingText.time")}: {formatSeconds(timeLeft)}
                </span>
              ) : null}

              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontWeight: 700,
                }}
              >
                {answeredCount} / {tasks.length} {t("meta.answered")}
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              fontSize: 16,
            }}
          >
            {sourceText}
          </div>

          {config?.showQuestionsAfterReading && !showQuestions ? (
            <div style={{ marginTop: 18 }}>
              <button onClick={revealQuestions} style={buttonPrimary} disabled={!started}>
                {t("actions.showQuestions")}
              </button>
              {!started ? (
                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.72 }}>
                  {t("readingText.startFirst")}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {showQuestions ? (
          <section style={{ marginTop: 18, ...cardStyle }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("questions.title")}</h2>

            <div style={{ marginTop: 14 }}>
              {tasks.map((task, idx) => {
                const currentAnswer = answers[task.id];
                const auto = isAutoGradable(task);
                const correct = submitted && auto ? isCorrect(task, currentAnswer) : null;

                return (
                  <div
                    key={task.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 12,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>
                      {idx + 1}. {task.prompt}
                    </div>

                    {(task.type === "word_choice" || task.type === "fill_in_word") && task.sentence ? (
                      <div style={{ marginBottom: 10, opacity: 0.88 }}>{task.sentence}</div>
                    ) : null}

                    {task.type === "sentence_placement" && task.textWithGap ? (
                      <div style={{ marginBottom: 10, whiteSpace: "pre-wrap", opacity: 0.88 }}>
                        {task.textWithGap}
                      </div>
                    ) : null}

                    {(task.options ?? []).length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {(task.options ?? []).map((opt, optIdx) => {
                          const checked =
                            typeof currentAnswer === "string" ? currentAnswer === opt : false;

                          return (
                            <label
                              key={`${task.id}_${optIdx}`}
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-start",
                                border: "1px solid #e2e8f0",
                                borderRadius: 12,
                                padding: 10,
                                background: "#fff",
                              }}
                            >
                              <input
                                type="radio"
                                name={task.id}
                                checked={checked}
                                disabled={submitted}
                                onChange={() => setAnswer(task.id, opt)}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : task.type === "true_false" ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {[true, false].map((value) => (
                          <label
                            key={`${task.id}_${String(value)}`}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              border: "1px solid #e2e8f0",
                              borderRadius: 12,
                              padding: "10px 12px",
                              background: "#fff",
                            }}
                          >
                            <input
                              type="radio"
                              name={task.id}
                              checked={currentAnswer === value}
                              disabled={submitted}
                              onChange={() => setAnswer(task.id, value)}
                            />
                            <span>{value ? t("questions.true") : t("questions.false")}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={typeof currentAnswer === "string" ? currentAnswer : ""}
                        onChange={(e) => setAnswer(task.id, e.target.value)}
                        rows={task.type === "open" ? 5 : 3}
                        disabled={submitted}
                        style={{ ...fieldStyle, resize: "vertical" }}
                      />
                    )}

                    {submitted ? (
                      <div style={{ marginTop: 10 }}>
                        {auto ? (
                          <div
                            style={{
                              fontWeight: 700,
                              color: correct ? "green" : "crimson",
                            }}
                          >
                            {correct ? t("questions.correct") : t("questions.incorrect")}
                          </div>
                        ) : (
                          <div style={{ fontWeight: 700, opacity: 0.78 }}>
                            {t("questions.openSaved")}
                          </div>
                        )}

                        <div style={{ marginTop: 6, fontSize: 14, opacity: 0.86 }}>
                          <strong>{t("questions.correctAnswer")}</strong>{" "}
                          {renderCorrectAnswer(task, t)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {submitted ? (
          <section style={{ marginTop: 18, ...cardStyle }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("result.title")}</h2>

            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800 }}>
              {score.correct} / {score.total}
            </div>

            <div style={{ marginTop: 10, lineHeight: 1.6 }}>{feedbackText}</div>
          </section>
        ) : null}

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