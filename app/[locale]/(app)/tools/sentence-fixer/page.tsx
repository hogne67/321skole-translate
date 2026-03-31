"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGES } from "@/lib/languages";

type FixResult = {
  corrected: string;
  explanation: string;
  betterVersion: string;
  language: string;
  level: string;
};

type LengthMode = "sentence" | "short";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (isRecord(e) && typeof e.error === "string") return e.error;
  if (isRecord(e) && typeof e.message === "string") return e.message;
  return "Unknown error";
}

function getLanguageCode(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const candidates = [item.code, item.value, item.locale, item.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function getLanguageLabel(item: unknown, fallback: string): string {
  if (!isRecord(item)) return fallback;
  const candidates = [item.label, item.name, item.nativeLabel, item.nativeName, item.title];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

async function fixSentence(args: {
  text: string;
  language: string;
  level: string;
  mode: LengthMode;
}): Promise<FixResult> {
  const res = await fetch("/api/tools/sentence-fixer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const raw = await res.text();

  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const preview = raw.slice(0, 300);
    throw new Error(`API returned non-JSON response: ${preview}`);
  }

  if (!res.ok) {
    if (isRecord(data) && typeof data.error === "string") {
      throw new Error(data.error);
    }
    throw new Error(`Request failed (${res.status})`);
  }

  if (!isRecord(data)) {
    throw new Error("Unexpected response format");
  }

  const corrected = typeof data.corrected === "string" ? data.corrected : "";
  const explanation = typeof data.explanation === "string" ? data.explanation : "";
  const betterVersion = typeof data.betterVersion === "string" ? data.betterVersion : "";

  if (!corrected || !explanation || !betterVersion) {
    throw new Error("Missing fields in response");
  }

  return {
    corrected,
    explanation,
    betterVersion,
    language: typeof data.language === "string" ? data.language : args.language,
    level: typeof data.level === "string" ? data.level : args.level,
  };
}

export default function SentenceFixerPage() {
  const t = useTranslations("sentenceFixerFree");
  const locale = useLocale();

  const languageOptions = useMemo(() => {
    const items = Array.isArray(LANGUAGES) ? LANGUAGES : [];
    const mapped = items
      .map((item) => {
        const code = getLanguageCode(item);
        if (!code) return null;
        return {
          code,
          label: getLanguageLabel(item, code),
        };
      })
      .filter((item): item is { code: string; label: string } => item !== null);

    return mapped.length ? mapped : [{ code: "en", label: "English" }];
  }, []);

  const defaultLanguage = useMemo(() => {
    const found = languageOptions.find((l) => l.code === locale);
    return found?.code || languageOptions[0]?.code || "en";
  }, [languageOptions, locale]);

  const [text, setText] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState("A2");
  const [mode, setMode] = useState<LengthMode>("sentence");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<FixResult | null>(null);

  const canSubmit = useMemo(() => text.trim().length > 0, [text]);

  async function onFix() {
    setBusy(true);
    setErr(null);
    setResult(null);

    try {
      const out = await fixSentence({ text, language, level, mode });
      setResult(out);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
        <div className="max-w-2xl">
          <div className="mb-2 inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
            321 Tools
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t("subtitle")}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">{t("fields.language")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              {languageOptions.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">{t("fields.level")}</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t("fields.mode")}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("sentence")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  mode === "sentence"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t("modes.sentence")}
              </button>
              <button
                type="button"
                onClick={() => setMode("short")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  mode === "short"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t("modes.short")}
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">{t("fields.text")}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholders.text")}
              rows={7}
              className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-500"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onFix}
            disabled={!canSubmit || busy}
            className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t("actions.fixing") : t("actions.fix")}
          </button>

          <div className="text-xs text-slate-500">{t("hint")}</div>

          {err ? <div className="text-sm font-medium text-rose-600">{err}</div> : null}
        </div>
      </section>

      {result && (
        <section className="mt-6 grid grid-cols-1 gap-4">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">{t("sections.corrected")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {result.corrected}
            </p>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">{t("sections.explanation")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {result.explanation}
            </p>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">{t("sections.betterVersion")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {result.betterVersion}
            </p>
          </article>
        </section>
      )}
    </main>
  );
}