"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { LANGUAGES } from "@/lib/languages";
import { getBucketLimit, getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";

type QuestionType = "multiple_choice" | "true_false";
type QuestionMode = "mixed" | "multiple_choice" | "true_false";
type SourceChoice = "new" | "paste" | "content";

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
  questionMode?: QuestionMode;
  questions: QuizQuestion[];
};

type GenerationQuota = {
  used: number;
  limit: number;
  remaining: number;
};

type SourceContentOption = {
  id: string;
  title: string;
  text: string;
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
    questionMode: data.questionMode === "multiple_choice" || data.questionMode === "true_false" || data.questionMode === "mixed" ? data.questionMode : "mixed",
    questions,
  };
}

function normalizeQuota(data: unknown): GenerationQuota | null {
  if (!isRecord(data)) return null;
  const quota = isRecord(data.quota) ? data.quota : data;
  const used = typeof quota.used === "number" ? quota.used : null;
  const limit = typeof quota.limit === "number" ? quota.limit : null;
  const remaining = typeof quota.remaining === "number" ? quota.remaining : null;
  if (used === null || limit === null || remaining === null) return null;
  return { used, limit, remaining };
}

function safeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "teacher";
}

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

async function generateQuiz(args: {
  sourceMode: string;
  topic: string;
  sourceText: string;
  language: string;
  level: string;
  focus: string;
  questionMode: QuestionMode;
  count: number;
  seconds: number;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Du må være logget inn for å generere quiz.");
  const token = await user.getIdToken();
  const res = await fetch("/api/tools/quiz-generator", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
  return { quiz: normalizeQuiz(data), quota: normalizeQuota(data) };
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

export default function QuizGeneratorPage() {
  const t = useTranslations("quizGenerator");
  const locale = useLocale();
  const router = useRouter();
  const { profile } = useUserProfile();

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
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("new");
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState("A2");
  const [focus, setFocus] = useState("language");
  const [questionMode, setQuestionMode] = useState<QuestionMode>("mixed");
  const [count, setCount] = useState(6);
  const seconds = 30;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [contentItems, setContentItems] = useState<SourceContentOption[]>([]);
  const [selectedContentId, setSelectedContentId] = useState("");
  const [contentBusy, setContentBusy] = useState(false);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [generationQuota, setGenerationQuota] = useState<GenerationQuota | null>(null);
  const { usage, loading: usageLoading, reload: reloadUsage } = useUsage(uid ?? undefined);

  const role = safeRole((profile as { role?: string } | null)?.role);
  const profileForPlan = profile as {
    plan?: string;
    schoolId?: string | null;
    schoolRole?: string | null;
    schoolStatus?: string | null;
  } | null;
  const plan = getEffectivePlan({
    plan: safePlan(profileForPlan?.plan),
    schoolId: profileForPlan?.schoolId ?? null,
    schoolRole: profileForPlan?.schoolRole ?? null,
    schoolStatus: profileForPlan?.schoolStatus ?? null,
  });
  const generatorsUsed = generationQuota?.used ?? usage.premium_generators ?? 0;
  const generatorsLimit = generationQuota?.limit ?? getBucketLimit(role, plan, "premium_generators");
  const generatorsRemaining = generationQuota?.remaining ?? Math.max(0, generatorsLimit - generatorsUsed);

  useEffect(() => {
    void loadContentOptions();
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
  }, []);

  function selectSourceChoice(next: SourceChoice) {
    setSourceChoice(next);
    setSourceMode(next === "new" ? "topic" : "text");
    if (next === "content" && selectedContentId) {
      const item = contentItems.find((candidate) => candidate.id === selectedContentId);
      if (item) {
        setTopic(item.title);
        setSourceText(item.text);
      }
    }
  }

  async function onGenerate() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      const next = await generateQuiz({ sourceMode, topic, sourceText, language, level, focus, questionMode, count, seconds });
      setQuiz(next.quiz);
      if (next.quota) setGenerationQuota(next.quota);
      void reloadUsage();
      setSaveMessage(null);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadContentOptions() {
    const user = auth.currentUser;
    if (!user) return;
    setContentBusy(true);
    try {
      const q = query(collection(db, "lessons"), where("ownerId", "==", user.uid), orderBy("updatedAt", "desc"), limit(30));
      const snap = await getDocs(q);
      const next = snap.docs
        .map((item) => {
          const data = item.data() as { title?: unknown; sourceText?: unknown; text?: unknown; description?: unknown };
          const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Uten tittel";
          const text =
            typeof data.sourceText === "string" && data.sourceText.trim()
              ? data.sourceText.trim()
              : typeof data.text === "string" && data.text.trim()
                ? data.text.trim()
                : typeof data.description === "string" && data.description.trim()
                  ? data.description.trim()
                  : "";
          return text ? { id: item.id, title, text } : null;
        })
        .filter((item): item is SourceContentOption => item !== null);
      setContentItems(next);
      setSelectedContentId((current) => current || next[0]?.id || "");
    } catch {
      setContentItems([]);
    } finally {
      setContentBusy(false);
    }
  }

  function applyContentSource(id: string) {
    setSelectedContentId(id);
    const item = contentItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setTopic(item.title);
    setSourceText(item.text);
    setSourceMode("text");
    setSourceChoice("content");
  }

  async function continueToEditor() {
    if (!quiz) return;
    setSaveBusy(true);
    setSaveMessage(null);
    try {
      const res = await authedFetch("/api/producer/save-quiz", {
        method: "POST",
        body: JSON.stringify({
          ...quiz,
          requireCover: false,
          coverImageUrl: "",
          coverImagePrompt: quiz.title ? `Illustrasjon til en quiz om ${quiz.title}. Klasseromsvennlig, tydelig, 16:9.` : "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: unknown; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke opprette quizutkast.");
      if (typeof data.id !== "string") throw new Error("Quizutkastet mangler id.");
      router.push(`/${locale}/producer/quiz/${data.id}`);
    } catch (e: unknown) {
      setSaveMessage(getErrorMessage(e));
    } finally {
      setSaveBusy(false);
    }
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

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">{t("steps.source.kicker")}</div>
            <div className="mt-2 text-lg font-black text-slate-950">{t("steps.source.title")}</div>
            <p className="mt-1 text-sm text-slate-600">{t("steps.source.text")}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${quiz ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{t("steps.quiz.kicker")}</div>
            <div className="mt-2 text-lg font-black text-slate-950">{t("steps.quiz.title")}</div>
            <p className="mt-1 text-sm text-slate-600">{quiz ? t("steps.quiz.ready") : t("steps.quiz.text")}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${quiz ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{t("steps.finish.kicker")}</div>
            <div className="mt-2 text-lg font-black text-slate-950">{t("steps.finish.title")}</div>
            <p className="mt-1 text-sm text-slate-600">{quiz ? t("steps.finish.ready") : t("steps.finish.text")}</p>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-800">1</div>
          <div>
            <h2 className="text-xl font-black text-slate-950">{t("source.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t("source.text")}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(["new", "paste", "content"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => selectSourceChoice(mode)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                sourceChoice === mode ? "border-violet-300 bg-violet-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-black text-slate-950">{t(`sourceChoices.${mode}.title`)}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{t(`sourceChoices.${mode}.text`)}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{t("fields.language")}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {languageOptions.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{t("fields.level")}</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {["A1", "A2", "B1", "B2", "C1"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{t("fields.focus")}</span>
            <select value={focus} onChange={(e) => setFocus(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              <option value="language">{t("focus.language")}</option>
              <option value="math">{t("focus.math")}</option>
              <option value="science">{t("focus.science")}</option>
              <option value="social_studies">{t("focus.social_studies")}</option>
              <option value="english">{t("focus.english")}</option>
              <option value="work_life">{t("focus.work_life")}</option>
              <option value="citizenship">{t("focus.citizenship")}</option>
              <option value="culture">{t("focus.culture")}</option>
              <option value="health">{t("focus.health")}</option>
              <option value="sports">{t("focus.sports")}</option>
              <option value="food">{t("focus.food")}</option>
              <option value="wildlife">{t("focus.wildlife")}</option>
              <option value="other">{t("focus.other")}</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          {sourceChoice === "new" ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">{t("fields.topic")}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{t("fields.topicHelp")}</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500"
                placeholder={t("placeholders.topic")}
              />
            </label>
          ) : sourceChoice === "paste" ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">{t("fields.sourceText")}</span>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="mt-2 min-h-[190px] w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-violet-500"
                placeholder={t("placeholders.sourceText")}
              />
            </label>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{t("source.pickContent")}</span>
                  <button type="button" onClick={loadContentOptions} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
                    {contentBusy ? t("source.loading") : t("source.refresh")}
                  </button>
                </div>
                <select
                  value={selectedContentId}
                  onChange={(e) => applyContentSource(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  {contentItems.length === 0 ? (
                    <option value="">{t("source.noContent")}</option>
                  ) : (
                    contentItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)
                  )}
                </select>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t("source.contentText")}</span>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  className="mt-2 min-h-[190px] w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-violet-500"
                  placeholder={t("placeholders.sourceText")}
                />
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-800">2</div>
          <div>
            <h2 className="text-xl font-black text-slate-950">{t("settings.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t("settings.text")}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{t("fields.questionMode")}</span>
            <select value={questionMode} onChange={(e) => setQuestionMode(e.target.value as QuestionMode)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              <option value="mixed">{t("questionModes.mixed")}</option>
              <option value="multiple_choice">{t("questionModes.multiple_choice")}</option>
              <option value="true_false">{t("questionModes.true_false")}</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{t("fields.count")}</span>
            <input type="number" min={3} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm" />
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="self-end inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {busy ? t("actions.generating") : t("actions.generate")}
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
          AI-generering: {usageLoading ? "laster..." : `${generatorsUsed} / ${generatorsLimit} brukt · ${generatorsRemaining} igjen`}
        </div>

        {err ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{err}</div> : null}
      </section>

      <section className="mt-5 min-h-[520px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-800">3</div>
          <div>
            <h2 className="text-xl font-black text-slate-950">{t("editor.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t("editor.text")}</p>
          </div>
        </div>
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
              {saveMessage ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{saveMessage}</div> : null}

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

              <div className="sticky bottom-3 mt-6 rounded-2xl border border-violet-200 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">{t("finish.kicker")}</div>
                    <h3 className="mt-1 text-lg font-black text-slate-950">{t("finish.title")}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t("finish.text")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={continueToEditor}
                    disabled={saveBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    <Check className="h-4 w-4" />
                    {saveBusy ? t("actions.saving") : t("actions.continueToEditor")}
                  </button>
                </div>
              </div>
            </div>
          )}
      </section>
    </main>
  );
}
