"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import {
  BookOpen,
  CheckCircle2,
  ListPlus,
  Mic2,
  Save,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { authedPost } from "@/lib/authedPost";
import { useUserProfile } from "@/lib/useUserProfile";

type ScriptMode = "bullet_points" | "script";
type AiSupport = "off" | "coach";

type Segment = {
  id: string;
  title: string;
  hint: string;
  order: number;
};

type SavePodcastWorkshopResponse = {
  ok?: boolean;
  id?: string;
  error?: string;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => safeString(item).trim()).filter(Boolean)
    : [];
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeSeconds(minutes: string) {
  const n = Number(minutes.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

function minutesFromSeconds(seconds: unknown) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "";
  return String(Math.round(seconds / 60));
}

export default function PodcastWorkshopPage() {
  const t = useTranslations("podcastWorkshopTool");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user } = useUserProfile();
  const activityId = searchParams.get("activityId")?.trim() || "";

  const [savedId, setSavedId] = useState(activityId);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [assignmentText, setAssignmentText] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("nb");
  const [targetMinutes, setTargetMinutes] = useState("4");
  const [scriptMode, setScriptMode] = useState<ScriptMode>("bullet_points");
  const [aiSupport, setAiSupport] = useState<AiSupport>("coach");
  const [criteria, setCriteria] = useState<string[]>(() => [
    t("defaults.criteria.intro"),
    t("defaults.criteria.assignment"),
    t("defaults.criteria.vocabulary"),
    t("defaults.criteria.examples"),
    t("defaults.criteria.ending"),
    t("defaults.criteria.audio"),
  ]);
  const [vocabulary, setVocabulary] = useState<string[]>(() => [
    t("defaults.vocabulary.term"),
    t("defaults.vocabulary.example"),
    t("defaults.vocabulary.source"),
  ]);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>(() => [
    t("defaults.questions.topic"),
    t("defaults.questions.everyday"),
    t("defaults.questions.explain"),
    t("defaults.questions.examples"),
    t("defaults.questions.takeaway"),
  ]);
  const [segments, setSegments] = useState<Segment[]>(() => [
    { id: "intro", title: t("defaults.segments.intro.title"), hint: t("defaults.segments.intro.hint"), order: 0 },
    { id: "part_1", title: t("defaults.segments.part1.title"), hint: t("defaults.segments.part1.hint"), order: 1 },
    { id: "part_2", title: t("defaults.segments.part2.title"), hint: t("defaults.segments.part2.hint"), order: 2 },
    { id: "ending", title: t("defaults.segments.ending.title"), hint: t("defaults.segments.ending.hint"), order: 3 },
  ]);

  const targetDurationSeconds = useMemo(() => normalizeSeconds(targetMinutes), [targetMinutes]);
  const canSave = title.trim().length > 0 && assignmentText.trim().length > 0 && segments.some((s) => s.title.trim());
  const levelOptions = ["", "A1", "A2", "B1", "B2", "1.-4. trinn", "5.-7. trinn", "8.-10. trinn", "VGS"];
  const languageOptions = [
    ["nb", "Norsk bokmål"],
    ["nn", "Norsk nynorsk"],
    ["en", "English"],
    ["pt", "Português"],
  ];
  const durationOptions = ["2", "3", "4", "5", "6", "8", "10"];
  const visibleLevelOptions = level && !levelOptions.includes(level) ? [...levelOptions, level] : levelOptions;
  const visibleDurationOptions =
    targetMinutes && !durationOptions.includes(targetMinutes) ? [...durationOptions, targetMinutes] : durationOptions;

  useEffect(() => {
    setSavedId(activityId);
  }, [activityId]);

  useEffect(() => {
    if (!activityId || !user || user.isAnonymous) return;

    let cancelled = false;

    async function loadSaved() {
      setLoadingSaved(true);
      setSaveError(null);

      try {
        const snap = await getDoc(doc(db, "lessons", activityId));
        if (cancelled) return;
        if (!snap.exists()) {
          setSaveError(t("save.notFound"));
          return;
        }

        const data = snap.data();
        const config =
          data.podcastWorkshopConfig && typeof data.podcastWorkshopConfig === "object"
            ? (data.podcastWorkshopConfig as Record<string, unknown>)
            : {};

        setTitle(safeString(data.title));
        setAssignmentText(safeString(config.assignmentText) || safeString(data.sourceText));
        setSubject(safeString(config.subject) || safeString(data.subject));
        setLevel(safeString(data.level));
        setLanguage(safeString(data.language) || "nb");
        setTargetMinutes(minutesFromSeconds(config.targetDurationSeconds) || "4");
        setScriptMode(config.scriptMode === "script" ? "script" : "bullet_points");
        setAiSupport(config.aiSupport === "off" ? "off" : "coach");
        setCriteria(stringArray(config.criteria));
        setVocabulary(stringArray(config.vocabulary));
        setGuidingQuestions(stringArray(config.guidingQuestions));

        const loadedSegments = Array.isArray(config.segments)
          ? config.segments
              .map((item, index): Segment | null => {
                if (!item || typeof item !== "object") return null;
                const row = item as Record<string, unknown>;
                const rowTitle = safeString(row.title).trim();
                if (!rowTitle) return null;
                return {
                  id: safeString(row.id).trim() || makeId("segment"),
                  title: rowTitle,
                  hint: safeString(row.hint),
                  order: typeof row.order === "number" ? row.order : index,
                };
              })
              .filter((item): item is Segment => item !== null)
          : [];

        if (loadedSegments.length > 0) setSegments(loadedSegments.sort((a, b) => a.order - b.order));
        setSavedId(snap.id);
      } catch {
        if (!cancelled) setSaveError(t("save.loadFailed"));
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    }

    void loadSaved();

    return () => {
      cancelled = true;
    };
  }, [activityId, user, t]);

  function updateList(setter: (next: string[]) => void, rows: string[], index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    setter(next);
  }

  function removeListItem(setter: (next: string[]) => void, rows: string[], index: number) {
    setter(rows.filter((_, i) => i !== index));
  }

  function addSegment() {
    setSegments((current) => [
      ...current,
      {
        id: makeId("segment"),
        title: t("segments.newTitle", { n: current.length + 1 }),
        hint: "",
        order: current.length,
      },
    ]);
  }

  function updateSegment(index: number, patch: Partial<Segment>) {
    setSegments((current) =>
      current.map((segment, i) => (i === index ? { ...segment, ...patch } : segment))
    );
  }

  function removeSegment(index: number) {
    setSegments((current) =>
      current
        .filter((_, i) => i !== index)
        .map((segment, order) => ({ ...segment, order }))
    );
  }

  async function saveWorkshop() {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await authedPost<SavePodcastWorkshopResponse>("/api/tools/podcast-workshop/save", {
        id: savedId || undefined,
        title,
        assignmentText,
        subject,
        level,
        language,
        targetDurationSeconds,
        scriptMode,
        aiSupport,
        criteria,
        vocabulary,
        guidingQuestions,
        segments,
      });

      if (!response.id) throw new Error(response.error || t("save.failed"));
      setSavedId(response.id);
      setSaveMessage(t("save.saved"));
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : t("save.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href={`/${locale}/tools`} className="text-sm font-bold text-slate-600 hover:text-slate-950">
        {t("back")}
      </Link>

      <section className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-emerald-800">
                {t("kicker")}
              </p>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                {t("beta")}
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950">{t("title")}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{t("subtitle")}</p>
          </div>
          <div className="rounded-2xl border border-slate-300 bg-white p-3">
            <div className="grid grid-cols-[118px_1fr] gap-3">
              <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-100 text-emerald-700">
                <Mic2 size={32} />
              </div>
              <div>
                <div className="text-sm font-black text-slate-950">{t("video.title")}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t("video.text")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4">
        <Section icon={<Target size={18} />} title={t("assignment.title")} description={t("assignment.description")}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("fields.title")}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("fields.titlePlaceholder")} className={inputClass} />
            </Field>
            <Field label={t("fields.subject")}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("fields.subjectPlaceholder")} className={inputClass} />
            </Field>
            <Field label={t("fields.level")}>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
                {visibleLevelOptions.map((option) => (
                  <option key={option || "empty"} value={option}>
                    {option || t("fields.levelPlaceholder")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fields.language")}>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                {languageOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("fields.assignmentText")}>
            <textarea value={assignmentText} onChange={(e) => setAssignmentText(e.target.value)} placeholder={t("fields.assignmentPlaceholder")} className={`${inputClass} min-h-36 resize-y leading-7`} />
          </Field>
        </Section>

        <Section icon={<CheckCircle2 size={18} />} title={t("criteria.title")} description={t("criteria.description")}>
          <EditableList rows={criteria} addLabel={t("criteria.add")} placeholder={t("criteria.placeholder")} onChange={setCriteria} />
        </Section>

        <Section icon={<BookOpen size={18} />} title={t("support.title")} description={t("support.description")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">{t("support.vocabularyTitle")}</h3>
              <EditableList rows={vocabulary} addLabel={t("support.addVocabulary")} placeholder={t("support.vocabularyPlaceholder")} onChange={setVocabulary} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-black text-slate-900">{t("support.questionsTitle")}</h3>
              <EditableList rows={guidingQuestions} addLabel={t("support.addQuestion")} placeholder={t("support.questionPlaceholder")} onChange={setGuidingQuestions} />
            </div>
          </div>
        </Section>

        <Section icon={<ListPlus size={18} />} title={t("segments.title")} description={t("segments.description")}>
          <div className="grid gap-3">
            {segments.map((segment, index) => (
              <div key={segment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                  <Field label={t("segments.partTitle")}>
                    <input value={segment.title} onChange={(e) => updateSegment(index, { title: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label={t("segments.hint")}>
                    <input value={segment.hint} onChange={(e) => updateSegment(index, { hint: e.target.value })} placeholder={t("segments.hintPlaceholder")} className={inputClass} />
                  </Field>
                  <button type="button" onClick={() => removeSegment(index)} className="mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-rose-700 hover:bg-rose-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addSegment} className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50">
              <ListPlus size={16} /> {t("segments.add")}
            </button>
          </div>
        </Section>

        <Section icon={<Sparkles size={18} />} title={t("settings.title")} description={t("settings.description")}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("fields.duration")}>
              <select value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} className={inputClass}>
                {visibleDurationOptions.map((option) => (
                  <option key={option} value={option}>{t("overview.minutes", { n: Number(option) })}</option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.scriptMode")}>
              <select value={scriptMode} onChange={(e) => setScriptMode(e.target.value as ScriptMode)} className={inputClass}>
                <option value="bullet_points">{t("settings.bulletPoints")}</option>
                <option value="script">{t("settings.fullScript")}</option>
              </select>
            </Field>
            <Field label={t("settings.aiSupport")}>
              <select value={aiSupport} onChange={(e) => setAiSupport(e.target.value as AiSupport)} className={inputClass}>
                <option value="coach">{t("settings.aiCoach")}</option>
                <option value="off">{t("settings.aiOff")}</option>
              </select>
            </Field>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            {t("settings.locked")}
          </div>
        </Section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                <Mic2 size={20} /> {t("overview.title")}
              </h2>
              <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                <Stat label={t("overview.segments")} value={String(segments.length)} />
                <Stat label={t("overview.duration")} value={targetDurationSeconds ? t("overview.minutes", { n: Math.round(targetDurationSeconds / 60) }) : "-"} />
              </div>
              {loadingSaved ? <div className="mt-3 text-sm font-bold text-slate-500">{t("save.loading")}</div> : null}
              {saveError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{saveError}</div> : null}
              {saveMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{saveMessage}</div> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80 lg:grid-cols-1">
              <button type="button" onClick={saveWorkshop} disabled={!canSave || saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                <Save size={17} /> {saving ? t("save.saving") : savedId ? t("save.update") : t("save.create")}
              </button>
              {savedId ? (
                <Link href={`/${locale}/content`} className="inline-flex w-full justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-800 no-underline hover:bg-slate-50">
                  {t("save.openContent")}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );

  function EditableList({
    rows,
    addLabel,
    placeholder,
    onChange,
  }: {
    rows: string[];
    addLabel: string;
    placeholder: string;
    onChange: (next: string[]) => void;
  }) {
    return (
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={row} onChange={(e) => updateList(onChange, rows, index, e.target.value)} placeholder={placeholder} className={inputClass} />
            <button type="button" onClick={() => removeListItem(onChange, rows, index)} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-700 hover:bg-rose-50">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, ""])} className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 hover:bg-slate-50">
          <ListPlus size={16} /> {addLabel}
        </button>
      </div>
    );
  }
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-950">
          {icon} {title}
        </h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-black text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-black uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-600";
