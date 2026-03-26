// app/[locale]/(app)/producer/math/[id]/print/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";

type WorksheetLanguage = "no" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "all";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";

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
  version?: number;
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

type LessonDoc = {
  ownerId?: string;
  title?: string;
  level?: string;
  lessonType?: string;
  textType?: string;
  sourceText?: string;
  producerName?: string;
  coverImageUrl?: string;
  mathWorksheet?: MathWorksheet;
};

type UIStrings = {
  pageTitle: string;
  worksheet: string;
  answerKeyTitle: string;
  name: string;
  date: string;
  classLabel: string;
  answer: string;
  explanation: string;
  hint: string;
  formula: string;
  print: string;
  backToEditor: string;
  saveAsPdf: string;
  loading: string;
  notFound: string;
  noAccess: string;
  invalidWorksheet: string;
  readyForPrint: string;
  producer: string;
  level: string;
  geometryWorksheet: string;
  task: string;
};

const STRINGS: Record<WorksheetLanguage, UIStrings> = {
  no: {
    pageTitle: "Matteark – utskrift",
    worksheet: "Arbeidsark",
    answerKeyTitle: "Fasit",
    name: "Navn",
    date: "Dato",
    classLabel: "Klasse",
    answer: "Svar",
    explanation: "Forklaring",
    hint: "Hint",
    formula: "Formel",
    print: "Skriv ut / lagre som PDF",
    backToEditor: "Tilbake",
    saveAsPdf: "Bruk nettleserens utskrift og velg Lagre som PDF.",
    loading: "Laster matteark...",
    notFound: "Fant ikke mattearket.",
    noAccess: "Du har ikke tilgang til dette mattearket.",
    invalidWorksheet: "Dette dokumentet inneholder ikke et gyldig matteark.",
    readyForPrint: "Klar for PDF",
    producer: "Produsent",
    level: "Nivå",
    geometryWorksheet: "Geometriark",
    task: "Oppgave",
  },
  en: {
    pageTitle: "Math worksheet – print",
    worksheet: "Worksheet",
    answerKeyTitle: "Answer key",
    name: "Name",
    date: "Date",
    classLabel: "Class",
    answer: "Answer",
    explanation: "Explanation",
    hint: "Hint",
    formula: "Formula",
    print: "Print / save as PDF",
    backToEditor: "Back",
    saveAsPdf: "Use your browser print dialog and choose Save as PDF.",
    loading: "Loading worksheet...",
    notFound: "Worksheet not found.",
    noAccess: "You do not have access to this worksheet.",
    invalidWorksheet: "This document does not contain a valid math worksheet.",
    readyForPrint: "Ready for PDF",
    producer: "Producer",
    level: "Level",
    geometryWorksheet: "Geometry worksheet",
    task: "Task",
  },
  pt: {
    pageTitle: "Ficha de matemática – imprimir",
    worksheet: "Ficha",
    answerKeyTitle: "Gabarito",
    name: "Nome",
    date: "Data",
    classLabel: "Turma",
    answer: "Resposta",
    explanation: "Explicação",
    hint: "Dica",
    formula: "Fórmula",
    print: "Imprimir / guardar em PDF",
    backToEditor: "Voltar",
    saveAsPdf: "Usa a impressão do navegador e escolhe Guardar em PDF.",
    loading: "A carregar ficha...",
    notFound: "Ficha não encontrada.",
    noAccess: "Não tens acesso a esta ficha.",
    invalidWorksheet: "Este documento não contém uma ficha de matemática válida.",
    readyForPrint: "Pronto para PDF",
    producer: "Produtor",
    level: "Nível",
    geometryWorksheet: "Ficha de geometria",
    task: "Tarefa",
  },
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return value === "no" || value === "en" || value === "pt";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return value === "shapes" || value === "perimeter" || value === "area" || value === "all";
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isGeometryLevel(value: unknown): value is GeometryLevel {
  return value === "grade_3_4" || value === "grade_5_7" || value === "grade_8_10";
}

function isFigureKind(value: unknown): value is FigureKind {
  return (
    value === "rectangle" ||
    value === "square" ||
    value === "parallelogram" ||
    value === "rhombus" ||
    value === "trapezoid" ||
    value === "triangle" ||
    value === "circle"
  );
}

function sanitizeFigureSpec(value: unknown): FigureSpec | undefined {
  if (!isRecord(value) || !isFigureKind(value.kind)) return undefined;

  const toNumber = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  return {
    kind: value.kind,
    widthCm: toNumber(value.widthCm),
    heightCm: toNumber(value.heightCm),
    sideCm: toNumber(value.sideCm),
    baseCm: toNumber(value.baseCm),
    topCm: toNumber(value.topCm),
    sideLeftCm: toNumber(value.sideLeftCm),
    sideRightCm: toNumber(value.sideRightCm),
    sideAcm: toNumber(value.sideAcm),
    sideBcm: toNumber(value.sideBcm),
    sideCcm: toNumber(value.sideCcm),
    radiusCm: toNumber(value.radiusCm),
  };
}

function sanitizeTask(value: unknown, index: number): MathWorksheetTask | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  if (
    type !== "shape_name" &&
    type !== "perimeter" &&
    type !== "area" &&
    type !== "all_in_one"
  ) {
    return null;
  }

  const prompt = safeString(value.prompt).trim();
  const answer = safeString(value.answer).trim();

  if (!prompt) return null;

  return {
    id: safeString(value.id, String(index + 1)),
    type,
    prompt,
    figure: sanitizeFigureSpec(value.figure),
    answer,
    explanation: safeString(value.explanation).trim() || undefined,
    hint: safeString(value.hint).trim() || undefined,
    formula: safeString(value.formula).trim() || undefined,
  };
}

function sanitizeWorksheet(value: unknown): MathWorksheet | null {
  if (!isRecord(value)) return null;

  const title = safeString(value.title).trim();
  const instructions = safeString(value.instructions).trim();
  if (!title || !instructions) return null;
  if (!isWorksheetLanguage(value.language)) return null;
  if (!isGeometryLevel(value.level)) return null;
  if (!isGeometryTopic(value.topic)) return null;
  if (!isDifficulty(value.difficulty)) return null;
  if (!Array.isArray(value.tasks)) return null;

  const tasks = value.tasks
    .map((task, index) => sanitizeTask(task, index))
    .filter((task): task is MathWorksheetTask => task !== null);

  return {
    version: typeof value.version === "number" ? value.version : 1,
    title,
    language: value.language,
    level: value.level,
    topic: value.topic,
    difficulty: value.difficulty,
    instructions,
    showAnswerKey: value.showAnswerKey === true,
    showFormulas: value.showFormulas === true,
    selectedShapes: Array.isArray(value.selectedShapes)
      ? value.selectedShapes.filter(isFigureKind)
      : [],
    tasks,
  };
}

function answerSpaceClass(taskType: MathWorksheetTask["type"]): string {
  if (taskType === "shape_name") return "min-h-[44px]";
  if (taskType === "perimeter") return "min-h-[56px]";
  if (taskType === "area") return "min-h-[56px]";
  return "min-h-[72px]";
}

function writeLineCount(taskType: MathWorksheetTask["type"]): number {
  if (taskType === "shape_name") return 2;
  if (taskType === "all_in_one") return 4;
  return 3;
}

function getMeasurementLabel(
  lang: WorksheetLanguage,
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
): string {
  const labels: Record<
    WorksheetLanguage,
    Record<
      "length" | "width" | "side" | "base" | "height" | "topBase" | "leftSide" | "rightSide" | "radius",
      string
    >
  > = {
    no: {
      length: "lengde",
      width: "bredde",
      side: "side",
      base: "grunnlinje",
      height: "høyde",
      topBase: "øvre grunnlinje",
      leftSide: "venstre side",
      rightSide: "høyre side",
      radius: "radius",
    },
    en: {
      length: "length",
      width: "width",
      side: "side",
      base: "base",
      height: "height",
      topBase: "top base",
      leftSide: "left side",
      rightSide: "right side",
      radius: "radius",
    },
    pt: {
      length: "comprimento",
      width: "largura",
      side: "lado",
      base: "base",
      height: "altura",
      topBase: "base menor",
      leftSide: "lado esquerdo",
      rightSide: "lado direito",
      radius: "raio",
    },
  };
  return labels[lang][key];
}

function GeometryFigure({
  figure,
  language,
}: {
  figure?: FigureSpec;
  language: WorksheetLanguage;
}) {
  if (!figure) return null;

  const labelClass = "text-[10px] fill-slate-700";
  const dashedLineClass = "stroke-slate-400";
  const heightText =
    language === "no" ? "høyde" : language === "en" ? "height" : "altura";

  if (figure.kind === "rectangle") {
    const width = figure.widthCm ?? 8;
    const height = figure.heightCm ?? 5;

    return (
      <svg viewBox="0 0 240 150" className="h-24 w-full max-w-[180px]">
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
      <svg viewBox="0 0 180 160" className="h-24 w-full max-w-[170px]">
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
      <svg viewBox="0 0 240 160" className="h-24 w-full max-w-[180px]">
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
      <svg viewBox="0 0 240 180" className="h-24 w-full max-w-[180px]">
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
      <svg viewBox="0 0 250 170" className="h-24 w-full max-w-[190px]">
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
      <svg viewBox="0 0 240 170" className="h-24 w-full max-w-[180px]">
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
    <svg viewBox="0 0 220 170" className="h-24 w-full max-w-[170px]">
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
        className="stroke-slate-400"
      />
      <text x="135" y="76" textAnchor="middle" className={labelClass}>
        {radius} cm
      </text>
    </svg>
  );
}

function FigureMeta({
  figure,
  language,
}: {
  figure?: FigureSpec;
  language: WorksheetLanguage;
}) {
  if (!figure) return null;

  if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
    return (
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "length")}: {figure.widthCm} cm,{" "}
        {getMeasurementLabel(language, "width")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "square" && figure.sideCm) {
    return (
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "side")}: {figure.sideCm} cm
      </p>
    );
  }

  if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
    return (
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "base")}: {figure.baseCm} cm,{" "}
        {getMeasurementLabel(language, "side")}: {figure.sideCm} cm,{" "}
        {getMeasurementLabel(language, "height")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
    return (
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "side")}: {figure.sideCm} cm,{" "}
        {getMeasurementLabel(language, "height")}: {figure.heightCm} cm
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
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "base")}: {figure.baseCm} cm,{" "}
        {getMeasurementLabel(language, "topBase")}: {figure.topCm} cm,{" "}
        {getMeasurementLabel(language, "height")}: {figure.heightCm} cm,{" "}
        {getMeasurementLabel(language, "leftSide")}: {figure.sideLeftCm} cm,{" "}
        {getMeasurementLabel(language, "rightSide")}: {figure.sideRightCm} cm
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
      <p className="text-xs text-slate-600">
        {language === "no" ? "Sider" : language === "en" ? "Sides" : "Lados"}:{" "}
        {figure.sideAcm} cm, {figure.sideBcm} cm, {figure.sideCcm} cm,{" "}
        {getMeasurementLabel(language, "height")}: {figure.heightCm} cm
      </p>
    );
  }

  if (figure.kind === "circle" && figure.radiusCm) {
    return (
      <p className="text-xs text-slate-600">
        {getMeasurementLabel(language, "radius")}: {figure.radiusCm} cm
      </p>
    );
  }

  return null;
}

export default function MathWorksheetPrintPage() {
  const params = useParams<{ id: string }>();
  const locale = useLocale();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDoc | null>(null);
  const [worksheet, setWorksheet] = useState<MathWorksheet | null>(null);

  const strings = useMemo<UIStrings>(() => {
    const lang =
      locale === "en" || locale === "pt" || locale === "no"
        ? (locale as WorksheetLanguage)
        : "no";
    return STRINGS[lang];
  }, [locale]);

  const localizeError = useCallback(
    (message: string): string => {
      if (message === "No auth uid.") return strings.noAccess;
      if (message === "Fant ikke lesson.") return strings.notFound;
      if (message === "Du har ikke tilgang til denne lesson (ownerId mismatch).") return strings.noAccess;
      return message || strings.invalidWorksheet;
    },
    [strings]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid.");

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr(strings.notFound);
          setLesson(null);
          setWorksheet(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as LessonDoc;

        if (data.ownerId && data.ownerId !== u) {
          setErr(strings.noAccess);
          setLesson(null);
          setWorksheet(null);
          setLoading(false);
          return;
        }

        const mathWorksheet = sanitizeWorksheet(data.mathWorksheet);
        if (!mathWorksheet) {
          setErr(strings.invalidWorksheet);
          setLesson(null);
          setWorksheet(null);
          setLoading(false);
          return;
        }

        setLesson(data);
        setWorksheet(mathWorksheet);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        console.error("MATH PRINT LOAD FAILED:", e);
        setErr(localizeError(getErrorMessage(e)));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, strings, localizeError]);

  const lang = worksheet?.language ?? "no";
  const ui = STRINGS[lang];

  if (loading) {
    return <main style={{ padding: 20 }}>{strings.loading}</main>;
  }

  if (err || !lesson || !worksheet) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{strings.pageTitle}</h1>

        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Feil</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err ?? strings.invalidWorksheet}</pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href={`/${locale}/producer/${lessonId}`}>{strings.backToEditor}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pdf-print-root">
      <div className="pdf-shell">
        <div className="no-print topbar">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href={`/${locale}/producer/${lessonId}`} className="btn-lite">
              {ui.backToEditor}
            </Link>

            <button className="btn" onClick={() => window.print()}>
              {ui.print}
            </button>
          </div>

          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>{ui.saveAsPdf}</div>
        </div>

        <div className="pdf-page">
          <div className="pdf-topline" />

          <div className="pdf-header">
            <div className="pdf-headerMain">
              <div className="pdf-kicker">321school {ui.geometryWorksheet}</div>
              <div className="pdf-title">{worksheet.title}</div>

              <div className="pdf-metaRow">
                {lesson.producerName?.trim() ? (
                  <div className="pdf-producer">
                    {ui.producer}: {lesson.producerName.trim()}
                  </div>
                ) : null}

                {(worksheet.level || lesson.level)?.trim() ? (
                  <div className="pdf-meta">
                    {ui.level}: {(worksheet.level || lesson.level)?.trim()}
                  </div>
                ) : null}

                <div className="pdf-meta ok">{ui.readyForPrint}</div>
              </div>
            </div>

            <div className="pdf-brandBlock">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo321ny.png"
                alt="321school"
                className="pdf-logo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className="pdf-brandText">321school.com</div>
            </div>
          </div>

          <div className="pdf-identity">
            <div className="line">
              <span>{ui.name}:</span> <span className="blank" />
            </div>
            <div className="line">
              <span>{ui.date}:</span> <span className="blank" />
            </div>
            <div className="line">
              <span>{ui.classLabel}:</span> <span className="blank" />
            </div>
          </div>

          <section className="pdf-section">
            <h2 className="pdf-h2">{ui.worksheet}</h2>
            <div className="pdf-reading">
              <p>{worksheet.instructions}</p>
            </div>
          </section>

          <section className="pdf-section">
            <ol className="pdf-tasks">
              {worksheet.tasks.map((task, idx) => (
                <li key={task.id || String(idx)} className="pdf-task">
                  <div className="task-prompt">
                    {ui.task} {idx + 1}: {task.prompt}
                  </div>

                  <div className="math-task-card">
                    <div className="math-task-grid">
                      <div className="figure-panel">
                        <GeometryFigure figure={task.figure} language={worksheet.language} />
                        <FigureMeta figure={task.figure} language={worksheet.language} />
                      </div>

                      <div className="answer-panel">
                        <div className={`answer-box ${answerSpaceClass(task.type)}`}>
                          <span className="answer-label">{ui.answer}:</span>

                          <div className="write-lines">
                            {Array.from({ length: writeLineCount(task.type) }).map((_, i) => (
                              <div className="write-line" key={i} />
                            ))}
                          </div>
                        </div>

                        {worksheet.showFormulas && task.formula ? (
                          <div className="info-box formula-box">
                            <span className="info-label">{ui.formula}:</span>
                            <div className="whitespace-pre-line">{task.formula}</div>
                          </div>
                        ) : null}

                        {task.hint ? (
                          <div className="info-box hint-box">
                            <span className="info-label">{ui.hint}:</span> {task.hint}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {worksheet.showAnswerKey ? (
            <>
              <div className="page-break" />

              <section className="pdf-section">
                <h2 className="pdf-h2">{ui.answerKeyTitle}</h2>

                <div className="space-y-4">
                  {worksheet.tasks.map((task, idx) => (
                    <article key={`answer-key-${task.id || idx}`} className="answer-key-card">
                      <div className="task-prompt">
                        {ui.task} {idx + 1}: {task.prompt}
                      </div>

                      <div className="math-task-grid">
                        <div className="figure-panel">
                          <GeometryFigure figure={task.figure} language={worksheet.language} />
                          <FigureMeta figure={task.figure} language={worksheet.language} />
                        </div>

                        <div className="answer-panel">
                          <div className="info-box answer-key-box">
                            <span className="info-label">{ui.answer}:</span>
                            <div className="whitespace-pre-line">{task.answer}</div>
                          </div>

                          {task.formula ? (
                            <div className="info-box formula-box">
                              <span className="info-label">{ui.formula}:</span>
                              <div className="whitespace-pre-line">{task.formula}</div>
                            </div>
                          ) : null}

                          {task.explanation ? (
                            <div className="info-box explanation-box">
                              <span className="info-label">{ui.explanation}:</span> {task.explanation}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        .pdf-shell {
          padding: 16px;
        }

        .topbar {
          max-width: 980px;
          margin: 0 auto 12px auto;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
        }

        .btn {
          padding: 10px 14px;
          border: 1px solid #111;
          border-radius: 10px;
          background: #111;
          color: #fff;
          cursor: pointer;
        }

        .btn-lite {
          padding: 10px 14px;
          border: 1px solid #ddd;
          border-radius: 10px;
          background: #fff;
          text-decoration: none;
          color: inherit;
          display: inline-block;
        }

        .pdf-page {
          max-width: 980px;
          margin: 0 auto;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          color: #111;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 10mm 10mm;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }

        .pdf-topline {
          height: 4px;
          width: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #111827 0%, #374151 45%, #9ca3af 100%);
          margin: 0 0 4mm 0;
        }

        .pdf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .pdf-headerMain {
          flex: 1;
          min-width: 0;
        }

        .pdf-kicker {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 1.5mm;
        }

        .pdf-title {
          font-size: 20px;
          font-weight: 900;
          line-height: 1.08;
        }

        .pdf-metaRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 2mm;
        }

        .pdf-producer,
        .pdf-meta {
          display: inline-flex;
          align-items: center;
          padding: 3px 7px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 10px;
          color: #374151;
          background: #f9fafb;
        }

        .pdf-meta.ok {
          background: #ecfdf5;
          border-color: #bbf7d0;
          color: #166534;
        }

        .pdf-brandBlock {
          width: 100px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        .pdf-logo {
          width: 60px;
          height: auto;
          object-fit: contain;
        }

        .pdf-brandText {
          font-size: 8px;
          font-weight: 700;
          color: #6b7280;
        }

        .pdf-identity {
          margin-top: 5mm;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4mm;
          font-size: 11px;
        }

        .pdf-identity .line {
          display: flex;
          gap: 6px;
          align-items: baseline;
          padding: 5px 7px 3px 7px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #fcfcfc;
        }

        .pdf-identity .blank {
          flex: 1;
          border-bottom: 1px solid #111;
          transform: translateY(-1px);
        }

        .pdf-section {
          margin-top: 4mm;
        }

        .pdf-h2 {
          font-size: 13px;
          font-weight: 900;
          margin: 0 0 2.5mm 0;
          padding-bottom: 1.5mm;
          border-bottom: 2px solid #111827;
        }

        .pdf-reading {
          font-size: 12px;
          line-height: 1.45;
        }

        .pdf-reading p {
          margin: 0 0 2mm 0;
          white-space: pre-wrap;
        }

        .pdf-tasks {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4mm;
        }

        .pdf-task {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .task-prompt {
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 2mm;
          line-height: 1.35;
        }

        .math-task-card,
        .answer-key-card {
          border: 1px solid #dbe3ea;
          border-radius: 12px;
          padding: 10px;
          background: #ffffff;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .math-task-grid {
          display: grid;
          grid-template-columns: 170px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
        }

        .figure-panel {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #f8fafc;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          justify-content: center;
        }

        .answer-panel {
          display: grid;
          gap: 8px;
        }

        .answer-box {
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          background: #fff;
          padding: 8px 10px;
        }

        .answer-label,
        .info-label {
          font-weight: 800;
          color: #111827;
          font-size: 12px;
        }

        .write-lines {
          display: grid;
          gap: 5mm;
          padding: 2mm 0 0.5mm 0;
        }

        .write-line {
          height: 0;
          border-bottom: 1px solid #111;
          opacity: 0.6;
        }

        .info-box {
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          color: #334155;
          border: 1px solid #e5e7eb;
          background: #fff;
          line-height: 1.35;
        }

        .formula-box {
          background: #eff6ff;
          border-color: #bfdbfe;
        }

        .hint-box {
          background: #fffbeb;
          border-color: #fde68a;
        }

        .answer-key-box {
          background: #ecfdf5;
          border-color: #bbf7d0;
        }

        .explanation-box {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .page-break {
          break-before: page;
          page-break-before: always;
          height: 0;
        }

        @media (max-width: 768px) {
          .math-task-grid {
            grid-template-columns: 1fr;
          }

          .pdf-identity {
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .pdf-print-root,
          .pdf-print-root * {
            visibility: visible !important;
          }

          .pdf-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .pdf-shell {
            padding: 0 !important;
          }

          .pdf-page {
            max-width: unset !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>
    </main>
  );
}