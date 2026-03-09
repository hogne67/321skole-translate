// components\ReadingTestPlayer.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ReadingTestTaskType =
  | "word_choice"
  | "sentence_placement"
  | "best_summary"
  | "mcq"
  | "true_false"
  | "fill_in_word"
  | "short_answer"
  | "open";

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
  sourceText: string;
  tasks: ReadingLessonTask[];
  readingTestConfig?: ReadingTestConfig | null;
  initialAnswers?: Record<string, unknown>;
  disabled?: boolean;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onSubmit?: () => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function countWords(text: string) {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
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

export default function ReadingTestPlayer({
  title,
  sourceText,
  tasks,
  readingTestConfig,
  initialAnswers,
  disabled = false,
  onAnswersChange,
  onSubmit,
}: ReadingTestPlayerProps) {
  const normalizedTasks = useMemo(() => normalizeTasks(tasks), [tasks]);
  const answersFromProps = useMemo(() => normalizeInitialAnswers(initialAnswers), [initialAnswers]);

  const timerEnabled = readingTestConfig?.timerEnabled === true;
  const showQuestionsAfterReading = readingTestConfig?.showQuestionsAfterReading === true;
  const initialTimer = timerEnabled ? Math.max(10, safeNumber(readingTestConfig?.timerSeconds, 300)) : 0;

  const [answers, setAnswers] = useState<Record<string, unknown>>(answersFromProps);
  const [hasStarted, setHasStarted] = useState(!showQuestionsAfterReading);
  const [questionsVisible, setQuestionsVisible] = useState(!showQuestionsAfterReading);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialTimer);

  useEffect(() => {
    setAnswers(answersFromProps);
  }, [answersFromProps]);

  useEffect(() => {
    onAnswersChange?.(answers);
  }, [answers, onAnswersChange]);

  useEffect(() => {
    setSecondsLeft(initialTimer);
    setHasStarted(!showQuestionsAfterReading);
    setQuestionsVisible(!showQuestionsAfterReading);
    setIsTimeUp(false);
  }, [initialTimer, showQuestionsAfterReading, sourceText]);

  useEffect(() => {
    if (!timerEnabled) return;
    if (!hasStarted) return;
    if (isTimeUp) return;
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
  }, [timerEnabled, hasStarted, isTimeUp, disabled]);

  useEffect(() => {
    if (timerEnabled && hasStarted && secondsLeft <= 0 && !isTimeUp) {
      setIsTimeUp(true);
      setQuestionsVisible(true);
    }
  }, [timerEnabled, hasStarted, secondsLeft, isTimeUp]);

  const wordCount = useMemo(() => countWords(sourceText), [sourceText]);

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

          return (
            <label
              key={`${task.id}_${optIndex}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                border: checked ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                borderRadius: 12,
                padding: checked ? "9px 11px" : "10px 12px",
                cursor: disabled || isTimeUp ? "default" : "pointer",
                background: checked ? "#eff6ff" : "#ffffff",
                opacity: isTimeUp ? 0.78 : 1,
                boxShadow: checked ? "0 0 0 1px rgba(59,130,246,0.10)" : "none",
              }}
            >
              <input
                type="radio"
                name={`task_${task.id}`}
                checked={checked}
                disabled={disabled || isTimeUp}
                onChange={() => setAnswer(task.id, opt)}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontWeight: checked ? 700 : 500, lineHeight: 1.45 }}>{opt}</span>
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
            {["True", "False"].map((opt, i) => {
              const checked = currentAnswer === opt || currentAnswer === opt.toLowerCase();

              return (
                <label
                  key={`${task.id}_tf_${i}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    border: checked ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                    borderRadius: 12,
                    padding: checked ? "9px 11px" : "10px 12px",
                    cursor: disabled || isTimeUp ? "default" : "pointer",
                    background: checked ? "#eff6ff" : "#ffffff",
                    opacity: isTimeUp ? 0.78 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name={`task_${task.id}`}
                    checked={checked}
                    disabled={disabled || isTimeUp}
                    onChange={() => setAnswer(task.id, opt.toLowerCase())}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontWeight: checked ? 700 : 500 }}>{opt}</span>
                </label>
              );
            })}
          </div>
        )}

        {(taskType === "open" || taskType === "short_answer") && (
          <textarea
            value={typeof currentAnswer === "string" ? currentAnswer : ""}
            onChange={(e) => setAnswer(task.id, e.target.value)}
            disabled={disabled || isTimeUp}
            rows={taskType === "open" ? 5 : 2}
            style={{ ...inputStyle, resize: "vertical", opacity: isTimeUp ? 0.78 : 1 }}
            placeholder="Skriv svaret ditt her"
          />
        )}
      </div>
    );
  }

  const showText = hasStarted || !showQuestionsAfterReading;

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
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 14 }}>
              Ord: {wordCount}
              {readingTestConfig?.cefrLevel ? ` • Nivå: ${readingTestConfig.cefrLevel}` : ""}
            </div>
          </div>

          {timerEnabled && hasStarted && !isTimeUp && (
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
        </div>

        {!hasStarted && showQuestionsAfterReading && (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginTop: 0, opacity: 0.86, lineHeight: 1.5 }}>
              Teksten vises når du starter. Les først, og åpne deretter spørsmålene.
            </p>
            <button
              type="button"
              onClick={() => {
                setHasStarted(true);
                if (!showQuestionsAfterReading) setQuestionsVisible(true);
              }}
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
              Start lesing
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
              onClick={() => setQuestionsVisible(true)}
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

      {questionsVisible && (
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

          {onSubmit && (
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={onSubmit}
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
                Lever
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}