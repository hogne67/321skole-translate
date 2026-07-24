// app\[locale]\(app)\producer\math\geometry\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import type {
  FigureKind,
  MathWorksheet,
  WorksheetLanguage,
  GeometryTopic,
  Difficulty,
  GeometryLevel,
} from "@/lib/math/geometry/types";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";

type AnswerSpace = "small" | "medium" | "large";

type GenerateResponse =
  | {
      ok: true;
      worksheet: MathWorksheet;
    }
  | {
      ok: false;
      error: string;
    };

const ALL_FIGURES: FigureKind[] = [
  "square",
  "rectangle",
  "parallelogram",
  "rhombus",
  "trapezoid",
  "triangle_right",
  "triangle_isosceles",
  "triangle_equilateral",
  "circle",
];

type TFn = (key: string) => string;
const GEOMETRY_DRAFT_STORAGE_KEY = "321school.math.geometry.previewDraft";

function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return value === "nb" || value === "en" || value === "pt";
}

function isGeometryLevel(value: unknown): value is GeometryLevel {
  return value === "grade_3_4" || value === "grade_5_7" || value === "grade_8_10";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return value === "shapes" || value === "perimeter" || value === "area" || value === "all";
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isAnswerSpace(value: unknown): value is AnswerSpace {
  return value === "small" || value === "medium" || value === "large";
}

function isFigureKind(value: unknown): value is FigureKind {
  return typeof value === "string" && ALL_FIGURES.includes(value as FigureKind);
}

function clampTaskCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(4, Math.min(12, Math.round(value)));
}

function safePlan(plan: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function resolveRoleFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "anonymous";

  const p = profile as Record<string, unknown>;

  if (p.role === "teacher" || p.role === "student" || p.role === "parent") {
    return p.role;
  }

  if (p.mode === "teacher" || p.mode === "student" || p.mode === "parent") {
    return p.mode;
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (
      orgRole === "teacher" ||
      orgRole === "student" ||
      orgRole === "parent"
    ) {
      return orgRole;
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.teacher === true) return "teacher";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return "anonymous";
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

function getShapeLabel(t: TFn, kind: FigureKind) {
  if (kind === "triangle_right") return t("triangleRight");
  if (kind === "triangle_isosceles") return t("triangleIsosceles");
  if (kind === "triangle_equilateral") return t("triangleEquilateral");
  return t(kind);
}

function getStatusMessage(status: FeatureStatus | null, t: TFn): string {
  if (!status?.reason) return "";
  if (status.reason === "teacher_only") return t("teacherOnly");
  if (status.reason === "upgrade_required") return t("upgradeRequired");
  if (status.reason === "limit_reached") return t("limitReached");
  return t("failed");
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
          active
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function ProducerMathGeometryPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("mathGeometry");

  const initialLanguage: WorksheetLanguage =
    locale === "nb" || locale === "en" || locale === "pt" ? locale : "en";

  const { profile } = useUserProfile();

  const [language, setLanguage] = useState<WorksheetLanguage>(initialLanguage);
  const [level, setLevel] = useState<GeometryLevel>("grade_5_7");
  const [topic, setTopic] = useState<GeometryTopic>("all");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [taskCount, setTaskCount] = useState<number>(6);
  const [includeHints, setIncludeHints] = useState<boolean>(false);
  const [showAnswerKey, setShowAnswerKey] = useState<boolean>(false);
  const [showFormulas, setShowFormulas] = useState<boolean>(false);
  const [answerSpace, setAnswerSpace] = useState<AnswerSpace>("medium");
  const [selectedShapes, setSelectedShapes] = useState<FigureKind[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [hasCountedDraft, setHasCountedDraft] = useState<boolean>(false);

  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);

  const profileUid =
    profile && typeof profile === "object" && "uid" in profile
      ? (profile as { uid?: string }).uid
      : undefined;

  const uid = profileUid ?? auth.currentUser?.uid ?? undefined;

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const plan = useMemo(() => safePlan(planValue), [planValue]);
  const role = useMemo(() => resolveRoleFromProfile(profile), [profile]);
  const billing = useMemo(() => getBillingSnapshot(profile), [profile]);
  const partnerAccess = profile?.partnerAccess === true;
  const partnerStatus = profile?.partnerStatus ?? null;
  const schoolId = profile?.schoolId ?? null;
  const schoolRole = profile?.schoolRole ?? null;
  const schoolStatus = profile?.schoolStatus ?? null;
  const editId = searchParams.get("edit")?.trim() || "";
  const startNew = searchParams.get("new") === "1";

  useEffect(() => {
    let active = true;

    async function loadEditableWorksheet() {
      if (startNew) {
        window.sessionStorage.removeItem(GEOMETRY_DRAFT_STORAGE_KEY);
        setLanguage(initialLanguage);
        setLevel("grade_5_7");
        setTopic("all");
        setDifficulty("easy");
        setTaskCount(6);
        setIncludeHints(false);
        setShowAnswerKey(false);
        setShowFormulas(false);
        setAnswerSpace("medium");
        setSelectedShapes([]);
        setHasCountedDraft(false);
        return true;
      }

      if (!editId) return false;

      try {
        const snap = await getDoc(doc(db, "lessons", editId));
        if (!active || !snap.exists()) return true;

        const data = snap.data() as { mathWorksheet?: unknown };
        const savedWorksheet = sanitizeWorksheet(data.mathWorksheet);
        if (!savedWorksheet) return true;

        setLanguage(savedWorksheet.language);
        setLevel(savedWorksheet.level);
        setTopic(savedWorksheet.topic);
        setDifficulty(savedWorksheet.difficulty);
        setTaskCount(Math.max(4, Math.min(12, savedWorksheet.tasks.length || 6)));
        setIncludeHints(savedWorksheet.tasks.some((task) => !!task.hint));
        setShowAnswerKey(savedWorksheet.showAnswerKey);
        setShowFormulas(savedWorksheet.showFormulas);
        setAnswerSpace(savedWorksheet.answerSpace ?? "medium");
        setSelectedShapes(savedWorksheet.selectedShapes.filter(isFigureKind));
        setHasCountedDraft(true);
        window.sessionStorage.setItem(
          GEOMETRY_DRAFT_STORAGE_KEY,
          JSON.stringify({
            worksheet: savedWorksheet,
            settings: {
              language: savedWorksheet.language,
              level: savedWorksheet.level,
              topic: savedWorksheet.topic,
              difficulty: savedWorksheet.difficulty,
              taskCount: Math.max(4, Math.min(12, savedWorksheet.tasks.length || 6)),
              includeHints: savedWorksheet.tasks.some((task) => !!task.hint),
              showAnswerKey: savedWorksheet.showAnswerKey,
              showFormulas: savedWorksheet.showFormulas,
              answerSpace: savedWorksheet.answerSpace ?? "medium",
              selectedShapes: savedWorksheet.selectedShapes,
            },
            usageCounted: true,
            createdAt: new Date().toISOString(),
          })
        );
      } catch {
        // Keep the blank generator if the saved lesson cannot be loaded.
      }

      return true;
    }

    void loadEditableWorksheet().then((handledEdit) => {
      if (!active || handledEdit) return;

    try {
      const rawDraft = window.sessionStorage.getItem(GEOMETRY_DRAFT_STORAGE_KEY);
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft) as {
        settings?: Record<string, unknown>;
        usageCounted?: unknown;
      };
      const settings = draft.settings;
      if (!settings) return;

      setHasCountedDraft(draft.usageCounted === true);

      if (isWorksheetLanguage(settings.language)) setLanguage(settings.language);
      if (isGeometryLevel(settings.level)) setLevel(settings.level);
      if (isGeometryTopic(settings.topic)) setTopic(settings.topic);
      if (isDifficulty(settings.difficulty)) setDifficulty(settings.difficulty);
      if (typeof settings.includeHints === "boolean") setIncludeHints(settings.includeHints);
      if (typeof settings.showAnswerKey === "boolean") setShowAnswerKey(settings.showAnswerKey);
      if (typeof settings.showFormulas === "boolean") setShowFormulas(settings.showFormulas);
      if (isAnswerSpace(settings.answerSpace)) setAnswerSpace(settings.answerSpace);

      const restoredTaskCount = clampTaskCount(settings.taskCount);
      if (restoredTaskCount !== null) setTaskCount(restoredTaskCount);

      if (Array.isArray(settings.selectedShapes)) {
        setSelectedShapes(settings.selectedShapes.filter(isFigureKind));
      }
    } catch {
      // Ignore older or invalid drafts.
    }
    });

    return () => {
      active = false;
    };
  }, [editId, initialLanguage, startNew]);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      if (!uid) {
        if (active) {
          setFeatureStatus(null);
          setStatusLoading(false);
        }
        return;
      }

      setStatusLoading(true);

      try {
        const status = await getFeatureStatusFromProfile({
          uid,
          role,
          plan,
          billing,
          partnerAccess,
          partnerStatus,
          schoolId,
          schoolRole,
          schoolStatus,
          feature: "producer_create_math_worksheet",
        });

        if (active) {
          setFeatureStatus(status);
        }
      } catch {
        if (active) {
          setFeatureStatus(null);
        }
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [
    uid,
    role,
    plan,
    billing,
    partnerAccess,
    partnerStatus,
    schoolId,
    schoolRole,
    schoolStatus,
  ]);

  const generatorsLimit = featureStatus?.limit ?? 0;
  const generatorsRemaining = featureStatus?.remaining ?? 0;
  const featureBlocked = featureStatus
    ? !featureStatus.allowed && !(hasCountedDraft && featureStatus.reason === "limit_reached")
    : false;

  async function refreshFeatureStatus() {
    if (!uid) return;

    try {
      const status = await getFeatureStatusFromProfile({
        uid,
        role,
        plan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
        feature: "producer_create_math_worksheet",
      });
      setFeatureStatus(status);
    } catch {
      // behold gammel status
    }
  }

  function toggleShape(kind: FigureKind) {
    setSelectedShapes((current) => {
      const exists = current.includes(kind);
      if (exists) return current.filter((item) => item !== kind);
      return [...current, kind];
    });
  }

  function selectAllShapes() {
    setSelectedShapes([...ALL_FIGURES]);
  }

  function clearAllShapes() {
    setSelectedShapes([]);
  }

  async function handleGenerateAndPreview() {
    if (!uid) {
      setError(t("upgradeRequired"));
      return;
    }

    if (featureBlocked) {
      setError(getStatusMessage(featureStatus, t));
      return;
    }

    if (selectedShapes.length === 0) {
      setError(t("selectAtLeastOneShape"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;
      const shouldCountUsage = !hasCountedDraft;

      const response = await fetch("/api/generate-math-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          language,
          level,
          topic,
          difficulty,
          taskCount,
          includeHints,
          showAnswerKey,
          showFormulas,
          answerSpace,
          selectedShapes,
          countUsage: shouldCountUsage,
        }),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : t("failed");
        setError(message);
        return;
      }

      const generatedWorksheet: MathWorksheet = {
        ...data.worksheet,
        version: 1,
        language:
          data.worksheet.language === "en" || data.worksheet.language === "pt"
            ? data.worksheet.language
            : "nb",
        answerSpace,
      };

      window.sessionStorage.setItem(
        GEOMETRY_DRAFT_STORAGE_KEY,
        JSON.stringify({
          worksheet: generatedWorksheet,
          settings: {
            language,
            level,
            topic,
            difficulty,
            taskCount,
            includeHints,
            showAnswerKey,
            showFormulas,
            answerSpace,
            selectedShapes,
          },
          usageCounted: true,
          createdAt: new Date().toISOString(),
        })
      );

      setHasCountedDraft(true);
      if (shouldCountUsage) {
        await refreshFeatureStatus();
      }
      router.push(`/${locale}/producer/math/draft/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-44 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <section className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
                {t("mathBrand")}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {t("pageTitle")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">
                {t("pageSubtitle")}
              </p>
            </div>

            <div className="flex w-full items-center gap-4 rounded-3xl border border-blue-200 bg-white p-4 shadow-sm md:max-w-sm">
              <div className="grid h-14 w-20 shrink-0 place-items-center rounded-2xl border border-blue-200 bg-slate-100">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/25">
                  ▶
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-950">
                  {t("video.title")}
                </div>
                <div className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                  {t("video.placeholder")}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                {t("builder")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                {t("generatorIntro")}
              </p>
            </div>

            {!statusLoading && featureStatus ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm">
                {t("usageLeft")}: {generatorsRemaining} / {generatorsLimit}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4">
            <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-black text-slate-950">
                {t("sections.setup")}
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("language")}
                  </span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as WorksheetLanguage)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                  >
                    <option value="nb">{t("languages.nb")}</option>
                    <option value="en">{t("languages.en")}</option>
                    <option value="pt">{t("languages.pt")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("level")}
                  </span>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as GeometryLevel)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    <option value="grade_3_4">{t("grade34")}</option>
                    <option value="grade_5_7">{t("grade57")}</option>
                    <option value="grade_8_10">{t("grade810")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("topic")}
                  </span>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value as GeometryTopic)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    <option value="shapes">{t("shapes")}</option>
                    <option value="perimeter">{t("perimeter")}</option>
                    <option value="area">{t("area")}</option>
                    <option value="all">{t("all")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("difficulty")}
                  </span>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    <option value="easy">{t("easy")}</option>
                    <option value="medium">{t("medium")}</option>
                    <option value="hard">{t("hard")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("taskCount")}
                  </span>
                  <input
                    type="number"
                    min={4}
                    max={12}
                    value={taskCount}
                    onChange={(e) => setTaskCount(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">
                    {t("answerSpace")}
                  </span>
                  <select
                    value={answerSpace}
                    onChange={(e) => setAnswerSpace(e.target.value as AnswerSpace)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    <option value="small">{t("small")}</option>
                    <option value="medium">{t("mediumSpace")}</option>
                    <option value="large">{t("large")}</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-slate-950">
                    {t("sections.shapes")}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {t("selectedCount")}: {selectedShapes.length}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllShapes}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                  >
                    {t("selectAll")}
                  </button>
                  <button
                    type="button"
                    onClick={clearAllShapes}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                  >
                    {t("clearAll")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_FIGURES.map((shape) => {
                  const checked = selectedShapes.includes(shape);

                  return (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => toggleShape(shape)}
                      className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm font-bold transition ${
                        checked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      aria-pressed={checked}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-black ${
                          checked
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span>{getShapeLabel(t, shape)}</span>
                    </button>
                  );
                })}
              </div>

              {selectedShapes.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-red-600">
                  {t("selectAtLeastOneShape")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-black text-slate-950">
                {t("sections.options")}
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleChip
                  label={t("hints")}
                  active={includeHints}
                  onClick={() => setIncludeHints((v) => !v)}
                />
                <ToggleChip
                  label={t("showFormulas")}
                  active={showFormulas}
                  onClick={() => setShowFormulas((v) => !v)}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-black text-slate-950">
                {t("sections.answerKey")}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {t("answerKeyHelp")}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleChip
                  label={t("showAnswerKey")}
                  active={showAnswerKey}
                  onClick={() => setShowAnswerKey((v) => !v)}
                />
              </div>
            </div>

            {!statusLoading && featureBlocked ? (
              <Link
                href={`/${locale}/pricing`}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                {t("seePlans")}
              </Link>
            ) : null}
          </div>
        </section>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

      </div>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-14px_40px_rgba(15,23,42,0.12)] backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">
              {t("saveBar.title")}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 sm:text-sm">
              {t("saveBar.description")}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleGenerateAndPreview}
              disabled={loading || statusLoading || featureBlocked || selectedShapes.length === 0 || !uid}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("generating") : t("generateAndPreview")}
            </button>
          </div>
        </div>
      </section>

    </main>
  );
}
