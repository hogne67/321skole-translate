// app\[locale]\(app)\tools\generator\page.tsx
"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGES } from "@/lib/languages";

type TaskType = "truefalse" | "mcq";
type LengthKey = "short" | "normal" | "long";
type ContentLanguage = string;

type GenTask = {
  id: string;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer: string | boolean | number;
  explanation?: string;
};

type GeneratedLesson = {
  title: string;
  level: string;
  topic: string;
  language: string;
  sourceText: string;
  tasks: GenTask[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (isRecord(e) && typeof e.message === "string") return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isLengthKey(v: string): v is LengthKey {
  return v === "short" || v === "normal" || v === "long";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isTruthyAnswer(value: string) {
  const v = normalizeText(value);
  return ["true", "yes", "correct", "right", "sant", "riktig", "verdadeiro", "certo"].includes(v);
}

function isFalsyAnswer(value: string) {
  const v = normalizeText(value);
  return ["false", "no", "incorrect", "wrong", "usant", "feil", "falso", "errado"].includes(v);
}

function isCorrectAnswer(task: GenTask, userAnswer: string): boolean {
  if (task.type === "truefalse") {
    if (typeof task.correctAnswer === "boolean") {
      return normalizeText(userAnswer) === String(task.correctAnswer);
    }

    const expected = String(task.correctAnswer);
    if (isTruthyAnswer(expected)) return normalizeText(userAnswer) === "true";
    if (isFalsyAnswer(expected)) return normalizeText(userAnswer) === "false";

    return normalizeText(userAnswer) === normalizeText(expected);
  }

  return normalizeText(userAnswer) === normalizeText(String(task.correctAnswer));
}

function optionButtonStyle(selected: boolean): CSSProperties {
  return {
    border: selected ? "1px solid #111" : "1px solid #d1d5db",
    borderRadius: 12,
    padding: "10px 14px",
    background: selected ? "#111" : "#fff",
    color: selected ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 600,
    textAlign: "left",
    transition: "all 0.15s ease",
    boxShadow: selected ? "0 0 0 2px rgba(0,0,0,0.08)" : "none",
  };
}

function getLanguageCode(item: unknown): string | null {
  if (!isRecord(item)) return null;

  const candidates = [item.code, item.value, item.locale, item.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return null;
}

function getLanguageLabel(item: unknown, fallback: string): string {
  if (!isRecord(item)) return fallback;

  const candidates = [item.label, item.name, item.nativeLabel, item.nativeName, item.title];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return fallback;
}

async function generateLesson(args: {
  topic: string;
  level: string;
  length: LengthKey;
  language: ContentLanguage;
}): Promise<GeneratedLesson> {
  const res = await fetch("/api/generate-lesson", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...args,
      closedOnly: true,
    }),
  });

  const raw = await res.text();

  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("API returned invalid JSON");
  }

  if (!res.ok) {
    if (isRecord(data) && typeof data.error === "string") {
      throw new Error(data.error);
    }
    throw new Error(`Generate API error (${res.status})`);
  }

  if (!isRecord(data)) {
    console.error("Unexpected lesson payload:", data);
    throw new Error("API returned unexpected lesson format");
  }

  const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];

  const tasks = rawTasks
    .map((task, index) => {
      if (!isRecord(task)) return null;

      const type: TaskType | null =
        task.type === "mcq" ? "mcq" : task.type === "truefalse" ? "truefalse" : null;

      if (!type) return null;

      const prompt =
        typeof task.prompt === "string"
          ? task.prompt
          : typeof task.question === "string"
            ? task.question
            : "";

      if (!prompt.trim()) return null;

      const options =
        type === "mcq"
          ? (Array.isArray(task.options) ? task.options : Array.isArray(task.choices) ? task.choices : [])
              .filter((x): x is string => typeof x === "string")
          : undefined;

      const taskObj: GenTask = {
        id: typeof task.id === "string" ? task.id : `task-${index + 1}`,
        type,
        prompt,
        options,
        correctAnswer:
          typeof task.correctAnswer === "string" ||
          typeof task.correctAnswer === "boolean" ||
          typeof task.correctAnswer === "number"
            ? task.correctAnswer
            : typeof task.answer === "string" ||
                typeof task.answer === "boolean" ||
                typeof task.answer === "number"
              ? task.answer
              : "",
        explanation: typeof task.explanation === "string" ? task.explanation : undefined,
      };

      return taskObj;
    })
    .filter((task) => task !== null) as GenTask[];

  const lesson: GeneratedLesson = {
    title: typeof data.title === "string" ? data.title : args.topic,
    level: typeof data.level === "string" ? data.level : args.level,
    topic: typeof data.topic === "string" ? data.topic : args.topic,
    language: typeof data.language === "string" ? data.language : args.language,
    sourceText:
      typeof data.sourceText === "string"
        ? data.sourceText
        : typeof data.text === "string"
          ? data.text
          : "",
    tasks,
  };

  if (!lesson.sourceText.trim() || lesson.tasks.length === 0) {
    console.error("Unexpected lesson payload:", data);
    throw new Error("API returned unexpected lesson format");
  }

  return lesson;
}

export default function ToolsGeneratorPage() {
  const t = useTranslations("textGeneratorFree");
  const locale = useLocale();

  const languageOptions = useMemo(() => {
    const items = Array.isArray(LANGUAGES) ? LANGUAGES : [];
    const mapped = items
      .map((item) => {
        const code = getLanguageCode(item);
        if (!code) return null;
        return {
          code,
          label: getLanguageLabel(item, code),
        };
      })
      .filter((item): item is { code: string; label: string } => item !== null);

    return mapped.length ? mapped : [{ code: "en", label: "English" }];
  }, []);

  const defaultLanguage = useMemo(() => {
    const found = languageOptions.find((l) => l.code === locale);
    return found?.code || languageOptions[0]?.code || "en";
  }, [languageOptions, locale]);

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("A2");
  const [length, setLength] = useState<LengthKey>("normal");
  const [language, setLanguage] = useState<ContentLanguage>(defaultLanguage);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<GeneratedLesson | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const canGenerate = useMemo(() => topic.trim().length > 0, [topic]);

  async function onGenerate() {
    setErr(null);
    setBusy(true);
    setDraft(null);
    setAnswers({});
    setChecked(false);

    try {
      const out = await generateLesson({ topic, level, length, language });
      setDraft(out);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || t("errors.generateFailed"));
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(taskId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  const score = draft
    ? draft.tasks.reduce((sum, task) => sum + (isCorrectAnswer(task, answers[task.id] || "") ? 1 : 0), 0)
    : 0;

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>{t("title")}</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>{t("subtitle")}</p>

      <hr style={{ margin: "10px 0 14px" }} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>{t("fields.topic")}</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px", width: 260 }}
            placeholder={t("placeholders.topic")}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>{t("fields.level")}</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>{t("fields.length")}</span>
          <select
            value={length}
            onChange={(e) => setLength(isLengthKey(e.target.value) ? e.target.value : "normal")}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="short">{t("length.short")}</option>
            <option value="normal">{t("length.normal")}</option>
            <option value="long">{t("length.long")}</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>{t("fields.language")}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px", minWidth: 160 }}
          >
            {languageOptions.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || !canGenerate}
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            background: "white",
            cursor: "pointer",
            opacity: busy || !canGenerate ? 0.6 : 1,
            fontWeight: 700,
          }}
        >
          {busy ? t("actions.generating") : t("actions.generate")}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      {draft && (
        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{draft.title}</div>
          <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
            {t("meta.level")}: {draft.level} • {t("meta.topic")}: {draft.topic} • {t("meta.language")}: {draft.language}
          </div>

          <div style={{ height: 16 }} />

          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("sections.text")}</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{draft.sourceText}</div>

          <div style={{ height: 20 }} />

          <div style={{ fontWeight: 700, marginBottom: 10 }}>{t("sections.tasks")}</div>

          <div style={{ display: "grid", gap: 12 }}>
            {draft.tasks.map((task, index) => {
              const userAnswer = answers[task.id] || "";
              const correct = checked ? isCorrectAnswer(task, userAnswer) : null;

              return (
                <div
                  key={task.id}
                  style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {t("taskLabel", { number: index + 1 })}{" "}
                    <span style={{ opacity: 0.6 }}>
                      ({task.type === "mcq" ? t("taskTypes.mcq") : t("taskTypes.truefalse")})
                    </span>
                  </div>

                  <div style={{ marginBottom: 12 }}>{task.prompt}</div>

                  {task.type === "mcq" && Array.isArray(task.options) && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {task.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAnswer(task.id, option)}
                          style={optionButtonStyle(userAnswer === option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  {task.type === "truefalse" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setAnswer(task.id, "true")}
                        style={optionButtonStyle(userAnswer === "true")}
                      >
                        {t("answers.true")}
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnswer(task.id, "false")}
                        style={optionButtonStyle(userAnswer === "false")}
                      >
                        {t("answers.false")}
                      </button>
                    </div>
                  )}

                  {checked && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: correct ? "#f3fff5" : "#fff5f5",
                        border: `1px solid ${correct ? "#cfe9d4" : "#f0caca"}`,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {correct ? t("results.correct") : t("results.incorrect")}
                      </div>

                      {!correct && (
                        <div style={{ marginTop: 4, opacity: 0.85 }}>
                          {t("results.correctAnswer")}: {String(task.correctAnswer)}
                        </div>
                      )}

                      {task.explanation && (
                        <div style={{ marginTop: 4, opacity: 0.85 }}>{task.explanation}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setChecked(true)}
              style={{
                border: "1px solid #111",
                borderRadius: 10,
                padding: "8px 12px",
                background: "#111",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {t("actions.checkAnswers")}
            </button>

            {checked && (
              <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 700 }}>
                {t("results.score", { score, total: draft.tasks.length })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}