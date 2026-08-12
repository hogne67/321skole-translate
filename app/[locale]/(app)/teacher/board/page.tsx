"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AuthGate from "@/components/AuthGate";
import { auth, db, storage } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import type { SpaceDoc } from "@/lib/spacesClient";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ArrowLeft, ArrowRight, BarChart3, ChevronDown, Clock3, ImageIcon, MonitorUp, Play, Radio, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type SpaceRow = { id: string; data: SpaceDoc & { createdAt?: unknown } };
type BoardMode = "text" | "poll" | "wordwall" | "image" | "clock" | "quiz";
type SortKey = "newest" | "title_az" | "live";
type BoardState = {
  active?: boolean;
  mode?: BoardMode | string;
  sessionId?: string;
  updatedAt?: unknown;
};
type WordwallMotion = "calm" | "alive" | "energy";
type ImageSourceMode = "ai" | "upload" | "url";
type TimestampLike = { toMillis: () => number };
type QuizRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  level: string;
  language: string;
  questionCount: number;
  publishedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return isRecord(value) && typeof value.toMillis === "function";
}

function asMillis(value: unknown): number {
  if (isTimestampLike(value)) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value) && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeStorageName(input: string) {
  return input.replace(/[^\w.-]+/g, "_").slice(0, 90) || "image";
}

function normalizePollOptionsText(value: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of value.split(/[\n,]+/)) {
    const option = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    const key = option.toLocaleLowerCase("nb");
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  return options.slice(0, 8);
}

function isOpenSpace(space: SpaceRow): boolean {
  return space.data.isOpen !== false;
}

function modeLabel(t: (key: string) => string, mode: unknown) {
  if (mode === "poll") return t("modes.poll");
  if (mode === "wordwall") return t("modes.wordwall");
  if (mode === "image") return t("modes.image");
  if (mode === "clock") return t("modes.clock");
  if (mode === "quiz") return t("modes.quiz");
  return t("modes.text");
}

function questionCountFrom(data: Record<string, unknown>): number {
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (questions.length) return questions.length;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  return tasks.length;
}

function coerceQuiz(id: string, raw: unknown): QuizRow | null {
  const data = isRecord(raw) ? raw : {};
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const lessonType = safeString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const isQuiz = lessonType === "quiz" || Array.isArray(quiz.questions);
  if (!isQuiz || data.isActive === false) return null;

  return {
    id,
    title: safeString(data.title || quiz.title, "Quiz uten tittel"),
    description: safeString(data.description || quiz.description),
    imageUrl: safeString(data.coverImageUrl || data.imageUrl),
    level: safeString(data.level || quiz.level),
    language: safeString(data.language || quiz.language),
    questionCount: questionCountFrom(data),
    publishedAt: asMillis(data.publishedAt || data.updatedAt || data.createdAt),
  };
}

function wordwallCopy(locale: string) {
  if (locale === "en") {
    return {
      kicker: "Live activity",
      title: "Create word cloud",
      text: "Write the prompt students see. Words are collected in a word cloud, and matching words grow automatically.",
      label: "Task / prompt",
      placeholder: "For example: What words do you connect with democracy?",
      motion: "Movement",
      calm: "Calm",
      alive: "Alive",
      energy: "Full energy",
      hint: "The word cloud is anonymous. Identical words are merged automatically.",
      timer: "Timer",
      noTimer: "No timer",
      customTime: "Custom seconds",
      start: "Start word cloud",
      starting: "Starting...",
      error: "Could not start word cloud.",
    };
  }
  if (locale === "pt") {
    return {
      kicker: "Atividade ao vivo",
      title: "Criar nuvem de palavras",
      text: "Escreva a instrução que os alunos recebem. As palavras são reunidas e palavras iguais crescem automaticamente.",
      label: "Tarefa / instrução",
      placeholder: "Por exemplo: Que palavras você associa à democracia?",
      motion: "Movimento",
      calm: "Calmo",
      alive: "Vivo",
      energy: "Energia total",
      hint: "A nuvem é anônima. Palavras iguais são combinadas automaticamente.",
      timer: "Temporizador",
      noTimer: "Sem timer",
      customTime: "Segundos personalizados",
      start: "Iniciar nuvem",
      starting: "Iniciando...",
      error: "Não foi possível iniciar a nuvem.",
    };
  }
  return {
    kicker: "Liveaktivitet",
    title: "Lag ordsky",
    text: "Skriv instruksjonen elevene får. Ordene samles i en ordsky, og like ord vokser automatisk.",
    label: "Oppgave / instruksjon",
    placeholder: "For eksempel: Hvilke ord forbinder du med demokrati?",
    motion: "Bevegelse",
    calm: "Rolig",
    alive: "Levende",
    energy: "Full energi",
    hint: "Ordskyen er anonym. Like ord slås sammen automatisk, og vokser når flere skriver det samme.",
    timer: "Timer",
    noTimer: "Uten timer",
    customTime: "Velg sekunder selv",
    start: "Start ordsky",
    starting: "Starter...",
    error: "Kunne ikke starte ordsky.",
  };
}

function boardLiveCopy(locale: string) {
  if (locale === "en") {
    return {
      videoTitle: "Instruction video",
      videoText: "A new short walkthrough will be added here when the live board flow is ready.",
      liveKicker: "321school live",
      liveTitle: "Shared student entry",
      liveText: "Students can go to /live and enter the code from the screen. Works for quiz, poll, word cloud and image activity.",
      liveButton: "Open live entry",
    };
  }
  if (locale === "pt") {
    return {
      videoTitle: "Vídeo de instrução",
      videoText: "Um novo guia curto será colocado aqui quando o fluxo ao vivo estiver pronto.",
      liveKicker: "321school live",
      liveTitle: "Entrada comum para alunos",
      liveText: "Os alunos podem acessar /live e digitar o código da tela. Funciona para quiz, votação, nuvem de palavras e atividade com imagem.",
      liveButton: "Abrir entrada live",
    };
  }
  return {
    videoTitle: "Instruksjonsvideo",
    videoText: "Her legger vi inn en ny kort gjennomgang når liveflyten er klar.",
    liveKicker: "321school live",
    liveTitle: "Felles inngang for elever",
    liveText: "Elever kan gå til /live og skrive inn koden fra skjermen. Fungerer for quiz, avstemming, ordsky og bildeaktivitet.",
    liveButton: "Åpne live-inngang",
  };
}

function pollCopy(locale: string) {
  if (locale === "en") {
    return {
      kicker: "Live activity",
      title: "Create poll",
      text: "Ask a quick question and show the result live on the big screen.",
      question: "Question",
      questionPlaceholder: "For example: Which strategy should we try first?",
      options: "Options",
      optionsPlaceholder: "One option per line",
      timer: "Timer",
      noTimer: "No timer",
      customTime: "Custom seconds",
      hint: "Students vote anonymously. One device can change its vote while the poll is open.",
      start: "Start poll",
      starting: "Starting...",
      error: "Could not start poll.",
    };
  }
  if (locale === "pt") {
    return {
      kicker: "Atividade ao vivo",
      title: "Criar votação",
      text: "Faça uma pergunta rápida e mostre o resultado ao vivo na tela.",
      question: "Pergunta",
      questionPlaceholder: "Por exemplo: Qual estratégia devemos tentar primeiro?",
      options: "Opções",
      optionsPlaceholder: "Uma opção por linha",
      timer: "Temporizador",
      noTimer: "Sem timer",
      customTime: "Segundos personalizados",
      hint: "Os alunos votam anonimamente. Um dispositivo pode alterar o voto enquanto a votação estiver aberta.",
      start: "Iniciar votação",
      starting: "Iniciando...",
      error: "Não foi possível iniciar a votação.",
    };
  }
  return {
    kicker: "Liveaktivitet",
    title: "Lag avstemming",
    text: "Still et raskt spørsmål og vis resultatet live på storskjermen.",
    question: "Spørsmål",
    questionPlaceholder: "For eksempel: Hvilken strategi skal vi prøve først?",
    options: "Alternativer",
    optionsPlaceholder: "Ett alternativ per linje",
    timer: "Timer",
    noTimer: "Uten timer",
    customTime: "Velg sekunder selv",
    hint: "Elevene stemmer anonymt. Én enhet kan endre stemme mens avstemmingen er åpen.",
    start: "Start avstemming",
    starting: "Starter...",
    error: "Kunne ikke starte avstemming.",
  };
}

function imageActivityCopy(locale: string) {
  if (locale === "en") {
    return {
      kicker: "Live activity",
      title: "Create image activity",
      text: "Show an image on the big screen and let students send short observations or sentences.",
      source: "Image source",
      ai: "AI image",
      upload: "Upload",
      url: "URL",
      aiPrompt: "AI image prompt",
      aiPlaceholder: "Describe the image you want to create. Avoid text in the image.",
      generate: "Generate image",
      generating: "Generating...",
      uploadImage: "Upload image",
      uploading: "Uploading...",
      imageUrl: "Image URL",
      imagePlaceholder: "Paste image URL",
      prompt: "Task / prompt",
      promptPlaceholder: "For example: What do you notice in this picture?",
      timer: "Timer",
      noTimer: "No timer",
      customTime: "Custom seconds",
      hint: "The answers are shown anonymously on the big screen.",
      imageReady: "Image is ready.",
      uploadFailed: "Upload failed.",
      generateFailed: "Could not generate image.",
      loginRequired: "You must be signed in first.",
      imageOnly: "Choose an image file.",
      tooLarge: "The file is too large. Max 8 MB.",
      promptRequired: "Write an AI prompt first.",
      start: "Start image activity",
      starting: "Starting...",
      error: "Could not start image activity.",
    };
  }
  if (locale === "pt") {
    return {
      kicker: "Atividade ao vivo",
      title: "Criar atividade com imagem",
      text: "Mostre uma imagem na tela e deixe os alunos enviarem observações ou frases curtas.",
      source: "Fonte da imagem",
      ai: "Imagem com IA",
      upload: "Upload",
      url: "URL",
      aiPrompt: "Prompt da imagem com IA",
      aiPlaceholder: "Descreva a imagem que você quer criar. Evite texto na imagem.",
      generate: "Gerar imagem",
      generating: "Gerando...",
      uploadImage: "Enviar imagem",
      uploading: "Enviando...",
      imageUrl: "URL da imagem",
      imagePlaceholder: "Cole a URL da imagem",
      prompt: "Tarefa / instrução",
      promptPlaceholder: "Por exemplo: O que você observa nesta imagem?",
      timer: "Temporizador",
      noTimer: "Sem timer",
      customTime: "Segundos personalizados",
      hint: "As respostas aparecem anonimamente na tela.",
      imageReady: "A imagem está pronta.",
      uploadFailed: "Falha ao enviar.",
      generateFailed: "Não foi possível gerar a imagem.",
      loginRequired: "Você precisa estar conectado primeiro.",
      imageOnly: "Escolha um arquivo de imagem.",
      tooLarge: "O arquivo é grande demais. Máximo de 8 MB.",
      promptRequired: "Escreva primeiro um prompt para IA.",
      start: "Iniciar atividade",
      starting: "Iniciando...",
      error: "Não foi possível iniciar a atividade.",
    };
  }
  return {
    kicker: "Liveaktivitet",
    title: "Lag bildeaktivitet",
    text: "Vis et bilde på storskjerm og la elevene sende korte observasjoner eller setninger.",
    source: "Bildekilde",
    ai: "AI-bilde",
    upload: "Last opp",
    url: "URL",
    aiPrompt: "Prompt til AI-bilde",
    aiPlaceholder: "Beskriv bildet du vil lage. Unngå tekst i selve bildet.",
    generate: "Generer bilde",
    generating: "Genererer...",
    uploadImage: "Last opp bilde",
    uploading: "Laster opp...",
    imageUrl: "Bilde-URL",
    imagePlaceholder: "Lim inn bilde-URL",
    prompt: "Oppgave / instruksjon",
    promptPlaceholder: "For eksempel: Hva legger du merke til i dette bildet?",
    timer: "Timer",
    noTimer: "Uten timer",
    customTime: "Velg sekunder selv",
    hint: "Svarene vises anonymt på storskjermen.",
    imageReady: "Bildet er klart.",
    uploadFailed: "Opplasting feilet.",
    generateFailed: "Kunne ikke generere bildet.",
    loginRequired: "Du må være innlogget først.",
    imageOnly: "Velg en bildefil.",
    tooLarge: "Filen er for stor. Maks 8 MB.",
    promptRequired: "Skriv et AI-prompt først.",
    start: "Start bildeaktivitet",
    starting: "Starter...",
    error: "Kunne ikke starte bildeaktivitet.",
  };
}

function timerCopy(locale: string) {
  if (locale === "en") {
    return {
      kicker: "Live timer",
      title: "Start timer",
      text: "Put a clear countdown on the big screen. Stop it early when everyone is finished.",
      customLabel: "Choose yourself",
      customPlaceholder: "Seconds",
      start: "Start timer",
      seconds: "sec",
      invalid: "Choose a time first.",
    };
  }
  if (locale === "pt") {
    return {
      kicker: "Temporizador ao vivo",
      title: "Iniciar temporizador",
      text: "Mostre uma contagem regressiva clara na tela. Pare antes se todos terminarem.",
      customLabel: "Escolher tempo",
      customPlaceholder: "Segundos",
      start: "Iniciar timer",
      seconds: "s",
      invalid: "Escolha um tempo primeiro.",
    };
  }
  return {
    kicker: "Live timer",
    title: "Start tidtaker",
    text: "Vis en tydelig nedtelling på storskjerm. Stopp den tidlig hvis alle er ferdige.",
    customLabel: "Velg selv",
    customPlaceholder: "Sekunder",
    start: "Start timer",
    seconds: "sek",
    invalid: "Velg tid først.",
  };
}

function quizLiveCopy(locale: string) {
  if (locale === "en") {
    return {
      kicker: "Live activity",
      title: "Start quiz",
      text: "Choose a quiz from My content and start it live on the big screen.",
      create: "Create new quiz",
      search: "Search my quizzes",
      searchPlaceholder: "Search by title, level or language",
      preview: "Preview",
      start: "Start live quiz",
      starting: "Starting...",
      empty: "No quizzes found in My content yet.",
      noMatch: "No quizzes matched your search.",
      error: "Could not start quiz.",
      questionSuffix: "questions",
    };
  }
  if (locale === "pt") {
    return {
      kicker: "Atividade ao vivo",
      title: "Iniciar quiz",
      text: "Escolha um quiz de Meu conteúdo e inicie ao vivo na tela.",
      create: "Criar novo quiz",
      search: "Pesquisar meus quizzes",
      searchPlaceholder: "Pesquisar por título, nível ou idioma",
      preview: "Pré-visualizar",
      start: "Iniciar quiz ao vivo",
      starting: "Iniciando...",
      empty: "Ainda não há quizzes em Meu conteúdo.",
      noMatch: "Nenhum quiz corresponde à pesquisa.",
      error: "Não foi possível iniciar o quiz.",
      questionSuffix: "perguntas",
    };
  }
  return {
    kicker: "Liveaktivitet",
    title: "Start quiz",
    text: "Velg en quiz fra Mitt innhold og start den live på storskjermen.",
    create: "Lag ny quiz",
    search: "Søk i mine quizzer",
    searchPlaceholder: "Søk på tittel, nivå eller språk",
    preview: "Forhåndsvis",
    start: "Start live quiz",
    starting: "Starter...",
    empty: "Du har ingen quizzer i Mitt innhold enda.",
    noMatch: "Ingen quizzer passet søket.",
    error: "Kunne ikke starte quiz.",
    questionSuffix: "spørsmål",
  };
}

function CollapsibleActivitySection({
  tone,
  icon,
  kicker,
  title,
  text,
  children,
}: {
  tone: "sky" | "emerald" | "violet" | "amber";
  icon?: ReactNode;
  kicker: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  const toneClass = {
    sky: "border-sky-200 bg-sky-50",
    emerald: "border-emerald-200 bg-emerald-50",
    violet: "border-violet-200 bg-violet-50",
    amber: "border-amber-200 bg-amber-50",
  }[tone];
  const textClass = {
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    amber: "text-amber-700",
  }[tone];

  return (
    <details className={`group rounded-2xl border ${toneClass} shadow-sm`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${textClass}`}>
            {icon}
            {kicker}
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{text}</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-600 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

export default function TeacherBoardIndexPage() {
  return (
    <AuthGate>
      <TeacherBoardIndexInner />
    </AuthGate>
  );
}

function TeacherBoardIndexInner() {
  const t = useTranslations("teacherBoardIndex");
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();

  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [boardStates, setBoardStates] = useState<Record<string, BoardState | null>>({});
  const [spaceSearch, setSpaceSearch] = useState("");
  const [sortKey] = useState<SortKey>("title_az");
  const [spacePage, setSpacePage] = useState(0);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [quizSearch, setQuizSearch] = useState("");
  const [quizBusyId, setQuizBusyId] = useState("");
  const [quizError, setQuizError] = useState("");
  const [wordwallPrompt, setWordwallPrompt] = useState("");
  const [wordwallMotion, setWordwallMotion] = useState<WordwallMotion>("alive");
  const [wordwallTimerSeconds, setWordwallTimerSeconds] = useState<number | null>(null);
  const [wordwallCustomTimerSeconds, setWordwallCustomTimerSeconds] = useState("");
  const [wordwallBusy, setWordwallBusy] = useState(false);
  const [wordwallError, setWordwallError] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionsRaw, setPollOptionsRaw] = useState("");
  const [pollTimerSeconds, setPollTimerSeconds] = useState<number | null>(null);
  const [pollCustomTimerSeconds, setPollCustomTimerSeconds] = useState("");
  const [pollBusy, setPollBusy] = useState(false);
  const [pollError, setPollError] = useState("");
  const [imageActivityPrompt, setImageActivityPrompt] = useState("");
  const [imageActivityUrl, setImageActivityUrl] = useState("");
  const [imageActivitySource, setImageActivitySource] = useState<ImageSourceMode>("ai");
  const [imageActivityAiPrompt, setImageActivityAiPrompt] = useState("");
  const [imageActivityTimerSeconds, setImageActivityTimerSeconds] = useState<number | null>(null);
  const [imageActivityCustomTimerSeconds, setImageActivityCustomTimerSeconds] = useState("");
  const [imageActivityBusy, setImageActivityBusy] = useState(false);
  const [imageActivityUploading, setImageActivityUploading] = useState(false);
  const [imageActivityGenerating, setImageActivityGenerating] = useState(false);
  const [imageActivityMessage, setImageActivityMessage] = useState("");
  const [imageActivityError, setImageActivityError] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [customTimerSeconds, setCustomTimerSeconds] = useState("");
  const [timerError, setTimerError] = useState("");

  const canUse = profile?.role === "teacher" || profile?.role === "admin";
  const wordwallText = wordwallCopy(locale);
  const pollText = pollCopy(locale);
  const imageText = imageActivityCopy(locale);
  const boardText = boardLiveCopy(locale);
  const timerText = timerCopy(locale);
  const quizText = quizLiveCopy(locale);

  useEffect(() => {
    if (!user?.uid || !canUse) return;

    const q = query(collection(db, "spaces"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setSpaces(
        snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as SpaceRow["data"],
        }))
      );
    });
  }, [user?.uid, canUse]);

  useEffect(() => {
    if (spaces.length === 0) {
      setBoardStates({});
      return;
    }

    const unsubs = spaces.map((space) =>
      onSnapshot(
        doc(db, "spaces", space.id, "board", "state"),
        (snap) => {
          setBoardStates((prev) => ({
            ...prev,
            [space.id]: snap.exists() ? (snap.data() as BoardState) : null,
          }));
        },
        () => {
          setBoardStates((prev) => ({ ...prev, [space.id]: null }));
        }
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [spaces]);

  useEffect(() => {
    if (!canUse) return;

    if (!user?.uid) return;

    const ownerQuery = query(collection(db, "lessons"), where("ownerId", "==", user.uid), limit(50));
    const uidQuery = query(collection(db, "lessons"), where("uid", "==", user.uid), limit(50));
    Promise.all([getDocs(ownerQuery), getDocs(uidQuery)])
      .then((snaps) => {
        const byId = new Map<string, QuizRow>();
        snaps
          .flatMap((snap) => snap.docs)
          .map((item) => coerceQuiz(item.id, item.data()))
          .filter((item): item is QuizRow => item !== null)
          .forEach((item) => byId.set(item.id, item));
        const next = Array.from(byId.values())
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, 24);
        setQuizzes(next);
      })
      .catch(() => setQuizzes([]));
  }, [canUse, user?.uid]);

  const filteredSpaces = useMemo(() => {
    const search = spaceSearch.trim().toLowerCase();
    const list = spaces.filter((space) => {
      if (!isOpenSpace(space)) return false;

      const title = safeString(space.data.title).toLowerCase();
      const code = safeString(space.data.code).toLowerCase();
      return !search || title.includes(search) || code.includes(search);
    });

    return [...list].sort((a, b) => {
      if (sortKey === "title_az") return safeString(a.data.title).localeCompare(safeString(b.data.title), "nb");
      if (sortKey === "live") {
        const al = boardStates[a.id]?.active === true ? 1 : 0;
        const bl = boardStates[b.id]?.active === true ? 1 : 0;
        if (al !== bl) return bl - al;
      }
      return asMillis(b.data.createdAt) - asMillis(a.data.createdAt);
    });
  }, [boardStates, spaceSearch, sortKey, spaces]);

  useEffect(() => {
    setSpacePage(0);
  }, [spaceSearch, sortKey]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredSpaces.length / pageSize));
  const visibleSpaces = filteredSpaces.slice(spacePage * pageSize, spacePage * pageSize + pageSize);
  const filteredQuizzes = useMemo(() => {
    const search = quizSearch.trim().toLowerCase();
    if (!search) return quizzes;
    return quizzes.filter((quiz) =>
      [quiz.title, quiz.description, quiz.level, quiz.language]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search))
    );
  }, [quizSearch, quizzes]);

  async function startWordwall() {
    const prompt = wordwallPrompt.trim();
    if (!prompt || wordwallBusy) return;
    const current = auth.currentUser;
    if (!current) return;

    setWordwallBusy(true);
    setWordwallError("");
    try {
      const token = await current.getIdToken();
      const customTimer = Number(wordwallCustomTimerSeconds);
      const timerSeconds = wordwallCustomTimerSeconds.trim() ? customTimer : wordwallTimerSeconds;
      const response = await fetch("/api/wordwall-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, motion: wordwallMotion, timerSeconds }),
      });
      const data = (await response.json().catch(() => ({}))) as { sessionId?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : wordwallText.error);
      const sessionId = safeString(data.sessionId);
      if (!sessionId) throw new Error(wordwallText.error);
      window.location.assign(`/${locale}/wordwall/host/${sessionId}/display`);
    } catch (error) {
      setWordwallError(error instanceof Error ? error.message : wordwallText.error);
    } finally {
      setWordwallBusy(false);
    }
  }

  async function startPoll() {
    const question = pollQuestion.trim();
    const options = normalizePollOptionsText(pollOptionsRaw);
    if (!question || options.length < 2 || pollBusy) return;
    const current = auth.currentUser;
    if (!current) return;

    setPollBusy(true);
    setPollError("");
    try {
      const token = await current.getIdToken();
      const customTimer = Number(pollCustomTimerSeconds);
      const timerSeconds = pollCustomTimerSeconds.trim() ? customTimer : pollTimerSeconds;
      const response = await fetch("/api/poll-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, options, timerSeconds }),
      });
      const data = (await response.json().catch(() => ({}))) as { sessionId?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : pollText.error);
      const sessionId = safeString(data.sessionId);
      if (!sessionId) throw new Error(pollText.error);
      window.location.assign(`/${locale}/poll/host/${sessionId}/display`);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : pollText.error);
    } finally {
      setPollBusy(false);
    }
  }

  async function startImageActivity() {
    const prompt = imageActivityPrompt.trim();
    const imageUrl = imageActivityUrl.trim();
    if (!prompt || !imageUrl || imageActivityBusy) return;
    const current = auth.currentUser;
    if (!current) return;

    setImageActivityBusy(true);
    setImageActivityError("");
    try {
      const token = await current.getIdToken();
      const customTimer = Number(imageActivityCustomTimerSeconds);
      const timerSeconds = imageActivityCustomTimerSeconds.trim() ? customTimer : imageActivityTimerSeconds;
      const response = await fetch("/api/image-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, imageUrl, timerSeconds }),
      });
      const data = (await response.json().catch(() => ({}))) as { sessionId?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : imageText.error);
      const sessionId = safeString(data.sessionId);
      if (!sessionId) throw new Error(imageText.error);
      window.location.assign(`/${locale}/image-live/host/${sessionId}/display`);
    } catch (error) {
      setImageActivityError(error instanceof Error ? error.message : imageText.error);
    } finally {
      setImageActivityBusy(false);
    }
  }

  async function uploadImageActivityFile(file: File) {
    const current = auth.currentUser;
    if (!current) {
      setImageActivityError(imageText.loginRequired);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImageActivityError(imageText.imageOnly);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageActivityError(imageText.tooLarge);
      return;
    }

    setImageActivityUploading(true);
    setImageActivityError("");
    setImageActivityMessage("");
    try {
      const fileRef = ref(storage, `live-image-activities/${current.uid}/${Date.now()}-${safeStorageName(file.name)}`);
      await uploadBytes(fileRef, file, {
        contentType: file.type || "image/jpeg",
        customMetadata: { ownerId: current.uid, context: "teacher-board-live-image" },
      });
      const nextUrl = await getDownloadURL(fileRef);
      setImageActivityUrl(nextUrl);
      setImageActivityMessage(imageText.imageReady);
    } catch {
      setImageActivityError(imageText.uploadFailed);
    } finally {
      setImageActivityUploading(false);
    }
  }

  async function generateImageActivityImage() {
    const current = auth.currentUser;
    if (!current) {
      setImageActivityError(imageText.loginRequired);
      return;
    }
    const customPrompt = imageActivityAiPrompt.trim() || imageActivityPrompt.trim();
    if (!customPrompt) {
      setImageActivityError(imageText.promptRequired);
      return;
    }

    setImageActivityGenerating(true);
    setImageActivityError("");
    setImageActivityMessage("");
    try {
      const token = await current.getIdToken();
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId: `live-image-${Date.now()}`,
          format: "16:9",
          style: "illustration",
          promptMode: "custom",
          customPrompt,
          title: imageActivityPrompt.trim() || imageText.title,
          language: locale,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { imageUrl?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : imageText.generateFailed);
      const nextUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
      if (!nextUrl) throw new Error(imageText.generateFailed);
      setImageActivityUrl(nextUrl);
      setImageActivityMessage(imageText.imageReady);
    } catch (error) {
      setImageActivityError(error instanceof Error ? error.message : imageText.generateFailed);
    } finally {
      setImageActivityGenerating(false);
    }
  }

  function startTimer() {
    const custom = Number(customTimerSeconds);
    const seconds = customTimerSeconds.trim() ? custom : timerSeconds;
    const safeSeconds = Math.max(5, Math.min(60 * 60, Math.trunc(seconds)));
    if (!Number.isFinite(safeSeconds) || safeSeconds < 5) {
      setTimerError(timerText.invalid);
      return;
    }
    setTimerError("");
    window.location.assign(`/${locale}/timer/display?seconds=${safeSeconds}`);
  }

  async function startQuizSession(lessonId: string) {
    if (quizBusyId) return;
    const current = auth.currentUser;
    if (!current) return;

    setQuizBusyId(lessonId);
    setQuizError("");
    try {
      const token = await current.getIdToken();
      const response = await fetch("/api/quiz-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lessonId }),
      });
      const data = (await response.json().catch(() => ({}))) as { sessionId?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : quizText.error);
      const sessionId = safeString(data.sessionId);
      if (!sessionId) throw new Error(quizText.error);
      window.location.assign(`/${locale}/quiz/host/${sessionId}/display`);
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : quizText.error);
    } finally {
      setQuizBusyId("");
    }
  }

  if (loading) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-slate-600">{t("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">{t("access.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">{t("access.text")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2 py-3 sm:px-4 sm:py-4">
      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-md sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t("hero.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600 sm:leading-6">{t("hero.text")}</p>
          </div>

          <div className="flex w-full min-w-0 justify-start lg:w-auto lg:justify-end">
            <div className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm lg:w-[360px]">
              <div className="text-sm font-black text-slate-950">{boardText.videoTitle}</div>
              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">{boardText.videoText}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{boardText.liveKicker}</div>
          <h2 className="mt-1 text-lg font-black text-slate-950">{boardText.liveTitle}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">{boardText.liveText}</p>
        </div>
        <Link
          href={`/${locale}/live`}
          className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-black text-emerald-900 no-underline hover:bg-emerald-100"
        >
          {boardText.liveButton}
        </Link>
      </section>


      <CollapsibleActivitySection tone="violet" icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} kicker={quizText.kicker} title={quizText.title} text={quizText.text}>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="block min-w-0 flex-1">
              <span className="text-sm font-black text-slate-800">{quizText.search}</span>
              <input
                value={quizSearch}
                onChange={(event) => setQuizSearch(event.target.value)}
                placeholder={quizText.searchPlaceholder}
                className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-violet-500"
              />
            </label>
            <Link
              href={`/${locale}/tools/quiz`}
              className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white no-underline hover:bg-violet-800"
            >
              {quizText.create}
            </Link>
          </div>

          {quizError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{quizError}</div> : null}

          {filteredQuizzes.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredQuizzes.slice(0, 9).map((quiz) => (
                <article key={quiz.id} className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                  <div className="aspect-video bg-violet-50">
                    {quiz.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-black uppercase tracking-[0.18em] text-violet-700">321quiz</div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2 text-xs font-black text-slate-600">
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-800">{quiz.questionCount} {quizText.questionSuffix}</span>
                      {quiz.level ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{quiz.level}</span> : null}
                      {quiz.language ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{quiz.language}</span> : null}
                    </div>
                    <div>
                      <h3 className="line-clamp-2 text-lg font-black leading-tight text-slate-950">{quiz.title}</h3>
                      {quiz.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{quiz.description}</p> : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/${locale}/producer/quiz/${quiz.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-black text-violet-800 no-underline hover:bg-violet-50"
                      >
                        {quizText.preview}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void startQuizSession(quiz.id)}
                        disabled={Boolean(quizBusyId)}
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                      >
                        {quizBusyId === quiz.id ? quizText.starting : quizText.start}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-violet-200 bg-white p-5 text-sm font-semibold text-slate-600">
              {quizzes.length ? quizText.noMatch : quizText.empty}
            </div>
          )}
        </div>
      </CollapsibleActivitySection>


      <CollapsibleActivitySection tone="sky" kicker={wordwallText.kicker} title={wordwallText.title} text={wordwallText.text}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
          <div>
            <label className="mt-4 block">
              <span className="text-sm font-black text-slate-800">{wordwallText.label}</span>
              <textarea
                value={wordwallPrompt}
                onChange={(event) => setWordwallPrompt(event.target.value)}
                placeholder={wordwallText.placeholder}
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-sky-500"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <div className="text-sm font-black text-slate-800">{wordwallText.motion}</div>
            <div className="mt-3 grid gap-2">
              {([
                ["calm", wordwallText.calm],
                ["alive", wordwallText.alive],
                ["energy", wordwallText.energy],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWordwallMotion(value)}
                  className={["rounded-xl border px-4 py-3 text-left text-sm font-black", wordwallMotion === value ? "border-sky-600 bg-sky-100 text-sky-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-sky-100 pt-4">
              <div className="text-sm font-black text-slate-800">{wordwallText.timer}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  [null, wordwallText.noTimer],
                  [30, "30s"],
                  [60, "60s"],
                  [120, "120s"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value ?? "none"}
                    type="button"
                    onClick={() => {
                      setWordwallTimerSeconds(value);
                      setWordwallCustomTimerSeconds("");
                    }}
                    className={["rounded-xl border px-3 py-2 text-sm font-black", wordwallTimerSeconds === value && !wordwallCustomTimerSeconds.trim() ? "border-sky-600 bg-sky-100 text-sky-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={wordwallCustomTimerSeconds}
                onChange={(event) => setWordwallCustomTimerSeconds(event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder={wordwallText.customTime}
                className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-sky-500"
              />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{wordwallText.hint}</p>
            {wordwallError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{wordwallError}</div> : null}
            <button
              type="button"
              onClick={startWordwall}
              disabled={wordwallBusy || !wordwallPrompt.trim()}
              className="mt-4 w-full rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {wordwallBusy ? wordwallText.starting : wordwallText.start}
            </button>
          </div>
        </div>
      </CollapsibleActivitySection>


      <CollapsibleActivitySection tone="emerald" icon={<ImageIcon className="h-4 w-4" aria-hidden="true" />} kicker={imageText.kicker} title={imageText.title} text={imageText.text}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
          <div>
            <label className="mt-4 block">
              <span className="text-sm font-black text-slate-800">{imageText.prompt}</span>
              <textarea
                value={imageActivityPrompt}
                onChange={(event) => setImageActivityPrompt(event.target.value)}
                placeholder={imageText.promptPlaceholder}
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-emerald-500"
              />
            </label>

            <div className="mt-4">
              <div className="text-sm font-black text-slate-800">{imageText.source}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([
                  ["ai", imageText.ai],
                  ["upload", imageText.upload],
                  ["url", imageText.url],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setImageActivitySource(value);
                      setImageActivityError("");
                      setImageActivityMessage("");
                    }}
                    className={["rounded-xl border px-3 py-2 text-sm font-black", imageActivitySource === value ? "border-emerald-600 bg-emerald-100 text-emerald-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {imageActivitySource === "ai" ? (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/70 p-3">
                <label className="block">
                  <span className="text-sm font-black text-slate-800">{imageText.aiPrompt}</span>
                  <textarea
                    value={imageActivityAiPrompt}
                    onChange={(event) => setImageActivityAiPrompt(event.target.value)}
                    placeholder={imageText.aiPlaceholder}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-emerald-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={generateImageActivityImage}
                  disabled={imageActivityGenerating || (!imageActivityAiPrompt.trim() && !imageActivityPrompt.trim())}
                  className="mt-3 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {imageActivityGenerating ? imageText.generating : imageText.generate}
                </button>
              </div>
            ) : null}

            {imageActivitySource === "upload" ? (
              <label className="mt-4 block rounded-2xl border border-emerald-100 bg-white/70 p-3">
                <span className="text-sm font-black text-slate-800">{imageText.uploadImage}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={imageActivityUploading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadImageActivityFile(file);
                    event.currentTarget.value = "";
                  }}
                  className="mt-2 w-full text-sm font-bold text-slate-700"
                />
                {imageActivityUploading ? <div className="mt-2 text-sm font-black text-emerald-800">{imageText.uploading}</div> : null}
              </label>
            ) : null}

            {imageActivitySource === "url" ? (
              <label className="mt-4 block rounded-2xl border border-emerald-100 bg-white/70 p-3">
                <span className="text-sm font-black text-slate-800">{imageText.imageUrl}</span>
                <input
                  value={imageActivityUrl}
                  onChange={(event) => setImageActivityUrl(event.target.value)}
                  placeholder={imageText.imagePlaceholder}
                  className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-emerald-500"
                />
              </label>
            ) : null}
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            {imageActivityUrl.trim() ? (
              <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageActivityUrl.trim()} alt="" className="aspect-video w-full object-cover" />
              </div>
            ) : null}
            <div className="text-sm font-black text-slate-800">{imageText.timer}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                [null, imageText.noTimer],
                [30, "30s"],
                [60, "60s"],
                [120, "120s"],
              ] as const).map(([value, label]) => (
                <button
                  key={value ?? "none"}
                  type="button"
                  onClick={() => {
                    setImageActivityTimerSeconds(value);
                    setImageActivityCustomTimerSeconds("");
                  }}
                  className={["rounded-xl border px-3 py-2 text-sm font-black", imageActivityTimerSeconds === value && !imageActivityCustomTimerSeconds.trim() ? "border-emerald-600 bg-emerald-100 text-emerald-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={imageActivityCustomTimerSeconds}
              onChange={(event) => setImageActivityCustomTimerSeconds(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder={imageText.customTime}
              className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-emerald-500"
            />
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{imageText.hint}</p>
            {imageActivityMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{imageActivityMessage}</div> : null}
            {imageActivityError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{imageActivityError}</div> : null}
            <button
              type="button"
              onClick={startImageActivity}
              disabled={imageActivityBusy || !imageActivityPrompt.trim() || !imageActivityUrl.trim()}
              className="mt-4 w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {imageActivityBusy ? imageText.starting : imageText.start}
            </button>
          </div>
        </div>
      </CollapsibleActivitySection>


      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MonitorUp className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-xl font-black text-slate-950 sm:text-2xl">{t("rooms.title")}</h2>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{t("rooms.text")}</p>
          </div>
          <button
            type="button"
            onClick={() => setSpacePickerOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 sm:w-auto"
          >
            {t("rooms.openPicker")}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {spaces.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">{t("rooms.empty")}</div>
        ) : null}
      </section>


      <CollapsibleActivitySection tone="violet" icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />} kicker={pollText.kicker} title={pollText.title} text={pollText.text}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
          <div>
            <label className="mt-4 block">
              <span className="text-sm font-black text-slate-800">{pollText.question}</span>
              <input
                value={pollQuestion}
                onChange={(event) => setPollQuestion(event.target.value)}
                placeholder={pollText.questionPlaceholder}
                className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-violet-500"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-black text-slate-800">{pollText.options}</span>
              <textarea
                value={pollOptionsRaw}
                onChange={(event) => setPollOptionsRaw(event.target.value)}
                placeholder={pollText.optionsPlaceholder}
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-violet-500"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-4">
            <div className="text-sm font-black text-slate-800">{pollText.timer}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                [null, pollText.noTimer],
                [30, "30s"],
                [60, "60s"],
                [120, "120s"],
              ] as const).map(([value, label]) => (
                <button
                  key={value ?? "none"}
                  type="button"
                  onClick={() => {
                    setPollTimerSeconds(value);
                    setPollCustomTimerSeconds("");
                  }}
                  className={["rounded-xl border px-3 py-2 text-sm font-black", pollTimerSeconds === value && !pollCustomTimerSeconds.trim() ? "border-violet-600 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={pollCustomTimerSeconds}
              onChange={(event) => setPollCustomTimerSeconds(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder={pollText.customTime}
              className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-violet-500"
            />
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-3">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">{pollText.options}</div>
              <div className="mt-2 space-y-2">
                {normalizePollOptionsText(pollOptionsRaw).map((option) => (
                  <div key={option} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-800">{option}</div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{pollText.hint}</p>
            {pollError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{pollError}</div> : null}
            <button
              type="button"
              onClick={startPoll}
              disabled={pollBusy || !pollQuestion.trim() || normalizePollOptionsText(pollOptionsRaw).length < 2}
              className="mt-4 w-full rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {pollBusy ? pollText.starting : pollText.start}
            </button>
          </div>
        </div>
      </CollapsibleActivitySection>


      <CollapsibleActivitySection tone="amber" icon={<Clock3 className="h-4 w-4" aria-hidden="true" />} kicker={timerText.kicker} title={timerText.title} text={timerText.text}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div className="rounded-2xl border border-amber-200 bg-white p-4">
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 120].map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => {
                    setTimerSeconds(seconds);
                    setCustomTimerSeconds("");
                    setTimerError("");
                  }}
                  className={["rounded-xl border px-4 py-3 text-sm font-black", timerSeconds === seconds && !customTimerSeconds.trim() ? "border-amber-600 bg-amber-100 text-amber-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
                >
                  {seconds}s
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-black text-slate-800">{timerText.customLabel}</span>
              <input
                value={customTimerSeconds}
                onChange={(event) => {
                  setCustomTimerSeconds(event.target.value.replace(/\D/g, "").slice(0, 4));
                  setTimerError("");
                }}
                inputMode="numeric"
                placeholder={timerText.customPlaceholder}
                className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-amber-500"
              />
            </label>
            {timerError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{timerError}</div> : null}
            <button
              type="button"
              onClick={startTimer}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white hover:bg-amber-700"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {timerText.start}
            </button>
          </div>
        </div>
      </CollapsibleActivitySection>


      {spacePickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">{t("rooms.modalTitle")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("rooms.modalText")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSpacePickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                aria-label={t("rooms.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              <input
                value={spaceSearch}
                onChange={(event) => setSpaceSearch(event.target.value)}
                placeholder={t("rooms.search")}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
              />

              <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
                <div className="grid gap-2">
                  {visibleSpaces.map((space) => {
                    const state = boardStates[space.id] ?? null;
                    const isLive = state?.active === true;
                    const title = safeString(space.data.title, t("rooms.untitled"));

                    return (
                      <Link
                        key={space.id}
                        href={`/${locale}/teacher/spaces/${space.id}/board`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 no-underline hover:border-blue-200 hover:bg-white"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-slate-950">{title}</div>
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                            <Radio className="h-4 w-4" aria-hidden="true" />
                            {isLive ? t("rooms.activeMode", { mode: modeLabel(t, state?.mode) }) : t("rooms.ready")}
                          </div>
                        </div>
                        <span className={["inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black", isLive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"].join(" ")}>
                          <span className={["h-2 w-2 rounded-full", isLive ? "bg-emerald-500" : "bg-slate-400"].join(" ")} />
                          {isLive ? t("rooms.live") : t("rooms.notLive")}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-500">{t("rooms.showing", { shown: visibleSpaces.length, total: filteredSpaces.length })}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSpacePage((page) => Math.max(0, page - 1))}
                    disabled={spacePage === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("rooms.prev")}
                  </button>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">{spacePage + 1} / {pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setSpacePage((page) => Math.min(pageCount - 1, page + 1))}
                    disabled={spacePage >= pageCount - 1}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("rooms.next")}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}



      <style jsx global>{`
        @keyframes boardQuizFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
