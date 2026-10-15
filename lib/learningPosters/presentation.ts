import { LANGUAGES } from "../languages";

export function posterLanguageCode(value: string) {
  const key = value.trim().toLowerCase().replaceAll("_", "-");
  if (["no", "no-no", "nb-no", "norsk", "norwegian", "bokmål", "norsk bokmål", "norsk (bokmål)"].includes(key)) return "nb";
  if (["nn-no", "nynorsk", "norsk nynorsk", "norsk (nynorsk)"].includes(key)) return "nn";
  if (["engelsk", "english"].includes(key)) return "en";
  if (["portugisisk", "portuguese", "português"].includes(key)) return "pt";
  return LANGUAGES.find(language => language.code.toLowerCase() === key)?.code || key;
}
export function posterLanguageLabel(value: string, locale: string) {
  const code = posterLanguageCode(value);
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch { /* Preserve readable labels from older lessons. */ }
  return LANGUAGES.find(language => language.code === code)?.label || value;
}
export const posterLevelLabel = (value: string) => value === "A1_START" ? "A1 start" : value;
export const POSTER_LANGUAGES = [...LANGUAGES.map(language => language.code), "pt"];
