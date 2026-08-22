"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
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
      <div className="mb-8">
        <Link href={`/${locale}/tools`} className="text-sm font-bold text-slate-600 hover:text-slate-950">
          {t("back")}
        </Link>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4">
          <Section icon={<Target size={18} />} title={t("assignment.title")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("fields.title")}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("fields.titlePlaceholder")} className={inputClass} />
              </Field>
              <Field label={t("fields.subject")}>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("fields.subjectPlaceholder")} className={inputClass} />
              </Field>
              <Field label={t("fields.level")}>
                <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder={t("fields.levelPlaceholder")} className={inputClass} />
              </Field>
              <Field label={t("fields.language")}>
                <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="nb" className={inputClass} />
              </Field>
            </div>
            <Field label={t("fields.assignmentText")}>
              <textarea value={assignmentText} onChange={(e) => setAssignmentText(e.target.value)} placeholder={t("fields.assignmentPlaceholder")} className={`${inputClass} min-h-36 resize-y leading-7`} />
            </Field>
            <Field label={t("fields.duration")}>
              <input value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} className={inputClass} />
            </Field>
          </Section>

          <Section icon={<CheckCircle2 size={18} />} title={t("criteria.title")}>
            <EditableList rows={criteria} addLabel={t("criteria.add")} placeholder={t("criteria.placeholder")} onChange={setCriteria} />
          </Section>

          <Section icon={<BookOpen size={18} />} title={t("support.title")}>
            <div className="grid gap-4 md:grid-cols-2">
              <EditableList rows={vocabulary} addLabel={t("support.addVocabulary")} placeholder={t("support.vocabularyPlaceholder")} onChange={setVocabulary} />
              <EditableList rows={guidingQuestions} addLabel={t("support.addQuestion")} placeholder={t("support.questionPlaceholder")} onChange={setGuidingQuestions} />
            </div>
          </Section>

          <Section icon={<ListPlus size={18} />} title={t("segments.title")}>
            <div className="grid gap-3">
              {segments.map((segment, index) => (
                <div key={segment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                    <input value={segment.title} onChange={(e) => updateSegment(index, { title: e.target.value })} className={inputClass} />
                    <input value={segment.hint} onChange={(e) => updateSegment(index, { hint: e.target.value })} placeholder={t("segments.hintPlaceholder")} className={inputClass} />
                    <button type="button" onClick={() => removeSegment(index)} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-700 hover:bg-rose-50">
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

          <Section icon={<Sparkles size={18} />} title={t("settings.title")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Segmented label={t("settings.scriptMode")} value={scriptMode} options={[
                ["bullet_points", t("settings.bulletPoints")],
                ["script", t("settings.fullScript")],
              ]} onChange={(value) => setScriptMode(value as ScriptMode)} />
              <Segmented label={t("settings.aiSupport")} value={aiSupport} options={[
                ["coach", t("settings.aiCoach")],
                ["off", t("settings.aiOff")],
              ]} onChange={(value) => setAiSupport(value as AiSupport)} />
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              {t("settings.locked")}
            </div>
          </Section>
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <div className="flex items-center gap-2 text-lg font-black text-slate-950">
            <Mic2 size={20} /> {t("overview.title")}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label={t("overview.segments")} value={String(segments.length)} />
            <Stat label={t("overview.duration")} value={targetDurationSeconds ? t("overview.minutes", { n: Math.round(targetDurationSeconds / 60) }) : "-"} />
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <div className="font-black text-slate-900">{t("overview.principleTitle")}</div>
            <p className="mt-1">{t("overview.principle")}</p>
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 text-sm leading-6 text-slate-600">
            <HelpCircle size={16} className="mb-2" />
            {t("overview.next")}
          </div>

          {saveError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{saveError}</div> : null}
          {saveMessage ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{saveMessage}</div> : null}
          {loadingSaved ? <div className="mt-4 text-sm font-bold text-slate-500">{t("save.loading")}</div> : null}

          <button type="button" onClick={saveWorkshop} disabled={!canSave || saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Save size={17} /> {saving ? t("save.saving") : savedId ? t("save.update") : t("save.create")}
          </button>
          {savedId ? (
            <Link href={`/${locale}/content`} className="mt-2 inline-flex w-full justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-800 no-underline hover:bg-slate-50">
              {t("save.openContent")}
            </Link>
          ) : null}
        </aside>
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950">
        {icon} {title}
      </h2>
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

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-sm font-black text-slate-700">{label}</div>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-300 bg-white">
        {options.map(([key, text]) => (
          <button key={key} type="button" onClick={() => onChange(key)} className={value === key ? "bg-slate-950 px-3 py-2 text-sm font-black text-white" : "px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"}>
            {text}
          </button>
        ))}
      </div>
    </div>
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
