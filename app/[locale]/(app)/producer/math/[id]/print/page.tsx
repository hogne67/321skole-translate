// app/[locale]/(app)/producer/math/[id]/print/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";
import type {
  LessonDocWithMathWorksheet as LessonDoc,
  MathWorksheet,
} from "@/lib/math/geometry/types";

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

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid.");

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr(t("errors.notFound"));
          setLesson(null);
          setWorksheet(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as LessonDoc;

        if (data.ownerId && data.ownerId !== u) {
          setErr(t("errors.noAccess"));
          setLesson(null);
          setWorksheet(null);
          setLoading(false);
          return;
        }

        const mathWorksheet = sanitizeWorksheet(data.mathWorksheet);

        if (!mathWorksheet) {
          setErr(t("errors.invalidWorksheet"));
          setLesson(data);
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
  }, [lessonId, t, localizeError]);

  const handlePrint = useCallback(() => {
    const content = printRef.current;
    if (!content || !worksheet) return;

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
          border: 1.5px dashed #94a3b8;
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
          border: 1px solid #bfdbfe;
        }

        .print-hint {
          background: #f5edcc;
          border: 1px solid #e2d9b9;
        }

        .print-answer-key {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .print-explanation {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
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
  }, [worksheet]);

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

        // figure meta / mål
        width: t("width"),
        height: t("height"),
        length: t("length"),
        base: t("base"),
        side: t("side"),
        sideA: t("sideA"),
        sideB: t("sideB"),
        sideC: t("sideC"),
        radius: t("radius"),
        diameter: t("diameter"),
        topBase: t("topBase"),
        bottomBase: t("bottomBase"),
        leftSide: t("leftSide"),
        rightSide: t("rightSide"),
        leg: t("leg"),
        hypotenuse: t("hypotenuse"),
      };

      return map[key] ?? key;
    },
    [t]
  );

  if (loading) {
    return <main style={{ padding: 20 }}>{t("loading")}</main>;
  }

  if (err || !lesson || !worksheet) {
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

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/producer/${lessonId}`}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              {t("backToEditor")}
            </Link>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              {t("print")}
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-600">{t("saveAsPdf")}</p>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="px-6 py-6 print:px-0 print:py-0">
            <GeometryWorksheetView
              worksheet={worksheet}
              answerSpace="medium"
              includeHints={true}
              t={tView}
              tBrand={tBrand}
              printRef={printRef}
              producerName={lesson.producerName?.trim() || undefined}
              levelLabel={(worksheet.level || lesson.level)?.trim() || undefined}
              showIdentityFields={true}
              showFigureMeta={true}
              emptyStateKey="worksheet"
            />
          </div>
        </section>
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
          border: 1.5px dashed #94a3b8;
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
          border: 1px solid #bfdbfe;
        }

        .print-hint {
          background: #fffbeb;
          border: 1px solid #eddb9f;
        }

        .print-answer-key {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .print-explanation {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
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