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
