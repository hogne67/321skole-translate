import { LANGUAGES } from "@/lib/languages";

export function normalizeAudioLanguage(language: string): string {
  const code = language.trim().replaceAll("_", "-").toLowerCase();
  if (code === "no" || code === "nb") return "no";
  if (code === "pt") return "pt-BR";
  return LANGUAGES.find(item => item.code.toLowerCase() === code)?.code ?? "no";
}
