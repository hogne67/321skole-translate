export type LanguageOption = {
  code: string;
  label: string;
};

export const LANGUAGES: LanguageOption[] = [
  // 🇳🇴 Norge
  { code: "nb", label: "Norsk (Bokmål)" },
  { code: "nn", label: "Norsk (Nynorsk)" },
  { code: "se", label: "Nordsamisk – Davvisámegiella" },

  // 🌍 Grunnspråk
  { code: "en", label: "Engelsk – English" },

  // 🇧🇷 Portugisisk
  { code: "pt-BR", label: "Portugisisk (Brasil) – Português" },
  { code: "pt-PT", label: "Portugisisk (Portugal) – Português" },

  // 🇸🇪🇩🇰🇫🇮 Norden
  { code: "sv", label: "Svensk – Svenska" },
  { code: "da", label: "Dansk – Dansk" },
  { code: "fi", label: "Finsk – Suomi" },

  // 🇪🇺 Europa (latinsk / kyrillisk / gresk)
  { code: "de", label: "Tysk – Deutsch" },
  { code: "fr", label: "Fransk – Français" },
  { code: "es", label: "Spansk – Español" },
  { code: "it", label: "Italiensk – Italiano" },
  { code: "nl", label: "Nederlandsk – Nederlands" },
  { code: "pl", label: "Polsk – Polski" },
  { code: "cs", label: "Tsjekkisk – Čeština" },
  { code: "sk", label: "Slovakisk – Slovenčina" },
  { code: "hu", label: "Ungarsk – Magyar" },
  { code: "ro", label: "Rumensk – Română" },
  { code: "bg", label: "Bulgarsk – Български" },
  { code: "el", label: "Gresk – Ελληνικά" },
  { code: "ru", label: "Russisk – Русский" },
  { code: "uk", label: "Ukrainsk – Українська" },
  { code: "sr", label: "Serbisk – Српски" },
  { code: "tr", label: "Tyrkisk – Türkçe" },

  // 🇱🇻🇱🇹 Baltikum
  { code: "lv", label: "Latvisk – Latviešu" },
  { code: "lt", label: "Litauisk – Lietuvių" },

  // 🌍 Store innvandrerspråk (pedagogisk viktige)
  { code: "ar", label: "Arabisk – العربية" },
  { code: "so", label: "Somali – Soomaali" },
  { code: "ti", label: "Tigrinja – ትግርኛ" },
  { code: "am", label: "Amharisk – አማርኛ" },
  { code: "kmr", label: "Kurdisk (Kurmanji) – Kurdî" },
{ code: "ckb", label: "Kurdisk (Sorani) – کوردی" },
{ code: "sq", label: "Albansk – Shqip" },
{ code: "ta", label: "Tamil – தமிழ்" },

  // 🇪🇹 Etiopia (tillegg)
  { code: "om", label: "Oromo – Afaan Oromoo" },

  // 🇦🇫 Afghanistan
  { code: "fa-AF", label: "Dari (Afghanistan) – دری" },
  { code: "ps", label: "Pashto – پښتو" },

  // 🌍 Persisk / Urdu / India / osv.
  { code: "fa", label: "Persisk – فارسی" },
  { code: "ur", label: "Urdu – اردو" },
  { code: "hi", label: "Hindi – हिन्दी" },
  { code: "bn", label: "Bengali – বাংলা" },

  // 🇨🇩🇷🇼 Sentral-Afrika
  { code: "rw", label: "Kinyarwanda – Ikinyarwanda" },
  { code: "ln", label: "Lingala – Lingála" },

  // 🌍 Øst-Afrika
  { code: "sw", label: "Swahili – Kiswahili" },

  // 🇸🇸 Sør-Sudan (valgfritt, men nyttig)
  { code: "din", label: "Dinka – Thuɔŋjäŋ" },
  { code: "nus", label: "Nuer – Thok Naath" },

  // 🌏 Asia
  { code: "vi", label: "Vietnamesisk – Tiếng Việt" },
  { code: "th", label: "Thai – ไทย" },
  { code: "zh-CN", label: "Kinesisk (forenklet) – 中文（简体）" },
  { code: "zh-TW", label: "Kinesisk (tradisjonell) – 中文（繁體）" },
  { code: "ja", label: "Japansk – 日本語" },
  { code: "ko", label: "Koreansk – 한국어" },

  // 🇵🇭 Filippinene
  { code: "tl", label: "Filipino / Tagalog – Tagalog" },
  { code: "ceb", label: "Cebuano – Cebuano" },
];
