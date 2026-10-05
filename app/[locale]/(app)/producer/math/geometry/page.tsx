// app\[locale]\(app)\producer\math\geometry\page.tsx
"use client";

import MathGeneratorBackLink from "@/components/generators/math/MathGeneratorBackLink";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import {
  GEOMETRY_FIGURES,
  isDifficulty,
  isFigureKind,
  isGeometryAnswerSpace,
  isGeometryLevel,
  isGeometryTopic,
} from "@/lib/math/geometry/types";
import type {
  FigureKind,
  GeometryAnswerSpace,
  MathWorksheet,
  WorksheetLanguage,
  GeometryTopic,
  Difficulty,
  GeometryLevel,
} from "@/lib/math/geometry/types";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";
import { applyGeometryDisplayOptions } from "@/lib/math/geometry/displayOptions";
import GeometryGeneratorPanel from "@/components/generators/math/geometry/GeometryGeneratorPanel";
import GeometryGeneratorPreview from "@/components/generators/math/geometry/GeometryGeneratorPreview";

type AnswerSpace = GeometryAnswerSpace;

type GenerateResponse =
  | {
      ok: true;
      worksheet: MathWorksheet;
    }
  | {
      ok: false;
      error: string;
    };

const ALL_FIGURES: FigureKind[] = [...GEOMETRY_FIGURES];

type TFn = (key: string) => string;
const GEOMETRY_DRAFT_STORAGE_KEY = "321school.math.geometry.previewDraft";

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

function getStatusMessage(status: FeatureStatus | null, t: TFn): string {
  if (!status?.reason) return "";
  if (status.reason === "teacher_only") return t("teacherOnly");
  if (status.reason === "upgrade_required") return t("upgradeRequired");
  if (status.reason === "limit_reached") return t("limitReached");
  return t("failed");
}

export default function ProducerMathGeometryPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("mathGeometry");

  const initialLanguage: WorksheetLanguage =
    locale === "nb" || locale === "en" || locale === "pt" ? locale : "en";

  const { profile } = useUserProfile();

  const language = initialLanguage;
  // Retain legacy metadata when opening existing worksheets, not as a task setting.
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
  const [worksheet, setWorksheet] = useState<MathWorksheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        setWorksheet(null);
        return true;
      }

      if (!editId) return false;

      try {
        const snap = await getDoc(doc(db, "lessons", editId));
        if (!active || !snap.exists()) return true;

        const data = snap.data() as { mathWorksheet?: unknown };
        const savedWorksheet = sanitizeWorksheet(data.mathWorksheet);
        if (!savedWorksheet) return true;

        setWorksheet(savedWorksheet);
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
        worksheet?: unknown;
      };
      setWorksheet(sanitizeWorksheet(draft.worksheet));
      const settings = draft.settings;
      if (!settings) return;

      setHasCountedDraft(draft.usageCounted === true);

      if (isGeometryLevel(settings.level)) setLevel(settings.level);
      if (isGeometryTopic(settings.topic)) setTopic(settings.topic);
      if (isDifficulty(settings.difficulty)) setDifficulty(settings.difficulty);
      if (typeof settings.includeHints === "boolean") setIncludeHints(settings.includeHints);
      if (typeof settings.showAnswerKey === "boolean") setShowAnswerKey(settings.showAnswerKey);
      if (typeof settings.showFormulas === "boolean") setShowFormulas(settings.showFormulas);
      if (isGeometryAnswerSpace(settings.answerSpace)) setAnswerSpace(settings.answerSpace);

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
    setSaved(false);

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


      setHasCountedDraft(true);
      setWorksheet(generatedWorksheet);
      if (shouldCountUsage) {
        await refreshFeatureStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setLoading(false);
    }
  }

  const previewWorksheet = worksheet
    ? applyGeometryDisplayOptions(worksheet, { answerSpace, showAnswerKey, showFormulas, includeHints })
    : null;

  useEffect(() => {
    if (!worksheet) return;
    window.sessionStorage.setItem(GEOMETRY_DRAFT_STORAGE_KEY, JSON.stringify({
      worksheet: applyGeometryDisplayOptions(worksheet, { answerSpace, showAnswerKey, showFormulas, includeHints }),
      settings: { language, level, topic, difficulty, taskCount, includeHints, showAnswerKey, showFormulas, answerSpace, selectedShapes },
      usageCounted: hasCountedDraft,
      createdAt: new Date().toISOString(),
    }));
  }, [worksheet, language, level, topic, difficulty, taskCount, includeHints, showAnswerKey, showFormulas, answerSpace, selectedShapes, hasCountedDraft]);

  async function saveToMyContent() {
    if (!previewWorksheet || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error(t("saveFailed"));
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/producer/save-math-worksheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          worksheet: previewWorksheet,
          source: "math-geometry-generator",
        }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; id?: string };
      if (!response.ok || !data.ok || !data.id) throw new Error(data.error || t("saveFailed"));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="geometry-generator min-h-screen bg-slate-50 pb-12">
      <div className="geometry-generator-layout mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="geometry-generator-controls h-fit bg-white p-5">
          <MathGeneratorBackLink />
          <p className="text-xs font-black uppercase text-teal-700">{t("mathBrand")}</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">{t("pageTitle")}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("pageSubtitle")}</p>
          <GeometryGeneratorPanel
            t={t}
            topic={topic}
            difficulty={difficulty}
            taskCount={taskCount}
            answerSpace={answerSpace}
            selectedShapes={selectedShapes}
            includeHints={includeHints}
            showFormulas={showFormulas}
            showAnswerKey={showAnswerKey}
            onTopicChange={setTopic}
            onMeasurementsChange={setDifficulty}
            onTaskCountChange={setTaskCount}
            onAnswerSpaceChange={setAnswerSpace}
            onToggleShape={toggleShape}
            onSelectAll={selectAllShapes}
            onClearAll={clearAllShapes}
            onHintsChange={setIncludeHints}
            onFormulasChange={setShowFormulas}
            onAnswerKeyChange={setShowAnswerKey}
            onGenerate={handleGenerateAndPreview}
            onSave={saveToMyContent}
            onPrint={() => window.print()}
            generating={loading}
            saving={saving}
            canGenerate={!loading && !saving && !statusLoading && !featureBlocked && selectedShapes.length > 0 && !!uid}
            hasWorksheet={!!worksheet}
          />
          {!statusLoading && featureStatus ? (
            <p className="mt-4 text-xs text-slate-500">{t("usageLeft")}: {generatorsRemaining} / {generatorsLimit}</p>
          ) : null}
          {featureBlocked ? (
            <Link href={`/${locale}/pricing`} className="mt-3 block text-sm font-semibold text-teal-700 underline">{t("seePlans")}</Link>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
          {saved ? (
            <div role="status" className="mt-4 text-sm text-emerald-800">
              <p>{t("savedToMyContent")}</p>
              <Link href={`/${locale}/content`} className="mt-1 inline-block underline">{t("controlPreview.openMyContent")}</Link>
            </div>
          ) : null}
        </aside>
        <section aria-label={t("preview")} className="geometry-generator-preview min-w-0 bg-white p-5 sm:p-6">
          <GeometryGeneratorPreview worksheet={previewWorksheet} includeHints={includeHints} />
        </section>
      </div>
    </main>
  );
}
