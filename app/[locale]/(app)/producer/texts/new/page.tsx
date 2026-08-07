// app\[locale]\(app)\producer\texts\new\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";
import { trackCreateLesson } from "@/lib/analytics";
import { trackEvent } from "@/lib/trackEvent";
import { getTextTypeLabel, type TextTypeKey } from "@/lib/textTypes";
import { X } from "lucide-react";

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

type TaskType = "truefalse" | "mcq" | "open";
type LessonTask = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
};

type GenerateTextResp = {
  title?: string;
  text?: unknown;
  error?: string;
  raw?: string;
};
type GenerateTasksResp = {
  ok?: boolean;
  tasks?: ContentPack["tasks"];
  error?: string;
  raw?: string;
  quota?: {
    feature?: string;
    bucket?: string;
    limit?: number;
    used?: number;
    remaining?: number;
  };
};

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

function stringifyGeneratedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(stringifyGeneratedText).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(stringifyGeneratedText)
      .filter(Boolean)
      .join("\n\n");
  }
  if (value == null) return "";
  return String(value).trim();
}

function hasAnyTerm(value: string, terms: string[]) {
  const normalized = value.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function looksLikeNamedPersonTopic(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 80 || /\bi\b/i.test(cleaned)) return false;
  const words = cleaned
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter(Boolean);

  const capitalizedWords = words.filter((word) => /^\p{Lu}/u.test(word));
  return capitalizedWords.length >= 2;
}

type LevelKey = "A1_START" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type A1StartTense = "present" | "past" | "future";
type A1StartSentenceCount = 10 | 13 | 16 | 19;
type A1StartHighFrequencyLength = 50 | 100 | 150;
type A1StartType = "pattern_sentences" | "high_frequency_words" | "sound_reading_ladder";
type A1StartWordClass = keyof typeof A1_START_HIGH_FREQUENCY_WORDS;

const A1_START_HIGH_FREQUENCY_WORDS = {
  conjunction: {
    nb: ["og", "men", "eller", "fordi", "så", "når", "hvis", "at"],
    en: ["and", "but", "or", "because", "so", "when", "if", "that"],
    "pt-br": ["e", "mas", "ou", "porque", "então", "quando", "se", "que"],
  },
  adverb: {
    nb: ["ikke", "også", "nå", "alltid", "ofte", "kanskje", "snart", "her"],
    en: ["not", "also", "now", "always", "often", "maybe", "soon", "here"],
    "pt-br": ["não", "também", "agora", "sempre", "muitas vezes", "talvez", "em breve", "aqui"],
  },
  determiner: {
    nb: ["min", "mitt", "mine", "denne", "dette", "disse", "alle", "mange"],
    en: ["my", "this", "these", "all", "many"],
    "pt-br": ["meu", "minha", "meus", "minhas", "este", "esta", "isto", "estes", "estas", "todos", "muitos"],
  },
  preposition: {
    nb: ["i", "på", "med", "til", "fra", "under", "ved", "mellom"],
    en: ["in", "on", "with", "to", "from", "under", "by", "between"],
    "pt-br": ["em", "sobre", "com", "para", "de", "embaixo de", "perto de", "entre"],
  },
} as const;

const A1_START_THEMES = [
  "familie",
  "skole",
  "shopping",
  "reise",
  "frokost",
  "middag",
  "venner",
  "hjem",
  "transport",
  "helse",
] as const;

const A1_START_SOUND_CHOICES = {
  nb: ["s", "m", "a", "b", "d", "f", "g", "k", "n", "e", "o", "u", "æ", "ø", "å", "sj", "kj"],
  en: ["s", "m", "a", "th", "b", "d", "f", "g", "k", "n", "e", "o", "u", "sh"],
  "pt-br": ["s", "m", "a", "nh", "b", "d", "f", "g", "l", "n", "e", "o", "u", "lh"],
} as const;

function getA1StartHighFrequencyWords(
  wordClass: A1StartWordClass,
  language: string
): readonly string[] {
  const lang = language.toLocaleLowerCase();
  const normalizedLang = lang === "no" ? "nb" : lang;
  if (normalizedLang !== "nb" && normalizedLang !== "en" && normalizedLang !== "pt-br") return [];
  return A1_START_HIGH_FREQUENCY_WORDS[wordClass][normalizedLang];
}

function getA1StartSoundChoices(language: string): readonly string[] {
  const lang = language.toLocaleLowerCase();
  const normalizedLang = lang === "no" || lang === "nn" ? "nb" : lang;
  if (normalizedLang !== "nb" && normalizedLang !== "en" && normalizedLang !== "pt-br") return [];
  return A1_START_SOUND_CHOICES[normalizedLang];
}

const A1_START_VERB_SUGGESTIONS: Record<string, readonly string[]> = {
  nb: ["er", "har", "ser", "liker", "spiser", "drikker", "går", "kommer", "lager", "leser", "skriver"],
  en: ["be", "have", "see", "like", "eat", "drink", "go", "come", "make", "read", "write"],
  "pt-br": ["ser", "ter", "ver", "gostar", "comer", "beber", "ir", "vir", "fazer", "ler", "escrever"],
};

function getA1StartVerbSuggestions(language: string): readonly string[] {
  return A1_START_VERB_SUGGESTIONS[language.toLocaleLowerCase()] || A1_START_VERB_SUGGESTIONS.nb;
}

function getDefaultContentLanguage(locale: string): string {
  const normalized = locale.toLocaleLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pt")) return "pt-BR";
  return "nb";
}

const LANGUAGE_LABELS_BY_LOCALE: Record<"nb" | "en" | "pt", Record<string, string>> = {
  nb: {
    nb: "Norsk (bokmål)",
    nn: "Norsk (nynorsk)",
    se: "Nordsamisk",
    en: "Engelsk",
    "pt-BR": "Portugisisk (Brasil)",
    "pt-PT": "Portugisisk (Portugal)",
    sv: "Svensk",
    da: "Dansk",
    fi: "Finsk",
    de: "Tysk",
    fr: "Fransk",
    es: "Spansk",
    it: "Italiensk",
    nl: "Nederlandsk",
    pl: "Polsk",
    cs: "Tsjekkisk",
    sk: "Slovakisk",
    hu: "Ungarsk",
    ro: "Rumensk",
    bg: "Bulgarsk",
    el: "Gresk",
    ru: "Russisk",
    uk: "Ukrainsk",
    sr: "Serbisk",
    tr: "Tyrkisk",
    lv: "Latvisk",
    lt: "Litauisk",
    ar: "Arabisk",
    so: "Somali",
    ti: "Tigrinja",
    am: "Amharisk",
    kmr: "Kurdisk (Kurmanji)",
    ckb: "Kurdisk (Sorani)",
    sq: "Albansk",
    ta: "Tamil",
    om: "Oromo",
    "fa-AF": "Dari (Afghanistan)",
    ps: "Pashto",
    fa: "Persisk",
    ur: "Urdu",
    hi: "Hindi",
    bn: "Bengali",
    rw: "Kinyarwanda",
    ln: "Lingala",
    sw: "Swahili",
    din: "Dinka",
    nus: "Nuer",
    vi: "Vietnamesisk",
    th: "Thai",
    "zh-CN": "Kinesisk (forenklet)",
    "zh-TW": "Kinesisk (tradisjonell)",
    ja: "Japansk",
    ko: "Koreansk",
    tl: "Filipino / Tagalog",
    ceb: "Cebuano",
  },
  en: {
    nb: "Norwegian (Bokmål)",
    nn: "Norwegian (Nynorsk)",
    se: "Northern Sami",
    en: "English",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese (Portugal)",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    nl: "Dutch",
    pl: "Polish",
    cs: "Czech",
    sk: "Slovak",
    hu: "Hungarian",
    ro: "Romanian",
    bg: "Bulgarian",
    el: "Greek",
    ru: "Russian",
    uk: "Ukrainian",
    sr: "Serbian",
    tr: "Turkish",
    lv: "Latvian",
    lt: "Lithuanian",
    ar: "Arabic",
    so: "Somali",
    ti: "Tigrinya",
    am: "Amharic",
    kmr: "Kurdish (Kurmanji)",
    ckb: "Kurdish (Sorani)",
    sq: "Albanian",
    ta: "Tamil",
    om: "Oromo",
    "fa-AF": "Dari (Afghanistan)",
    ps: "Pashto",
    fa: "Persian",
    ur: "Urdu",
    hi: "Hindi",
    bn: "Bengali",
    rw: "Kinyarwanda",
    ln: "Lingala",
    sw: "Swahili",
    din: "Dinka",
    nus: "Nuer",
    vi: "Vietnamese",
    th: "Thai",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    ja: "Japanese",
    ko: "Korean",
    tl: "Filipino / Tagalog",
    ceb: "Cebuano",
  },
  pt: {
    nb: "Norueguês (Bokmål)",
    nn: "Norueguês (Nynorsk)",
    se: "Sami do Norte",
    en: "Inglês",
    "pt-BR": "Português (Brasil)",
    "pt-PT": "Português (Portugal)",
    sv: "Sueco",
    da: "Dinamarquês",
    fi: "Finlandês",
    de: "Alemão",
    fr: "Francês",
    es: "Espanhol",
    it: "Italiano",
    nl: "Holandês",
    pl: "Polonês",
    cs: "Tcheco",
    sk: "Eslovaco",
    hu: "Húngaro",
    ro: "Romeno",
    bg: "Búlgaro",
    el: "Grego",
    ru: "Russo",
    uk: "Ucraniano",
    sr: "Sérvio",
    tr: "Turco",
    lv: "Letão",
    lt: "Lituano",
    ar: "Árabe",
    so: "Somali",
    ti: "Tigrínia",
    am: "Amárico",
    kmr: "Curdo (Kurmanji)",
    ckb: "Curdo (Sorani)",
    sq: "Albanês",
    ta: "Tâmil",
    om: "Oromo",
    "fa-AF": "Dari (Afeganistão)",
    ps: "Pashto",
    fa: "Persa",
    ur: "Urdu",
    hi: "Hindi",
    bn: "Bengali",
    rw: "Kinyarwanda",
    ln: "Lingala",
    sw: "Suaíli",
    din: "Dinka",
    nus: "Nuer",
    vi: "Vietnamita",
    th: "Tailandês",
    "zh-CN": "Chinês (simplificado)",
    "zh-TW": "Chinês (tradicional)",
    ja: "Japonês",
    ko: "Coreano",
    tl: "Filipino / Tagalog",
    ceb: "Cebuano",
  },
};

function getLabelLocale(locale: string): "nb" | "en" | "pt" {
  const normalized = locale.toLocaleLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pt")) return "pt";
  return "nb";
}

function getLanguageDisplayLabel(code: string, label: string, locale: string): string {
  return LANGUAGE_LABELS_BY_LOCALE[getLabelLocale(locale)][code] || label.split("–")[0]?.trim() || label;
}

const GENERATOR_TEXT_TYPE_KEYS = [
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
] as const satisfies readonly TextTypeKey[];

const LEVEL_DEFAULTS: Record<
  LevelKey,
  { textLength: number; trueFalse: number; mcq: number; facts: number; reflection: number }
> = {
  A1_START: { textLength: 10, trueFalse: 0, mcq: 0, facts: 0, reflection: 1 },
  A1: { textLength: 80, trueFalse: 3, mcq: 3, facts: 2, reflection: 1 },
  A2: { textLength: 140, trueFalse: 6, mcq: 4, facts: 3, reflection: 1 },
  B1: { textLength: 200, trueFalse: 8, mcq: 6, facts: 3, reflection: 2 },
  B2: { textLength: 260, trueFalse: 10, mcq: 6, facts: 6, reflection: 2 },
  C1: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
  C2: { textLength: 300, trueFalse: 10, mcq: 8, facts: 6, reflection: 3 },
};

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function resolveRoleFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "anonymous";

  const p = profile as Record<string, unknown>;

  if (p.role === "teacher" || p.role === "student" || p.role === "parent") {
    return p.role;
  }

  if (p.mode === "teacher" || p.mode === "student" || p.mode === "parent") {
    return p.mode;
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (orgRole === "teacher" || orgRole === "student" || orgRole === "parent") {
      return orgRole;
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.teacher === true) return "teacher";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return "anonymous";
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

export default function NewTextPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("generateNewText");
  const { profile } = useUserProfile();
  const videoCopy = useMemo(() => {
    const lang = locale.toLocaleLowerCase();
    if (lang.startsWith("en")) {
      return {
        title: "Instruction video",
        body: "See how to create a worksheet lesson",
        close: "Close video",
      };
    }
    if (lang.startsWith("pt")) {
      return {
        title: "Vídeo de instrução",
        body: "Veja como criar uma lesson com tarefas",
        close: "Fechar vídeo",
      };
    }
    return {
      title: "Instruksjonsvideo",
      body: "Se hvordan du lager en worksheet lesson",
      close: "Lukk video",
    };
  }, [locale]);

  useEffect(() => {
    trackEvent("lesson_generator_open", {
      source: "text",
    });
  }, []);

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    marginTop: 6,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffffef",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    outline: "none",
    fontSize: 14,
  };

  const cardStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 20,
    background: "#e6eef0f1",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.10)",
    padding: 18,
  };

  const mutedCardStyle: CSSProperties = {
    ...cardStyle,
    opacity: 0.68,
    background: "#e3e4d8f3",
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

  const buttonSuccess: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #14532d",
    background: "#15803d",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
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

  const stepBadgeStyle = (active: boolean, done: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    border: "1px solid #cbd5e1",
    background: done ? "#deede3" : active ? "#dbeafe" : "#f8fafc",
    color: "#0f172a",
  });

  const videoLink: CSSProperties = {
    minWidth: 250,
    flex: "0 1 320px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#bfdbfe",
    borderRadius: 20,
    background: "rgba(255,255,255,0.88)",
    padding: 10,
    display: "flex",
    alignItems: "center",
    gap: 12,
    color: "inherit",
    boxShadow: "0 10px 24px rgba(37,99,235,0.09)",
    cursor: "pointer",
    textAlign: "left",
  };

  const videoThumb: CSSProperties = {
    position: "relative",
    width: 92,
    aspectRatio: "16 / 9",
    borderRadius: 14,
    overflow: "hidden",
    background: "#dbeafe",
    flex: "0 0 auto",
  };

  const playCircle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 36,
    height: 36,
    borderRadius: 999,
    background: "#2563eb",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 8px 18px rgba(37,99,235,0.22)",
  };

  const playTriangle: CSSProperties = {
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderLeft: "12px solid #ffffff",
    marginLeft: 3,
  };

  const videoOverlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "grid",
    placeItems: "center",
    background: "rgba(15,23,42,0.72)",
    padding: 16,
  };

  const videoModal: CSSProperties = {
    width: "min(960px, 100%)",
    overflow: "hidden",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  };

  const videoModalHeader: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e2e8f0",
    padding: "16px 18px",
  };

  const closeVideoButton: CSSProperties = {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    background: "#ffffff",
    color: "#334155",
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  };

  const videoFrameShell: CSSProperties = {
    aspectRatio: "16 / 9",
    background: "#000000",
  };

  const videoFrame: CSSProperties = {
    width: "100%",
    height: "100%",
    border: 0,
  };

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [level, setLevel] = useState<LevelKey>("A2");
  const [language, setLanguage] = useState(() => getDefaultContentLanguage(locale));
  const languageOptions = useMemo(() => {
    const defaultLanguage = getDefaultContentLanguage(locale);
    return [...LANGUAGES].sort((a, b) => {
      if (a.code === defaultLanguage) return -1;
      if (b.code === defaultLanguage) return 1;
      return 0;
    });
  }, [locale]);
  const [prompt, setPrompt] = useState("");
  const [textTypePreset, setTextTypePreset] = useState<TextTypeKey>("everydayStory");
  const [textTypeOther, setTextTypeOther] = useState("");
  const textTypeLabel = useMemo(() => {
    if (textTypePreset === "other") {
      return (textTypeOther || t("textTypes.other")).trim() || t("textTypes.other");
    }
    return getTextTypeLabel(textTypePreset, locale);
  }, [locale, textTypePreset, textTypeOther, t]);
  const textTypeValue = textTypePreset === "other" ? textTypeLabel : textTypePreset;

  const [textLength, setTextLength] = useState<number>(LEVEL_DEFAULTS.A2.textLength);
  const [mcqCount, setMcqCount] = useState<number>(LEVEL_DEFAULTS.A2.mcq);
  const [trueFalseCount, setTrueFalseCount] = useState<number>(LEVEL_DEFAULTS.A2.trueFalse);
  const [factsCount, setFactsCount] = useState<number>(LEVEL_DEFAULTS.A2.facts);
  const [reflectionCount, setReflectionCount] = useState<number>(LEVEL_DEFAULTS.A2.reflection);
  const [a1StartVerb, setA1StartVerb] = useState("er");
  const [a1StartCustomVerb, setA1StartCustomVerb] = useState("");
  const [a1StartType, setA1StartType] = useState<A1StartType>("pattern_sentences");
  const [a1StartWordClass, setA1StartWordClass] = useState<A1StartWordClass>("conjunction");
  const [a1StartWord, setA1StartWord] = useState("og");
  const [a1StartHighFrequencyLength, setA1StartHighFrequencyLength] =
    useState<A1StartHighFrequencyLength>(50);
  const [a1StartHighFrequencyTheme, setA1StartHighFrequencyTheme] = useState("familie");
  const [a1StartHighFrequencyCustomTheme, setA1StartHighFrequencyCustomTheme] = useState("");
  const [a1StartFocusSound, setA1StartFocusSound] = useState("s");
  const [a1StartSoundSentenceCount, setA1StartSoundSentenceCount] = useState(5);
  const [a1StartSoundWordCount, setA1StartSoundWordCount] = useState(9);
  const [a1StartTense, setA1StartTense] = useState<A1StartTense>("present");
  const [a1StartSentenceCount, setA1StartSentenceCount] =
    useState<A1StartSentenceCount>(10);
  const [a1StartTopic, setA1StartTopic] = useState("familie");
  const [a1StartCustomTopic, setA1StartCustomTopic] = useState("");
  const [a1StartTrueFalseCount, setA1StartTrueFalseCount] = useState(5);
  const [a1StartImageSentenceCount, setA1StartImageSentenceCount] = useState(5);
  const [a1StartVerbSentenceCount, setA1StartVerbSentenceCount] = useState(5);
  const a1StartVerbSuggestions = getA1StartVerbSuggestions(language);
  const a1StartUsesCustomVerb = a1StartVerb === "__custom__";
  const effectiveA1StartVerb = a1StartUsesCustomVerb
    ? a1StartCustomVerb.trim()
    : a1StartVerb.trim();
  const isA1StartHighFrequency = a1StartType === "high_frequency_words";
  const isA1StartSoundLadder = a1StartType === "sound_reading_ladder";
  const isHighFrequencyLanguage = ["nb", "no", "en", "pt-br"].includes(language.toLocaleLowerCase());
  const isSoundLadderLanguage = ["nb", "no", "nn", "en", "pt-br"].includes(language.toLocaleLowerCase());
  const a1StartWords = getA1StartHighFrequencyWords(a1StartWordClass, language);
  const a1StartSoundChoices = getA1StartSoundChoices(language);
  const effectiveA1StartHighFrequencyTheme =
    a1StartHighFrequencyTheme === "__custom__"
      ? a1StartHighFrequencyCustomTheme.trim()
      : a1StartHighFrequencyTheme;
  const effectiveA1StartPatternTopic =
    a1StartTopic === "__custom__"
      ? a1StartCustomTopic.trim()
      : a1StartTopic;

  const [title, setTitle] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>("");
  const [approvedSourceText, setApprovedSourceText] = useState("");
  const [lastFactCheckedText, setLastFactCheckedText] = useState("");
  const [lastGeneratedWith, setLastGeneratedWith] = useState<"standard" | "factcheck" | "manual">("manual");
  const [lessonTasks, setLessonTasks] = useState<LessonTask[]>([]);
  const [pack, setPack] = useState<ContentPack | null>(null);

  const [loadingText, setLoadingText] = useState(false);
  const [textGenerationMode, setTextGenerationMode] = useState<"standard" | "factcheck" | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [tasksDirty, setTasksDirty] = useState(false);
  const [taskUsageMessage, setTaskUsageMessage] = useState<string | null>(null);

  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const busy = loadingText || loadingTasks || saving;
  const isA1Start = level === "A1_START";
  const effectiveTextType = isA1Start ? a1StartType : textTypeLabel;
  const effectiveTextTypeValue = isA1Start ? a1StartType : textTypeValue;
  const effectiveA1StartTopic = isA1StartHighFrequency || isA1StartSoundLadder
    ? effectiveA1StartHighFrequencyTheme
    : effectiveA1StartPatternTopic;
  const effectiveTopic = isA1Start ? effectiveA1StartTopic : prompt.trim();

  useEffect(() => {
    if (!videoOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVideoOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [videoOpen]);

  useEffect(() => {
    const nextLanguage = getDefaultContentLanguage(locale);
    setLanguage(nextLanguage);
    if (isA1Start) {
      setA1StartVerb(getA1StartVerbSuggestions(nextLanguage)[0] || "");
      const nextWords = getA1StartHighFrequencyWords(a1StartWordClass, nextLanguage);
      setA1StartWord(nextWords[0] || "");
      const nextSounds = getA1StartSoundChoices(nextLanguage);
      setA1StartFocusSound(nextSounds[0] || "s");
    }
    // This should only follow the page language, not reset a manual language choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const factCheckReason = useMemo(() => {
    if (isA1Start) return "";
    const textTypeTerms = `${textTypePreset} ${textTypeLabel} ${textTypeOther}`;
    const topicTerms = `${prompt} ${effectiveTopic}`;
    if (hasAnyTerm(textTypeTerms, ["factual", "saktekst", "texto informativo"])) return "factual_text";
    if (hasAnyTerm(textTypeTerms, ["biography", "biografi"])) return "biography";
    if (hasAnyTerm(topicTerms, ["biografi", "biography", "historisk", "historical", "historie", "history"])) {
      return "sensitive_topic";
    }
    if (looksLikeNamedPersonTopic(effectiveTopic)) return "named_person_topic";
    return "";
  }, [effectiveTopic, isA1Start, prompt, textTypeLabel, textTypeOther, textTypePreset]);
  const factCheckRequired = factCheckReason.length > 0;
  const currentTextFactChecked =
    factCheckRequired && lastFactCheckedText.trim() === sourceText.trim() && sourceText.trim().length > 0;

  const profileUid =
    profile && typeof profile === "object" && "uid" in profile
      ? (profile as { uid?: string }).uid
      : undefined;

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const role = useMemo(() => resolveRoleFromProfile(profile), [profile]);
  const plan = useMemo(() => safePlan(planValue), [planValue]);
  const billing = useMemo(() => getBillingSnapshot(profile), [profile]);
  const partnerAccess = profile?.partnerAccess === true;
  const partnerStatus = profile?.partnerStatus ?? null;
  const schoolId = profile?.schoolId ?? null;
  const schoolRole = profile?.schoolRole ?? null;
  const schoolStatus = profile?.schoolStatus ?? null;

  const sourceWordCount = useMemo(() => {
    return sourceText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }, [sourceText]);

  useEffect(() => {
    const d = LEVEL_DEFAULTS[level];
    setTextLength(d.textLength);
    setTrueFalseCount(d.trueFalse);
    setMcqCount(d.mcq);
    setFactsCount(Math.max(0, Math.min(10, d.facts)));
    setReflectionCount(d.reflection);
  }, [level]);

  const a1StartConfig = isA1Start
    ? {
      type: a1StartType,
      verb: effectiveA1StartVerb,
      tense: a1StartTense,
      sentenceCount: a1StartSentenceCount,
      topic: effectiveA1StartTopic,
      trueFalseCount: a1StartTrueFalseCount,
      imageSentenceCount: a1StartImageSentenceCount,
      verbSentenceCount: a1StartVerbSentenceCount,
      wordClass: a1StartWordClass,
      word: a1StartWord,
      highFrequencyLength: a1StartHighFrequencyLength,
      highFrequencyTheme: effectiveA1StartHighFrequencyTheme,
      focusSound: a1StartFocusSound,
      soundSentenceCount: a1StartSoundSentenceCount,
      soundWordCount: a1StartSoundWordCount,
    }
    : undefined;

  async function refreshFeatureStatus(currentUid?: string) {
    const uid = currentUid ?? getAuth().currentUser?.uid ?? profileUid;
    if (!uid) {
      setFeatureStatus(null);
      setStatusLoading(false);
      return;
    }

    try {
      const status = await getFeatureStatusFromProfile({
        uid,
        role,
        plan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
        feature: "producer_create_lesson",
      });
      setFeatureStatus(status);
    } catch {
      setFeatureStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const uid = getAuth().currentUser?.uid ?? profileUid;

      if (!uid) {
        if (active) {
          setFeatureStatus(null);
          setStatusLoading(false);
        }
        return;
      }

      setStatusLoading(true);

      try {
        const status = await getFeatureStatusFromProfile({
          uid,
          role,
          plan,
          billing,
          partnerAccess,
          partnerStatus,
          schoolId,
          schoolRole,
          schoolStatus,
          feature: "producer_create_lesson",
        });

        if (active) {
          setFeatureStatus(status);
        }
      } catch {
        if (active) {
          setFeatureStatus(null);
        }
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [
    profileUid,
    role,
    plan,
    billing,
    partnerAccess,
    partnerStatus,
    schoolId,
    schoolRole,
    schoolStatus,
  ]);

  function buildFactsPrompt(count: number) {
    if (count <= 0) return "";
    return t("tasks.factsPrompt", { count });
  }

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
    const factsN = Math.max(0, Math.min(10, factsCount));
    if (factsN > 0) {
      tasks.push({
        id: newId(),
        order: order++,
        type: "open",
        prompt: buildFactsPrompt(factsN),
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
    return tasks.map((ttt, idx) => ({ ...ttt, order: idx + 1 }));
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

  function localizeError(message: string): string {
    const m = message || "";
    if (m === "Generate or write text first.") return t("errors.generateOrWriteTextFirst");
    if (m === "Missing text in response.") return t("errors.missingTextInResponse");
    if (m === "Title is required.") return t("errors.titleRequired");
    if (m === "Source text is empty.") return t("errors.sourceTextEmpty");
    if (m === "Not signed in. Please log in as teacher/producer.") return t("errors.notSignedIn");
    if (m === "Not signed in.") return t("errors.notSignedIn");
    if (m.startsWith("Empty response from server.")) return t("errors.emptyResponseFromServer");
    if (m.startsWith("Not JSON.")) return t("errors.notJsonFromServer");
    if (m === "Missing id from server.") return t("errors.missingIdFromServer");
    if (m.startsWith("Limit reached:")) return m;
    return m;
  }

  async function generateTextOnly(extraFactCheck = false) {
    setLoadingText(true);
    setTextGenerationMode(extraFactCheck ? "factcheck" : "standard");
    setError(null);
    setSavedId(null);

    try {
      if (isA1Start && !isA1StartHighFrequency && !effectiveA1StartVerb) {
        throw new Error(t("a1Start.errors.verbRequired"));
      }

      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");

      const token = await user.getIdToken();

      const res = await fetch("/api/producer/generate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          level,
          language,
          topic: effectiveTopic,
          textType: effectiveTextType,
          textLength,
          extraFactCheck,
          a1Start: a1StartConfig,
        }),
      });

      const raw = await res.text();
      if (!raw) throw new Error(`Empty response from server. HTTP ${res.status}`);

      let data: GenerateTextResp & {
        quota?: {
          feature?: string;
          limit?: number;
          used?: number;
          remaining?: number;
        };
      };

      try {
        data = JSON.parse(raw) as GenerateTextResp & {
          quota?: {
            feature?: string;
            limit?: number;
            used?: number;
            remaining?: number;
          };
        };
      } catch {
        throw new Error(`Not JSON. HTTP ${res.status}. First chars: ${raw.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      trackEvent("ai_generate_text", {
        source: "text",
        level,
        language,
        textType: effectiveTextTypeValue,
      });

      const nextTitle = String(data.title || "").trim();
      const nextText = stringifyGeneratedText(data.text);
      if (!nextText) throw new Error("Missing text in response.");

      setTitle(nextTitle);
      setSourceText(nextText);
      setApprovedSourceText("");
      setLastGeneratedWith(extraFactCheck ? "factcheck" : "standard");
      setLastFactCheckedText(extraFactCheck ? nextText : "");
      setLessonTasks([]);
      setPack(null);
      setTasksDirty(false);

      await refreshFeatureStatus(user.uid);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingText(false);
      setTextGenerationMode(null);
    }
  }

  async function generateTasksOnly(approvedTextOverride = "") {
    setLoadingTasks(true);
    setError(null);
    setSavedId(null);
    setTaskUsageMessage(null);

    try {
      if (!sourceText.trim()) throw new Error("Generate or write text first.");
      const approvedText = approvedTextOverride.trim() || approvedSourceText.trim();
      if (approvedText !== sourceText.trim()) {
        throw new Error(t("errors.approveTextFirst"));
      }

      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in.");

      const token = await user.getIdToken();

      const res = await fetch("/api/producer/generate-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          level,
          language,
          topic: effectiveTopic,
          textType: effectiveTextType,
          text: sourceText,
          tasks: {
            mcq: mcqCount,
            trueFalse: trueFalseCount,
            facts: factsCount,
            reflection: reflectionCount,
          },
          a1Start: a1StartConfig,
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
        topic: effectiveTopic,
        text: sourceText,
        tasks: data.tasks,
      };

      setLessonTasks(packToLessonTasks(fakePack));
      setPack(fakePack);
      setTasksDirty(false);

      if (data.quota) {
        setFeatureStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            used: typeof data.quota?.used === "number" ? data.quota.used : prev.used,
            limit: typeof data.quota?.limit === "number" ? data.quota.limit : prev.limit,
            remaining:
              typeof data.quota?.remaining === "number" ? data.quota.remaining : prev.remaining,
          };
        });

        if (
          typeof data.quota.used === "number" &&
          typeof data.quota.limit === "number"
        ) {
          setTaskUsageMessage(
            t("status.tasksGeneratedQuotaUsed", {
              used: data.quota.used,
              limit: data.quota.limit,
            })
          );
        } else {
          setTaskUsageMessage(t("status.tasksGeneratedUsageUpdated"));
        }
      } else {
        setTaskUsageMessage(t("status.tasksGeneratedUsageUpdated"));
      }
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setLoadingTasks(false);
    }
  }

  async function approveTextAndGenerateTasks() {
    const nextApprovedText = sourceText.trim();
    setApprovedSourceText(nextApprovedText);
    await generateTasksOnly(nextApprovedText);
  }

  async function saveLesson(): Promise<string> {
    if (!sourceText.trim()) throw new Error("Source text is empty.");

    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in. Please log in as teacher/producer.");

    if (featureStatus && !featureStatus.allowed) {
      throw new Error(
        featureStatus.reason === "limit_reached"
          ? t("status.quotaExceeded", {
            used: featureStatus.used,
            limit: featureStatus.limit,
          })
          : t("status.featureUnavailable")
      );
    }

    const token = await user.getIdToken();

    const res = await fetch("/api/producer/create-lesson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: title.trim() || t("defaults.title"),
        level,
        language,
        prompt: effectiveTopic,
        topic: effectiveTopic,
        textType: effectiveTextType,
        sourceText: sourceText || "",
        tasks: renumberOrders(lessonTasks),
        aiQuality: {
          factCheckRequired,
          factChecked: currentTextFactChecked,
          factCheckReason,
          generatedWith: lastGeneratedWith,
        },
      }),
    });
    if (!res.ok) {
      throw new Error("Could not create lesson");
    }

    trackCreateLesson("text");
    trackEvent("lesson_created", {
      source: "text",
      level,
      language,
      textType: effectiveTextTypeValue,
    });

    const raw = await res.text();

    let data: unknown = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // ignore invalid JSON
    }

    const anyData: Record<string, unknown> = isRecord(data) ? data : {};

    if (!res.ok) {
      const msg = typeof anyData["error"] === "string" ? anyData["error"] : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const id = typeof anyData["id"] === "string" ? anyData["id"].trim() : "";
    if (!id) throw new Error("Missing id from server.");

    setSavedId(id);
    await refreshFeatureStatus(user.uid);

    return id;
  }

  async function saveDraftOnly() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const id = await saveLesson();
      router.push(`/${locale}/producer/${id}`);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  async function goToFinishing() {
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const id = await saveLesson();
      router.push(`/${locale}/producer/${id}`);
    } catch (e: unknown) {
      setError(localizeError(getErrorMessage(e)));
    } finally {
      setSaving(false);
    }
  }

  const quotaBlocked = featureStatus ? !featureStatus.allowed : false;
  const quotaBadgeText = featureStatus
    ? t("status.quotaUsed", { used: featureStatus.used, limit: featureStatus.limit })
    : null;

  const hasText = sourceText.trim().length > 0;
  const hasTasks = lessonTasks.length > 0;
  const textApproved = hasText && approvedSourceText.trim() === sourceText.trim();
  const step1Done = textApproved;
  const step2Active = hasText;
  const step2Done = hasTasks;
  const step3Active = hasText && hasTasks;

  const stepStatus = !hasText
    ? {
      title: t("stepStatus.step1Title"),
      body: t("stepStatus.step1Body"),
      tone: "#eff6ff",
      border: "#bfdbfe",
    }
    : !textApproved
      ? {
        title: t("stepStatus.reviewTextTitle"),
        body: t("stepStatus.reviewTextBody"),
        tone: "#fff7ed",
        border: "#fed7aa",
      }
    : !hasTasks
      ? {
        title: t("stepStatus.textReadyTitle"),
        body: t("stepStatus.textReadyBody"),
        tone: "#fffbeb",
        border: "#fde68a",
      }
      : {
        title: t("stepStatus.tasksReadyTitle"),
        body: t("stepStatus.tasksReadyBody"),
        tone: "#ecfdf5",
        border: "#86efac",
      };

  return (
    <main
      className="pageWrap"
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        padding: "8px 12px 60px",
        boxSizing: "border-box",
      }}
    >
      <div className="pageCard" style={{ ...cardStyle, padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "stretch",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 520px" }}>
            <h1 style={{ marginTop: 0, marginBottom: 6, fontSize: 26, fontWeight: 800 }}>
              {t("title")}
            </h1>
            <p style={{ marginTop: 0, marginBottom: 0, opacity: 0.8 }}>{t("subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            style={videoLink}
            aria-label={videoCopy.title}
          >
            <div style={videoThumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://img.youtube.com/vi/X8lX6hSRNvs/mqdefault.jpg"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div style={playCircle} aria-hidden="true">
                <span style={playTriangle} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{videoCopy.title}</div>
              <div style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>{videoCopy.body}</div>
            </div>
          </button>
        </div>

        {videoOpen ? (
          <div style={videoOverlay} role="dialog" aria-modal="true" aria-label={videoCopy.title} onClick={() => setVideoOpen(false)}>
            <div style={videoModal} onClick={(event) => event.stopPropagation()}>
              <div style={videoModalHeader}>
                <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{videoCopy.title}</div>
                <button type="button" onClick={() => setVideoOpen(false)} style={closeVideoButton} aria-label={videoCopy.close}>
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
              <div style={videoFrameShell}>
                <iframe
                  src="https://www.youtube-nocookie.com/embed/X8lX6hSRNvs?autoplay=1&rel=0&modestbranding=1"
                  title={videoCopy.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={videoFrame}
                />
              </div>
            </div>
          </div>
        ) : null}

        <section
          style={{
            ...cardStyle,
            marginBottom: 16,
            background: "#eaedf1f3",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#eaeddbf2",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
                <strong>{t("steps.text")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step1Done ? t("steps.ready") : t("steps.generateOrPasteText")}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#eee4e4f4",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
                <strong>{t("steps.tasks")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step2Done
                  ? t("steps.ready")
                  : step2Active
                    ? t("steps.nextStep")
                    : t("steps.lockedUntilTextReady")}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 12,
                background: "#e5e6eff5",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span style={stepBadgeStyle(step3Active, false)}>3</span>
                <strong>{t("steps.finishing")}</strong>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {step3Active ? t("steps.readyForFinalSetup") : t("steps.lockedUntilTasksReady")}
              </div>
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${stepStatus.border}`,
              background: stepStatus.tone,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{stepStatus.title}</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{stepStatus.body}</div>
          </div>
        </section>

        <section style={{ marginTop: 14 }}>
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <span style={stepBadgeStyle(!step1Done, step1Done)}>1</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.generateOrPasteTextTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.generateOrPasteTextBody")}
                </div>
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
                background: "#e2e8eef8",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
                {t("fields.sharedSettingsTitle")}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <label>
                  {t("fields.level")}
                  <select
                    value={level}
                    onChange={(e) => {
                      const nextLevel = e.target.value as LevelKey;
                      setLevel(nextLevel);
                      if (nextLevel === "A1_START") {
                        setA1StartVerb(getA1StartVerbSuggestions(language)[0] || "");
                      }
                    }}
                    style={fieldStyle}
                  >
                    <option value="A1_START">{t("a1Start.levelLabel")}</option>
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
                  <select
                    value={language}
                    onChange={(e) => {
                      const nextLanguage = e.target.value;
                      setLanguage(nextLanguage);
                      if (isA1Start) {
                        setA1StartVerb(getA1StartVerbSuggestions(nextLanguage)[0] || "");
                        const nextWords = getA1StartHighFrequencyWords(a1StartWordClass, nextLanguage);
                        setA1StartWord(nextWords[0] || "");
                        const nextSounds = getA1StartSoundChoices(nextLanguage);
                        setA1StartFocusSound(nextSounds[0] || "s");
                      }
                    }}
                    style={fieldStyle}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {getLanguageDisplayLabel(option.code, option.label, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                {!isA1Start && (
                  <>
                    <label>
                      {t("fields.textType")}
                      <select
                        value={textTypePreset}
                        onChange={(e) => setTextTypePreset(e.target.value as TextTypeKey)}
                        style={fieldStyle}
                      >
                        {GENERATOR_TEXT_TYPE_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {getTextTypeLabel(k, locale)}
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
                  </>
                )}
              </div>
            </div>

            {isA1Start && (
              <div
                style={{
                  border: "1px solid #93c5fd",
                  borderRadius: 16,
                  padding: 14,
                  background: "#eff6ff",
                  marginBottom: 14,
                }}
              >
                <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800 }}>
                  {t("a1Start.title")}
                </h3>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
                  {isA1StartSoundLadder
                    ? t("a1Start.soundLadderDescription")
                    : isA1StartHighFrequency
                      ? t("a1Start.highFrequencyDescription")
                      : t("a1Start.description")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isNarrow ? "1fr" : "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  <label>
                    {t("a1Start.fields.type")}
                    <select
                      value={a1StartType}
                      onChange={(e) => setA1StartType(e.target.value as A1StartType)}
                      style={fieldStyle}
                    >
                      <option value="pattern_sentences">{t("a1Start.types.patternSentences")}</option>
                      <option value="high_frequency_words" disabled={!isHighFrequencyLanguage}>
                        {t("a1Start.types.highFrequencyWords")}
                      </option>
                      <option value="sound_reading_ladder" disabled={!isSoundLadderLanguage}>
                        {t("a1Start.types.soundReadingLadder")}
                      </option>
                    </select>
                  </label>
                  {!isA1StartHighFrequency && !isA1StartSoundLadder && <label>
                    {t("a1Start.fields.verb")}
                    <select
                      value={a1StartVerb}
                      onChange={(e) => setA1StartVerb(e.target.value)}
                      style={fieldStyle}
                    >
                      {a1StartVerbSuggestions.map((verb) => (
                        <option key={verb} value={verb}>{verb}</option>
                      ))}
                      <option value="__custom__">{t("a1Start.customVerb")}</option>
                    </select>
                    {a1StartUsesCustomVerb && (
                      <input
                        value={a1StartCustomVerb}
                        onChange={(e) => setA1StartCustomVerb(e.target.value)}
                        placeholder={t("a1Start.placeholders.verb")}
                        style={{ ...fieldStyle, marginTop: 8 }}
                      />
                    )}
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      {t("a1Start.verbSuggestions", {
                        verbs: a1StartVerbSuggestions.join(", "),
                      })}
                    </div>
                  </label>}
                  {!isA1StartHighFrequency && !isA1StartSoundLadder && <label>
                    {t("a1Start.fields.tense")}
                    <select
                      value={a1StartTense}
                      onChange={(e) => setA1StartTense(e.target.value as A1StartTense)}
                      style={fieldStyle}
                    >
                      <option value="present">{t("a1Start.tenses.present")}</option>
                      <option value="past">{t("a1Start.tenses.past")}</option>
                      <option value="future">{t("a1Start.tenses.future")}</option>
                    </select>
                  </label>}
                  {!isA1StartHighFrequency && !isA1StartSoundLadder && <label>
                    {t("a1Start.fields.sentenceCount")}
                    <select
                      value={a1StartSentenceCount}
                      onChange={(e) =>
                        setA1StartSentenceCount(Number(e.target.value) as A1StartSentenceCount)
                      }
                      style={fieldStyle}
                    >
                      {[10, 13, 16, 19].map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>}
                  {isA1StartHighFrequency && (
                    <>
                      <label>
                        {t("a1Start.fields.wordClass")}
                        <select
                          value={a1StartWordClass}
                          onChange={(e) => {
                            const nextClass = e.target.value as A1StartWordClass;
                            setA1StartWordClass(nextClass);
                            setA1StartWord(getA1StartHighFrequencyWords(nextClass, language)[0] || "");
                          }}
                          style={fieldStyle}
                        >
                          {Object.keys(A1_START_HIGH_FREQUENCY_WORDS).map((wordClass) => (
                            <option key={wordClass} value={wordClass}>
                              {t(`a1Start.wordClasses.${wordClass}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("a1Start.fields.word")}
                        <select
                          value={a1StartWord}
                          onChange={(e) => setA1StartWord(e.target.value)}
                          style={fieldStyle}
                        >
                          {a1StartWords.map((word) => (
                            <option key={word} value={word}>{word}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("a1Start.fields.highFrequencyLength")}
                        <select
                          value={a1StartHighFrequencyLength}
                          onChange={(e) =>
                            setA1StartHighFrequencyLength(Number(e.target.value) as A1StartHighFrequencyLength)
                          }
                          style={fieldStyle}
                        >
                          <option value={50}>{t("a1Start.textLengths.short")}</option>
                          <option value={100}>{t("a1Start.textLengths.medium")}</option>
                          <option value={150}>{t("a1Start.textLengths.long")}</option>
                        </select>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                          {t("a1Start.highFrequencyHelp")}
                        </div>
                      </label>
                    </>
                  )}
                  {isA1StartSoundLadder && (
                    <>
                      <label>
                        {t("a1Start.fields.focusSound")}
                        <select
                          value={a1StartFocusSound}
                          onChange={(e) => setA1StartFocusSound(e.target.value)}
                          style={fieldStyle}
                        >
                          {a1StartSoundChoices.map((sound) => (
                            <option key={sound} value={sound}>{sound}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("a1Start.fields.soundSentenceCount")}
                        <select
                          value={a1StartSoundSentenceCount}
                          onChange={(e) => setA1StartSoundSentenceCount(Number(e.target.value))}
                          style={fieldStyle}
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                            <option key={count} value={count}>{count}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("a1Start.fields.soundWordCount")}
                        <select
                          value={a1StartSoundWordCount}
                          onChange={(e) => setA1StartSoundWordCount(Number(e.target.value))}
                          style={fieldStyle}
                        >
                          {[0, 3, 6, 9, 12, 15].map((count) => (
                            <option key={count} value={count}>{count}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                          {t("a1Start.soundLadderHelp")}
                        </div>
                      </label>
                    </>
                  )}
                  <label style={{ gridColumn: isNarrow ? "auto" : "1 / -1" }}>
                    {t("a1Start.fields.topic")}
                    {isA1StartHighFrequency || isA1StartSoundLadder ? (
                      <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
                        <select
                          value={a1StartHighFrequencyTheme}
                          onChange={(e) => setA1StartHighFrequencyTheme(e.target.value)}
                          style={fieldStyle}
                        >
                          {A1_START_THEMES.map((theme) => (
                            <option key={theme} value={theme}>
                              {t(`a1Start.highFrequencyThemes.${theme}`)}
                            </option>
                          ))}
                          <option value="__custom__">{t("a1Start.highFrequencyThemes.custom")}</option>
                        </select>
                        {a1StartHighFrequencyTheme === "__custom__" && (
                          <input
                            value={a1StartHighFrequencyCustomTheme}
                            onChange={(e) => setA1StartHighFrequencyCustomTheme(e.target.value)}
                            placeholder={t("a1Start.placeholders.topic")}
                            style={fieldStyle}
                          />
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
                        <select
                          value={a1StartTopic}
                          onChange={(e) => setA1StartTopic(e.target.value)}
                          style={fieldStyle}
                        >
                          {A1_START_THEMES.map((theme) => (
                            <option key={theme} value={theme}>
                              {t(`a1Start.highFrequencyThemes.${theme}`)}
                            </option>
                          ))}
                          <option value="__custom__">{t("a1Start.highFrequencyThemes.custom")}</option>
                        </select>
                        {a1StartTopic === "__custom__" && (
                          <input
                            value={a1StartCustomTopic}
                            onChange={(e) => setA1StartCustomTopic(e.target.value)}
                            placeholder={t("a1Start.placeholders.topic")}
                            style={fieldStyle}
                          />
                        )}
                      </div>
                    )}
                  </label>
                  {!isA1StartSoundLadder && <label>
                    {t("a1Start.fields.trueFalseCount")}
                    <select
                      value={a1StartTrueFalseCount}
                      onChange={(e) => setA1StartTrueFalseCount(Number(e.target.value))}
                      style={fieldStyle}
                    >
                      {[0, 3, 5, 8, 10].map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>}
                  {!isA1StartSoundLadder && <label>
                    {t("a1Start.fields.imageSentenceCount")}
                    <select
                      value={a1StartImageSentenceCount}
                      onChange={(e) => setA1StartImageSentenceCount(Number(e.target.value))}
                      style={fieldStyle}
                    >
                      {[0, 3, 5, 8, 10].map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>}
                  {!isA1StartSoundLadder && <label>
                    {isA1StartHighFrequency
                      ? t("a1Start.fields.wordSentenceCount")
                      : t("a1Start.fields.verbSentenceCount")}
                    <select
                      value={a1StartVerbSentenceCount}
                      onChange={(e) => setA1StartVerbSentenceCount(Number(e.target.value))}
                      style={fieldStyle}
                    >
                      {[0, 3, 5, 8, 10].map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>}
                  {isA1StartSoundLadder && (
                    <div
                      style={{
                        gridColumn: isNarrow ? "auto" : "1 / -1",
                        border: "1px solid rgba(37,99,235,0.18)",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.62)",
                        padding: 12,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        {t("a1Start.soundTasksPreview.title")}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                        <li>{t("a1Start.soundTasksPreview.trueFalse")}</li>
                        <li>{t("a1Start.soundTasksPreview.words", { sound: a1StartFocusSound })}</li>
                        <li>{t("a1Start.soundTasksPreview.sentences", { sound: a1StartFocusSound })}</li>
                        <li>{t("a1Start.soundTasksPreview.image")}</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                gap: 14,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: 16,
                  padding: 14,
                  background: "#f8fbff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("buttons.generateText")}
                </h3>

                {!isA1Start && (
                  <label>
                    {t("fields.prompt")}
                    <textarea
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        autoGrow(e.currentTarget);
                      }}
                      onInput={(e) => autoGrow(e.currentTarget as HTMLTextAreaElement)}
                      rows={5}
                      placeholder={t("defaults.prompt")}
                      style={{
                        ...fieldStyle,
                        resize: "vertical",
                        minHeight: 110,
                        lineHeight: 1.35,
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      {t("fields.promptTip")}
                    </div>
                  </label>
                )}

                <div style={{ marginTop: 12 }}>
                  <button
                    className="actionBtn"
                    onClick={() => generateTextOnly(false)}
                    disabled={busy || (isA1Start && !isA1StartHighFrequency && !effectiveA1StartVerb)}
                    style={{
                      ...buttonPrimary,
                      width: isNarrow ? "100%" : "auto",
                      opacity: busy || (isA1Start && !isA1StartHighFrequency && !effectiveA1StartVerb) ? 0.7 : 1,
                      cursor: busy || (isA1Start && !isA1StartHighFrequency && !effectiveA1StartVerb) ? "not-allowed" : "pointer",
                    }}
                  >
                    {loadingText && textGenerationMode === "standard" ? t("buttons.generatingText") : t("buttons.generateText")}
                  </button>
                  {!isA1Start && (
                    <button
                      className="actionBtn"
                      onClick={() => generateTextOnly(true)}
                      disabled={busy}
                      style={{
                        ...buttonSecondary,
                        width: isNarrow ? "100%" : "auto",
                        marginLeft: isNarrow ? 0 : 8,
                        marginTop: isNarrow ? 8 : 0,
                        opacity: busy ? 0.7 : 1,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      {loadingText && textGenerationMode === "factcheck"
                        ? t("buttons.generatingFactCheckedText")
                        : t("buttons.generateFactCheckedText")}
                    </button>
                  )}
                  {!isA1Start && factCheckRequired && !currentTextFactChecked && sourceText.trim() && (
                    <div style={{ fontSize: 12, color: "#92400e", marginTop: 8, lineHeight: 1.45 }}>
                      {t("warnings.factCheckRequiredBeforePublish")}
                    </div>
                  )}
                  {!isA1Start && factCheckRequired && currentTextFactChecked && (
                    <div style={{ fontSize: 12, color: "#166534", marginTop: 8, lineHeight: 1.45 }}>
                      {t("warnings.factCheckCompleted")}
                    </div>
                  )}
                  {isA1Start && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8, lineHeight: 1.45 }}>
                      {t("a1Start.reviewReminder")}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 800 }}>
                  {t("builder.text")}
                </h3>

                <label style={{ display: "block" }}>
                  {t("builder.lessonTitle")}
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("defaults.title")}
                    style={fieldStyle}
                  />
                </label>

                <label style={{ display: "block", marginTop: 10 }}>
                  {t("builder.textbox")}
                  <textarea
                    value={sourceText}
                    onChange={(e) => {
                      setSourceText(e.target.value);
                      setApprovedSourceText("");
                      if (lessonTasks.length > 0) setTasksDirty(true);
                    }}
                    rows={14}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      fontSize: 12,
                      opacity: 0.75,
                    }}
                  >
                    <span>{t("builder.textHelp")}</span>
                    <span>{t("builder.wordCount", { count: sourceWordCount })}</span>
                  </div>
                </label>
                {hasText && (
                  <div
                    style={{
                      marginTop: 12,
                      border: textApproved ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                      borderRadius: 14,
                      padding: 12,
                      background: textApproved ? "#f0fdf4" : "#fff7ed",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: textApproved ? "#166534" : "#9a3412" }}>
                      {textApproved ? t("review.approvedTitle") : t("review.title")}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4, lineHeight: 1.45 }}>
                      {textApproved ? t("review.approvedBody") : t("review.body")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <div style={{ ...(hasText ? cardStyle : mutedCardStyle) }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span style={stepBadgeStyle(step2Active && !step2Done, step2Done)}>2</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {t("sections.generateTasksTitle")}
                </h2>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {t("sections.generateTasksBody")}
                </div>
              </div>
            </div>

            {!hasText && (
              <div
                style={{
                  border: "1px dashed #cbd5e1",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff",
                  fontSize: 14,
                  opacity: 0.8,
                }}
              >
                {t("sections.enableTaskGeneratorFirst")}
              </div>
            )}
            {hasText && !textApproved && (
              <div
                style={{
                  border: "1px dashed #fed7aa",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff7ed",
                  fontSize: 14,
                  color: "#9a3412",
                  fontWeight: 700,
                }}
              >
                {t("sections.approveTextFirst")}
              </div>
            )}

            {!isA1Start && <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 10,
                marginTop: textApproved ? 10 : 14,
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
                  disabled={!hasText}
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
                  disabled={!hasText}
                />
              </label>
              <label>
                {t("tasks.facts")}
                <input
                  type="number"
                  value={factsCount}
                  onChange={(e) => setFactsCount(Math.max(0, Math.min(10, Number(e.target.value))))}
                  style={fieldStyle}
                  min={0}
                  max={10}
                  disabled={!hasText}
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  {t("tasks.factsSingleBoxHelp")}
                </div>
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
                  disabled={!hasText}
                />
              </label>
            </div>}

            {hasText && (
              <div
                className="actionRow"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 14,
                }}
              >
                <button
                  className="actionBtn"
                  onClick={textApproved ? () => generateTasksOnly() : approveTextAndGenerateTasks}
                  disabled={busy || !sourceText.trim()}
                  style={{
                    ...buttonPrimary,
                    opacity: busy || !sourceText.trim() ? 0.55 : 1,
                    cursor: busy || !sourceText.trim() ? "not-allowed" : "pointer",
                  }}
                  title={!sourceText.trim() ? t("hints.generateTextFirst") : !textApproved ? t("hints.approveTextFirst") : t("hints.generateTasks")}
                >
                  {loadingTasks
                    ? t("buttons.generatingTasks")
                    : textApproved
                      ? t("buttons.generateTasks")
                      : t("buttons.approveText")}
                </button>

                {tasksDirty && sourceText.trim() && (
                  <span style={{ color: "#b45309", fontWeight: 700 }}>
                    {t("warnings.checkTextBeforeTasks")}
                  </span>
                )}

                {taskUsageMessage && (
                  <span style={{ color: "#15803d", fontWeight: 700 }}>
                    {taskUsageMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {(hasTasks || hasText) && (
          <section
            className="stickyFinishSection"
            style={{
              marginTop: 22,
              position: hasTasks ? "fixed" : "sticky",
              left: hasTasks ? 12 : undefined,
              right: hasTasks ? 12 : undefined,
              bottom: 12,
              zIndex: 50,
              width: hasTasks ? "calc(100% - 24px)" : undefined,
              maxWidth: hasTasks ? 1180 : undefined,
              marginLeft: hasTasks ? "auto" : undefined,
              marginRight: hasTasks ? "auto" : undefined,
            }}
          >
            <div style={{ ...(hasTasks ? cardStyle : mutedCardStyle) }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={stepBadgeStyle(step3Active, false)}>3</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                      {t("sections.goToFinishingTitle")}
                    </h2>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {t("sections.goToFinishingBody")}
                    </div>
                  </div>
                </div>

                {hasTasks && (
                  <button
                    className="actionBtn"
                    onClick={goToFinishing}
                    disabled={busy || statusLoading || quotaBlocked}
                    style={{
                      ...buttonSuccess,
                      opacity: busy || statusLoading || quotaBlocked ? 0.55 : 1,
                      cursor: busy || statusLoading || quotaBlocked ? "not-allowed" : "pointer",
                    }}
                    title={
                      quotaBlocked && featureStatus
                        ? t("status.quotaUsed", {
                          used: featureStatus.used,
                          limit: featureStatus.limit,
                        })
                        : t("buttons.saveAndGoToFinishing")
                    }
                  >
                    {saving ? t("buttons.saving") : t("buttons.goToFinishing")}
                  </button>
                )}
              </div>

              {!hasTasks && (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fff",
                    fontSize: 14,
                    opacity: 0.8,
                  }}
                >
                  {t("sections.readyToFinishBody")}
                </div>
              )}
            </div>
          </section>
        )}

        {hasTasks && <div aria-hidden="true" style={{ height: isNarrow ? 168 : 128 }} />}

        {hasTasks && (
          <section style={{ marginTop: 22 }}>
            <h2 style={sectionTitleStyle}>
              {isA1Start ? t("a1Start.tasksHeading") : t("editor.title")}
            </h2>

            <div style={{ marginTop: 12, ...cardStyle }}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                  {t("editor.editBeforeFinishing")}
                </h3>

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
                          <span style={{ opacity: 0.7, fontSize: 13 }}>
                            {t("editor.taskId", { id: task.id })}
                          </span>
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
                        {task.type === "open" ? (
                          <textarea
                            value={task.prompt}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                            }}
                            rows={3}
                            style={{ ...fieldStyle, resize: "vertical" }}
                          />
                        ) : (
                          <input
                            value={task.prompt}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, prompt: v } : x)));
                            }}
                            style={fieldStyle}
                          />
                        )}
                      </label>

                      {task.type === "truefalse" && (
                        <label style={{ display: "block", marginTop: 10 }}>
                          {t("editor.correctAnswer")}
                          <select
                            value={String(task.correctAnswer ?? "true")}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLessonTasks((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                              );
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
                                setLessonTasks((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, correctAnswer: v } : x))
                                );
                              }}
                              style={fieldStyle}
                            />
                          </label>
                        </div>
                      )}

                      {task.type === "open" && (
                        <p style={{ marginTop: 10, opacity: 0.75, marginBottom: 0 }}>
                          {t("editor.openHint")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <div
            className="actionRow"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="actionBtn"
              onClick={saveDraftOnly}
              disabled={busy || statusLoading || quotaBlocked || !hasText}
              style={{
                ...buttonSecondary,
                opacity: busy || statusLoading || quotaBlocked || !hasText ? 0.55 : 1,
                cursor: busy || statusLoading || quotaBlocked || !hasText ? "not-allowed" : "pointer",
              }}
              title={
                !hasText
                  ? t("hints.enterTextFirst")
                  : quotaBlocked && featureStatus
                    ? t("status.quotaUsed", {
                      used: featureStatus.used,
                      limit: featureStatus.limit,
                    })
                    : tasksDirty
                      ? t("hints.tasksDirty")
                      : t("hints.saveDraft")
              }
            >
              {saving ? t("buttons.saving") : t("buttons.saveDraft")}
            </button>

            {statusLoading && <span style={{ opacity: 0.75 }}>{t("status.loadingQuota")}</span>}

            {featureStatus && quotaBadgeText && (
              <span
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background:
                    featureStatus.remaining <= 0
                      ? "#fff1f2"
                      : featureStatus.remaining <= 2
                        ? "#fffbeb"
                        : "#f0fdf4",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {quotaBadgeText}
                {featureStatus.remaining <= 2 && featureStatus.remaining > 0
                  ? ` ${t("warnings.soonEmpty")}`
                  : ""}
              </span>
            )}

            {savedId && <span style={{ color: "green" }}>{t("status.saved", { id: savedId })}</span>}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </section>

        {pack && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>{t("debug.title")}</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#ead9d9ed",
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

        <style jsx>{`
          @media (max-width: 560px) {
            .actionRow {
              flex-direction: column !important;
              align-items: stretch !important;
              flex-wrap: nowrap !important;
              margin-top: 0 !important;
            }

            .actionBtn {
              width: 100% !important;
            }

            .pageWrap {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 0 60px !important;
              overflow-x: hidden !important;
              box-sizing: border-box !important;
            }

            .pageCard {
              width: 100% !important;
              padding: 12px 10px !important;
              border-radius: 0 !important;
              border-left: 0 !important;
              border-right: 0 !important;
              box-sizing: border-box !important;
            }

            .stickyFinishSection {
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              width: 100% !important;
              max-width: none !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
