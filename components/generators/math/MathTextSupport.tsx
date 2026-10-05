"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Languages, LoaderCircle, Volume2 } from "lucide-react";

type TextResult = { translated?: string; busy?: boolean; error?: string };
type Support = {
  targetLang: string; sourceLang: string; audioBusy: boolean;
  results: Record<string, TextResult>;
  translate: (text: string) => Promise<void>;
  play: (text: string, language: string) => void;
  t: (key: string) => string;
};
const Context = createContext<Support | null>(null);

export function sameMathLanguage(left: string, right: string) {
  const normalize = (lang: string) => ["nb", "no"].includes(lang.toLowerCase()) ? "no" : lang.toLowerCase();
  return normalize(left) === normalize(right);
}

export function MathTextSupportProvider({ children, targetLang, sourceLang, audioBusy, translateText, onPlay, t }: {
  children: ReactNode; targetLang: string; sourceLang: string; audioBusy: boolean;
  translateText: (text: string, language: string) => Promise<string>;
  onPlay: (text: string, language: string) => void;
  t: (key: string) => string;
}) {
  const [results, setResults] = useState<Record<string, TextResult>>({});
  const pending = useRef(new Set<string>());
  async function translate(text: string) {
    const key = JSON.stringify([targetLang, text]);
    if (pending.current.has(key) || results[key]?.translated) return;
    pending.current.add(key);
    setResults(current => ({ ...current, [key]: { busy: true } }));
    try {
      const translated = await translateText(text, targetLang);
      if (!translated.trim()) throw new Error(t("translate.failed"));
      setResults(current => ({ ...current, [key]: { translated } }));
    } catch {
      setResults(current => ({ ...current, [key]: { error: t("translate.failed") } }));
    } finally {
      pending.current.delete(key);
    }
  }
  return <Context.Provider value={{ targetLang, sourceLang, audioBusy, results, translate, play: onPlay, t }}>{children}</Context.Provider>;
}

export default function MathText({ text, hideOriginal = false }: { text: string; hideOriginal?: boolean }) {
  const support = useContext(Context);
  if (!support || !text.trim()) return hideOriginal ? null : <>{text}</>;
  const { targetLang, sourceLang, results, audioBusy, translate, play, t } = support;
  const result = results[JSON.stringify([targetLang, text])];
  const canTranslate = !sameMathLanguage(targetLang, sourceLang);
  const iconClass = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-teal-700 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-50";
  return <span className="block min-w-0">
    <span className="flex flex-wrap items-start gap-2"><span className={hideOriginal ? "sr-only" : "min-w-0 flex-[1_1_180px] whitespace-pre-line"}>{text}</span><span className="inline-flex shrink-0 gap-1 print:hidden">
      <button type="button" title={t("tts.playAudio")} aria-label={t("tts.playAudio")} className={iconClass} disabled={audioBusy} onClick={() => play(text, sourceLang)}><Volume2 size={17} aria-hidden="true" /></button>
      {canTranslate ? <button type="button" title={t("translate.text")} aria-label={t("translate.text")} className={iconClass} disabled={result?.busy} onClick={() => void translate(text)}>{result?.busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Languages size={17} aria-hidden="true" />}</button> : null}
    </span></span>
    {canTranslate && result?.translated ? <span className="mt-2 flex flex-wrap items-start gap-2 border-l-2 border-teal-300 pl-3 font-normal text-slate-700 print:hidden" lang={targetLang} dir="auto"><span className="min-w-0 flex-[1_1_180px] whitespace-pre-line">{result.translated}</span><button type="button" title={t("tts.playTranslation")} aria-label={t("tts.playTranslation")} className={iconClass} disabled={audioBusy} onClick={() => play(result.translated!, targetLang)}><Volume2 size={17} aria-hidden="true" /></button></span> : null}
    {canTranslate && result?.error ? <span className="mt-1 block text-sm font-normal text-red-700" role="alert">{result.error}</span> : null}
  </span>;
}
