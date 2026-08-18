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
const GENRES = ["story"] as const;
const PROGRESSION_OPTIONS: WritingProgression[] = ["guided", "free", "locked"];
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
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("story");
  const [level, setLevel] = useState("A2");
  const [language, setLanguage] = useState("nb");
  const [targetWordCount, setTargetWordCount] = useState(140);
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
        genre,
        level,
        language,
        targetWordCount,
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
    <main className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black uppercase text-emerald-800">{t("eyebrow")}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black text-slate-950">{t("title")}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-800">
                {t("beta")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{t("subtitle")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <div className="flex min-w-64 items-center gap-3 rounded-2xl border border-sky-200 bg-white p-3 shadow-sm">
              <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-100">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-sm font-black text-white">
                  {t("video.play")}
                </span>
              </div>
              <div>
                <div className="text-sm font-black text-slate-950">{t("video.title")}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t("video.text")}</p>
              </div>
            </div>
            <Link
              href={`/${locale}/teacher/writing`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              {t("backToWriting")}
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {["frame", "assignment", "support"].map((step, index) => (
            <div key={step} className="rounded-2xl border border-sky-100 bg-white/70 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-sky-200 bg-sky-100 text-xs font-black text-slate-800">
                  {index + 1}
                </span>
                <h2 className="text-base font-black text-slate-950">{t(`steps.${step}.title`)}</h2>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600">{t(`steps.${step}.text`)}</p>
            </div>
          ))}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-slate-950">{t("frame.title")}</h2>
          <p className="text-sm text-slate-600">{t("frame.subtitle")}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.genre")}</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as (typeof GENRES)[number])}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {GENRES.map((value) => (
                <option key={value} value={value}>
                  {t(`genres.${value}`)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{t(`genres.${genre}Description`)}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.language")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {LANGUAGES.map((value) => (
                <option key={value} value={value}>{value.toUpperCase()}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{t("frame.languageHelp")}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.level")}</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {LEVELS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.targetWordCount")}</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <div className="mt-5">
          <h3 className="text-base font-black text-slate-950">{t("progression.title")}</h3>
          <p className="mt-1 text-sm text-slate-600">{t("progression.subtitle")}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {PROGRESSION_OPTIONS.map((value) => {
              const selected = progression === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProgression(value)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-950">{t(`progression.${value}`)}</span>
                    <span
                      className={`h-4 w-4 rounded-full border ${
                        selected ? "border-emerald-700 bg-emerald-700" : "border-slate-300 bg-white"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{t(`progression.${value}Text`)}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <h2 className="text-xl font-black text-emerald-950">{t("aiControl.title")}</h2>
        <p className="mt-1 text-sm text-emerald-900">{t("aiControl.subtitle")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
            <span>{aiEnabled ? t("settings.aiOn") : t("settings.aiOff")}</span>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.aiTotal")}</span>
            <input
              type="number"
              min={0}
              max={80}
              value={aiMaxUsesTotal}
              onChange={(e) => setAiMaxUsesTotal(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs leading-5 text-emerald-900">{t("aiControl.totalHelp")}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-900">{t("fields.aiSection")}</span>
            <input
              type="number"
              min={0}
              max={5}
              value={aiMaxUsesPerSection}
              onChange={(e) => setAiMaxUsesPerSection(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs leading-5 text-emerald-900">{t("aiControl.sectionHelp")}</span>
          </label>
          <div className="grid gap-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
              <span>{t("settings.printImage")}</span>
              <input
                type="checkbox"
                checked={allowPrintImageUpload}
                onChange={(e) => setAllowPrintImageUpload(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
              <span>{t("settings.aiImage")}</span>
              <input
                type="checkbox"
                checked={allowAiImage}
                onChange={(e) => setAllowAiImage(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-slate-950">{t("story.title")}</h2>
          <p className="text-sm text-slate-600">{t("story.subtitle")}</p>
        </div>
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black text-slate-950">{t("bottom.title")}</div>
            <p className="text-xs leading-5 text-slate-600">{t("bottom.summary")}</p>
          </div>
          <button
            type="button"
            onClick={() => void saveActivity()}
            disabled={saving}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </main>
  );
}
