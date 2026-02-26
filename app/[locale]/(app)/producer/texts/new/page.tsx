// app/(app)/producer/texts/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

type MCQ = {
  q: string;
  options: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
};
type TF = { statement: string; answer: boolean };

type ContentPack = {
  title: string;
  level: string;
  language: string;
  topic: string;
  text: string;
  tasks: {
    multipleChoice: MCQ[];
    trueFalse: TF[];
    writeFacts: string[];
    reflectionQuestions: string[];
  };
};

// LessonTask-formatet som Producer editor/preview bruker
type TaskType = "truefalse" | "mcq" | "open";
type LessonTask = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
};

type GenerateTextResp = { title?: string; text?: string; error?: string; raw?: string };
type GenerateTasksResp = { tasks?: ContentPack["tasks"]; error?: string; raw?: string };

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

// ===== Text types (keys) =====
const TEXT_TYPE_KEYS = [
  "everydayStory",
  "factual",
  "fiction",
  "article",
  "dialogue",
  "news",
  "biography",
  "letterEmail",
  "opinion",
  "howto",
  "other",
] as const;
type TextTypeKey = (typeof TEXT_TYPE_KEYS)[number];

// ===== Level defaults =====
type LevelKey = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const LEVEL_DEFAULTS: Record<
  LevelKey,
  { textLength: number; trueFalse: number; mcq: number; facts: number; reflection: number }
> = {
  A1: { textLength: 80, trueFalse: 3, mcq: 3, facts: 2, reflection: 1 },
  A2: { textLength: 140, trueFalse: 6, mcq: 4, facts: 3, reflection: 1 },
  B1: { textLength: 200, trueFalse: 8, mcq: 6, facts: 3, reflection: 2 },
  B2: { textLength: 260, trueFalse: 10, mcq: 6, facts: 6, reflection: 2 },
  C1: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
  C2: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
};

export default function NewTextPage() {
  const router = useRouter();
  const t = useTranslations("producer.newText");

  // ===== Inline UI styles (SAFE: no Tailwind dependency) =====
  const fieldStyle: CSSProperties = {
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
    background: "#ffffff",
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
    color: "#d8dce6",
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

  // Responsive: 2 columns on wide, 1 column on narrow
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ===== Producer inputs for AI generation =====
  const [level, setLevel] = useState<LevelKey>("A2");

  // Default: Bokmål
  const [language, setLanguage] = useState("nb");
  const [languageSearch, setLanguageSearch] = useState("");

  // Full prompt/instructions
  const [prompt, setPrompt] = useState(t("defaults.prompt"));

  const [textTypePreset, setTextTypePreset] = useState<TextTypeKey>("everydayStory");
  const [textTypeOther, setTextTypeOther] = useState("");

  // Hva vi faktisk sender til API (tekstverdi):
  const textTypeLabel = useMemo(() => {
    if (textTypePreset === "other")
      return (textTypeOther || t("textTypes.other")).trim() || t("textTypes.other");
    return t(`textTypes.${textTypePreset}`);
  }, [textTypePreset, textTypeOther, t]);

  const [textLength, setTextLength] = useState<number>(LEVEL_DEFAULTS.A2.textLength);

  const [mcqCount, setMcqCount] = useState<number>(LEVEL_DEFAULTS.A2.mcq);
  const [trueFalseCount, setTrueFalseCount] = useState<number>(LEVEL_DEFAULTS.A2.trueFalse);
  const [factsCount, setFactsCount] = useState<number>(LEVEL_DEFAULTS.A2.facts);
  const [reflectionCount, setReflectionCount] = useState<number>(LEVEL_DEFAULTS.A2.reflection);

  // ===== Lesson Builder state (truth) =====
  const [title, setTitle] = useState<string>(t("defaults.title"));
  const [sourceText, setSourceText] = useState<string>("");
  const [lessonTasks, setLessonTasks] = useState<LessonTask[]>([]);

  // Optional: keep pack for debugging / tracing AI output
  const [pack, setPack] = useState<ContentPack | null>(null);

  // ===== UI state =====
  const [loadingText, setLoadingText] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Track if text has changed after tasks were generated
  const [tasksDirty, setTasksDirty] = useState(false);

  const busy = loadingText || loadingTasks || saving;

  // Apply defaults when level changes
  useEffect(() => {
    const d = LEVEL_DEFAULTS[level];
    setTextLength(d.textLength);
    setTrueFalseCount(d.trueFalse);
    setMcqCount(d.mcq);
    setFactsCount(d.facts);
    setReflectionCount(d.reflection);
  }, [level]);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.trim().toLowerCase();
    if (!q) return LANGUAGES;

    return LANGUAGES.filter((l) => {
      const hay = `${l.label} ${l.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [languageSearch]);

  function packToLessonTasks(p: ContentPack): LessonTask[] {
    const tasks: LessonTask[] = [];
    let order = 1;

    for (const ttf of p.tasks?.trueFalse ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "truefalse",
        prompt: ttf.statement,
        correctAnswer: ttf.answer ? "true" : "false",
      });
    }

    for (const q of p.tasks?.multipleChoice ?? []) {
      const opts = (q.options ?? []).map((x) => String(x));
      const correct = opts[q.answerIndex] ?? opts[0] ?? "";
      tasks.push({
        id: newId(),
        order: order++,
        type: "mcq",
        prompt: q.q,
        options: opts,
        correctAnswer: correct,
      });
    }

    for (const f of p.tasks?.writeFacts ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "open",
        prompt: `${t("tasks.writeFactPrefix")} ${f}`,
      });
    }

    for (const rq of p.tasks?.reflectionQuestions ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "open",
        prompt: rq,
      });
    }

    return tasks;
  }

  function renumberOrders(tasks: LessonTask[]) {
    return tasks.map((t, idx) => ({ ...t, order: idx + 1 }));
  }

  function addTask(type: TaskType) {
    setLessonTasks((prev) => {
      const next: LessonTask[] = [
        ...prev,
        type === "mcq"
          ? {
              id: newId(),
              type: "mcq",
              prompt: t("tasks.defaults.mcqPrompt"),
              options: [
                t("tasks.defaults.option1"),
                t("tasks.defaults.option2"),
                t("tasks.defaults.option3"),
                t("tasks.defaults.option4"),
              ],
              correctAnswer: t("tasks.defaults.option1"),
            }
          : type === "truefalse"
          ? {
              id: newId(),
              type: "truefalse",
              prompt: t("tasks.defaults.tfPrompt"),
              correctAnswer: "true",
            }
          : { id: newId(), type: "open", prompt: t("tasks.defaults.openPrompt") },
      ];
      return renumberOrders(next);
    });
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

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // “Kjente” feilmeldinger (vi oversetter disse, ellers viser vi raw)
  function localizeError(message: string): string {
    const m = message || "";
    if (m === "Generate or write text first.") return t("errors.generateOrWriteTextFirst");
    if (m === "Missing text in response.") return t("errors.missingTextInResponse");
    if (m === "Title is required.") return t("errors.titleRequired");
    if (m === "Source text is empty.") return t("errors.sourceTextEmpty");
    if (m === "Not signed in. Please log in as teacher/producer.") return t("errors.notSignedIn");
    if (m.startsWith("Empty response from server.")) return t("errors.emptyResponseFromServer", { status: "" });
    if (m.startsWith("Not JSON.")) return t("errors.notJsonFromServer");
    return m;
  }

  async function generateTextOnly() {
    setLoadingText(true);
    setError(null);
    setSavedId(null);

    try {
      const res = await fetch("/api/producer/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          language,
          topic: prompt,
          textType: textTypeLabel,
          textLength,
        }),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateTextResp;
      try {
        data = JSON.parse(raw) as GenerateTextResp;
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const nextTitle = String(data.title || t("defaults.title")).trim() || t("defaults.title");
      const nextText = String(data.text || "").trim();
      if (!nextText) throw new Error("Missing text in response.");

      setTitle(nextTitle);
      setSourceText(nextText);

      // When text changes, tasks should be regenerated
      setLessonTasks([]);
      setPack(null);
      setTasksDirty(true);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingText(false);
    }
  }

  async function generateTasksOnly() {
    setLoadingTasks(true);
    setError(null);
    setSavedId(null);

    try {
      if (!sourceText.trim()) throw new Error("Generate or write text first.");

      const res = await fetch("/api/producer/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          language,
          topic: prompt,
          textType: textTypeLabel,
          text: sourceText,
          tasks: {
            mcq: mcqCount,
            trueFalse: trueFalseCount,
            facts: factsCount,
            reflection: reflectionCount,
          },
        }),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateTasksResp;
      try {
        data = JSON.parse(raw) as GenerateTasksResp;
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.tasks) throw new Error(t("errors.missingTasksInResponse"));

      const fakePack: ContentPack = {
        title: title || t("defaults.title"),
        level,
        language,
        topic: prompt,
        text: sourceText,
        tasks: data.tasks,
      };

      setLessonTasks(packToLessonTasks(fakePack));
      setPack(fakePack); // for debug panel
      setTasksDirty(false);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingTasks(false);
    }
  }

  async function saveToFirestore() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      if (!title.trim()) throw new Error("Title is required.");
      if (!sourceText.trim()) throw new Error("Source text is empty.");

      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in. Please log in as teacher/producer.");
      const uid = user.uid;

      const cleanTextType = String(textTypeLabel || "").trim().replace(/^"+|"+$/g, "").trim();

      const docRef = await addDoc(collection(db, "lessons"), {
        ownerId: uid,
        status: "draft",
        title: title || t("defaults.title"),
        level,

        topic: prompt,
        prompt,

        textType: cleanTextType,
        texttype: cleanTextType,

        language,
        estimatedMinutes: 20,
        releaseMode: "ALL_AT_ONCE",
        sourceText: sourceText || "",
        tasks: renumberOrders(lessonTasks),

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "producer-texts-new",

        deletedAt: null,
        activePublishedId: null,
      });

      setSavedId(docRef.id);

      // ✅ Redirect directly to Producer editor
      router.push(`/producer/${docRef.id}`);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 60px" }}>
      <div style={{ ...cardStyle, padding: 20 }}>
        <h1 style={{ marginBottom: 6, fontSize: 26, fontWeight: 800 }}>{t("title")}</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>{t("subtitle")}</p>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 12,
            marginTop: 14,
          }}
        >
          <label>
            {t("fields.level")}
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
                placeholder={t("fields.languageSearchPlaceholder")}
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
                {t("fields.languageCount", { count: filteredLanguages.length })}
              </div>
            </div>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            {t("fields.prompt")}
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                autoGrow(e.currentTarget);
              }}
              onInput={(e) => autoGrow(e.currentTarget as HTMLTextAreaElement)}
              rows={4}
              style={{
                ...fieldStyle,
                resize: "vertical",
                minHeight: 90,
                lineHeight: 1.35,
                fontFamily: "inherit",
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{t("fields.promptTip")}</div>
          </label>

          <label>
            {t("fields.textType")}
            <select
              value={textTypePreset}
              onChange={(e) => setTextTypePreset(e.target.value as TextTypeKey)}
              style={fieldStyle}
            >
              {TEXT_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`textTypes.${k}`)}
                </option>
              ))}
            </select>

            {textTypePreset === "other" && (
              <input
                value={textTypeOther}
                onChange={(e) => setTextTypeOther(e.target.value)}
                placeholder={t("fields.textTypeOtherPlaceholder")}
                style={{ ...fieldStyle, marginTop: 8 }}
              />
            )}
          </label>

          <label>
            {t("fields.textLength")}
            <input
              type="number"
              value={textLength}
              onChange={(e) => setTextLength(Number(e.target.value))}
              style={fieldStyle}
              min={60}
              max={900}
            />
          </label>

          <div style={{ gridColumn: "1 / -1", ...cardStyle }}>
            <strong>{t("tasks.generatorTitle")}</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 10,
                marginTop: 10,
              }}
            >
              <label>
                {t("tasks.mcq")}
                <input
                  type="number"
                  value={mcqCount}
                  onChange={(e) => setMcqCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={20}
                />
              </label>
              <label>
                {t("tasks.trueFalse")}
                <input
                  type="number"
                  value={trueFalseCount}
                  onChange={(e) => setTrueFalseCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={30}
                />
              </label>
              <label>
                {t("tasks.facts")}
                <input
                  type="number"
                  value={factsCount}
                  onChange={(e) => setFactsCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={20}
                />
              </label>
              <label>
                {t("tasks.reflection")}
                <input
                  type="number"
                  value={reflectionCount}
                  onChange={(e) => setReflectionCount(Number(e.target.value))}
                  style={fieldStyle}
                  min={0}
                  max={20}
                />
              </label>
            </div>
          </div>

          {/* ✅ ACTION BUTTONS: stack on mobile via CSS */}
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
              onClick={generateTextOnly}
              disabled={busy}
              style={{
                ...buttonPrimary,
                opacity: busy ? 0.7 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {loadingText ? t("buttons.generatingText") : t("buttons.step1")}
            </button>

            <button
              className="actionBtn"
              onClick={generateTasksOnly}
              disabled={busy || !sourceText.trim()}
              style={{
                ...buttonPrimary,
                opacity: busy || !sourceText.trim() ? 0.55 : 1,
                cursor: busy || !sourceText.trim() ? "not-allowed" : "pointer",
              }}
              title={!sourceText.trim() ? t("hints.generateTextFirst") : t("hints.generateTasks")}
            >
              {loadingTasks ? t("buttons.generatingTasks") : t("buttons.step2")}
            </button>

            <button
              className="actionBtn"
              onClick={saveToFirestore}
              disabled={busy}
              style={{
                ...buttonSecondary,
                opacity: busy ? 0.7 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
              title={tasksDirty ? t("hints.tasksDirty") : t("hints.saveDraft")}
            >
              {saving ? t("buttons.saving") : t("buttons.saveDraft")}
            </button>

            {tasksDirty && sourceText.trim() && (
              <span style={{ color: "#b45309", fontWeight: 700 }}>{t("warnings.checkTextBeforeTasks")}</span>
            )}

            {savedId && <span style={{ color: "green" }}>{t("status.saved", { id: savedId })}</span>}
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
            {t("builder.text")}
            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value);
                // if tasks already exist, editing text should mark them potentially outdated
                if (lessonTasks.length > 0) setTasksDirty(true);
              }}
              rows={10}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>

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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{t("editor.title")}</h3>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => addTask("mcq")} style={buttonSmall}>
                  {t("editor.addMcq")}
                </button>
                <button onClick={() => addTask("truefalse")} style={buttonSmall}>
                  {t("editor.addTf")}
                </button>
                <button onClick={() => addTask("open")} style={buttonSmall}>
                  {t("editor.addOpen")}
                </button>
              </div>
            </div>

            {lessonTasks.length === 0 ? (
              <p style={{ opacity: 0.75, marginTop: 10 }}>{t("editor.empty")}</p>
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
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <strong style={{ minWidth: 110 }}>
                          {idx + 1}. {task.type.toUpperCase()}
                        </strong>
                        <span style={{ opacity: 0.7, fontSize: 13 }}>{t("editor.taskId", { id: task.id })}</span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
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
                        <button onClick={() => deleteTask(idx)} style={buttonSmall}>
                          {t("editor.delete")}
                        </button>
                      </div>
                    </div>

                    <label style={{ display: "block", marginTop: 10 }}>
                      {t("editor.prompt")}
                      <input
                        value={task.prompt}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                        }}
                        style={fieldStyle}
                      />
                    </label>

                    {task.type === "truefalse" && (
                      <label style={{ display: "block", marginTop: 10 }}>
                        {t("editor.correctAnswer")}
                        <select
                          value={String(task.correctAnswer ?? "true")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
                          }}
                          style={fieldStyle}
                        >
                          <option value="true">{t("answers.true")}</option>
                          <option value="false">{t("answers.false")}</option>
                        </select>
                      </label>
                    )}

                    {task.type === "mcq" && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("editor.options")}</div>

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

                                  const correct =
                                    typeof x.correctAnswer === "string" && opts.includes(x.correctAnswer as string)
                                      ? (x.correctAnswer as string)
                                      : opts[0] ?? "";

                                  return { ...x, options: opts, correctAnswer: correct };
                                })
                              );
                            }}
                            style={{ ...fieldStyle, marginTop: 8 }}
                          />
                        ))}

                        <label style={{ display: "block", marginTop: 10 }}>
                          {t("editor.correctAnswerHint")}
                          <input
                            value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
                            }}
                            style={fieldStyle}
                          />
                        </label>
                      </div>
                    )}

                    {task.type === "open" && (
                      <p style={{ marginTop: 10, opacity: 0.75, marginBottom: 0 }}>{t("editor.openHint")}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {pack && (
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
                {JSON.stringify(pack, null, 2)}
              </pre>
            </details>
          )}
        </section>

        {/* ✅ Mobile stacking for action buttons */}
        <style jsx>{`
          @media (max-width: 560px) {
            .actionRow {
              flex-direction: column !important;
              align-items: stretch !important;
              flex-wrap: nowrap !important;
            }
            .actionBtn {
              width: 100% !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}