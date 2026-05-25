// components\ReadingTestPlayer.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { countReadingTestWords } from "@/lib/readingTests/readingSignals";

type ReadingTestTaskType =
  | "word_choice"
  | "sentence_placement"
  | "best_summary"
  | "mcq"
  | "true_false"
  | "fill_in_word"
  | "short_answer"
  | "open";

export type ReadingProgress = {
  timeLimitSeconds: number | null;
  secondsLeft: number | null;
  secondsUsed: number | null;
  isTimeUp: boolean;
  hasStarted: boolean;
  questionsVisible: boolean;
};

export type ReadingLessonTask = {
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

export type ReadingTestConfig = {
  cefrLevel?: string;
  audience?: string;
  topic?: string;
  minWords?: number;
  maxWords?: number;
  timerEnabled?: boolean;
  timerSeconds?: number | null;
  showQuestionsAfterReading?: boolean;
  enabledTaskTypes?: ReadingTestTaskType[];
  feedbackMode?: "learner" | "adult" | "both";
};

export type ReadingTestPlayerProps = {
  title?: string;
  level?: string;
  language?: string;
  sourceText: string;
  tasks: ReadingLessonTask[];
  readingTestConfig?: ReadingTestConfig | null;
  initialAnswers?: Record<string, unknown>;
  disabled?: boolean;
  submitLabel?: string;
  importantMessage?: string;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onProgressChange?: (progress: ReadingProgress) => void;
  onSubmittedChange?: (submitted: boolean) => void;
  onSubmit?: (progress?: ReadingProgress) => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function formatTime(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeInitialAnswers(v: unknown): Record<string, unknown> {
  if (!isRecord(v)) return {};
  return v;
}

function normalizeTasks(tasks: ReadingLessonTask[]): ReadingLessonTask[] {
  return [...tasks]
    .filter((t) => t && t.enabled !== false)
    .sort((a, b) => safeNumber(a.order, 0) - safeNumber(b.order, 0));
}

function isOptionSelected(currentAnswer: unknown, opt: string) {
  if (typeof currentAnswer === "string") return currentAnswer === opt;
  return false;
}

function normalizeAnswer(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
}

function getCorrectValues(task: ReadingLessonTask): string[] {
  const raw = (task as ReadingLessonTask & { correctAnswer?: unknown }).correctAnswer;
  if (Array.isArray(raw)) return raw.map(normalizeAnswer).filter(Boolean);
  if (typeof raw === "number" && Array.isArray(task.options) && task.options[raw] != null) {
    return [normalizeAnswer(task.options[raw])].filter(Boolean);
  }
  const normalized = normalizeAnswer(raw);
  return normalized ? [normalized] : [];
}

function isClosedTask(task: ReadingLessonTask) {
  const type = String(task.type || "").toLowerCase();
  return (
    type === "mcq" ||
    type === "word_choice" ||
    type === "sentence_placement" ||
    type === "best_summary" ||
    type === "fill_in_word" ||
    type === "true_false" ||
    type === "truefalse"
  );
}

function isCorrectAnswer(task: ReadingLessonTask, answer: unknown) {
  const correctValues = getCorrectValues(task);
  if (!correctValues.length) return null;
  return correctValues.includes(normalizeAnswer(answer));
}

function calculateClosedResult(tasks: ReadingLessonTask[], answers: Record<string, unknown>) {
  let total = 0;
  let correct = 0;

  for (const task of tasks) {
    if (!isClosedTask(task)) continue;
    const result = isCorrectAnswer(task, answers[task.id]);
    if (result === null) continue;
    total += 1;
    if (result) correct += 1;
  }

  return { total, correct, wrong: Math.max(0, total - correct) };
}

function InfoPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid #cbd5e1",
        borderRadius: 999,
        background: "#f8fafc",
        color: "#0f172a",
        padding: "5px 9px",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

export default function ReadingTestPlayer({
  title,
  level,
  language,
  sourceText,
  tasks,
  readingTestConfig,
  initialAnswers,
  disabled = false,
  submitLabel = "Lever",
  importantMessage,
  onAnswersChange,
  onProgressChange,
  onSubmittedChange,
  onSubmit,
}: ReadingTestPlayerProps) {
  const normalizedTasks = useMemo(() => normalizeTasks(tasks), [tasks]);
  const answersFromProps = useMemo(() => normalizeInitialAnswers(initialAnswers), [initialAnswers]);

  const timerEnabled = readingTestConfig?.timerEnabled !== false;
  const showQuestionsAfterReading = readingTestConfig?.showQuestionsAfterReading === true;
  const initialTimer = timerEnabled ? Math.max(10, safeNumber(readingTestConfig?.timerSeconds, 120)) : 0;

  const [answers, setAnswers] = useState<Record<string, unknown>>(answersFromProps);
  const [hasStarted, setHasStarted] = useState(false);
  const [questionsVisible, setQuestionsVisible] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialTimer);
  const [finalSecondsUsed, setFinalSecondsUsed] = useState<number | null>(null);

  useEffect(() => {
    setAnswers(answersFromProps);
  }, [answersFromProps]);

  useEffect(() => {
    onSubmittedChange?.(isSubmitted);
  }, [isSubmitted, onSubmittedChange]);

  useEffect(() => {
    onAnswersChange?.(answers);
  }, [answers, onAnswersChange]);

  useEffect(() => {
    const secondsUsed = timerEnabled ? finalSecondsUsed ?? Math.max(0, initialTimer - secondsLeft) : null;
    onProgressChange?.({
      timeLimitSeconds: timerEnabled ? initialTimer : null,
      secondsLeft: timerEnabled ? secondsLeft : null,
      secondsUsed,
      isTimeUp,
      hasStarted,
      questionsVisible,
    });
  }, [
    finalSecondsUsed,
    hasStarted,
    initialTimer,
    isTimeUp,
    onProgressChange,
    questionsVisible,
    secondsLeft,
    timerEnabled,
  ]);

  useEffect(() => {
    setSecondsLeft(initialTimer);
    setHasStarted(false);
    setQuestionsVisible(false);
    setIsTimeUp(false);
    setIsSubmitted(false);
    setShowTasks(false);
    setFinalSecondsUsed(null);
  }, [initialTimer, sourceText]);

  useEffect(() => {
    if (!timerEnabled) return;
    if (!hasStarted) return;
    if (isTimeUp) return;
    if (isSubmitted) return;
    if (disabled) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timerEnabled, hasStarted, isTimeUp, isSubmitted, disabled]);

  useEffect(() => {
    if (timerEnabled && hasStarted && secondsLeft <= 0 && !isTimeUp) {
      setIsTimeUp(true);
      setQuestionsVisible(true);
    }
  }, [timerEnabled, hasStarted, secondsLeft, isTimeUp]);

  const wordCount = useMemo(
    () => countReadingTestWords(sourceText, normalizedTasks),
    [normalizedTasks, sourceText]
  );
  const closedResult = useMemo(() => calculateClosedResult(normalizedTasks, answers), [answers, normalizedTasks]);
  const secondsUsed = timerEnabled ? finalSecondsUsed ?? Math.max(0, initialTimer - secondsLeft) : null;
  const remainingRatio = timerEnabled && initialTimer > 0 ? Math.max(0, Math.min(1, secondsLeft / initialTimer)) : 1;
  const elapsedRatio = 1 - remainingRatio;
  const timerColor =
    remainingRatio <= 0.1 ? "#dc2626" : remainingRatio <= 0.25 ? "#f59e0b" : "#16a34a";
  const timerBg =
    remainingRatio <= 0.1 ? "#fef2f2" : remainingRatio <= 0.25 ? "#fffbeb" : "#f0fdf4";
  const timerText =
    remainingRatio <= 0.1 ? "#991b1b" : remainingRatio <= 0.25 ? "#92400e" : "#166534";

  function startTest() {
    setHasStarted(true);
    setQuestionsVisible(true);
    setShowTasks(false);
    setIsTimeUp(false);
    setIsSubmitted(false);
    setFinalSecondsUsed(null);
    setSecondsLeft(initialTimer);
  }

  function hasAnyAnswer() {
    return Object.values(answers).some((value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    });
  }

  function handleSubmit() {
    const progress: ReadingProgress = {
      timeLimitSeconds: timerEnabled ? initialTimer : null,
      secondsLeft: timerEnabled ? secondsLeft : null,
      secondsUsed: timerEnabled ? Math.max(0, initialTimer - secondsLeft) : null,
      isTimeUp,
      hasStarted,
      questionsVisible,
    };

    if (hasAnyAnswer()) {
      setIsSubmitted(true);
      setFinalSecondsUsed(progress.secondsUsed);
      onProgressChange?.(progress);
    }
    onSubmit?.(progress);
  }

  function setAnswer(taskId: string, value: unknown) {
    setAnswers((prev) => ({
      ...prev,
      [taskId]: value,
    }));
  }

  function renderChoiceOptions(task: ReadingLessonTask, currentAnswer: unknown) {
    if (!Array.isArray(task.options) || task.options.length === 0) return null;

    return (
      <div style={{ display: "grid", gap: 10 }}>
        {task.options.map((opt, optIndex) => {
          const checked = isOptionSelected(currentAnswer, opt);
          const correct = isCorrectAnswer(task, opt) === true;
          const selectedCorrect = isSubmitted && checked && correct;
          const selectedWrong = isSubmitted && checked && !correct;
          const showCorrect = isSubmitted && correct;
          const borderColor = selectedCorrect || showCorrect
            ? "#16a34a"
            : selectedWrong
              ? "#dc2626"
              : checked
                ? "#3b82f6"
                : "#cbd5e1";
          const background = selectedCorrect || showCorrect
            ? "#ecfdf5"
            : selectedWrong
              ? "#fef2f2"
              : checked
                ? "#eff6ff"
                : "#ffffff";

          return (
            <label
              key={`${task.id}_${optIndex}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                border: checked || showCorrect ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                borderRadius: 12,
                padding: checked || showCorrect ? "9px 11px" : "10px 12px",
                cursor: disabled || isTimeUp || isSubmitted ? "default" : "pointer",
                background,
                opacity: isTimeUp && !isSubmitted ? 0.78 : 1,
                boxShadow: checked ? "0 0 0 1px rgba(59,130,246,0.10)" : "none",
              }}
            >
              <input
                type="radio"
                name={`task_${task.id}`}
                checked={checked}
                disabled={disabled || isTimeUp || isSubmitted}
                onChange={() => setAnswer(task.id, opt)}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontWeight: checked || showCorrect ? 700 : 500, lineHeight: 1.45 }}>
                {opt}
                {selectedCorrect ? " - Riktig" : ""}
                {selectedWrong ? " - Feil" : ""}
                {!checked && showCorrect ? " - Riktig svar" : ""}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderTask(task: ReadingLessonTask, index: number) {
    const currentAnswer = answers[task.id];
    const taskType = String(task.type || "").toLowerCase();

    const boxStyle: React.CSSProperties = {
      border: "1px solid #cbd5e1",
      borderRadius: 16,
      padding: 14,
      background: "#ffffff",
      marginTop: 12,
      boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
    };

    const promptStyle: React.CSSProperties = {
      fontWeight: 800,
      marginBottom: 10,
      whiteSpace: "pre-wrap",
      lineHeight: 1.45,
      color: "#0f172a",
    };

    const hintBoxStyle: React.CSSProperties = {
      opacity: 1,
      fontSize: 15,
      marginBottom: 12,
      whiteSpace: "pre-wrap",
      lineHeight: 1.55,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #d1d5db",
      background: "#f8fafc",
      color: "#111827",
    };

    const inputStyle: React.CSSProperties = {
      width: "100%",
      boxSizing: "border-box",
      padding: 10,
      borderRadius: 12,
      border: "1px solid #cbd5e1",
      marginTop: 8,
      fontSize: 14,
      outline: "none",
      background: "#ffffff",
      color: "#111827",
    };

    return (
      <div key={task.id} style={boxStyle}>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6, fontWeight: 600 }}>
          Oppgave {index + 1} • {task.type}
        </div>

        <div style={promptStyle}>{task.prompt}</div>

        {(taskType === "word_choice" || taskType === "fill_in_word") && task.sentence && (
          <div style={hintBoxStyle}>{task.sentence}</div>
        )}

        {taskType === "sentence_placement" && task.textWithGap && (
          <div style={hintBoxStyle}>{task.textWithGap}</div>
        )}

        {(taskType === "mcq" ||
          taskType === "word_choice" ||
          taskType === "sentence_placement" ||
          taskType === "best_summary" ||
          taskType === "fill_in_word") &&
          renderChoiceOptions(task, currentAnswer)}

        {(taskType === "true_false" || taskType === "truefalse") && (
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { label: "Sant", value: "true" },
              { label: "Usant", value: "false" },
            ].map((opt, i) => {
              const checked = normalizeAnswer(currentAnswer) === opt.value;
              const correct = isCorrectAnswer(task, opt.value) === true;
              const selectedCorrect = isSubmitted && checked && correct;
              const selectedWrong = isSubmitted && checked && !correct;
              const showCorrect = isSubmitted && correct;
              const borderColor = selectedCorrect || showCorrect
                ? "#16a34a"
                : selectedWrong
                  ? "#dc2626"
                  : checked
                    ? "#3b82f6"
                    : "#cbd5e1";
              const background = selectedCorrect || showCorrect
                ? "#ecfdf5"
                : selectedWrong
                  ? "#fef2f2"
                  : checked
                    ? "#eff6ff"
                    : "#ffffff";

              return (
                <label
                  key={`${task.id}_tf_${i}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    border: checked || showCorrect ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                    borderRadius: 12,
                    padding: checked || showCorrect ? "9px 11px" : "10px 12px",
                    cursor: disabled || isTimeUp || isSubmitted ? "default" : "pointer",
                    background,
                    opacity: isTimeUp && !isSubmitted ? 0.78 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name={`task_${task.id}`}
                    checked={checked}
                    disabled={disabled || isTimeUp || isSubmitted}
                    onChange={() => setAnswer(task.id, opt.value)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontWeight: checked || showCorrect ? 700 : 500 }}>
                    {opt.label}
                    {selectedCorrect ? " - Riktig" : ""}
                    {selectedWrong ? " - Feil" : ""}
                    {!checked && showCorrect ? " - Riktig svar" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {(taskType === "open" || taskType === "short_answer") && (
          <textarea
            value={typeof currentAnswer === "string" ? currentAnswer : ""}
            onChange={(e) => setAnswer(task.id, e.target.value)}
            disabled={disabled || isTimeUp || isSubmitted}
            rows={taskType === "open" ? 5 : 2}
            style={{ ...inputStyle, resize: "vertical", opacity: isTimeUp && !isSubmitted ? 0.78 : 1 }}
            placeholder="Skriv svaret ditt her"
          />
        )}
      </div>
    );
  }

  const showText = hasStarted;
  const effectiveLevel = level || readingTestConfig?.cefrLevel || "";
  const languageLabel = language ? language.toUpperCase() : "";

  return (
    <section
      style={{
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 20,
          background: "#ffffff",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              {title || "Lesetest"}
            </h2>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {effectiveLevel ? <InfoPill label={`Nivå: ${effectiveLevel}`} /> : null}
              {languageLabel ? <InfoPill label={`Språk: ${languageLabel}`} /> : null}
              <InfoPill label={`Ord: ${wordCount}`} />
              <InfoPill label={`Oppgaver: ${normalizedTasks.length}`} />
            </div>
          </div>

          {timerEnabled && hasStarted && !isTimeUp && !isSubmitted && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                background: secondsLeft <= 30 ? "#fff1f2" : "#f8fafc",
                color: secondsLeft <= 30 ? "#b91c1c" : "#0f172a",
                fontWeight: 800,
              }}
            >
              Tid: {formatTime(secondsLeft)}
            </div>
          )}

          {timerEnabled && isSubmitted && secondsUsed != null && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #16a34a",
                background: "#ecfdf5",
                color: "#166534",
                fontWeight: 800,
              }}
            >
              Brukt tid: {formatTime(secondsUsed)}
            </div>
          )}
        </div>

        {!hasStarted && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                border: "1px solid #f59e0b",
                borderRadius: 14,
                background: "#fffbeb",
                color: "#78350f",
                padding: 12,
                lineHeight: 1.5,
                fontWeight: 700,
              }}
            >
              {importantMessage ||
                `Viktig! Nedtellingen starter når du trykker på Start test. Les teksten nøye og svar på oppgavene. Timeren stopper når du trykker på ${submitLabel}.`}
            </div>
            <button
              type="button"
              onClick={startTest}
              disabled={disabled}
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #0f172a",
                background: "#214db4",
                color: "#fff",
                fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              Start test
            </button>
          </div>
        )}

        {showText ? (
          <div
            style={{
              marginTop: 16,
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              fontSize: 16,
              color: "#111827",
            }}
          >
            {sourceText}
          </div>
        ) : null}

        {showQuestionsAfterReading && hasStarted && !questionsVisible && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                setQuestionsVisible(true);
                setShowTasks(false);
              }}
              disabled={disabled}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              Jeg er ferdig å lese – vis spørsmål
            </button>
          </div>
        )}

        {isTimeUp && timerEnabled && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #fca5a5",
              background: "#fff1f2",
              color: "#9f1239",
              fontWeight: 700,
            }}
          >
            Tiden er ute.
          </div>
        )}
      </div>

      {isSubmitted && (
        <div
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: 20,
            background: "#f0fdf4",
            boxShadow: "0 10px 30px rgba(22, 163, 74, 0.08)",
            padding: 18,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#14532d" }}>
            Autokorrektur
          </h3>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <InfoPill label={`Riktige: ${closedResult.correct}`} />
            <InfoPill label={`Feil: ${closedResult.wrong}`} />
            <InfoPill label={`Totalt: ${closedResult.total}`} />
            {timerEnabled && secondsUsed != null ? (
              <InfoPill label={`Brukt tid: ${formatTime(secondsUsed)}`} />
            ) : null}
          </div>
        </div>
      )}

      {questionsVisible && !showTasks && !isSubmitted && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 20,
            background: "#ffffff",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            padding: 18,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 800 }}>
            Oppgaver
          </h3>
          <p style={{ marginTop: 0, opacity: 0.78, lineHeight: 1.5 }}>
            Når du er klar, kan du vise oppgavene og svare.
          </p>
          <button
            type="button"
            onClick={() => setShowTasks(true)}
            disabled={disabled}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #0f172a",
              background: "#214db4",
              color: "#fff",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            Vis oppgaver
          </button>
        </div>
      )}

      {questionsVisible && (showTasks || isSubmitted) && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 20,
            background: "#ffffff",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            padding: 18,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18, fontWeight: 800 }}>
            Oppgaver
          </h3>

          {normalizedTasks.length === 0 ? (
            <p style={{ opacity: 0.75, marginBottom: 0 }}>Ingen oppgaver ennå.</p>
          ) : (
            normalizedTasks.map((task, index) => renderTask(task, index))
          )}

          {onSubmit && !isSubmitted && !timerEnabled && (
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={disabled}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#214db4",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {submitLabel}
              </button>
            </div>
          )}
        </div>
      )}

      {timerEnabled && hasStarted && !isSubmitted && (
        <div
          style={{
            position: "sticky",
            bottom: 10,
            zIndex: 20,
            border: `1px solid ${timerColor}`,
            borderRadius: 18,
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
            padding: 12,
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto minmax(160px, 1fr) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: "#334155", whiteSpace: "nowrap" }}>
              Starttid: {formatTime(initialTimer)}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <div
                aria-label="Tid igjen"
                style={{
                  height: 14,
                  borderRadius: 999,
                  background: "#e5e7eb",
                  overflow: "hidden",
                  boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.08)",
                }}
              >
                <div
                  style={{
                    width: `${elapsedRatio * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: timerColor,
                    transition: "width 220ms linear, background 160ms ease",
                  }}
                />
              </div>

              <div
                style={{
                  minWidth: 62,
                  textAlign: "right",
                  borderRadius: 999,
                  background: timerBg,
                  color: timerText,
                  padding: "6px 9px",
                  fontWeight: 950,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTime(secondsLeft)}
              </div>
            </div>

            {onSubmit ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={disabled}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #0f172a",
                  background: "#16a34a",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {submitLabel}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
