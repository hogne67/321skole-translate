"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";

type QuestionType = "multiple_choice" | "true_false";

type QuizQuestion = {
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
};

type QuizResult = {
  title: string;
  description: string;
  level: string;
  language: string;
  sourceMode: string;
  topic: string;
  sourceText: string;
  focus: string;
  questions: QuizQuestion[];
};

type SavedQuiz = {
  id: string;
  title: string;
  description: string;
  level: string;
  language: string;
  questionsCount: number;
  quiz: QuizResult | null;
};

type SpaceOption = {
  id: string;
  title: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getLanguageCode(item: unknown): string | null {
  if (!isRecord(item)) return null;
  for (const candidate of [item.code, item.value, item.locale, item.id]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function getLanguageLabel(item: unknown, fallback: string): string {
  if (!isRecord(item)) return fallback;
  for (const candidate of [item.label, item.name, item.nativeLabel, item.nativeName, item.title]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (isRecord(e) && typeof e.error === "string") return e.error;
  return "Unknown error";
}

function normalizeQuiz(data: unknown): QuizResult {
  if (!isRecord(data)) throw new Error("Unexpected response format");
  const questions = Array.isArray(data.questions)
    ? data.questions
        .map((item): QuizQuestion | null => {
          if (!isRecord(item)) return null;
          const type: QuestionType = item.type === "true_false" ? "true_false" : "multiple_choice";
          const question = typeof item.question === "string" ? item.question : "";
          const options = Array.isArray(item.options)
            ? item.options.filter((option): option is string => typeof option === "string")
            : [];
          const correctIndex = typeof item.correctIndex === "number" ? item.correctIndex : 0;
          const explanation = typeof item.explanation === "string" ? item.explanation : "";
          const seconds = typeof item.seconds === "number" ? item.seconds : 30;
          if (!question || options.length < 2) return null;
          return { type, question, options, correctIndex, explanation, seconds };
        })
        .filter((item): item is QuizQuestion => item !== null)
    : [];

  if (!questions.length) throw new Error("Missing questions in response");

  return {
    title: typeof data.title === "string" ? data.title : "321 quiz",
    description: typeof data.description === "string" ? data.description : "",
    level: typeof data.level === "string" ? data.level : "",
    language: typeof data.language === "string" ? data.language : "",
    sourceMode: typeof data.sourceMode === "string" ? data.sourceMode : "topic",
    topic: typeof data.topic === "string" ? data.topic : "",
    sourceText: typeof data.sourceText === "string" ? data.sourceText : "",
    focus: typeof data.focus === "string" ? data.focus : "",
    questions,
  };
}

async function generateQuiz(args: {
  sourceMode: string;
  topic: string;
  sourceText: string;
  language: string;
  level: string;
  focus: string;
  count: number;
  seconds: number;
}) {
  const res = await fetch("/api/tools/quiz-generator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`API returned non-JSON response: ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    if (isRecord(data) && typeof data.error === "string") throw new Error(data.error);
    throw new Error(`Request failed (${res.status})`);
  }
  return normalizeQuiz(data);
}

async function authedFetch(path: string, init?: RequestInit) {
  const user = auth.currentUser;
  if (!user) throw new Error("Du må være logget inn for å lagre quiz.");
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

function formatQuizForClipboard(quiz: QuizResult) {
  const lines = [`${quiz.title}`, quiz.description, "", ...quiz.questions.flatMap((q, index) => {
    const answer = q.options[q.correctIndex] ?? "";
    return [
      `${index + 1}. ${q.question}`,
      ...q.options.map((option, optionIndex) => `   ${String.fromCharCode(65 + optionIndex)}. ${option}`),
      `   Riktig svar: ${answer}`,
      q.explanation ? `   Forklaring: ${q.explanation}` : "",
      "",
    ].filter(Boolean);
  })];
  return lines.filter((line, index) => line || lines[index - 1]).join("\n");
}

function newSessionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function QuizGeneratorPage() {
  const t = useTranslations("quizGenerator");
  const locale = useLocale();

  const languageOptions = useMemo(() => {
    const mapped = (Array.isArray(LANGUAGES) ? LANGUAGES : [])
      .map((item) => {
        const code = getLanguageCode(item);
        return code ? { code, label: getLanguageLabel(item, code) } : null;
      })
      .filter((item): item is { code: string; label: string } => item !== null);
    return mapped.length ? mapped : [{ code: "nb", label: "Norsk" }];
  }, []);

  const defaultLanguage = useMemo(() => {
    return languageOptions.find((item) => item.code === locale)?.code || (locale === "no" ? "nb" : languageOptions[0]?.code || "nb");
  }, [languageOptions, locale]);

  const [sourceMode, setSourceMode] = useState<"topic" | "text">("topic");
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState("A2");
  const [focus, setFocus] = useState("understanding");
  const [count, setCount] = useState(6);
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [library, setLibrary] = useState<SavedQuiz[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadLibrary();
    void loadSpaces();
  }, []);

  async function onGenerate() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      const next = await generateQuiz({ sourceMode, topic, sourceText, language, level, focus, count, seconds });
      setQuiz(next);
      setSavedQuizId(null);
      setSaveMessage(null);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadLibrary() {
    setLibraryBusy(true);
    try {
      const res = await authedFetch("/api/tools/quizzes", { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke hente quizer.");
      const items = isRecord(data) && Array.isArray(data.quizzes) ? data.quizzes : [];
      setLibrary(items.filter((item): item is SavedQuiz => isRecord(item) && typeof item.id === "string") as SavedQuiz[]);
    } catch {
      setLibrary([]);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function loadSpaces() {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const next = snap.docs.map((item) => {
      const data = item.data() as { title?: unknown; name?: unknown };
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : typeof data.name === "string" && data.name.trim() ? data.name.trim() : item.id;
      return { id: item.id, title };
    });
    setSpaces(next);
    setSelectedSpaceId((current) => current || next[0]?.id || "");
  }

  async function saveQuiz() {
    if (!quiz) return;
    setSaveBusy(true);
    setSaveMessage(null);
    try {
      const res = await authedFetch("/api/tools/quizzes", {
        method: "POST",
        body: JSON.stringify({ id: savedQuizId, quiz }),
      });
      const data = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Kunne ikke lagre quiz.");
      const id = isRecord(data) && typeof data.id === "string" ? data.id : null;
      if (id) setSavedQuizId(id);
      setSaveMessage(t("actions.saved"));
      await loadLibrary();
    } catch (e: unknown) {
      setSaveMessage(getErrorMessage(e));
    } finally {
      setSaveBusy(false);
    }
  }

  async function sendQuizToBoard() {
    if (!quiz || !selectedSpaceId) return;
    setSendBusy(true);
    setSendMessage(null);
    try {
      const startedAt = Date.now();
      const ref = doc(db, "spaces", selectedSpaceId, "board", "state");
      await setDoc(
        ref,
        {
          active: true,
          sessionId: newSessionId(),
          mode: "quiz",
          endsAt: null,
          timerStartedAt: null,
          timerTotalSec: null,
          timerVisible: false,
          clearedAt: null,
          data: {
            quizTitle: quiz.title,
            quizDescription: quiz.description,
            quizQuestions: quiz.questions,
            quizCurrentIndex: 0,
            quizShowAnswer: false,
            quizFinished: false,
            quizQuestionStartedAtByIndex: { 0: startedAt },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSendMessage(t("actions.sentToBoard"));
    } catch (e: unknown) {
      setSendMessage(getErrorMessage(e));
    } finally {
      setSendBusy(false);
    }
  }

  function openSavedQuiz(item: SavedQuiz) {
    if (!item.quiz) return;
    setQuiz(item.quiz);
    setSavedQuizId(item.id);
    setSaveMessage(null);
    setCopied(false);
  }

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setQuiz((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
      };
    });
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuiz((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.map((q, i) =>
          i === questionIndex
            ? { ...q, options: q.options.map((option, oi) => (oi === optionIndex ? value : option)) }
            : q
        ),
      };
    });
  }

  function removeQuestion(index: number) {
    setQuiz((current) => current ? { ...current, questions: current.questions.filter((_, i) => i !== index) } : current);
  }

  function addQuestion() {
    setQuiz((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: [
          ...current.questions,
          {
            type: "multiple_choice",
            question: "",
            options: ["", "", ""],
            correctIndex: 0,
            explanation: "",
            seconds,
          },
        ],
      };
    });
  }

  async function copyQuiz() {
    if (!quiz) return;
    await navigator.clipboard.writeText(formatQuizForClipboard(quiz));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-6 shadow-sm">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">321 Quiz Studio</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{t("title")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("subtitle")}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex rounded-xl border border-slate-300 bg-slate-50 p-1">
            {(["topic", "text"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSourceMode(mode)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${sourceMode === mode ? "bg-slate-950 text-white" : "text-slate-700"}`}
              >
                {t(`sourceModes.${mode}`)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {sourceMode === "topic" ? (
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.topic")}</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
                  placeholder={t("placeholders.topic")}
                />
              </label>
            ) : (
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.sourceText")}</span>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  className="mt-2 min-h-[180px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-violet-500"
                  placeholder={t("placeholders.sourceText")}
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.language")}</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  {languageOptions.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.level")}</span>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  {["A1", "A2", "B1", "B2", "C1"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">{t("fields.focus")}</span>
              <select value={focus} onChange={(e) => setFocus(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="understanding">{t("focus.understanding")}</option>
                <option value="vocabulary">{t("focus.vocabulary")}</option>
                <option value="discussion">{t("focus.discussion")}</option>
                <option value="exam">{t("focus.exam")}</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.count")}</span>
                <input type="number" min={3} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("fields.seconds")}</span>
                <input type="number" min={10} max={120} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {busy ? t("actions.generating") : t("actions.generate")}
            </button>

            {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{err}</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950">{t("library.title")}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t("library.subtitle")}</p>
            </div>
            <button type="button" onClick={loadLibrary} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
              {libraryBusy ? t("library.loading") : t("library.refresh")}
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {library.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">{t("library.empty")}</div>
            ) : (
              library.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSavedQuiz(item)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-violet-200 hover:bg-violet-50"
                >
                  <div className="font-bold text-slate-950">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t("library.meta", { count: item.questionsCount, level: item.level || "-" })}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        </div>

        <div className="min-h-[520px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!quiz ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <div className="max-w-sm px-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-xl font-black text-slate-950">{t("empty.title")}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{t("empty.text")}</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0 flex-1">
                  <input
                    value={quiz.title}
                    onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
                    className="w-full rounded-lg border border-transparent px-2 py-1 text-2xl font-black text-slate-950 outline-none hover:border-slate-200 focus:border-violet-400"
                  />
                  <textarea
                    value={quiz.description}
                    onChange={(e) => setQuiz({ ...quiz, description: e.target.value })}
                    className="mt-2 min-h-[54px] w-full rounded-lg border border-transparent px-2 py-1 text-sm leading-6 text-slate-600 outline-none hover:border-slate-200 focus:border-violet-400"
                    placeholder={t("placeholders.description")}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveQuiz} disabled={saveBusy} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
                    <Check className="h-4 w-4" />
                    {saveBusy ? t("actions.saving") : t("actions.save")}
                  </button>
                  <select value={selectedSpaceId} onChange={(e) => setSelectedSpaceId(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold">
                    {spaces.length === 0 ? <option value="">{t("actions.noSpaces")}</option> : spaces.map((space) => <option key={space.id} value={space.id}>{space.title}</option>)}
                  </select>
                  <button type="button" onClick={sendQuizToBoard} disabled={sendBusy || !selectedSpaceId} className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-black disabled:opacity-60">
                    <Sparkles className="h-4 w-4" />
                    {sendBusy ? t("actions.sendingToBoard") : t("actions.sendToBoard")}
                  </button>
                  <button type="button" onClick={copyQuiz} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50">
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? t("actions.copied") : t("actions.copy")}
                  </button>
                  <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-60">
                    <RotateCcw className="h-4 w-4" />
                    {t("actions.regenerate")}
                  </button>
                </div>
              </div>
              {saveMessage || sendMessage ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{sendMessage ?? saveMessage}</div> : null}

              <div className="mt-4 space-y-4">
                {quiz.questions.map((q, questionIndex) => (
                  <article key={questionIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-black text-slate-500">{t("questionLabel", { number: questionIndex + 1 })}</div>
                      <button type="button" onClick={() => removeQuestion(questionIndex)} className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-600" title={t("actions.remove")}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      value={q.question}
                      onChange={(e) => updateQuestion(questionIndex, { question: e.target.value })}
                      className="mt-2 min-h-[70px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-violet-500"
                    />
                    <div className="mt-3 grid gap-2">
                      {q.options.map((option, optionIndex) => (
                        <label key={optionIndex} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <input
                            type="radio"
                            name={`correct-${questionIndex}`}
                            checked={q.correctIndex === optionIndex}
                            onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })}
                          />
                          <input
                            value={option}
                            onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)}
                            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px]">
                      <textarea
                        value={q.explanation}
                        onChange={(e) => updateQuestion(questionIndex, { explanation: e.target.value })}
                        className="min-h-[58px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-violet-500"
                        placeholder={t("placeholders.explanation")}
                      />
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500">{t("fields.secondsShort")}</span>
                        <input
                          type="number"
                          min={10}
                          max={120}
                          value={q.seconds}
                          onChange={(e) => updateQuestion(questionIndex, { seconds: Number(e.target.value) })}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <button type="button" onClick={addQuestion} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("actions.addQuestion")}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
