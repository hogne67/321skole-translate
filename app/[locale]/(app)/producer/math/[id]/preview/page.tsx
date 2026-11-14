// app/[locale]/(app)/producer/math/[id]/preview/page.tsx
"use client";

import { mathEditorHref } from "@/lib/math/editor";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import GeometryWorksheetView from "@/components/generators/math/geometry/GeometryWorksheetView";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import ArithmeticWorksheetView from "@/components/generators/math/arithmetic/ArithmeticWorksheetView";
import LengthWorksheetView from "@/components/generators/math/length/LengthWorksheetView";
import PercentageWorksheetView from "@/components/generators/math/percentage/PercentageWorksheetView";
import EquationWorksheetView from "@/components/generators/math/equations/EquationWorksheetView";
import { sanitizePercentageWorksheet, type PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import { sanitizeEquationWorksheet, type EquationWorksheet } from "@/lib/math/equations/worksheet";
import CoordinatesWorksheetView from "@/components/generators/math/coordinates/CoordinatesWorksheetView";
import { sanitizeCoordinatesWorksheet, type CoordinatesWorksheet } from "@/lib/math/coordinates/worksheet";
import StatisticsWorksheetView from "@/components/generators/math/statistics/StatisticsWorksheetView";
import { sanitizeStatisticsWorksheet, type StatisticsWorksheet } from "@/lib/math/statistics/worksheet";
import ClockWorksheetView from "@/components/generators/math/clock/ClockWorksheetView";
import { sanitizeClockWorksheet, type ClockWorksheet } from "@/lib/math/clock/worksheet";
import NumberLineWorksheetView from "@/components/generators/math/number-line/NumberLineWorksheetView";
import { sanitizeNumberLineWorksheet, type NumberLineWorksheet } from "@/lib/math/number-line/worksheet";
import ComparisonWorksheetView from "@/components/generators/math/comparison/ComparisonWorksheetView";
import { sanitizeComparisonWorksheet, type ComparisonWorksheet } from "@/lib/math/comparison/worksheet";
import { sanitizeLengthWorksheet, type LengthWorksheet } from "@/lib/math/length/worksheet";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import { sanitizeWorksheet } from "@/lib/math/geometry/sanitize";
import { sanitizeArithmeticWorksheet } from "@/lib/math/arithmetic/sanitize";
import type {
  LessonDocWithMathWorksheet as LessonDoc,
  GeometryAnswerSpace,
  MathWorksheet,
} from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";

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
  const [lengthWorksheet, setLengthWorksheet] = useState<LengthWorksheet | null>(null);
  const [equationWorksheet, setEquationWorksheet] = useState<EquationWorksheet | null>(null);
  const [percentageWorksheet, setPercentageWorksheet] = useState<PercentageWorksheet | null>(null);
  const [coordinatesWorksheet, setCoordinatesWorksheet] = useState<CoordinatesWorksheet | null>(null);
  const [statisticsWorksheet, setStatisticsWorksheet] = useState<StatisticsWorksheet | null>(null);
  const [clockWorksheet, setClockWorksheet] = useState<ClockWorksheet | null>(null);
  const [numberLineWorksheet, setNumberLineWorksheet] = useState<NumberLineWorksheet | null>(null);
  const [comparisonWorksheet, setComparisonWorksheet] = useState<ComparisonWorksheet | null>(null);
  const [answerSpace, setAnswerSpace] =
    useState<GeometryAnswerSpace>("medium");
  const [fractionWorksheet, setFractionWorksheet] =
    useState<FractionWorksheet | null>(null);
  const [arithmeticWorksheet, setArithmeticWorksheet] =
    useState<ArithmeticWorksheet | null>(null);

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
      setLengthWorksheet(null);
      setCoordinatesWorksheet(null);
      setStatisticsWorksheet(null);
      setClockWorksheet(null);
      setNumberLineWorksheet(null);
      setComparisonWorksheet(null);
      setEquationWorksheet(null);
      setPercentageWorksheet(null);

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
            setArithmeticWorksheet(null);
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
            setArithmeticWorksheet(null);
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
          setArithmeticWorksheet(null);
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
        const coordinates = sanitizeCoordinatesWorksheet(loadedRecord.mathWorksheet);
        if (coordinates) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setCoordinatesWorksheet(coordinates); setLoading(false); return;
        }
        const statistics = sanitizeStatisticsWorksheet(loadedRecord.mathWorksheet);
        if (statistics) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setStatisticsWorksheet(statistics); setLoading(false); return;
        }
        const clock = sanitizeClockWorksheet(loadedRecord.mathWorksheet);
        if (clock) {
          setLesson(loadedLesson);
          setWorksheet(null); setFractionWorksheet(null); setArithmeticWorksheet(null);
          setClockWorksheet(clock); setLoading(false); return;
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
          setErr(tPrint("errors.invalidWorksheet"));
          setLesson(loadedLesson);
          setWorksheet(null);
          setFractionWorksheet(null);
          setArithmeticWorksheet(null);
          setLoading(false);
          return;
        }

        setLesson(loadedLesson);
        setWorksheet(mathWorksheet);
        setAnswerSpace(mathWorksheet.answerSpace ?? "medium");
        setFractionWorksheet(null);
        setArithmeticWorksheet(null);
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
          worksheet,
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

  const editorHref = mathEditorHref(locale, lessonId, coordinatesWorksheet ? "coordinates" : statisticsWorksheet ? "statistics" : clockWorksheet ? "clock" : numberLineWorksheet ? "number_line" : equationWorksheet ? "equations" : percentageWorksheet ? "percentage" : comparisonWorksheet ? "comparison" : lengthWorksheet ? "measurement" : arithmeticWorksheet ? "arithmetic" : fractionWorksheet ? "fractions" : "geometry", "", fractionWorksheet ?? undefined);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-700">
        {tPrint("loading")}
      </main>
    );
  }

  if (err || !lesson || (!worksheet && !fractionWorksheet && !arithmeticWorksheet && !lengthWorksheet && !coordinatesWorksheet && !statisticsWorksheet && !clockWorksheet && !numberLineWorksheet && !comparisonWorksheet && !equationWorksheet && !percentageWorksheet)) {
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
          href={isDraftPreview ? `/${locale}/producer/math/geometry` : editorHref}
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
                {worksheet?.title ||
                  fractionWorksheet?.title ||
                  arithmeticWorksheet?.title ||
                  lengthWorksheet?.title ||
                  equationWorksheet?.title || percentageWorksheet?.title ||
                  coordinatesWorksheet?.title ||
                  statisticsWorksheet?.title ||
                  clockWorksheet?.title ||
                  numberLineWorksheet?.title ||
                  comparisonWorksheet?.title ||
                  tPrint("worksheet")}
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
          {equationWorksheet ? (
              <EquationWorksheetView worksheet={equationWorksheet} printMode printRef={previewRef} />
            ) : percentageWorksheet ? (
              <PercentageWorksheetView worksheet={percentageWorksheet} printMode printRef={previewRef} />
            ) : coordinatesWorksheet ? (
              <CoordinatesWorksheetView worksheet={coordinatesWorksheet} printMode printRef={previewRef} />
            ) : statisticsWorksheet ? (
              <StatisticsWorksheetView worksheet={statisticsWorksheet} printMode printRef={previewRef} />
            ) : clockWorksheet ? (
              <ClockWorksheetView worksheet={clockWorksheet} printMode printRef={previewRef} />
            ) : numberLineWorksheet ? (
              <NumberLineWorksheetView worksheet={numberLineWorksheet} printMode printRef={previewRef} />
            ) : comparisonWorksheet ? (
            <ComparisonWorksheetView worksheet={comparisonWorksheet} printMode printRef={previewRef} />
          ) : lengthWorksheet ? (
            <LengthWorksheetView worksheet={lengthWorksheet} printMode printRef={previewRef} />
          ) : fractionWorksheet ? (
            <FractionWorksheetView
              worksheet={fractionWorksheet}
              tBrand={tBrand}
              printRef={previewRef}
              showAutoCheck={false}
              showIdentityFields={true}
              readOnly
              printMode
            />
          ) : arithmeticWorksheet ? (
            <ArithmeticWorksheetView
              worksheet={arithmeticWorksheet}
              t={tView}
              tBrand={tBrand}
              printRef={previewRef}
              showIdentityFields={true}
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
              showIdentityFields={true}
              showFigureMeta={false}
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
                href={editorHref}
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


    </main>
  );
}
