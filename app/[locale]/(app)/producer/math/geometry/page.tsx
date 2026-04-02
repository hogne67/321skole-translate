// app/[locale]/(app)/producer/math/geometry/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import type {
  FigureKind,
  MathWorksheet,
  WorksheetLanguage,
  GeometryTopic,
  Difficulty,
  GeometryLevel,
} from "@/lib/math/geometry/types";

type SavedWorksheetLanguage = "no" | "en" | "pt";
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

function fallbackWorksheet(language: WorksheetLanguage, t: TFn): MathWorksheet {
  return {
    version: 1,
    title: t("fallback.title"),
    language,
    level: "grade_5_7",
    topic: "all",
    difficulty: "easy",
    instructions: t("fallback.instructions"),
    showAnswerKey: false,
    showFormulas: false,
    selectedShapes: ALL_FIGURES,
    tasks: [],
  };
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

// Midlertidig kompatibilitet med eksisterende save-route.
// Når backend er oppdatert til nb, kan denne fjernes.
function normalizeLanguageForSave(
  language: WorksheetLanguage
): SavedWorksheetLanguage {
  return language === "nb" ? "no" : language;
}

function normalizeWorksheetForSave(worksheet: MathWorksheet) {
  return {
    ...worksheet,
    language: normalizeLanguageForSave(worksheet.language),
  };
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      if (typeof json.error === "string" && json.error.trim()) return json.error;
      if (typeof json.message === "string" && json.message.trim()) {
        return json.message;
      }
      return fallback;
    } catch {
      return text.trim() || fallback;
    }
  } catch {
    return fallback;
  }
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
  const t = useTranslations("mathGeometry");
  const tBrand = useTranslations("brandLogo");
  const printRef = useRef<HTMLDivElement | null>(null);

  const initialLanguage: WorksheetLanguage =
    locale === "nb" || locale === "en" || locale === "pt" ? locale : "en";

  const { profile } = useUserProfile();

  const [language, setLanguage] = useState<WorksheetLanguage>(initialLanguage);
  const [level, setLevel] = useState<GeometryLevel>("grade_5_7");
  const [topic, setTopic] = useState<GeometryTopic>("all");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [taskCount, setTaskCount] = useState<number>(6);
  const [includeHints, setIncludeHints] = useState<boolean>(true);
  const [showAnswerKey, setShowAnswerKey] = useState<boolean>(false);
  const [showFormulas, setShowFormulas] = useState<boolean>(false);
  const [answerSpace, setAnswerSpace] = useState<AnswerSpace>("medium");
  const [selectedShapes, setSelectedShapes] = useState<FigureKind[]>(ALL_FIGURES);
  const [worksheet, setWorksheet] = useState<MathWorksheet>(() =>
    fallbackWorksheet(initialLanguage, t)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [usageInfo, setUsageInfo] = useState<string>("");
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
  }, [uid, role, plan, billing]);

  const generatorsLimit = featureStatus?.limit ?? 0;
  const generatorsRemaining = featureStatus?.remaining ?? 0;
  const featureBlocked = featureStatus ? !featureStatus.allowed : false;

  async function refreshFeatureStatus() {
    if (!uid) return;

    try {
      const status = await getFeatureStatusFromProfile({
        uid,
        role,
        plan,
        billing,
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

  async function handleGenerate() {
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
    setUsageInfo("");

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

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

      setWorksheet({
        ...data.worksheet,
        version: 1,
        language:
          data.worksheet.language === "en" || data.worksheet.language === "pt"
            ? data.worksheet.language
            : "nb",
      });
      setUsageInfo(t("successGenerated"));
      await refreshFeatureStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToMyContent() {
    if (!uid) {
      setError(t("saveFailed"));
      return;
    }

    if (worksheet.tasks.length === 0) {
      setError(t("saveFailed"));
      return;
    }

    setSaving(true);
    setError("");
    setUsageInfo("");

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      const payload = {
        worksheet: normalizeWorksheetForSave(worksheet),
        source: "math-geometry-generator",
      };

      const response = await fetch("/api/producer/save-math-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, t("saveFailed"));
        setError(message);
        return;
      }

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!data.ok) {
        setError(data.error || t("saveFailed"));
        return;
      }

      setUsageInfo(t("savedToMyContent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=1000,height=1400");
    if (!printWindow) return;

    const styles = `
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          color: #111827;
        }

        * {
          box-sizing: border-box;
        }

        .print-root {
          max-width: 980px;
          margin: 0 auto;
          padding: 0;
        }

        .print-card {
          background: #fff;
        }

        .print-brandbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
        }

        .print-brandleft {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .print-brandlogo {
          width: 64px;
          height: auto;
          object-fit: contain;
          flex-shrink: 0;
        }

        .print-brandtext {
          min-width: 0;
        }

        .print-brandtitle {
          font-size: 20px;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
        }

        .print-brandsite {
          margin-top: 2px;
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        .print-title-wrap {
          margin-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
        }

        .print-top-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .print-title {
          font-size: 24px;
          line-height: 1.2;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .print-instructions {
          margin-top: 8px;
          font-size: 14px;
          color: #475569;
        }

        .print-badge {
          flex-shrink: 0;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 8px 12px;
          font-size: 14px;
          font-weight: 500;
          color: #334155;
        }

        .print-meta-grid {
          margin-top: 20px;
          display: grid;
          gap: 12px;
        }

        .print-meta-box {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          color: #334155;
        }

        .print-task-list {
          display: grid;
          gap: 20px;
        }

        .print-task {
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 20px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .print-task-head {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .print-task-num {
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: #0f172a;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .print-task-prompt {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }

        .print-task-grid {
          display: grid;
          gap: 16px;
        }

        .print-figure-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border-radius: 16px;
          padding: 12px;
          min-height: 150px;
        }

        .print-answer-box {
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #fff;
          padding: 12px;
        }

        .print-answer-label {
          font-size: 14px;
          font-weight: 500;
          color: #475569;
        }

        .print-formula,
        .print-hint,
        .print-answer-key,
        .print-explanation {
          margin-top: 12px;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          color: #334155;
        }

        .print-formula {
          background: #eff6ff;
        }

        .print-hint {
          background: #fffbeb;
        }

        .print-answer-key {
          background: #ecfdf5;
        }

        .print-explanation {
          background: #f8fafc;
        }

        .print-strong {
          font-weight: 600;
          color: #0f172a;
        }

        .print-pre {
          white-space: pre-line;
        }

        .print-page-break {
          break-before: page;
          page-break-before: always;
          height: 0;
          margin: 0;
          padding: 0;
        }

        .figure-meta-text {
          font-size: 12px;
          color: #475569;
          text-align: center;
          line-height: 1.4;
          margin: 0;
        }

        svg {
          max-width: 100%;
          height: auto;
        }

        @media (min-width: 640px) {
          .print-top-row {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
          }

          .print-meta-grid {
            grid-template-columns: 1fr 1fr;
          }

          .print-task-grid {
            grid-template-columns: 220px minmax(0, 1fr);
          }
        }

        @media (max-width: 640px) {
          .print-brandbar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      </style>
    `;

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${worksheet.title}</title>
          ${styles}
        </head>
        <body>
          ${content.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    const doPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    if (images.length === 0) {
      doPrint();
      return;
    }

    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded >= images.length) {
        doPrint();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        done();
      } else {
        img.onload = done;
        img.onerror = done;
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t("pageTitle")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
            {t("pageSubtitle")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] print:block">
          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("builder")}
              </h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("language")}
                </span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as WorksheetLanguage)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                >
                  <option value="nb">{t("languages.nb")}</option>
                  <option value="en">{t("languages.en")}</option>
                  <option value="pt">{t("languages.pt")}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("level")}
                </span>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as GeometryLevel)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="grade_3_4">{t("grade34")}</option>
                  <option value="grade_5_7">{t("grade57")}</option>
                  <option value="grade_8_10">{t("grade810")}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("topic")}
                </span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as GeometryTopic)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="shapes">{t("shapes")}</option>
                  <option value="perimeter">{t("perimeter")}</option>
                  <option value="area">{t("area")}</option>
                  <option value="all">{t("all")}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("difficulty")}
                </span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="easy">{t("easy")}</option>
                  <option value="medium">{t("medium")}</option>
                  <option value="hard">{t("hard")}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("taskCount")}
                </span>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={taskCount}
                  onChange={(e) => setTaskCount(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("answerSpace")}
                </span>
                <select
                  value={answerSpace}
                  onChange={(e) => setAnswerSpace(e.target.value as AnswerSpace)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="small">{t("small")}</option>
                  <option value="medium">{t("mediumSpace")}</option>
                  <option value="large">{t("large")}</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t("chooseShapes")}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllShapes}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {t("selectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={clearAllShapes}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
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
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                          checked
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        aria-pressed={checked}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
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
                  <p className="mt-3 text-sm text-red-600">
                    {t("selectAtLeastOneShape")}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    {t("selectedCount")}: {selectedShapes.length}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-700">
                  {t("options")}
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  <ToggleChip
                    label={t("showAnswerKey")}
                    active={showAnswerKey}
                    onClick={() => setShowAnswerKey((v) => !v)}
                  />
                </div>
              </div>

              {!statusLoading && featureStatus ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {t("usageLeft")}: {generatorsRemaining} / {generatorsLimit}
                </div>
              ) : null}

              {!statusLoading && featureBlocked ? (
                <Link
                  href={`/${locale}/pricing`}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {t("seePlans")}
                </Link>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {!error && usageInfo ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {usageInfo}
                </div>
              ) : null}

              <div className="grid gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || statusLoading || featureBlocked}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? t("generating") : t("generate")}
                </button>

                <button
                  type="button"
                  onClick={handleSaveToMyContent}
                  disabled={saving || worksheet.tasks.length === 0 || !uid}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? t("saving") : t("saveToMyContent")}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {t("print")}
                </button>
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <div className="border-b border-slate-200 px-6 py-4 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("preview")}
              </h2>
            </div>

            <div className="px-6 py-6 print:px-0 print:py-0">
              <GeometryWorksheetView
                worksheet={worksheet}
                answerSpace={answerSpace}
                includeHints={includeHints}
                t={t}
                tBrand={tBrand}
                printRef={printRef}
                showIdentityFields={true}
                showFigureMeta={true}
                emptyStateKey="generate"
              />
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        .print-root {
          max-width: 980px;
          margin: 0 auto;
          padding: 0;
        }

        .print-card {
          background: #fff;
        }

        .print-brandbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
        }

        .print-brandleft {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .print-brandlogo {
          width: 64px;
          height: auto;
          object-fit: contain;
          flex-shrink: 0;
        }

        .print-brandtext {
          min-width: 0;
        }

        .print-brandtitle {
          font-size: 20px;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
        }

        .print-brandsite {
          margin-top: 2px;
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        .print-title-wrap {
          margin-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
        }

        .print-top-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .print-title {
          font-size: 24px;
          line-height: 1.2;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .print-instructions {
          margin-top: 8px;
          font-size: 14px;
          color: #475569;
        }

        .print-badge {
          flex-shrink: 0;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 8px 12px;
          font-size: 14px;
          font-weight: 500;
          color: #334155;
        }

        .print-meta-grid {
          margin-top: 20px;
          display: grid;
          gap: 12px;
        }

        .print-meta-box {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          color: #334155;
        }

        .print-task-list {
          display: grid;
          gap: 20px;
        }

        .print-task {
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 20px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .print-task-head {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .print-task-num {
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: #0f172a;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .print-task-prompt {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }

        .print-task-grid {
          display: grid;
          gap: 16px;
        }

        .print-figure-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border-radius: 16px;
          padding: 12px;
          min-height: 150px;
        }

        .print-answer-box {
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #fff;
          padding: 12px;
        }

        .print-answer-label {
          font-size: 14px;
          font-weight: 500;
          color: #475569;
        }

        .print-formula,
        .print-hint,
        .print-answer-key,
        .print-explanation {
          margin-top: 12px;
          border-radius: 16px;
          padding: 12px;
          font-size: 14px;
          color: #334155;
        }

        .print-formula {
          background: #eff6ff;
        }

        .print-hint {
          background: #fffbeb;
        }

        .print-answer-key {
          background: #ecfdf5;
        }

        .print-explanation {
          background: #f8fafc;
        }

        .print-strong {
          font-weight: 600;
          color: #0f172a;
        }

        .print-pre {
          white-space: pre-line;
        }

        .print-page-break {
          break-before: page;
          page-break-before: always;
          height: 0;
          margin: 0;
          padding: 0;
        }

        .figure-meta-text {
          font-size: 12px;
          color: #475569;
          text-align: center;
          line-height: 1.4;
          margin: 0;
        }

        svg {
          max-width: 100%;
          height: auto;
        }

        @media (min-width: 640px) {
          .print-top-row {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
          }

          .print-meta-grid {
            grid-template-columns: 1fr 1fr;
          }

          .print-task-grid {
            grid-template-columns: 220px minmax(0, 1fr);
          }
        }

        @media (max-width: 640px) {
          .print-brandbar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </main>
  );
}