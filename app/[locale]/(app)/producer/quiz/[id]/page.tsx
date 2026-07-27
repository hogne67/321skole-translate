"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useLocale } from "next-intl";
import { db } from "@/lib/firebase";
import { getBucketLimit, getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";

type QuestionType = "multiple_choice" | "true_false";
type QuestionMode = "mixed" | "multiple_choice" | "true_false";
type CoverImageMode = "url" | "ai";
type CoverImageStyle = "illustration" | "realistic";
type CoverPromptMode = "custom" | "fromText";

type ImageUsage = {
  used: number;
  limit: number;
  remaining: number;
};

type QuizQuestion = {
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
};

type QuizDraft = {
  title: string;
  description: string;
  producerName: string;
  language: string;
  level: string;
  sourceMode: string;
  topic: string;
  tags: string[];
  sourceText: string;
  focus: string;
  questionMode: QuestionMode;
  coverImageUrl: string;
  coverImagePrompt: string;
  questions: QuizQuestion[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => safeString(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeUsage(value: unknown): ImageUsage | null {
  if (!isRecord(value)) return null;
  const used = typeof value.used === "number" ? value.used : null;
  const limit = typeof value.limit === "number" ? value.limit : null;
  const remaining = typeof value.remaining === "number" ? value.remaining : null;
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

const CATEGORY_OPTIONS = [
  ["language", "Språk og tekst"],
  ["math", "Matematikk"],
  ["science", "Naturfag"],
  ["social_studies", "Samfunnsfag"],
  ["english", "Engelsk"],
  ["work_life", "Arbeidsliv"],
  ["citizenship", "Demokrati og medborgerskap"],
  ["culture", "Kultur og samfunn"],
  ["health", "Helse og livsmestring"],
  ["sports", "Sport og idrett"],
  ["food", "Mat og drikke"],
  ["wildlife", "Dyreliv"],
  ["other", "Annet"],
] as const;

function normalizeQuestion(item: unknown): QuizQuestion | null {
  if (!isRecord(item)) return null;
  const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === "string") : [];
  const question = safeString(item.question || item.prompt).trim();
  if (!question || options.length < 2) return null;
  return {
    type: item.type === "true_false" || item.questionType === "true_false" ? "true_false" : "multiple_choice",
    question,
    options,
    correctIndex: typeof item.correctIndex === "number" ? item.correctIndex : 0,
    explanation: safeString(item.explanation),
    seconds: typeof item.seconds === "number" ? item.seconds : 30,
  };
}

function normalizeDraft(data: unknown): QuizDraft {
  const root = isRecord(data) ? data : {};
  const quiz = isRecord(root.quiz) ? root.quiz : {};
  const rawQuestions = Array.isArray(quiz.questions) ? quiz.questions : Array.isArray(root.tasks) ? root.tasks : [];
  const questionMode = quiz.questionMode === "multiple_choice" || quiz.questionMode === "true_false" || quiz.questionMode === "mixed" ? quiz.questionMode : "mixed";

  return {
    title: safeString(quiz.title || root.title, "321 quiz"),
    description: safeString(quiz.description || root.description),
    producerName: safeString(root.producerName),
    language: safeString(quiz.language || root.language, "nb"),
    level: safeString(quiz.level || root.level, "A2"),
    sourceMode: safeString(quiz.sourceMode || root.sourceMode, "topic"),
    topic: safeString(quiz.topic || root.topic),
    tags: safeStringArray(quiz.tags || root.tags),
    sourceText: safeString(quiz.sourceText || root.sourceText || root.text),
    focus: safeString(quiz.focus || root.focus, "language"),
    questionMode,
    coverImageUrl: safeString(root.coverImageUrl || root.imageUrl),
    coverImagePrompt: safeString(root.coverImagePrompt),
    questions: rawQuestions.map(normalizeQuestion).filter((item): item is QuizQuestion => item !== null),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Noe gikk galt.";
}

async function authedFetch(path: string, init?: RequestInit) {
  const user = getAuth().currentUser;
  if (!user || user.isAnonymous) throw new Error("Du må være logget inn.");
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

export default function QuizEditorPage() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { profile } = useUserProfile();

  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [uid, setUid] = useState<string | null>(getAuth().currentUser?.uid ?? null);
  const [imageUsage, setImageUsage] = useState<ImageUsage | null>(null);
  const [coverImageMode, setCoverImageMode] = useState<CoverImageMode>("ai");
  const [coverImageStyle, setCoverImageStyle] = useState<CoverImageStyle>("illustration");
  const [coverPromptMode, setCoverPromptMode] = useState<CoverPromptMode>("custom");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const imagesUsed = imageUsage?.used ?? usage.image_generation ?? 0;
  const imagesLimit = imageUsage?.limit ?? getBucketLimit(role, plan, "image_generation");
  const imagesRemaining = imageUsage?.remaining ?? Math.max(0, imagesLimit - imagesUsed);
  const imageLimitReached = !usageLoading && imagesLimit > 0 && imagesUsed >= imagesLimit;

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      if (!user || user.isAnonymous) {
        setUid(null);
        setError("Du må være logget inn.");
        setLoading(false);
        return;
      }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "lessons", id));
        if (!snap.exists()) throw new Error("Fant ikke quizen.");
        const data = snap.data() as Record<string, unknown>;
        if (data.ownerId !== user.uid && data.uid !== user.uid) throw new Error("Du har ikke tilgang til denne quizen.");
        setDraft(normalizeDraft(data));
      } catch (e: unknown) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [id]);

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setDraft((current) => current ? { ...current, questions: current.questions.map((q, i) => i === index ? { ...q, ...patch } : q) } : current);
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setDraft((current) => current ? {
      ...current,
      questions: current.questions.map((q, i) => i === questionIndex ? { ...q, options: q.options.map((option, oi) => oi === optionIndex ? value : option) } : q),
    } : current);
  }

  function addQuestion() {
    setDraft((current) => current ? {
      ...current,
      questions: [...current.questions, { type: "multiple_choice", question: "", options: ["", "", ""], correctIndex: 0, explanation: "", seconds: 30 }],
    } : current);
  }

  function removeQuestion(index: number) {
    setDraft((current) => current ? { ...current, questions: current.questions.filter((_, i) => i !== index) } : current);
  }

  async function generateCoverImage() {
    if (!draft) return;
    setImageBusy(true);
    setError(null);
    setMessage(null);
    try {
      const canUseText = draft.sourceMode === "text" && draft.sourceText.trim().length >= 40;
      const effectivePromptMode: CoverPromptMode = coverPromptMode === "fromText" && canUseText ? "fromText" : "custom";
      const prompt = draft.coverImagePrompt.trim() || `Forsidebilde til en quiz om ${draft.title}. Klasseromsvennlig, tydelig, 16:9.`;
      const res = await authedFetch("/api/images/generate", {
        method: "POST",
        body: JSON.stringify({
          lessonId: id,
          format: "16:9",
          style: coverImageStyle,
          promptMode: effectivePromptMode,
          customPrompt: effectivePromptMode === "custom" ? prompt : "",
          sourceText: effectivePromptMode === "fromText" ? draft.sourceText : draft.sourceText || draft.topic || draft.description,
          title: draft.title,
          level: draft.level,
          language: draft.language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { imageUrl?: unknown; error?: unknown; usage?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke lage bilde.");
      if (typeof data.imageUrl !== "string") throw new Error("Bildet mangler i svaret.");
      const nextUsage = normalizeUsage(data.usage);
      if (nextUsage) setImageUsage(nextUsage);
      setDraft({ ...draft, coverImagePrompt: effectivePromptMode === "custom" ? prompt : draft.coverImagePrompt, coverImageUrl: data.imageUrl });
      void reloadUsage();
      setMessage("Bilde generert.");
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setImageBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await authedFetch("/api/producer/save-quiz", {
        method: "POST",
        body: JSON.stringify({ id, requireCover: true, ...draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Kunne ikke lagre quiz.");
      setMessage("Quiz lagret i Mitt innhold.");
      router.push(`/${locale}/content`);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="mx-auto w-full max-w-5xl px-4 py-8"><div className="rounded-2xl border bg-white p-6 font-bold">Laster quiz...</div></main>;
  }

  if (!draft) {
    return <main className="mx-auto w-full max-w-5xl px-4 py-8"><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 font-bold text-rose-700">{error || "Fant ikke quizen."}</div></main>;
  }

  const canUseTextAsImageInspiration = draft.sourceMode === "text" && draft.sourceText.trim().length >= 40;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8">
      <header className="rounded-3xl border border-violet-200 bg-violet-50/70 p-6 shadow-sm">
        <Link href={`/${locale}/tools/quiz`} className="text-sm font-black text-slate-600 hover:text-slate-950">Tilbake</Link>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Fullføre / redigere quiz</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Rediger spørsmål, metadata og bilde før quizen lagres i Mitt innhold.</p>
      </header>

      <section className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Info label="Tittel" value={draft.title} />
        <Info label="Spørsmål" value={String(draft.questions.length)} />
        <Info label="Nivå" value={draft.level} />
        <Info label="Bilde" value={draft.coverImageUrl ? "Klart" : "Mangler"} />
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-slate-950">1. Grunninformasjon</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Fyll ut informasjonen som gjør quizen lett å finne, forstå og publisere.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">Tittel *</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Nivå</span>
            <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {["A1", "A2", "B1", "B2", "C1"].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Språk</span>
            <input value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Forfatter</span>
            <input value={draft.producerName || "Hentes fra profilen din"} readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-600" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Kategori</span>
            <select value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">Kort beskrivelse</span>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-2 min-h-[90px] w-full rounded-xl border border-slate-300 px-3 py-3 text-sm leading-6" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Tema</span>
            <input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" placeholder="F.eks. demokrati, vikingtid, Jostedalsrypa..." />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Tagger</span>
            <input value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: safeStringArray(e.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" placeholder="F.eks. skole, naturfag, lesing" />
            <span className="mt-1 block text-xs text-slate-500">Skill tagger med komma.</span>
          </label>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-violet-200 bg-violet-50/60 p-5">
        <h2 className="text-xl font-black text-slate-950">2. Forsidebilde og presentasjon</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Velg om du vil bruke egen bildeadresse eller generere et bilde med AI.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCoverImageMode("url")}
            className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageMode === "url" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
          >
            Bildeadresse
          </button>
          <button
            type="button"
            onClick={() => setCoverImageMode("ai")}
            className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageMode === "ai" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
          >
            Generer AI-bilde
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <label className="block max-w-xs">
              <span className="text-sm font-bold text-slate-700">Format</span>
              <input value="16:9" readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-600" />
              <span className="mt-1 block text-xs text-slate-500">Kun 16:9 er tillatt.</span>
            </label>

            {coverImageMode === "ai" ? (
              <>
                <div>
                  <div className="text-sm font-bold text-slate-700">Bildestil</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoverImageStyle("illustration")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageStyle === "illustration" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      Illustrasjon
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverImageStyle("realistic")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageStyle === "realistic" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      Realistisk
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-700">Prompt-kilde</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoverPromptMode("custom")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverPromptMode === "custom" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      Skriv prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => canUseTextAsImageInspiration && setCoverPromptMode("fromText")}
                      disabled={!canUseTextAsImageInspiration}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverPromptMode === "fromText" && canUseTextAsImageInspiration ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"} disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      Bruk teksten som inspirasjon
                    </button>
                  </div>
                </div>

                {coverPromptMode === "fromText" && canUseTextAsImageInspiration ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Systemet bruker quiztittel og tekstgrunnlag som inspirasjon for bildet.
                  </div>
                ) : (
                  <textarea
                    value={draft.coverImagePrompt}
                    onChange={(e) => setDraft({ ...draft, coverImagePrompt: e.target.value })}
                    className="min-h-[110px] w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm leading-6"
                    placeholder="Beskriv bildet kort..."
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={generateCoverImage} disabled={imageBusy || imageLimitReached} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                    <Sparkles className="h-4 w-4" />
                    {imageBusy ? "Lager bilde..." : imageLimitReached ? "Bildekvote brukt opp" : "Generer bilde"}
                  </button>
                  <button type="button" onClick={() => setDraft({ ...draft, coverImageUrl: "" })} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">
                    Fjern bilde
                  </button>
                </div>
                <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${imageLimitReached ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>
                  Bildegenerering: {usageLoading ? "laster..." : `${imagesUsed} / ${imagesLimit} brukt · ${imagesRemaining} igjen`}
                </div>
              </>
            ) : (
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Bildeadresse</span>
                <input value={draft.coverImageUrl} onChange={(e) => setDraft({ ...draft, coverImageUrl: e.target.value })} className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm" placeholder="https://..." />
                <span className="mt-1 block text-xs text-slate-500">Bildet bør være liggende i 16:9.</span>
              </label>
            )}

            {!draft.coverImageUrl.trim() ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">Bilde må legges til før lagring.</div> : null}
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</div> : null}
            {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
          </div>

          {draft.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.coverImageUrl} alt="" className="aspect-video w-full rounded-2xl border border-violet-200 object-cover shadow-sm" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-white text-sm font-bold text-slate-500">Bilde mangler</div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-slate-950">3. Spørsmål og svar</h2>
        <div className="mt-4 space-y-4">
          {draft.questions.map((q, questionIndex) => (
            <article key={questionIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-500">Spørsmål {questionIndex + 1}</div>
                <button type="button" onClick={() => removeQuestion(questionIndex)} className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea value={q.question} onChange={(e) => updateQuestion(questionIndex, { question: e.target.value })} className="mt-2 min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold leading-6" />
              <div className="mt-3 grid gap-2">
                {q.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <input type="radio" checked={q.correctIndex === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} />
                    <input value={option} onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
                  </label>
                ))}
              </div>
              <textarea value={q.explanation} onChange={(e) => updateQuestion(questionIndex, { explanation: e.target.value })} className="mt-3 min-h-[62px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6" placeholder="Forklaring til riktig svar..." />
            </article>
          ))}
        </div>
        <button type="button" onClick={addQuestion} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50">
          <Plus className="h-4 w-4" />
          Legg til spørsmål
        </button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-950">Klar til å lagre</div>
            <p className="text-xs leading-5 text-slate-600">Når quizen lagres, legges den i Mitt innhold.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</div> : null}
            {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
          <button type="button" onClick={save} disabled={saving || !draft.coverImageUrl.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
            <Check className="h-4 w-4" />
            {saving ? "Lagrer..." : "Lagre til Mitt innhold"}
          </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-950">{value || "-"}</div>
    </div>
  );
}
