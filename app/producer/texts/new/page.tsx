// app/producer/texts/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";

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
  correctAnswer?: any;
};

type LangOption = { code: string; name: string };

function newId() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(2, 6)
  );
}

// ===== Language list (extendable) =====
const LANGUAGES: LangOption[] = [
  { code: "af", name: "Afrikaans" },
  { code: "sq", name: "Albanian" },
  { code: "am", name: "Amharic" },
  { code: "ar", name: "Arabic" },
  { code: "hy", name: "Armenian" },
  { code: "az", name: "Azerbaijani" },
  { code: "eu", name: "Basque" },
  { code: "be", name: "Belarusian" },
  { code: "bn", name: "Bengali" },
  { code: "bs", name: "Bosnian" },
  { code: "bg", name: "Bulgarian" },
  { code: "ca", name: "Catalan" },
  { code: "ceb", name: "Cebuano" },
  { code: "zh", name: "Chinese" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "co", name: "Corsican" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "eo", name: "Esperanto" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "fy", name: "Frisian" },
  { code: "gl", name: "Galician" },
  { code: "ka", name: "Georgian" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "ht", name: "Haitian Creole" },
  { code: "ha", name: "Hausa" },
  { code: "haw", name: "Hawaiian" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hmn", name: "Hmong" },
  { code: "hu", name: "Hungarian" },
  { code: "is", name: "Icelandic" },
  { code: "ig", name: "Igbo" },
  { code: "id", name: "Indonesian" },
  { code: "ga", name: "Irish" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "jw", name: "Javanese" },
  { code: "kn", name: "Kannada" },
  { code: "kk", name: "Kazakh" },
  { code: "km", name: "Khmer" },
  { code: "ko", name: "Korean" },
  { code: "ku", name: "Kurdish" },
  { code: "ky", name: "Kyrgyz" },
  { code: "lo", name: "Lao" },
  { code: "la", name: "Latin" },
  { code: "lv", name: "Latvian" },
  { code: "lt", name: "Lithuanian" },
  { code: "lb", name: "Luxembourgish" },
  { code: "mk", name: "Macedonian" },
  { code: "mg", name: "Malagasy" },
  { code: "ms", name: "Malay" },
  { code: "ml", name: "Malayalam" },
  { code: "mt", name: "Maltese" },
  { code: "mi", name: "Maori" },
  { code: "mr", name: "Marathi" },
  { code: "mn", name: "Mongolian" },
  { code: "my", name: "Myanmar (Burmese)" },
  { code: "ne", name: "Nepali" },
  { code: "no", name: "Norwegian" },
  { code: "ny", name: "Nyanja (Chichewa)" },
  { code: "or", name: "Odia (Oriya)" },
  { code: "ps", name: "Pashto" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pa", name: "Punjabi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sm", name: "Samoan" },
  { code: "gd", name: "Scots Gaelic" },
  { code: "sr", name: "Serbian" },
  { code: "st", name: "Sesotho" },
  { code: "sn", name: "Shona" },
  { code: "sd", name: "Sindhi" },
  { code: "si", name: "Sinhala" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "so", name: "Somali" },
  { code: "es", name: "Spanish" },
  { code: "su", name: "Sundanese" },
  { code: "sw", name: "Swahili" },
  { code: "sv", name: "Swedish" },
  { code: "tl", name: "Tagalog (Filipino)" },
  { code: "tg", name: "Tajik" },
  { code: "ta", name: "Tamil" },
  { code: "tt", name: "Tatar" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "tk", name: "Turkmen" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "ug", name: "Uyghur" },
  { code: "uz", name: "Uzbek" },
  { code: "vi", name: "Vietnamese" },
  { code: "cy", name: "Welsh" },
  { code: "xh", name: "Xhosa" },
  { code: "yi", name: "Yiddish" },
  { code: "yo", name: "Yoruba" },
  { code: "zu", name: "Zulu" },
];

// ===== Text types =====
const TEXT_TYPE_PRESETS = [
  "Everyday story",
  "Factual",
  "Fiction",
  "Article",
  "Dialogue",
  "News",
  "Biography",
  "Letter / Email",
  "Opinion",
  "How-to / Instructions",
  "Other",
] as const;

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

  // ===== Producer inputs for AI generation =====
  const [level, setLevel] = useState<LevelKey>("A2");
  const [language, setLanguage] = useState("en");
  const [languageSearch, setLanguageSearch] = useState("");

  // This is now the full prompt/instructions
  const [prompt, setPrompt] = useState(
    "Moving to a New Country"
  );

  const [textTypePreset, setTextTypePreset] =
    useState<(typeof TEXT_TYPE_PRESETS)[number]>("Everyday story");
  const [textTypeOther, setTextTypeOther] = useState("");
  const textType = textTypePreset === "Other" ? textTypeOther || "Other" : textTypePreset;

  const [textLength, setTextLength] = useState<number>(LEVEL_DEFAULTS.A2.textLength);

  const [mcqCount, setMcqCount] = useState<number>(LEVEL_DEFAULTS.A2.mcq);
  const [trueFalseCount, setTrueFalseCount] = useState<number>(LEVEL_DEFAULTS.A2.trueFalse);
  const [factsCount, setFactsCount] = useState<number>(LEVEL_DEFAULTS.A2.facts);
  const [reflectionCount, setReflectionCount] = useState<number>(LEVEL_DEFAULTS.A2.reflection);

  // ===== Lesson Builder state (truth) =====
  const [title, setTitle] = useState<string>("New lesson");
  const [sourceText, setSourceText] = useState<string>("");
  const [lessonTasks, setLessonTasks] = useState<LessonTask[]>([]);

  // Optional: keep pack for debugging / tracing AI output
  const [pack, setPack] = useState<ContentPack | null>(null);

  // ===== UI state =====
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

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
    return LANGUAGES.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(q));
  }, [languageSearch]);

  function packToLessonTasks(p: ContentPack): LessonTask[] {
    const tasks: LessonTask[] = [];
    let order = 1;

    for (const t of p.tasks?.trueFalse ?? []) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "truefalse",
        prompt: t.statement,
        correctAnswer: t.answer ? "true" : "false",
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
        prompt: `Write a fact: ${f}`,
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
              prompt: "New multiple choice question",
              options: ["Option 1", "Option 2", "Option 3", "Option 4"],
              correctAnswer: "Option 1",
            }
          : type === "truefalse"
          ? {
              id: newId(),
              type: "truefalse",
              prompt: "New true/false statement",
              correctAnswer: "true",
            }
          : { id: newId(), type: "open", prompt: "New open question" },
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

  // Auto-grow textarea helper (no React type needed)
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setSavedId(null);

    try {
      const res = await fetch("/api/producer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          language,
          // keep API contract: "topic" = full prompt for now
          topic: prompt,
          textType,
          textLength,
          tasks: {
            mcq: mcqCount,
            trueFalse: trueFalseCount,
            facts: factsCount,
            reflection: reflectionCount,
          },
        }),
      });

      const raw = await res.text();
      if (!raw) {
        setError(`Empty response from server. HTTP ${res.status}`);
        setPack(null);
        return;
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        setError(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
        setPack(null);
        return;
      }

      if (!res.ok) {
        setError(`HTTP ${res.status}: ${data?.error ?? "Unknown error"}`);
        setPack(null);
        return;
      }

      if (!data?.contentPack) {
        setError(`Missing "contentPack" in response. First chars: ${raw.slice(0, 200)}`);
        setPack(null);
        return;
      }

      const cp = data.contentPack as ContentPack;
      setPack(cp);

      setTitle(cp.title || "New lesson");
      setSourceText(cp.text || "");
      setLessonTasks(packToLessonTasks(cp));
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPack(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveToFirestore() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      if (!title.trim()) throw new Error("Title is required.");
      if (!sourceText.trim()) throw new Error("Source text is empty.");

      await ensureAnonymousUser();
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error("No auth uid (anonymous auth not ready).");

      const docRef = await addDoc(collection(db, "lessons"), {
        ownerId: uid,
        status: "draft",
        title: title || "New lesson",
        level,

        // keep old field for compatibility + add "prompt" for clarity
        topic: prompt,
        prompt,

        language,
        estimatedMinutes: 20,
        releaseMode: "ALL_AT_ONCE",
        sourceText: sourceText || "",
        tasks: renumberOrders(lessonTasks),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "producer-texts-new",
      });

      setSavedId(docRef.id);
      router.push(`/producer/texts/${docRef.id}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, paddingBottom: 60 }}>
      <h1 style={{ marginBottom: 6 }}>Producer: Lesson Builder (new)</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Write the prompt → generate with AI → edit → save draft.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          Level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LevelKey)}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
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
          Choose lesson language
          <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
            <input
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              placeholder="Search language (e.g. Norwegian, ar, pt-BR...)"
              style={{ width: "100%", padding: 8 }}
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              {filteredLanguages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Showing {filteredLanguages.length} languages
            </div>
          </div>
        </label>

        {/* ✅ Full prompt / instructions */}
        <label style={{ gridColumn: "1 / -1" }}>
          Prompt / instructions
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              autoGrow(e.currentTarget);
            }}
            onInput={(e) => autoGrow(e.currentTarget as HTMLTextAreaElement)}
            placeholder={`What do you want to write about?

Include details about:
• content and purpose
• place and setting
• people/characters
• specific requirements (tone, style, vocabulary, grammar focus)
• anything else that matters`}
            rows={4}
            style={{
              width: "100%",
              padding: 8,
              marginTop: 6,
              resize: "vertical",
              minHeight: 90,
              lineHeight: 1.35,
              fontFamily: "inherit",
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Tip: This field is the main “prompt” that drives the AI generation.
          </div>
        </label>

        <label>
          Text type
          <select
            value={textTypePreset}
            onChange={(e) => setTextTypePreset(e.target.value as any)}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          >
            {TEXT_TYPE_PRESETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {textTypePreset === "Other" && (
            <input
              value={textTypeOther}
              onChange={(e) => setTextTypeOther(e.target.value)}
              placeholder="Describe the text type..."
              style={{ width: "100%", padding: 8, marginTop: 8 }}
            />
          )}
        </label>

        <label>
          Text length (words)
          <input
            type="number"
            value={textLength}
            onChange={(e) => setTextLength(Number(e.target.value))}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
            min={60}
            max={900}
          />
        </label>

        <div style={{ gridColumn: "1 / -1", padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <strong>AI Tasks (generator)</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
            <label>
              MCQ
              <input
                type="number"
                value={mcqCount}
                onChange={(e) => setMcqCount(Number(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                min={0}
                max={20}
              />
            </label>
            <label>
              True/False
              <input
                type="number"
                value={trueFalseCount}
                onChange={(e) => setTrueFalseCount(Number(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                min={0}
                max={30}
              />
            </label>
            <label>
              Facts
              <input
                type="number"
                value={factsCount}
                onChange={(e) => setFactsCount(Number(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                min={0}
                max={20}
              />
            </label>
            <label>
              Reflection
              <input
                type="number"
                value={reflectionCount}
                onChange={(e) => setReflectionCount(Number(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                min={0}
                max={20}
              />
            </label>
          </div>
        </div>

        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={generate} disabled={loading} style={{ padding: "10px 14px" }}>
            {loading ? "Generating..." : "Generate with AI"}
          </button>

          <button onClick={saveToFirestore} disabled={saving} style={{ padding: "10px 14px" }}>
            {saving ? "Saving..." : "Save draft lesson"}
          </button>

          {savedId && <span style={{ color: "green" }}>Saved! ID: {savedId}</span>}
          {error && <span style={{ color: "crimson" }}>{error}</span>}
        </div>
      </section>

      {/* Lesson builder + tasks editor + debug (unchanged) */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ marginBottom: 8 }}>Lesson builder</h2>

        <label style={{ display: "block" }}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          Text
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <div style={{ marginTop: 18, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Tasks editor</h3>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => addTask("mcq")} style={{ padding: "8px 10px" }}>
                + MCQ
              </button>
              <button onClick={() => addTask("truefalse")} style={{ padding: "8px 10px" }}>
                + True/False
              </button>
              <button onClick={() => addTask("open")} style={{ padding: "8px 10px" }}>
                + Open
              </button>
            </div>
          </div>

          {lessonTasks.length === 0 ? (
            <p style={{ opacity: 0.75, marginTop: 10 }}>No tasks yet. Add tasks or generate with AI.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {lessonTasks.map((t, idx) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <strong style={{ minWidth: 110 }}>
                        {idx + 1}. {t.type.toUpperCase()}
                      </strong>
                      <span style={{ opacity: 0.7, fontSize: 13 }}>id: {t.id}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => moveTask(idx, -1)} disabled={idx === 0} style={{ padding: "6px 10px" }}>
                        ↑
                      </button>
                      <button onClick={() => moveTask(idx, 1)} disabled={idx === lessonTasks.length - 1} style={{ padding: "6px 10px" }}>
                        ↓
                      </button>
                      <button onClick={() => deleteTask(idx)} style={{ padding: "6px 10px" }}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <label style={{ display: "block", marginTop: 10 }}>
                    Prompt
                    <input
                      value={t.prompt}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                      }}
                      style={{ width: "100%", padding: 8, marginTop: 6 }}
                    />
                  </label>

                  {t.type === "truefalse" && (
                    <label style={{ display: "block", marginTop: 10 }}>
                      Correct answer
                      <select
                        value={String(t.correctAnswer ?? "true")}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
                        }}
                        style={{ padding: 8, marginTop: 6 }}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    </label>
                  )}

                  {t.type === "mcq" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Options</div>

                      {(t.options ?? []).map((opt, oIdx) => (
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
                                  x.correctAnswer && opts.includes(x.correctAnswer)
                                    ? x.correctAnswer
                                    : opts[0] ?? "";

                                return { ...x, options: opts, correctAnswer: correct };
                              })
                            );
                          }}
                          style={{ width: "100%", padding: 8, marginTop: 8 }}
                        />
                      ))}

                      <label style={{ display: "block", marginTop: 10 }}>
                        Correct answer (must match one option)
                        <input
                          value={String(t.correctAnswer ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x)));
                          }}
                          style={{ width: "100%", padding: 8, marginTop: 6 }}
                        />
                      </label>
                    </div>
                  )}

                  {t.type === "open" && (
                    <p style={{ marginTop: 10, opacity: 0.75, marginBottom: 0 }}>
                      Open task: student writes a response.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {pack && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>Debug: latest AI contentPack</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#f7f7f7",
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
    </main>
  );
}
