import { READING_PRACTICE_TEXT_TYPES } from "./a1start/readingPractice";

export const TEXT_TYPE_KEYS = [
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
  "reading_test",
  "pattern_sentences",
  "high_frequency_words",
  "sound_reading_ladder",
  ...Object.values(READING_PRACTICE_TEXT_TYPES),
  "other",
] as const;

export type TextTypeKey = (typeof TEXT_TYPE_KEYS)[number];

const TEXT_TYPE_ALIASES: Record<string, TextTypeKey> = {
  everydaystory: "everydayStory",
  "everyday story": "everydayStory",
  hverdagsfortelling: "everydayStory",
  "história do cotidiano": "everydayStory",
  factual: "factual",
  faktatekst: "factual",
  saktekst: "factual",
  "texto informativo": "factual",
  fiction: "fiction",
  skjønnlitteratur: "fiction",
  ficção: "fiction",
  article: "article",
  artikkel: "article",
  artigo: "article",
  dialogue: "dialogue",
  dialog: "dialogue",
  diálogo: "dialogue",
  news: "news",
  nyhet: "news",
  notícia: "news",
  biography: "biography",
  biografi: "biography",
  biografia: "biography",
  letteremail: "letterEmail",
  "letter/email": "letterEmail",
  "brev/e-post": "letterEmail",
  "carta/e-mail": "letterEmail",
  opinion: "opinion",
  mening: "opinion",
  opinião: "opinion",
  howto: "howto",
  "how-to": "howto",
  "slik gjør du": "howto",
  "como fazer": "howto",
  readingtest: "reading_test",
  "reading test": "reading_test",
  leseprøve: "reading_test",
  "teste de leitura": "reading_test",
  patternsentences: "pattern_sentences",
  "pattern sentences": "pattern_sentences",
  mønstersetninger: "pattern_sentences",
  "frases padrão": "pattern_sentences",
  highfrequencywords: "high_frequency_words",
  "high frequency words": "high_frequency_words",
  "high-frequency words": "high_frequency_words",
  "høyfrekvente ord": "high_frequency_words",
  "palavras de alta frequência": "high_frequency_words",
  soundreadingladder: "sound_reading_ladder",
  "sound reading ladder": "sound_reading_ladder",
  lydtrening: "sound_reading_ladder",
  "treino de som": "sound_reading_ladder",
  "escada de leitura sonora": "sound_reading_ladder",
  "lesetrening – én stavelse": READING_PRACTICE_TEXT_TYPES.one_syllable,
  "lesetrening – én og to stavelser": READING_PRACTICE_TEXT_TYPES.one_and_two_syllables,
  "lesetrening – én, to og tre stavelser": READING_PRACTICE_TEXT_TYPES.one_to_three_syllables,
  "reading practice – one syllable": READING_PRACTICE_TEXT_TYPES.one_syllable,
  "reading practice – one and two syllables": READING_PRACTICE_TEXT_TYPES.one_and_two_syllables,
  "reading practice – one, two and three syllables": READING_PRACTICE_TEXT_TYPES.one_to_three_syllables,
  "prática de leitura – uma sílaba": READING_PRACTICE_TEXT_TYPES.one_syllable,
  "prática de leitura – uma e duas sílabas": READING_PRACTICE_TEXT_TYPES.one_and_two_syllables,
  "prática de leitura – uma, duas e três sílabas": READING_PRACTICE_TEXT_TYPES.one_to_three_syllables,
  other: "other",
  annet: "other",
  outro: "other",
};

export function normalizeTextTypeKey(value: unknown): TextTypeKey | null {
  const raw = String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();
  if (!raw) return null;

  const direct = TEXT_TYPE_KEYS.find((key) => key === raw);
  if (direct) return direct;

  const normalized = raw.toLocaleLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
  return TEXT_TYPE_ALIASES[normalized] ?? null;
}

export function normalizeTextTypeValue(value: unknown): string {
  return normalizeTextTypeKey(value) ?? String(value ?? "").trim().replace(/^"+|"+$/g, "").trim();
}

export function getTextTypeSearchTerms(value: unknown): string[] {
  const key = normalizeTextTypeKey(value);
  if (!key) return [String(value ?? "")].filter(Boolean);

  return Object.entries(TEXT_TYPE_ALIASES)
    .filter(([, aliasKey]) => aliasKey === key)
    .map(([alias]) => alias)
    .concat(key);
}

export function getTextTypeLabel(key: TextTypeKey, locale: string): string {
  const labels: Record<"nb" | "en" | "pt", Record<TextTypeKey, string>> = {
    nb: {
      everydayStory: "Hverdagsfortelling",
      factual: "Saktekst",
      fiction: "Skjønnlitteratur",
      article: "Artikkel",
      dialogue: "Dialog",
      news: "Nyhet",
      biography: "Biografi",
      letterEmail: "Brev/e-post",
      opinion: "Mening",
      howto: "Slik gjør du",
      reading_test: "Leseprøve",
      pattern_sentences: "Mønstersetninger",
      high_frequency_words: "Høyfrekvente ord",
      sound_reading_ladder: "Lydtrening",
      [READING_PRACTICE_TEXT_TYPES.one_syllable]: "Lesetrening – Én stavelse",
      [READING_PRACTICE_TEXT_TYPES.one_and_two_syllables]: "Lesetrening – Én og to stavelser",
      [READING_PRACTICE_TEXT_TYPES.one_to_three_syllables]: "Lesetrening – Én, to og tre stavelser",
      other: "Annet",
    },
    en: {
      everydayStory: "Everyday story",
      factual: "Factual",
      fiction: "Fiction",
      article: "Article",
      dialogue: "Dialogue",
      news: "News",
      biography: "Biography",
      letterEmail: "Letter/email",
      opinion: "Opinion",
      howto: "How-to",
      reading_test: "Reading test",
      pattern_sentences: "Pattern sentences",
      high_frequency_words: "High-frequency words",
      sound_reading_ladder: "Sound training",
      [READING_PRACTICE_TEXT_TYPES.one_syllable]: "Reading practice – One syllable",
      [READING_PRACTICE_TEXT_TYPES.one_and_two_syllables]: "Reading practice – One and two syllables",
      [READING_PRACTICE_TEXT_TYPES.one_to_three_syllables]: "Reading practice – One, two and three syllables",
      other: "Other",
    },
    pt: {
      everydayStory: "História do cotidiano",
      factual: "Texto informativo",
      fiction: "Ficção",
      article: "Artigo",
      dialogue: "Diálogo",
      news: "Notícia",
      biography: "Biografia",
      letterEmail: "Carta/e-mail",
      opinion: "Opinião",
      howto: "Como fazer",
      reading_test: "Teste de leitura",
      pattern_sentences: "Frases padrão",
      high_frequency_words: "Palavras de alta frequência",
      sound_reading_ladder: "Treino de som",
      [READING_PRACTICE_TEXT_TYPES.one_syllable]: "Prática de leitura – Uma sílaba",
      [READING_PRACTICE_TEXT_TYPES.one_and_two_syllables]: "Prática de leitura – Uma e duas sílabas",
      [READING_PRACTICE_TEXT_TYPES.one_to_three_syllables]: "Prática de leitura – Uma, duas e três sílabas",
      other: "Outro",
    },
  };
  const language = locale.toLocaleLowerCase().startsWith("pt")
    ? "pt"
    : locale.toLocaleLowerCase().startsWith("en")
      ? "en"
      : "nb";
  return labels[language][key];
}
