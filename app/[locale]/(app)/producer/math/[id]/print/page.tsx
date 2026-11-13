// app/[locale]/(app)/producer/math/[id]/print/page.tsx
"use client";

import { mathEditorHref } from "@/lib/math/editor";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import ArithmeticWorksheetView from "@/components/generators/math/arithmetic/ArithmeticWorksheetView";
import LengthWorksheetView from "@/components/generators/math/length/LengthWorksheetView";
import PercentageWorksheetView from "@/components/generators/math/percentage/PercentageWorksheetView";
import EquationWorksheetView from "@/components/generators/math/equations/EquationWorksheetView";
import { sanitizePercentageWorksheet, type PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import { sanitizeEquationWorksheet, type EquationWorksheet } from "@/lib/math/equations/worksheet";
import NumberLineWorksheetView from "@/components/generators/math/number-line/NumberLineWorksheetView";
import { sanitizeNumberLineWorksheet, type NumberLineWorksheet } from "@/lib/math/number-line/worksheet";
import ComparisonWorksheetView from "@/components/generators/math/comparison/ComparisonWorksheetView";
import { sanitizeComparisonWorksheet, type ComparisonWorksheet } from "@/lib/math/comparison/worksheet";
import { sanitizeLengthWorksheet, type LengthWorksheet } from "@/lib/math/length/worksheet";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";
import { sanitizeArithmeticWorksheet } from "@/lib/math/arithmetic/sanitize";
import type {
  LessonDocWithMathWorksheet as LessonDoc,
  MathWorksheet,
} from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";
import { printMathWorksheet } from "@/lib/math/printWorksheet";
import { logUsageEvent } from "@/lib/usageClient";

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

export default function MathWorksheetPrintPage() {
  const params = useParams<{ id: string }>();
  const locale = useLocale();
  const t = useTranslations("mathGeometryPrint");
  const tBrand = useTranslations("brandLogo");
  const lessonId = params.id;
  const printRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDoc | null>(null);
  const [worksheet, setWorksheet] = useState<MathWorksheet | null>(null);
  const [lengthWorksheet, setLengthWorksheet] = useState<LengthWorksheet | null>(null);
  const [equationWorksheet, setEquationWorksheet] = useState<EquationWorksheet | null>(null);
  const [percentageWorksheet, setPercentageWorksheet] = useState<PercentageWorksheet | null>(null);
  const [numberLineWorksheet, setNumberLineWorksheet] = useState<NumberLineWorksheet | null>(null);
  const [comparisonWorksheet, setComparisonWorksheet] = useState<ComparisonWorksheet | null>(null);
  const [fractionWorksheet, setFractionWorksheet] = useState<FractionWorksheet | null>(null);
  const [arithmeticWorksheet, setArithmeticWorksheet] =
    useState<ArithmeticWorksheet | null>(null);

  const localizeError = useCallback(
    (message: string): string => {
      if (message === "No auth uid.") return t("errors.noAccess");
      return message || t("errors.invalidWorksheet");
    },
    [t]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);
      setLengthWorksheet(null);
      setNumberLineWorksheet(null);
      setComparisonWorksheet(null);
      setEquationWorksheet(null);
      setPercentageWorksheet(null);

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid.");

        let loadedLesson: LessonDoc | null = null;

        // 1. Prøv original lesson først
        try {
          const ownSnap = await getDoc(doc(db, "lessons", lessonId));

          if (ownSnap.exists()) {
            const data = ownSnap.data() as LessonDoc;

            const isOwner = !data.ownerId || data.ownerId === u;
            const isPublished =
              (data as { status?: unknown }).status === "published";

            if (isOwner || isPublished) {
              loadedLesson = data;
            }
          }
        } catch {
          // prøver published_lessons under
        }

        // 2. Prøv publisert library-versjon
        if (!loadedLesson) {
          const publishedSnap = await getDoc(
            doc(db, "published_lessons", lessonId)
          );

          if (publishedSnap.exists()) {
            loadedLesson = publishedSnap.data() as LessonDoc;
          }
        }

        if (!alive) return;

        if (!loadedLesson) {
          setErr(t("errors.notFound"));
          setLesson(null);
          setWorksheet(null);
          setFractionWorksheet(null);
          setArithmeticWorksheet(null);
          setLoading(false);
          return;
        }

        const loadedRecord = loadedLesson as LessonDoc & {
          contentType?: unknown;
          mathType?: unknown;
          fractionWorksheet?: unknown;
          arithmeticWorksheet?: unknown;
          lengthWorksheet?: unknown;
          measurementWorksheet?: unknown;
        };
        const equations = sanitizeEquationWorksheet(loadedRecord.mathWorksheet);
        if (equations) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setEquationWorksheet(equations); setLoading(false); return;
        }
        const percentage = sanitizePercentageWorksheet(loadedRecord.mathWorksheet);
        if (percentage) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setPercentageWorksheet(percentage); setLoading(false); return;
        }
        const numberLine = sanitizeNumberLineWorksheet(loadedRecord.mathWorksheet);
        if (numberLine) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setNumberLineWorksheet(numberLine); setLoading(false); return;
        }
        const comparison = sanitizeComparisonWorksheet(loadedRecord.mathWorksheet);
        if (comparison) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setComparisonWorksheet(comparison); setLoading(false); return;
        }
        const length = sanitizeLengthWorksheet(loadedRecord.measurementWorksheet ?? loadedRecord.lengthWorksheet ?? loadedRecord.mathWorksheet);
        if (length) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setLengthWorksheet(length); setLoading(false); return;
        }
        const contentType = typeof loadedRecord.contentType === "string" ? loadedRecord.contentType : "";
        const mathType = typeof loadedRecord.mathType === "string" ? loadedRecord.mathType : "";
        const fractionCandidate =
          loadedRecord.fractionWorksheet ??
          (mathType === "fractions" || contentType === "fraction_worksheet"
            ? loadedRecord.mathWorksheet
            : null);
        const arithmeticCandidate =
          loadedRecord.arithmeticWorksheet ??
          (mathType === "arithmetic" || contentType === "arithmetic_worksheet"
            ? loadedRecord.mathWorksheet
            : null);

        const sanitizedArithmetic =
          sanitizeArithmeticWorksheet(arithmeticCandidate);

        if (sanitizedArithmetic) {
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(null);
          setArithmeticWorksheet(sanitizedArithmetic);
          setLoading(false);
          return;
        }

        if (fractionCandidate && typeof fractionCandidate === "object") {
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(fractionCandidate as FractionWorksheet);
          setArithmeticWorksheet(null);
          setLoading(false);
          return;
        }

        const mathWorksheet = sanitizeWorksheet(loadedLesson.mathWorksheet);

        if (!mathWorksheet) {
          setErr(t("errors.invalidWorksheet"));
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(null);
          setArithmeticWorksheet(null);
          setLoading(false);
          return;
        }

        setLesson(loadedLesson);
        setWorksheet(mathWorksheet);
        setFractionWorksheet(null);
        setArithmeticWorksheet(null);
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
  }, [lessonId, t, localizeError]);

  useEffect(() => {
    if (!worksheet && !fractionWorksheet && !arithmeticWorksheet && !lengthWorksheet && !numberLineWorksheet && !comparisonWorksheet && !equationWorksheet && !percentageWorksheet) return;

    let alive = true;
    const status =
      typeof (lesson as { status?: unknown } | null)?.status === "string"
        ? (lesson as { status?: string }).status
        : "";

    (async () => {
      try {
        await logUsageEvent({
          feature: "pdf_download",
          contentId: lessonId,
          contentType: "math",
          source: status === "published" ? "library" : "own",
          path: window.location.pathname,
        });
      } catch (error) {
        if (!alive) return;
        console.error("PDF quota check failed:", error);
        setErr(error instanceof Error ? error.message : t("errors.invalidWorksheet"));
        setLengthWorksheet(null);
      setNumberLineWorksheet(null);
      setComparisonWorksheet(null);
      setEquationWorksheet(null);
      setPercentageWorksheet(null);
        setLesson(null);
        setWorksheet(null);
        setFractionWorksheet(null);
        setArithmeticWorksheet(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [worksheet, fractionWorksheet, arithmeticWorksheet, lengthWorksheet, numberLineWorksheet, comparisonWorksheet, equationWorksheet, percentageWorksheet, lesson, lessonId, t]);

  const handlePrint = () => { void printMathWorksheet(); };

  const tView = useCallback(
    (key: string) => {
      const map: Record<string, string> = {
        pageTitle: t("pageTitle"),
        worksheet: t("worksheet"),
        answerKeyTitle: t("answerKeyTitle"),
        name: t("name"),
        date: t("date"),
        classLabel: t("classLabel"),
        answer: t("answer"),
        explanation: t("explanation"),
        hint: t("hint"),
        formula: t("formula"),
        print: t("print"),
        backToEditor: t("backToEditor"),
        saveAsPdf: t("saveAsPdf"),
        loading: t("loading"),
        producer: t("producer"),
        level: t("level"),
        geometryWorksheet: t("geometryWorksheet"),
        task: t("task"),
        taskLabel: t("taskLabel"),
        errorTitle: t("errorTitle"),
        instructionsTitle: t("instructionsTitle"),
        shapeNameLabel: t("shapeNameLabel"),

        // hvis key kommer som "width"
        width: t("measurements.width"),
        height: t("measurements.height"),
        length: t("measurements.length"),
        side: t("measurements.side"),
        sides: t("measurements.sides"),
        sideA: t("measurements.sideA"),
        sideB: t("measurements.sideB"),
        sideC: t("measurements.sideC"),
        base: t("measurements.base"),
        topBase: t("measurements.topBase"),
        bottomBase: t("measurements.bottomBase"),
        leftSide: t("measurements.leftSide"),
        rightSide: t("measurements.rightSide"),
        radius: t("measurements.radius"),
        diameter: t("measurements.diameter"),
        leg: t("measurements.leg"),
        hypotenuse: t("measurements.hypotenuse"),
      };

      // 🔥 dette er nøkkelen
      return map[key] ?? t(key) ?? key;
    },
    [t]
  );

  if (loading) {
    return <main style={{ padding: 20 }}>{t("loading")}</main>;
  }

  if (err || !lesson || (!worksheet && !fractionWorksheet && !arithmeticWorksheet && !lengthWorksheet && !numberLineWorksheet && !comparisonWorksheet && !equationWorksheet && !percentageWorksheet)) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{t("pageTitle")}</h1>

        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>{t("errorTitle")}</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {err ?? t("errors.invalidWorksheet")}
          </pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href={`/${locale}/producer/${lessonId}`}>{t("backToEditor")}</Link>
        </div>
      </main>
    );
  }

  const editorHref = mathEditorHref(locale, lessonId, numberLineWorksheet ? "number_line" : equationWorksheet ? "equations" : percentageWorksheet ? "percentage" : comparisonWorksheet ? "comparison" : lengthWorksheet ? "measurement" : arithmeticWorksheet ? "arithmetic" : fractionWorksheet ? "fractions" : "geometry", "", fractionWorksheet ?? undefined);

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <Link
            href={editorHref}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            {t("backToEditor")}
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="px-6 py-6 print:px-0 print:py-0">
            {equationWorksheet ? (
              <EquationWorksheetView worksheet={equationWorksheet} printMode printRef={printRef} />
            ) : percentageWorksheet ? (
              <PercentageWorksheetView worksheet={percentageWorksheet} printMode printRef={printRef} />
            ) : numberLineWorksheet ? (
              <NumberLineWorksheetView worksheet={numberLineWorksheet} printMode printRef={printRef} />
            ) : comparisonWorksheet ? (
              <ComparisonWorksheetView worksheet={comparisonWorksheet} printMode printRef={printRef} />
            ) : lengthWorksheet ? (
              <LengthWorksheetView worksheet={lengthWorksheet} printMode printRef={printRef} />
            ) : fractionWorksheet ? (
              <FractionWorksheetView
                worksheet={fractionWorksheet}
                tBrand={tBrand}
                printRef={printRef}
                showAutoCheck={false}
                showIdentityFields={true}
                printMode
              />
            ) : arithmeticWorksheet ? (
              <ArithmeticWorksheetView
                worksheet={arithmeticWorksheet}
                t={tView}
                tBrand={tBrand}
                printRef={printRef}
                showIdentityFields={true}
              />
            ) : worksheet ? (
              <GeometryWorksheetView
                worksheet={worksheet}
                answerSpace={worksheet.answerSpace ?? "medium"}
                includeHints={true}
                t={tView}
                tBrand={tBrand}
                printRef={printRef}
                producerName={lesson.producerName?.trim() || undefined}
                showIdentityFields={true}
                showFigureMeta={false}
                emptyStateKey="worksheet"
              />
            ) : null}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.10)] backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-sm text-slate-600">{t("saveAsPdf")}</p>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            {t("print")}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        .print-root,
        .print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          header,
          nav,
          .sectionHeader,
          .libraryWrap,
          .print\\:hidden {
            display: none !important;
          }

          body {
            background: #fff !important;
          }

          main.min-h-screen {
            min-height: 0 !important;
          }

          .sectionContent,
          .sectionContent.full {
            padding: 0 !important;
          }

          .shellRoot,
          .appShellRoot {
            overflow: visible !important;
          }

          .print-root {
            max-width: none !important;
          }

        }

      `}</style>
    </main>
  );
}
