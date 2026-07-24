// app/[locale]/(app)/producer/math/[id]/preview/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";
import type {
  LessonDocWithMathWorksheet as LessonDoc,
  GeometryAnswerSpace,
  MathWorksheet,
  WorksheetLanguage,
} from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

const GEOMETRY_DRAFT_STORAGE_KEY = "321school.math.geometry.previewDraft";

type SaveWorksheetResponse = {
  ok?: boolean;
  error?: string;
  id?: string;
  worksheetId?: string;
  lessonId?: string;
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(err);
}

function normalizeLanguageForSave(language: WorksheetLanguage): "no" | "en" | "pt" {
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
      if (typeof json.message === "string" && json.message.trim()) return json.message;
      return fallback;
    } catch {
      return text.trim() || fallback;
    }
  } catch {
    return fallback;
  }
}

export default function MathWorksheetPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("mathGeometry");
  const tPrint = useTranslations("mathGeometryPrint");
  const tBrand = useTranslations("brandLogo");
  const lessonId = params.id;
  const isDraftPreview = lessonId === "draft";
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDoc | null>(null);
  const [worksheet, setWorksheet] = useState<MathWorksheet | null>(null);
  const [answerSpace, setAnswerSpace] =
    useState<GeometryAnswerSpace>("medium");
  const [fractionWorksheet, setFractionWorksheet] =
    useState<FractionWorksheet | null>(null);

  const localizeError = useCallback(
    (message: string): string => {
      if (message === "No auth uid.") return tPrint("errors.noAccess");
      return message || tPrint("errors.invalidWorksheet");
    },
    [tPrint]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const uid = uidNow();
        if (!uid) throw new Error("No auth uid.");

        if (isDraftPreview) {
          const rawDraft = window.sessionStorage.getItem(
            GEOMETRY_DRAFT_STORAGE_KEY
          );

          if (!rawDraft) {
            setErr(tPrint("errors.notFound"));
            setLesson(null);
            setWorksheet(null);
            setFractionWorksheet(null);
            setLoading(false);
            return;
          }

          const draft = JSON.parse(rawDraft) as { worksheet?: unknown };
          const draftWorksheet = sanitizeWorksheet(draft.worksheet);

          if (!draftWorksheet) {
            setErr(tPrint("errors.invalidWorksheet"));
            setLesson(null);
            setWorksheet(null);
            setFractionWorksheet(null);
            setLoading(false);
            return;
          }

          if (!alive) return;

          setLesson({
            ownerId: uid,
            title: draftWorksheet.title,
            level: draftWorksheet.level,
            mathWorksheet: draftWorksheet,
          });
          setWorksheet(draftWorksheet);
          setAnswerSpace(draftWorksheet.answerSpace ?? "medium");
          setFractionWorksheet(null);
          setLoading(false);
          return;
        }

        let loadedLesson: LessonDoc | null = null;

        const ownSnap = await getDoc(doc(db, "lessons", lessonId));
        if (ownSnap.exists()) {
          const data = ownSnap.data() as LessonDoc;
          const isOwner = !data.ownerId || data.ownerId === uid;
          const isPublished =
            (data as { status?: unknown }).status === "published";

          if (isOwner || isPublished) {
            loadedLesson = data;
          }
        }

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
          setErr(tPrint("errors.notFound"));
          setLesson(null);
          setWorksheet(null);
          setFractionWorksheet(null);
          setLoading(false);
          return;
        }

        const loadedRecord = loadedLesson as LessonDoc & {
          contentType?: unknown;
          mathType?: unknown;
          fractionWorksheet?: unknown;
        };
        const contentType =
          typeof loadedRecord.contentType === "string"
            ? loadedRecord.contentType
            : "";
        const mathType =
          typeof loadedRecord.mathType === "string" ? loadedRecord.mathType : "";
        const fractionCandidate =
          loadedRecord.fractionWorksheet ??
          (mathType === "fractions" || contentType === "fraction_worksheet"
            ? loadedRecord.mathWorksheet
            : null);

        if (fractionCandidate && typeof fractionCandidate === "object") {
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(fractionCandidate as FractionWorksheet);
          setLoading(false);
          return;
        }

        const mathWorksheet = sanitizeWorksheet(loadedLesson.mathWorksheet);
        if (!mathWorksheet) {
          setErr(tPrint("errors.invalidWorksheet"));
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(null);
          setLoading(false);
          return;
        }

        setLesson(loadedLesson);
        setWorksheet(mathWorksheet);
        setAnswerSpace(mathWorksheet.answerSpace ?? "medium");
        setFractionWorksheet(null);
        setLoading(false);
      } catch (error) {
        if (!alive) return;
        console.error("MATH PREVIEW LOAD FAILED:", error);
        setErr(localizeError(getErrorMessage(error)));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isDraftPreview, lessonId, localizeError, tPrint]);

  async function saveDraftToMyContent() {
    if (!worksheet) return;

    setSaving(true);
    setErr(null);

    try {
      const currentUser = getAuth().currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      const response = await fetch("/api/producer/save-math-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          worksheet: normalizeWorksheetForSave(worksheet),
          source: "math-geometry-generator",
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, t("saveFailed")));
      }

      const data = (await response.json()) as SaveWorksheetResponse;
      const savedId = data.id || data.worksheetId || data.lessonId || null;

      if (!data.ok || !savedId) {
        throw new Error(data.error || t("saveFailed"));
      }

      window.sessionStorage.removeItem(GEOMETRY_DRAFT_STORAGE_KEY);
      router.push(`/${locale}/content`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const tView = useCallback(
    (key: string) => {
      const map: Record<string, string> = {
        pageTitle: tPrint("pageTitle"),
        worksheet: tPrint("worksheet"),
        answerKeyTitle: tPrint("answerKeyTitle"),
        name: tPrint("name"),
        date: tPrint("date"),
        classLabel: tPrint("classLabel"),
        answer: tPrint("answer"),
        explanation: tPrint("explanation"),
        hint: tPrint("hint"),
        formula: tPrint("formula"),
        producer: tPrint("producer"),
        level: tPrint("level"),
        geometryWorksheet: tPrint("geometryWorksheet"),
        task: tPrint("task"),
        taskLabel: tPrint("taskLabel"),
        instructionsTitle: tPrint("instructionsTitle"),
        shapeNameLabel: tPrint("shapeNameLabel"),
        length: tPrint("measurements.length"),
        width: tPrint("measurements.width"),
        height: tPrint("measurements.height"),
        side: tPrint("measurements.side"),
        sides: tPrint("measurements.sides"),
        sideA: tPrint("measurements.sideA"),
        sideB: tPrint("measurements.sideB"),
        sideC: tPrint("measurements.sideC"),
        base: tPrint("measurements.base"),
        topBase: tPrint("measurements.topBase"),
        bottomBase: tPrint("measurements.bottomBase"),
        leftSide: tPrint("measurements.leftSide"),
        rightSide: tPrint("measurements.rightSide"),
        radius: tPrint("measurements.radius"),
        diameter: tPrint("measurements.diameter"),
        leg: tPrint("measurements.leg"),
        hypotenuse: tPrint("measurements.hypotenuse"),
      };

      return map[key] ?? tPrint(key) ?? key;
    },
    [tPrint]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-700">
        {tPrint("loading")}
      </main>
    );
  }

  if (err || !lesson || (!worksheet && !fractionWorksheet)) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 px-4 py-8">
        <h1 className="text-2xl font-black text-slate-950">
          {t("controlPreview.title")}
        </h1>
        <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="font-black">{tPrint("errorTitle")}</div>
          <p className="mt-2 whitespace-pre-wrap">
            {err ?? tPrint("errors.invalidWorksheet")}
          </p>
        </div>
        <Link
          href={`/${locale}/producer/math/geometry`}
          className="mt-5 inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
        >
          {t("controlPreview.backToGenerator")}
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-[28px] border border-blue-200 bg-blue-50/70 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
                {t("controlPreview.eyebrow")}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {worksheet?.title || fractionWorksheet?.title || tPrint("worksheet")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                {t("controlPreview.description")}
              </p>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-white px-5 py-4 text-sm font-semibold leading-6 text-slate-700 shadow-sm">
              <p className="font-black text-slate-950">
                {t("controlPreview.cardTitle")}
              </p>
              <p className="mt-1">{t("controlPreview.cardBody")}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {fractionWorksheet ? (
            <FractionWorksheetView
              worksheet={fractionWorksheet}
              tBrand={tBrand}
              printRef={previewRef}
              showAutoCheck={false}
              showIdentityFields={true}
              readOnly
            />
          ) : worksheet ? (
            <GeometryWorksheetView
              worksheet={worksheet}
              answerSpace={answerSpace}
              includeHints={true}
              t={tView}
              tBrand={tBrand}
              printRef={previewRef}
              producerName={lesson.producerName?.trim() || undefined}
              levelLabel={(worksheet.level || lesson.level)?.trim() || undefined}
              showIdentityFields={true}
              showFigureMeta={true}
              emptyStateKey="worksheet"
            />
          ) : null}
        </section>
      </div>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-14px_40px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">
              {t("controlPreview.bottomTitle")}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 sm:text-sm">
              {isDraftPreview
                ? t("controlPreview.draftBottomBody")
                : t("controlPreview.bottomBody")}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {isDraftPreview ? (
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                {t("controlPreview.backAndEdit")}
              </button>
            ) : (
              <Link
                href={`/${locale}/producer/math/geometry`}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                {t("controlPreview.backToGenerator")}
              </Link>
            )}
            {isDraftPreview ? (
              <button
                type="button"
                onClick={saveDraftToMyContent}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? t("saving") : t("saveToMyContent")}
              </button>
            ) : (
              <Link
                href={`/${locale}/content`}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
              >
                {t("controlPreview.openMyContent")}
              </Link>
            )}
          </div>
        </div>
      </section>

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

        .print-root svg {
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
