"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { authedPost } from "@/lib/authedPost";
import { useUserProfile } from "@/lib/useUserProfile";

type WritingProgression = "free" | "guided" | "locked";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const LANGUAGES = ["nb", "en", "pt"];
const THEMES = ["Spennende", "Vennskap", "Skole", "Mysterie", "Framtid", "Natur", "Valgfritt"];
const SECTIONS = [
  { id: "title", labelKey: "sections.title" },
  { id: "introduction", labelKey: "sections.introduction" },
  { id: "main_part", labelKey: "sections.mainPart" },
  { id: "ending", labelKey: "sections.ending" },
  { id: "content_check", labelKey: "sections.contentCheck" },
  { id: "language_check", labelKey: "sections.languageCheck" },
];

const DEFAULT_ASSIGNMENT =
  "Ta utgangspunkt i sitatet: «Døra lukket seg, og plutselig var alt helt stille.»\n\nSkriv en skjønnlitterær tekst der sitatet enten innleder teksten eller inngår i handlingen. Legg stor vekt på detaljerte person- og miljøskildringer, og bruk sansene dine for å skape stemning.";

const DEFAULT_CRITERIA = [
  "sitatet er brukt",
  "personskildring",
  "miljøskildring",
  "sanser",
  "stemning",
  "tydelig innledning",
  "rød tråd",
  "avslutning",
];

const DEFAULT_SUPPORT: Record<string, string> = {
  title: "Den låste døra\nDa alt ble stille\nLyden bak døra\nEt øyeblikk av stillhet",
  introduction: "Døra lukket seg...\nJeg hørte...\nPlutselig ble...\nAlt var stille fordi...",
  main_part: "Han/hun så...\nDet luktet...\nLyden kom fra...\nHjertet slo...",
  ending: "Til slutt...\nDa forstod...\nEtterpå var...\nStillheten betydde...",
  content_check: "Jeg ser at...\nJeg vil gjøre ... tydeligere.\nLeseren forstår...\nDette henger sammen fordi...",
  language_check: "Jeg leser setningen høyt.\nJeg sjekker stor bokstav.\nJeg setter punktum.\nJeg bytter ut gjentatte ord.",
};

function lines(value: string, maxItems = 16): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

export default function ProducerTextNewPage() {
  return (
    <AuthGate>
      <ProducerTextNewInner />
    </AuthGate>
  );
}

function ProducerTextNewInner() {
  const t = useTranslations("producerTextNew");
  const locale = useLocale();
  const { profile, loading } = useUserProfile();

  const [title, setTitle] = useState("");
  const [assignmentText, setAssignmentText] = useState(DEFAULT_ASSIGNMENT);
  const [theme, setTheme] = useState("Spennende");
  const [customTheme, setCustomTheme] = useState("");
  const [level, setLevel] = useState("A2");
  const [language, setLanguage] = useState("nb");
  const [progression, setProgression] = useState<WritingProgression>("guided");
  const [criteriaText, setCriteriaText] = useState(DEFAULT_CRITERIA.join("\n"));
  const [goalsText, setGoalsText] = useState("");
  const [supportBySection, setSupportBySection] = useState(DEFAULT_SUPPORT);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiMaxUsesTotal, setAiMaxUsesTotal] = useState(20);
  const [aiMaxUsesPerSection, setAiMaxUsesPerSection] = useState(2);
  const [allowPrintImageUpload, setAllowPrintImageUpload] = useState(false);
  const [allowAiImage, setAllowAiImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUse = profile?.role === "teacher" || profile?.role === "admin";
  const selectedTheme = theme === "Valgfritt" ? customTheme.trim() : theme;

  async function saveActivity() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        title: title.trim() || t("fallbackTitle"),
        assignmentText,
        theme: selectedTheme,
        level,
        language,
        progression,
        criteria: lines(criteriaText),
        competenceGoals: lines(goalsText, 8),
        supportWordsBySection: Object.fromEntries(
          Object.entries(supportBySection).map(([sectionId, text]) => [sectionId, lines(text)])
        ),
        aiEnabled,
        aiMaxUsesTotal,
        aiMaxUsesPerSection,
        allowPrintImageUpload,
        allowAiImage,
      };

      await authedPost<{ activityId?: string }>("/api/teacher/writing-activities", payload);
      setMessage(t("saved"));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto w-full max-w-5xl py-6 text-sm text-slate-600">{t("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        {t("noAccess")}
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 pb-16">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-black uppercase text-emerald-800">{t("eyebrow")}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black text-slate-950">{t("title")}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-800">
                {t("beta")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("subtitle")}</p>
          </div>
          <Link
            href={`/${locale}/teacher/writing`}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            {t("backToWriting")}
          </Link>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          {message}{" "}
          <Link href={`/${locale}/teacher/writing`} className="underline">
            {t("openLibrary")}
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">{t("assignment.title")}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.libraryTitle")}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("fields.libraryTitlePlaceholder")}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.theme")}</span>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  {THEMES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              {theme === "Valgfritt" ? (
                <label className="block md:col-span-2">
                  <span className="text-sm font-bold text-slate-900">{t("fields.customTheme")}</span>
                  <input
                    value={customTheme}
                    onChange={(e) => setCustomTheme(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
              ) : null}
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-900">{t("fields.assignmentText")}</span>
              <textarea
                value={assignmentText}
                onChange={(e) => setAssignmentText(e.target.value)}
                rows={8}
                className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
              />
            </label>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">{t("criteria.title")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("criteria.subtitle")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.criteria")}</span>
                <textarea
                  value={criteriaText}
                  onChange={(e) => setCriteriaText(e.target.value)}
                  rows={9}
                  className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.goals")}</span>
                <textarea
                  value={goalsText}
                  onChange={(e) => setGoalsText(e.target.value)}
                  placeholder={t("fields.goalsPlaceholder")}
                  rows={9}
                  className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                />
              </label>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">{t("support.title")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("support.subtitle")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SECTIONS.map((section) => (
                <label key={section.id} className="block">
                  <span className="text-sm font-bold text-slate-900">{t(section.labelKey)}</span>
                  <textarea
                    value={supportBySection[section.id] ?? ""}
                    onChange={(e) =>
                      setSupportBySection((current) => ({
                        ...current,
                        [section.id]: e.target.value,
                      }))
                    }
                    rows={5}
                    className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500"
                  />
                </label>
              ))}
            </div>
          </article>
        </div>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm lg:sticky lg:top-4">
            <h2 className="text-xl font-black text-emerald-950">{t("settings.title")}</h2>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.level")}</span>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm">
                  {LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.language")}</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm">
                  {LANGUAGES.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.progression")}</span>
                <select value={progression} onChange={(e) => setProgression(e.target.value as WritingProgression)} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm">
                  <option value="guided">{t("progression.guided")}</option>
                  <option value="free">{t("progression.free")}</option>
                  <option value="locked">{t("progression.locked")}</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                <span>{aiEnabled ? t("settings.aiOn") : t("settings.aiOff")}</span>
                <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.aiTotal")}</span>
                <input type="number" min={0} max={80} value={aiMaxUsesTotal} onChange={(e) => setAiMaxUsesTotal(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-900">{t("fields.aiSection")}</span>
                <input type="number" min={0} max={5} value={aiMaxUsesPerSection} onChange={(e) => setAiMaxUsesPerSection(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                <span>{t("settings.printImage")}</span>
                <input type="checkbox" checked={allowPrintImageUpload} onChange={(e) => setAllowPrintImageUpload(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                <span>{t("settings.aiImage")}</span>
                <input type="checkbox" checked={allowAiImage} onChange={(e) => setAllowAiImage(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
              </label>
              <button
                type="button"
                onClick={() => void saveActivity()}
                disabled={saving}
                className="mt-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}
