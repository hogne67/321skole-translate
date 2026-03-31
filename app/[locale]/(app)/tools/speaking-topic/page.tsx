"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGES } from "@/lib/languages";

type TopicResult = {
  topic: string;
  question: string;
  followups: string[];
  language: string;
  level: string;
  category: string;
};

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

async function generateTopic(args: {
  language: string;
  level: string;
  category: string;
}): Promise<TopicResult> {
  const res = await fetch("/api/tools/speaking-topic", {
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

  const topic = typeof data.topic === "string" ? data.topic : "";
  const question = typeof data.question === "string" ? data.question : "";
  const followups = Array.isArray(data.followups)
    ? data.followups.filter((item): item is string => typeof item === "string")
    : [];

  if (!topic || !question || followups.length === 0) {
    throw new Error("Missing fields in response");
  }

  return {
    topic,
    question,
    followups,
    language: typeof data.language === "string" ? data.language : args.language,
    level: typeof data.level === "string" ? data.level : args.level,
    category: typeof data.category === "string" ? data.category : args.category,
  };
}

export default function SpeakingTopicPage() {
  const t = useTranslations("speakingTopicFree");
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

  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState("A2");
  const [category, setCategory] = useState("everyday");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<TopicResult | null>(null);

  async function onGenerate() {
    setBusy(true);
    setErr(null);
    setResult(null);

    try {
      const out = await generateTopic({ language, level, category });
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">{t("fields.category")}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="everyday">{t("categories.everyday")}</option>
              <option value="school">{t("categories.school")}</option>
              <option value="work">{t("categories.work")}</option>
              <option value="travel">{t("categories.travel")}</option>
              <option value="food">{t("categories.food")}</option>
              <option value="friends">{t("categories.friends")}</option>
              <option value="culture">{t("categories.culture")}</option>
              <option value="free">{t("categories.free")}</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t("actions.generating") : t("actions.generate")}
          </button>

          <div className="text-xs text-slate-500">{t("hint")}</div>

          {err ? <div className="text-sm font-medium text-rose-600">{err}</div> : null}
        </div>
      </section>

      {result && (
        <section className="mt-6 grid grid-cols-1 gap-4">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              {t("sections.topic")}
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{result.topic}</h2>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">{t("sections.mainQuestion")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {result.question}
            </p>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">{t("sections.followups")}</h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
              {result.followups.map((item, index) => (
                <li key={`${item}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </main>
  );
}