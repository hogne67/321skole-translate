// app\[locale]\(app)\producer\math\geometry\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  getFeatureStatusFromProfile,
  type FeatureStatus,
} from "@/lib/featureGuard";
import type { BillingSnapshot, PlanKey } from "@/lib/featureAccess";
import mathGeometryMessages from "@/messages/en/math/mathGeometry.json";

type WorksheetLanguage = "no" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "all";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";
type AnswerSpace = "small" | "medium" | "large";

type FigureKind =
  | "rectangle"
  | "square"
  | "parallelogram"
  | "rhombus"
  | "trapezoid"
  | "triangle"
  | "circle";

type FigureSpec = {
  kind: FigureKind;
  widthCm?: number;
  heightCm?: number;
  sideCm?: number;
  baseCm?: number;
  topCm?: number;
  sideLeftCm?: number;
  sideRightCm?: number;
  sideAcm?: number;
  sideBcm?: number;
  sideCcm?: number;
  radiusCm?: number;
};

type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "perimeter" | "area" | "all_in_one";
  prompt: string;
  figure?: FigureSpec;
  answer: string;
  explanation?: string;
  hint?: string;
  formula?: string;
};

type MathWorksheet = {
  title: string;
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  instructions: string;
  showAnswerKey: boolean;
  showFormulas: boolean;
  selectedShapes: FigureKind[];
  tasks: MathWorksheetTask[];
};

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
  "triangle",
  "circle",
];

const strings = mathGeometryMessages.mathGeometry;
type MathGeometryStrings = typeof strings;

function fallbackWorksheet(language: WorksheetLanguage): MathWorksheet {
  return {
    title: strings.fallback.title,
    language,
    level: "grade_5_7",
    topic: "all",
    difficulty: "easy",
    instructions: strings.fallback.instructions,
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
    if (orgRole === "teacher" || orgRole === "student" || orgRole === "parent") {
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

function answerSpaceClass(answerSpace: AnswerSpace): string {
  if (answerSpace === "small") return "min-h-[40px]";
  if (answerSpace === "large") return "min-h-[110px]";
  return "min-h-[72px]";
}

function getMeasurementLabel(
  key:
    | "length"
    | "width"
    | "side"
    | "base"
    | "height"
    | "topBase"
    | "leftSide"
    | "rightSide"
    | "radius"
    | "sides"
): string {
  return strings.measurementLabels[key];
}

function getShapeLabel(kind: FigureKind) {
  if (kind === "square") return strings.square;
  if (kind === "rectangle") return strings.rectangle;
  if (kind === "parallelogram") return strings.parallelogram;
  if (kind === "rhombus") return strings.rhombus;
  if (kind === "trapezoid") return strings.trapezoid;
  if (kind === "triangle") return strings.triangle;
  return strings.circle;
}

function GeometryFigure({
  figure,
}: {
  figure?: FigureSpec;
}) {
  if (!figure) return null;

  const labelClass = "text-[11px] fill-slate-700";
  const dashedLineClass = "stroke-slate-400";
  const heightText = getMeasurementLabel("height");

  if (figure.kind === "rectangle") {
    const width = figure.widthCm ?? 8;
    const height = figure.heightCm ?? 5;

    return (
      <svg viewBox="0 0 240 150" className="h-36 w-full max-w-[260px]">
        <rect
          x="40"
          y="28"
          width="160"
          height="90"
          rx="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <text x="120" y="20" textAnchor="middle" className={labelClass}>
          {width} cm
        </text>
        <text x="216" y="76" textAnchor="middle" className={labelClass}>
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "square") {
    const side = figure.sideCm ?? 6;

    return (
      <svg viewBox="0 0 180 160" className="h-36 w-full max-w-[220px]">
        <rect
          x="40"
          y="30"
          width="90"
          height="90"
          rx="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <text x="85" y="20" textAnchor="middle" className={labelClass}>
          {side} cm
        </text>
        <text x="145" y="78" textAnchor="middle" className={labelClass}>
          {side} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "parallelogram") {
    const base = figure.baseCm ?? 8;
    const side = figure.sideCm ?? 5;
    const height = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 240 160" className="h-36 w-full max-w-[260px]">
        <polygon
          points="55,118 95,36 195,36 155,118"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <line
          x1="95"
          y1="36"
          x2="95"
          y2="118"
          strokeDasharray="5 5"
          strokeWidth="2"
          className={dashedLineClass}
        />
        <text x="125" y="28" textAnchor="middle" className={labelClass}>
          {base} cm
        </text>
        <text x="48" y="80" textAnchor="middle" className={labelClass}>
          {side} cm
        </text>
        <text x="82" y="80" textAnchor="end" className={labelClass}>
          {height} cm
        </text>
        <text x="82" y="94" textAnchor="end" className={labelClass}>
          {heightText}
        </text>
      </svg>
    );
  }

  if (figure.kind === "rhombus") {
    const side = figure.sideCm ?? 6;
    const height = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 240 180" className="h-36 w-full max-w-[260px]">
        <polygon
          points="120,30 185,80 120,130 55,80"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <line
          x1="55"
          y1="80"
          x2="185"
          y2="80"
          strokeDasharray="4 4"
          strokeWidth="1.5"
          className="stroke-slate-300"
        />
        <line
          x1="120"
          y1="30"
          x2="120"
          y2="80"
          strokeDasharray="5 5"
          strokeWidth="2"
          className={dashedLineClass}
        />
        <text x="198" y="84" textAnchor="start" className={labelClass}>
          {side} cm
        </text>
        <text x="108" y="58" textAnchor="end" className={labelClass}>
          {height} cm
        </text>
        <text x="108" y="72" textAnchor="end" className={labelClass}>
          {heightText}
        </text>
      </svg>
    );
  }

  if (figure.kind === "trapezoid") {
    const base = figure.baseCm ?? 12;
    const top = figure.topCm ?? 8;
    const height = figure.heightCm ?? 4;
    const sideLeft = figure.sideLeftCm ?? 5;
    const sideRight = figure.sideRightCm ?? 5;

    return (
      <svg viewBox="0 0 250 170" className="h-36 w-full max-w-[270px]">
        <polygon
          points="45,122 80,44 170,44 205,122"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <line
          x1="80"
          y1="44"
          x2="80"
          y2="122"
          strokeDasharray="5 5"
          strokeWidth="2"
          className={dashedLineClass}
        />
        <text x="125" y="34" textAnchor="middle" className={labelClass}>
          {top} cm
        </text>
        <text x="125" y="143" textAnchor="middle" className={labelClass}>
          {base} cm
        </text>
        <text x="34" y="82" textAnchor="middle" className={labelClass}>
          {sideLeft} cm
        </text>
        <text x="216" y="82" textAnchor="middle" className={labelClass}>
          {sideRight} cm
        </text>
        <text x="68" y="82" textAnchor="end" className={labelClass}>
          {height} cm
        </text>
        <text x="68" y="96" textAnchor="end" className={labelClass}>
          {heightText}
        </text>
      </svg>
    );
  }

  if (figure.kind === "triangle") {
    const a = figure.sideAcm ?? 3;
    const b = figure.sideBcm ?? 4;
    const c = figure.sideCcm ?? 5;
    const h = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 240 170" className="h-36 w-full max-w-[250px]">
        <polygon
          points="55,130 55,40 175,130"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
        />
        <line
          x1="55"
          y1="40"
          x2="55"
          y2="130"
          strokeDasharray="5 5"
          strokeWidth="2"
          className={dashedLineClass}
        />
        <text x="112" y="146" textAnchor="middle" className={labelClass}>
          {a} cm
        </text>
        <text x="38" y="88" textAnchor="middle" className={labelClass}>
          {b} cm
        </text>
        <text x="122" y="76" textAnchor="middle" className={labelClass}>
          {c} cm
        </text>
        <text x="42" y="90" textAnchor="end" className={labelClass}>
          {h} cm
        </text>
      </svg>
    );
  }

  const radius = figure.radiusCm ?? 5;

  return (
    <svg viewBox="0 0 220 170" className="h-36 w-full max-w-[240px]">
      <circle
        cx="110"
        cy="85"
        r="50"
        fill="white"
        stroke="currentColor"
        strokeWidth="2"
        className="text-slate-700"
      />
      <line
        x1="110"
        y1="85"
        x2="160"
        y2="85"
        strokeDasharray="5 5"
        strokeWidth="2"
        className={dashedLineClass}
      />
      <text x="135" y="76" textAnchor="middle" className={labelClass}>
        {radius} cm
      </text>
    </svg>
  );
}

function FigureMeta({
  figure,
}: {
  figure?: FigureSpec;
}) {
  if (!figure) return null;

  if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("length")}: {figure.widthCm} cm, {getMeasurementLabel("width")}:{" "}
        {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "square" && figure.sideCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("side")}: {figure.sideCm} cm
      </p>
    );
  }

  if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("base")}: {figure.baseCm} cm, {getMeasurementLabel("side")}:{" "}
        {figure.sideCm} cm, {getMeasurementLabel("height")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("side")}: {figure.sideCm} cm, {getMeasurementLabel("height")}:{" "}
        {figure.heightCm} cm
      </p>
    );
  }

  if (
    figure.kind === "trapezoid" &&
    figure.baseCm &&
    figure.topCm &&
    figure.heightCm &&
    figure.sideLeftCm &&
    figure.sideRightCm
  ) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("base")}: {figure.baseCm} cm, {getMeasurementLabel("topBase")}:{" "}
        {figure.topCm} cm, {getMeasurementLabel("height")}: {figure.heightCm} cm,{" "}
        {getMeasurementLabel("leftSide")}: {figure.sideLeftCm} cm,{" "}
        {getMeasurementLabel("rightSide")}: {figure.sideRightCm} cm
      </p>
    );
  }

  if (
    figure.kind === "triangle" &&
    figure.sideAcm &&
    figure.sideBcm &&
    figure.sideCcm &&
    figure.heightCm
  ) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("sides")}: {figure.sideAcm} cm, {figure.sideBcm} cm,{" "}
        {figure.sideCcm} cm, {getMeasurementLabel("height")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "circle" && figure.radiusCm) {
    return (
      <p className="text-sm text-slate-600">
        {getMeasurementLabel("radius")}: {figure.radiusCm} cm
      </p>
    );
  }

  return null;
}

function getStatusMessage(status: FeatureStatus | null, ui: MathGeometryStrings): string {
  if (!status?.reason) return "";

  if (status.reason === "teacher_only") return ui.teacherOnly;
  if (status.reason === "upgrade_required") return ui.upgradeRequired;
  if (status.reason === "limit_reached") return ui.limitReached;
  return ui.failed;
}

function formatAnswerKeyAnswer(task: MathWorksheetTask) {
  if (task.type === "all_in_one") return task.answer;

  if (task.type === "shape_name") {
    return `${strings.shapeNameLabel}: ${task.answer}`;
  }

  return task.answer;
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
  const initialLanguage: WorksheetLanguage =
    locale === "no" || locale === "en" || locale === "pt" ? locale : "en";

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
    fallbackWorksheet(initialLanguage)
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
      setError(strings.upgradeRequired);
      return;
    }

    if (featureBlocked) {
      setError(getStatusMessage(featureStatus, strings));
      return;
    }

    if (selectedShapes.length === 0) {
      setError(strings.selectAtLeastOneShape);
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
            : strings.failed;
        setError(message);
        return;
      }

      setWorksheet(data.worksheet);
      setUsageInfo(strings.successGenerated);
      await refreshFeatureStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.failed);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToMyContent() {
    if (!uid || worksheet.tasks.length === 0) return;

    setSaving(true);
    setError("");
    setUsageInfo("");

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      const response = await fetch("/api/producer/save-math-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          worksheet,
          source: "math-geometry-generator",
        }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || strings.saveFailed);
        return;
      }

      setUsageInfo(strings.savedToMyContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      <style jsx global>{`
        @media print {
          header,
          nav,
          aside[class*="sidebar"],
          [data-topnav],
          [data-sidebar],
          [data-app-shell-nav] {
            display: none !important;
          }

          main,
          section,
          article,
          div {
            box-shadow: none !important;
          }

          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {strings.pageTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
            {strings.pageSubtitle}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] print:block">
          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {strings.builder}
              </h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {strings.language}
                </span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as WorksheetLanguage)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                >
                  <option value="no">Norsk</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {strings.level}
                </span>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as GeometryLevel)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="grade_3_4">{strings.grade34}</option>
                  <option value="grade_5_7">{strings.grade57}</option>
                  <option value="grade_8_10">{strings.grade810}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {strings.topic}
                </span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as GeometryTopic)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="shapes">{strings.shapes}</option>
                  <option value="perimeter">{strings.perimeter}</option>
                  <option value="area">{strings.area}</option>
                  <option value="all">{strings.all}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {strings.difficulty}
                </span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="easy">{strings.easy}</option>
                  <option value="medium">{strings.medium}</option>
                  <option value="hard">{strings.hard}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  {strings.taskCount}
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
                  {strings.answerSpace}
                </span>
                <select
                  value={answerSpace}
                  onChange={(e) => setAnswerSpace(e.target.value as AnswerSpace)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                >
                  <option value="small">{strings.small}</option>
                  <option value="medium">{strings.mediumSpace}</option>
                  <option value="large">{strings.large}</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {strings.chooseShapes}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllShapes}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {strings.selectAll}
                    </button>
                    <button
                      type="button"
                      onClick={clearAllShapes}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {strings.clearAll}
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
                        <span>{getShapeLabel(shape)}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedShapes.length === 0 ? (
                  <p className="mt-3 text-sm text-red-600">
                    {strings.selectAtLeastOneShape}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    {strings.selectedCount}: {selectedShapes.length}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-700">
                  {strings.options}
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ToggleChip
                    label={strings.hints}
                    active={includeHints}
                    onClick={() => setIncludeHints((v) => !v)}
                  />
                  <ToggleChip
                    label={strings.showFormulas}
                    active={showFormulas}
                    onClick={() => setShowFormulas((v) => !v)}
                  />
                  <ToggleChip
                    label={strings.showAnswerKey}
                    active={showAnswerKey}
                    onClick={() => setShowAnswerKey((v) => !v)}
                  />
                </div>
              </div>

              {!statusLoading && featureStatus ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {strings.usageLeft}: {generatorsRemaining} / {generatorsLimit}
                </div>
              ) : null}

              {!statusLoading && featureBlocked ? (
                <Link
                  href={`/${locale}/pricing`}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {strings.seePlans}
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
                  {loading ? strings.generating : strings.generate}
                </button>

                <button
                  type="button"
                  onClick={handleSaveToMyContent}
                  disabled={saving || worksheet.tasks.length === 0}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? strings.saving : strings.saveToMyContent}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {strings.print}
                </button>
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <div className="border-b border-slate-200 px-6 py-4 print:hidden">
              <h2 className="text-lg font-semibold text-slate-900">
                {strings.preview}
              </h2>
            </div>

            <div className="px-6 py-6 print:px-0 print:py-0">
              <div className="mx-auto max-w-[820px] bg-white text-slate-900 print:max-w-none">
                <div className="mb-6 border-b border-slate-200 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-2xl font-bold">{worksheet.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {worksheet.instructions}
                      </p>
                    </div>

                    <div className="shrink-0 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                      {strings.worksheet}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                      <span className="font-medium">{strings.name}:</span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                      <span className="font-medium">{strings.date}:</span>
                    </div>
                  </div>
                </div>

                {worksheet.tasks.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                    {strings.generate}
                  </div>
                ) : (
                  <>
                    <div className="space-y-5">
                      {worksheet.tasks.map((task, idx) => (
                        <article
                          key={task.id}
                          className="rounded-3xl border border-slate-200 p-4 sm:p-5"
                        >
                          <div className="mb-3 flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-base font-semibold text-slate-900">
                                {task.prompt}
                              </h4>
                              <FigureMeta figure={task.figure} />
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                            <div className="flex items-center justify-center rounded-2xl bg-slate-50 p-3">
                              <GeometryFigure figure={task.figure} />
                            </div>

                            <div className="space-y-3">
                              <div
                                className={`rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 ${answerSpaceClass(
                                  answerSpace
                                )}`}
                              >
                                <span className="text-sm font-medium text-slate-600">
                                  {strings.answer}:
                                </span>
                              </div>

                              {worksheet.showFormulas && task.formula ? (
                                <div className="rounded-2xl bg-blue-50 p-3 text-sm text-slate-700">
                                  <span className="font-semibold text-slate-900">
                                    {strings.formula}:
                                  </span>
                                  <div className="mt-1 whitespace-pre-line">
                                    {task.formula}
                                  </div>
                                </div>
                              ) : null}

                              {includeHints && task.hint ? (
                                <div className="rounded-2xl bg-amber-50 p-3 text-sm text-slate-700">
                                  <span className="font-semibold text-slate-900">
                                    {strings.hint}:
                                  </span>{" "}
                                  {task.hint}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>

                    {worksheet.showAnswerKey ? (
                      <section className="mt-10 break-before-page border-t-2 border-slate-300 pt-8">
                        <div className="mb-6">
                          <h3 className="text-2xl font-bold text-slate-900">
                            {strings.answerKeyTitle}
                          </h3>
                        </div>

                        <div className="space-y-5">
                          {worksheet.tasks.map((task, idx) => (
                            <article
                              key={`answer-key-${task.id}`}
                              className="rounded-3xl border border-slate-200 bg-emerald-50 p-4 sm:p-5"
                            >
                              <div className="mb-3 flex items-start gap-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                                  {idx + 1}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-base font-semibold text-slate-900">
                                    {strings.taskLabel} {idx + 1}
                                  </h4>
                                  <p className="mt-1 text-sm text-slate-700">
                                    {task.prompt}
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                                <div className="flex items-center justify-center rounded-2xl bg-white p-3">
                                  <GeometryFigure figure={task.figure} />
                                </div>

                                <div className="space-y-3">
                                  <div className="rounded-2xl bg-white p-3">
                                    <p className="whitespace-pre-line text-sm text-slate-800">
                                      <span className="font-semibold text-slate-900">
                                        {strings.answer}:
                                      </span>{" "}
                                      {formatAnswerKeyAnswer(task)}
                                    </p>
                                  </div>

                                  {task.formula ? (
                                    <div className="rounded-2xl bg-white p-3">
                                      <p className="whitespace-pre-line text-sm text-slate-700">
                                        <span className="font-semibold text-slate-900">
                                          {strings.formula}:
                                        </span>{" "}
                                        {task.formula}
                                      </p>
                                    </div>
                                  ) : null}

                                  {task.explanation ? (
                                    <div className="rounded-2xl bg-white p-3">
                                      <p className="text-sm text-slate-700">
                                        <span className="font-semibold text-slate-900">
                                          {strings.explanation}:
                                        </span>{" "}
                                        {task.explanation}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}