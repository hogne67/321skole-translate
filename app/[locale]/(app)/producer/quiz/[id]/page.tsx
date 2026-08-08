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
  "language",
  "math",
  "science",
  "social_studies",
  "history",
  "english",
  "work_life",
  "citizenship",
  "culture",
  "health",
  "sports",
  "food",
  "wildlife",
  "other",
] as const;

type QuizEditorLocale = "nb" | "en" | "pt";

const LABELS = {
  nb: {
    errors: {
      unknown: "Noe gikk galt.",
      signIn: "Du må være logget inn.",
      notFound: "Fant ikke quizen.",
      noAccess: "Du har ikke tilgang til denne quizen.",
      imageFailed: "Kunne ikke lage bilde.",
      imageMissing: "Bildet mangler i svaret.",
      saveFailed: "Kunne ikke lagre quiz.",
    },
    messages: { imageGenerated: "Bilde generert.", saved: "Quiz lagret i Mitt innhold." },
    header: {
      back: "Tilbake",
      title: "Fullføre / redigere quiz",
      text: "Rediger spørsmål, metadata og bilde før quizen lagres i Mitt innhold.",
    },
    info: { title: "Tittel", questions: "Spørsmål", level: "Nivå", image: "Bilde", ready: "Klart", missing: "Mangler" },
    basic: {
      title: "1. Grunninformasjon",
      text: "Fyll ut informasjonen som gjør quizen lett å finne, forstå og publisere.",
      titleLabel: "Tittel *",
      level: "Nivå",
      language: "Språk",
      author: "Forfatter",
      authorFallback: "Hentes fra profilen din",
      category: "Kategori",
      description: "Kort beskrivelse",
      topic: "Tema",
      topicPlaceholder: "F.eks. demokrati, vikingtid, Jostedalsrypa...",
      tags: "Tagger",
      tagsPlaceholder: "F.eks. skole, naturfag, lesing",
      tagsHelp: "Skill tagger med komma.",
    },
    image: {
      title: "2. Forsidebilde og presentasjon",
      text: "Velg om du vil bruke egen bildeadresse eller generere et bilde med AI.",
      privacy: "Ikke bruk bilder eller navn på elever uten avklaring.",
      url: "Bildeadresse",
      ai: "Generer AI-bilde",
      format: "Format",
      formatHelp: "Kun 16:9 er tillatt.",
      style: "Bildestil",
      illustration: "Illustrasjon",
      realistic: "Realistisk",
      promptSource: "Prompt-kilde",
      customPrompt: "Skriv prompt",
      fromText: "Bruk teksten som inspirasjon",
      fromTextHelp: "Systemet bruker quiztittel og tekstgrunnlag som inspirasjon for bildet.",
      promptPlaceholder: "Beskriv bildet kort...",
      generating: "Lager bilde...",
      quotaUsed: "Bildekvote brukt opp",
      generate: "Generer bilde",
      remove: "Fjern bilde",
      quota: "Bildegenerering",
      loading: "laster...",
      used: "brukt",
      left: "igjen",
      urlHelp: "Bildet bør være liggende i 16:9.",
      required: "Bilde må legges til før lagring.",
      missing: "Bilde mangler",
    },
    questions: { title: "3. Spørsmål og svar", label: "Spørsmål {number}", explanation: "Forklaring til riktig svar...", add: "Legg til spørsmål" },
    finish: { title: "Klar til å lagre", text: "Når quizen lagres, legges den i Mitt innhold.", saving: "Lagrer...", save: "Lagre til Mitt innhold" },
    loading: "Laster quiz...",
    empty: "-",
    coverPrompt: (title: string) => `Forsidebilde til en quiz om ${title}. Klasseromsvennlig, tydelig, 16:9.`,
    categories: {
      language: "Språk og tekst", math: "Matematikk", science: "Naturfag", social_studies: "Samfunnsfag", history: "Historie", english: "Engelsk", work_life: "Arbeidsliv", citizenship: "Demokrati og medborgerskap", culture: "Kultur og samfunn", health: "Helse og livsmestring", sports: "Sport og idrett", food: "Mat og drikke", wildlife: "Dyreliv", other: "Annet",
    },
  },
  en: {
    errors: {
      unknown: "Something went wrong.",
      signIn: "You must be signed in.",
      notFound: "Could not find the quiz.",
      noAccess: "You do not have access to this quiz.",
      imageFailed: "Could not create image.",
      imageMissing: "The image is missing from the response.",
      saveFailed: "Could not save quiz.",
    },
    messages: { imageGenerated: "Image generated.", saved: "Quiz saved to My content." },
    header: {
      back: "Back",
      title: "Finish / edit quiz",
      text: "Edit questions, metadata and image before the quiz is saved to My content.",
    },
    info: { title: "Title", questions: "Questions", level: "Level", image: "Image", ready: "Ready", missing: "Missing" },
    basic: {
      title: "1. Basic information",
      text: "Fill in information that makes the quiz easy to find, understand and publish.",
      titleLabel: "Title *",
      level: "Level",
      language: "Language",
      author: "Author",
      authorFallback: "Taken from your profile",
      category: "Category",
      description: "Short description",
      topic: "Topic",
      topicPlaceholder: "E.g. democracy, Viking age, Thor...",
      tags: "Tags",
      tagsPlaceholder: "E.g. school, science, reading",
      tagsHelp: "Separate tags with commas.",
    },
    image: {
      title: "2. Cover image and presentation",
      text: "Choose whether to use your own image URL or generate an image with AI.",
      privacy: "Do not use images or names of students without clarification.",
      url: "Image URL",
      ai: "Generate AI image",
      format: "Format",
      formatHelp: "Only 16:9 is allowed.",
      style: "Image style",
      illustration: "Illustration",
      realistic: "Realistic",
      promptSource: "Prompt source",
      customPrompt: "Write prompt",
      fromText: "Use the text as inspiration",
      fromTextHelp: "The system uses the quiz title and source text as image inspiration.",
      promptPlaceholder: "Briefly describe the image...",
      generating: "Creating image...",
      quotaUsed: "Image quota used up",
      generate: "Generate image",
      remove: "Remove image",
      quota: "Image generation",
      loading: "loading...",
      used: "used",
      left: "left",
      urlHelp: "The image should be landscape in 16:9.",
      required: "An image must be added before saving.",
      missing: "Image missing",
    },
    questions: { title: "3. Questions and answers", label: "Question {number}", explanation: "Explanation for the correct answer...", add: "Add question" },
    finish: { title: "Ready to save", text: "When the quiz is saved, it is added to My content.", saving: "Saving...", save: "Save to My content" },
    loading: "Loading quiz...",
    empty: "-",
    coverPrompt: (title: string) => `Cover image for a quiz about ${title}. Classroom-friendly, clear, 16:9.`,
    categories: {
      language: "Language and text", math: "Mathematics", science: "Science", social_studies: "Social studies", history: "History", english: "English", work_life: "Work life", citizenship: "Democracy and citizenship", culture: "Culture and society", health: "Health and life skills", sports: "Sports and physical education", food: "Food and drink", wildlife: "Wildlife", other: "Other",
    },
  },
  pt: {
    errors: {
      unknown: "Algo deu errado.",
      signIn: "Você precisa estar conectado.",
      notFound: "Não foi possível encontrar o quiz.",
      noAccess: "Você não tem acesso a este quiz.",
      imageFailed: "Não foi possível criar a imagem.",
      imageMissing: "A imagem está ausente na resposta.",
      saveFailed: "Não foi possível salvar o quiz.",
    },
    messages: { imageGenerated: "Imagem gerada.", saved: "Quiz salvo em Meu conteúdo." },
    header: {
      back: "Voltar",
      title: "Finalizar / editar quiz",
      text: "Edite perguntas, metadados e imagem antes de salvar o quiz em Meu conteúdo.",
    },
    info: { title: "Título", questions: "Perguntas", level: "Nível", image: "Imagem", ready: "Pronta", missing: "Faltando" },
    basic: {
      title: "1. Informações básicas",
      text: "Preencha informações que tornam o quiz fácil de encontrar, entender e publicar.",
      titleLabel: "Título *",
      level: "Nível",
      language: "Idioma",
      author: "Autor",
      authorFallback: "Retirado do seu perfil",
      category: "Categoria",
      description: "Descrição curta",
      topic: "Tema",
      topicPlaceholder: "Ex.: democracia, era viking, Thor...",
      tags: "Tags",
      tagsPlaceholder: "Ex.: escola, ciências, leitura",
      tagsHelp: "Separe as tags com vírgulas.",
    },
    image: {
      title: "2. Imagem de capa e apresentação",
      text: "Escolha usar uma URL de imagem ou gerar uma imagem com IA.",
      privacy: "Não use imagens ou nomes de alunos sem autorização.",
      url: "URL da imagem",
      ai: "Gerar imagem com IA",
      format: "Formato",
      formatHelp: "Apenas 16:9 é permitido.",
      style: "Estilo da imagem",
      illustration: "Ilustração",
      realistic: "Realista",
      promptSource: "Fonte do prompt",
      customPrompt: "Escrever prompt",
      fromText: "Usar o texto como inspiração",
      fromTextHelp: "O sistema usa o título do quiz e o texto de origem como inspiração para a imagem.",
      promptPlaceholder: "Descreva brevemente a imagem...",
      generating: "Criando imagem...",
      quotaUsed: "Cota de imagens esgotada",
      generate: "Gerar imagem",
      remove: "Remover imagem",
      quota: "Geração de imagem",
      loading: "carregando...",
      used: "usado",
      left: "restante",
      urlHelp: "A imagem deve estar em formato paisagem 16:9.",
      required: "Uma imagem deve ser adicionada antes de salvar.",
      missing: "Imagem faltando",
    },
    questions: { title: "3. Perguntas e respostas", label: "Pergunta {number}", explanation: "Explicação da resposta correta...", add: "Adicionar pergunta" },
    finish: { title: "Pronto para salvar", text: "Quando o quiz for salvo, ele será adicionado a Meu conteúdo.", saving: "Salvando...", save: "Salvar em Meu conteúdo" },
    loading: "Carregando quiz...",
    empty: "-",
    coverPrompt: (title: string) => `Imagem de capa para um quiz sobre ${title}. Adequada para sala de aula, clara, 16:9.`,
    categories: {
      language: "Língua e texto", math: "Matemática", science: "Ciências", social_studies: "Estudos sociais", history: "História", english: "Inglês", work_life: "Vida profissional", citizenship: "Democracia e cidadania", culture: "Cultura e sociedade", health: "Saúde e competências para a vida", sports: "Esporte e educação física", food: "Comida e bebida", wildlife: "Vida animal", other: "Outro",
    },
  },
} as const;

function quizEditorLocale(locale: string): QuizEditorLocale {
  if (locale === "en") return "en";
  if (locale === "pt" || locale.startsWith("pt")) return "pt";
  return "nb";
}

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
}

async function authedFetch(path: string, init?: RequestInit, signInMessage = "Not signed in.") {
  const user = getAuth().currentUser;
  if (!user || user.isAnonymous) throw new Error(signInMessage);
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
  const labels = LABELS[quizEditorLocale(locale)];
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
        setError(labels.errors.signIn);
        setLoading(false);
        return;
      }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "lessons", id));
        if (!snap.exists()) throw new Error(labels.errors.notFound);
        const data = snap.data() as Record<string, unknown>;
        if (data.ownerId !== user.uid && data.uid !== user.uid) throw new Error(labels.errors.noAccess);
        setDraft(normalizeDraft(data));
      } catch (e: unknown) {
        setError(getErrorMessage(e, labels.errors.unknown));
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [id, labels.errors.noAccess, labels.errors.notFound, labels.errors.signIn, labels.errors.unknown]);

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
      const prompt = draft.coverImagePrompt.trim() || labels.coverPrompt(draft.title);
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
      }, labels.errors.signIn);
      const data = (await res.json().catch(() => ({}))) as { imageUrl?: unknown; error?: unknown; usage?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : labels.errors.imageFailed);
      if (typeof data.imageUrl !== "string") throw new Error(labels.errors.imageMissing);
      const nextUsage = normalizeUsage(data.usage);
      if (nextUsage) setImageUsage(nextUsage);
      setDraft({ ...draft, coverImagePrompt: effectivePromptMode === "custom" ? prompt : draft.coverImagePrompt, coverImageUrl: data.imageUrl });
      void reloadUsage();
      setMessage(labels.messages.imageGenerated);
    } catch (e: unknown) {
      setError(getErrorMessage(e, labels.errors.unknown));
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
      }, labels.errors.signIn);
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : labels.errors.saveFailed);
      setMessage(labels.messages.saved);
      router.push(`/${locale}/content`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, labels.errors.unknown));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="mx-auto w-full max-w-5xl px-4 py-8"><div className="rounded-2xl border bg-white p-6 font-bold">{labels.loading}</div></main>;
  }

  if (!draft) {
    return <main className="mx-auto w-full max-w-5xl px-4 py-8"><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 font-bold text-rose-700">{error || labels.errors.notFound}</div></main>;
  }

  const canUseTextAsImageInspiration = draft.sourceMode === "text" && draft.sourceText.trim().length >= 40;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8">
      <header className="rounded-3xl border border-violet-200 bg-violet-50/70 p-6 shadow-sm">
        <Link href={`/${locale}/tools/quiz`} className="text-sm font-black text-slate-600 hover:text-slate-950">{labels.header.back}</Link>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{labels.header.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{labels.header.text}</p>
      </header>

      <section className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Info label={labels.info.title} value={draft.title} empty={labels.empty} />
        <Info label={labels.info.questions} value={String(draft.questions.length)} empty={labels.empty} />
        <Info label={labels.info.level} value={draft.level} empty={labels.empty} />
        <Info label={labels.info.image} value={draft.coverImageUrl ? labels.info.ready : labels.info.missing} empty={labels.empty} />
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-slate-950">{labels.basic.title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{labels.basic.text}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">{labels.basic.titleLabel}</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.level}</span>
            <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {["A1", "A2", "B1", "B2", "C1"].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.language}</span>
            <input value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.author}</span>
            <input value={draft.producerName || labels.basic.authorFallback} readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-600" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.category}</span>
            <select value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">
              {CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{labels.categories[value]}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">{labels.basic.description}</span>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-2 min-h-[90px] w-full rounded-xl border border-slate-300 px-3 py-3 text-sm leading-6" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.topic}</span>
            <input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" placeholder={labels.basic.topicPlaceholder} />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">{labels.basic.tags}</span>
            <input value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: safeStringArray(e.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" placeholder={labels.basic.tagsPlaceholder} />
            <span className="mt-1 block text-xs text-slate-500">{labels.basic.tagsHelp}</span>
          </label>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-violet-200 bg-violet-50/60 p-5">
        <h2 className="text-xl font-black text-slate-950">{labels.image.title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{labels.image.text}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{labels.image.privacy}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCoverImageMode("url")}
            className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageMode === "url" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
          >
            {labels.image.url}
          </button>
          <button
            type="button"
            onClick={() => setCoverImageMode("ai")}
            className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageMode === "ai" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
          >
            {labels.image.ai}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <label className="block max-w-xs">
              <span className="text-sm font-bold text-slate-700">{labels.image.format}</span>
              <input value="16:9" readOnly className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-600" />
              <span className="mt-1 block text-xs text-slate-500">{labels.image.formatHelp}</span>
            </label>

            {coverImageMode === "ai" ? (
              <>
                <div>
                  <div className="text-sm font-bold text-slate-700">{labels.image.style}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoverImageStyle("illustration")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageStyle === "illustration" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      {labels.image.illustration}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverImageStyle("realistic")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverImageStyle === "realistic" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      {labels.image.realistic}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-700">{labels.image.promptSource}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoverPromptMode("custom")}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverPromptMode === "custom" ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      {labels.image.customPrompt}
                    </button>
                    <button
                      type="button"
                      onClick={() => canUseTextAsImageInspiration && setCoverPromptMode("fromText")}
                      disabled={!canUseTextAsImageInspiration}
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${coverPromptMode === "fromText" && canUseTextAsImageInspiration ? "border-violet-700 bg-white text-violet-800" : "border-slate-300 bg-white text-slate-900"} disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {labels.image.fromText}
                    </button>
                  </div>
                </div>

                {coverPromptMode === "fromText" && canUseTextAsImageInspiration ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    {labels.image.fromTextHelp}
                  </div>
                ) : (
                  <textarea
                    value={draft.coverImagePrompt}
                    onChange={(e) => setDraft({ ...draft, coverImagePrompt: e.target.value })}
                    className="min-h-[110px] w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm leading-6"
                    placeholder={labels.image.promptPlaceholder}
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={generateCoverImage} disabled={imageBusy || imageLimitReached} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                    <Sparkles className="h-4 w-4" />
                    {imageBusy ? labels.image.generating : imageLimitReached ? labels.image.quotaUsed : labels.image.generate}
                  </button>
                  <button type="button" onClick={() => setDraft({ ...draft, coverImageUrl: "" })} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">
                    {labels.image.remove}
                  </button>
                </div>
                <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${imageLimitReached ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>
                  {labels.image.quota}: {usageLoading ? labels.image.loading : `${imagesUsed} / ${imagesLimit} ${labels.image.used} · ${imagesRemaining} ${labels.image.left}`}
                </div>
              </>
            ) : (
              <label className="block">
                <span className="text-sm font-bold text-slate-700">{labels.image.url}</span>
                <input value={draft.coverImageUrl} onChange={(e) => setDraft({ ...draft, coverImageUrl: e.target.value })} className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm" placeholder="https://..." />
                <span className="mt-1 block text-xs text-slate-500">{labels.image.urlHelp}</span>
              </label>
            )}

            {!draft.coverImageUrl.trim() ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{labels.image.required}</div> : null}
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</div> : null}
            {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
          </div>

          {draft.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.coverImageUrl} alt="" className="aspect-video w-full rounded-2xl border border-violet-200 object-cover shadow-sm" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-white text-sm font-bold text-slate-500">{labels.image.missing}</div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-slate-950">{labels.questions.title}</h2>
        <div className="mt-4 space-y-4">
          {draft.questions.map((q, questionIndex) => (
            <article key={questionIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-500">{labels.questions.label.replace("{number}", String(questionIndex + 1))}</div>
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
              <textarea value={q.explanation} onChange={(e) => updateQuestion(questionIndex, { explanation: e.target.value })} className="mt-3 min-h-[62px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6" placeholder={labels.questions.explanation} />
            </article>
          ))}
        </div>
        <button type="button" onClick={addQuestion} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50">
          <Plus className="h-4 w-4" />
          {labels.questions.add}
        </button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-950">{labels.finish.title}</div>
            <p className="text-xs leading-5 text-slate-600">{labels.finish.text}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</div> : null}
            {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
          <button type="button" onClick={save} disabled={saving || !draft.coverImageUrl.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
            <Check className="h-4 w-4" />
            {saving ? labels.finish.saving : labels.finish.save}
          </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-950">{value || empty}</div>
    </div>
  );
}
