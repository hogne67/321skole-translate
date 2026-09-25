"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import ArithmeticWorksheetView from "@/components/generators/math/arithmetic/ArithmeticWorksheetView";
import type {
  ArithmeticDifficulty,
  ArithmeticLanguage,
  ArithmeticLayout,
  ArithmeticLevel,
  ArithmeticOperation,
  ArithmeticWorksheet,
} from "@/lib/math/arithmetic/types";

type GenerateResponse =
  | { ok: true; worksheet: ArithmeticWorksheet }
  | { ok: false; error: string };

type SaveResponse = {
  ok?: boolean;
  error?: string;
  id?: string;
  worksheetId?: string;
  lessonId?: string;
};

function normalizeLocale(locale: string): ArithmeticLanguage {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

function defaultRange(
  level: ArithmeticLevel,
  difficulty: ArithmeticDifficulty,
  operation: ArithmeticOperation,
  layout: ArithmeticLayout
) {
  if (layout === "visual") {
    if (difficulty === "easy") return { min: 0, max: 10 };
    if (difficulty === "medium") return { min: 0, max: 15 };
    return { min: 0, max: 20 };
  }

  if (operation === "multiplication" || operation === "division") {
    if (difficulty === "easy") return { min: 0, max: 5 };
    if (difficulty === "medium") return { min: 0, max: 10 };
    return { min: 0, max: level === "grade_8_10" ? 15 : 12 };
  }

  if (level === "grade_1_2") {
    if (difficulty === "easy") return { min: 0, max: 10 };
    if (difficulty === "medium") return { min: 0, max: 20 };
    return { min: 0, max: 50 };
  }

  if (level === "grade_3_4") {
    if (difficulty === "easy") return { min: 0, max: 50 };
    if (difficulty === "medium") return { min: 0, max: 100 };
    return { min: 0, max: 500 };
  }

  if (level === "grade_5_7") {
    if (difficulty === "easy") return { min: 0, max: 100 };
    if (difficulty === "medium") return { min: 0, max: 1000 };
    return { min: 0, max: 5000 };
  }

  if (difficulty === "easy") return { min: -20, max: 100 };
  if (difficulty === "medium") return { min: -100, max: 1000 };
  return { min: -500, max: 5000 };
}

function maxTaskCount(layout: ArithmeticLayout) {
  if (layout === "grid") return 120;
  if (layout === "vertical") return 36;
  return 18;
}

function supportsVisualLevel(level: ArithmeticLevel) {
  return level === "grade_1_2" || level === "grade_3_4";
}

function supportsVisualDifficulty(difficulty: ArithmeticDifficulty) {
  return difficulty === "easy" || difficulty === "medium";
}

export default function ProducerMathArithmeticPage() {
  const locale = useLocale();
  const printRef = useRef<HTMLDivElement | null>(null);
  const [language, setLanguage] = useState<ArithmeticLanguage>(
    normalizeLocale(locale)
  );
  const [level, setLevel] = useState<ArithmeticLevel>("grade_3_4");
  const [operation, setOperation] = useState<ArithmeticOperation>("addition");
  const [difficulty, setDifficulty] = useState<ArithmeticDifficulty>("easy");
  const [layout, setLayout] = useState<ArithmeticLayout>("grid");
  const [taskCount, setTaskCount] = useState(60);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [{ min, max }, setRange] = useState({ min: 0, max: 50 });
  const [worksheet, setWorksheet] = useState<ArithmeticWorksheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const taskMax = maxTaskCount(layout);
  const safeTaskCount = Math.max(4, Math.min(taskMax, taskCount));

  const suggestedRange = useMemo(
    () => defaultRange(level, difficulty, operation, layout),
    [level, difficulty, operation, layout]
  );
  const rangeHint = `${suggestedRange.min}–${suggestedRange.max}`;

  useEffect(() => {
    if (layout !== "visual") return;
    if (!supportsVisualLevel(level)) setLevel("grade_1_2");
    if (!supportsVisualDifficulty(difficulty)) setDifficulty("easy");
  }, [difficulty, layout, level]);

  function applySuggestedRange() {
    setRange(suggestedRange);
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setSuccess("");
    setSavedId(null);

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      if (!idToken) {
        setError("Du må være logget inn.");
        return;
      }

      const response = await fetch("/api/generate-arithmetic-worksheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          language,
          level,
          operation,
          difficulty,
          layout,
          taskCount: safeTaskCount,
          minNumber: min,
          maxNumber: max,
          showAnswerKey,
        }),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok) {
        throw new Error("error" in data ? data.error : "Kunne ikke lage arket.");
      }

      setWorksheet(data.worksheet);
      setSuccess("Regnearket er laget.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lage arket.");
    } finally {
      setLoading(false);
    }
  }

  async function saveWorksheetAndGetId() {
    if (!worksheet) return null;

    const currentUser = auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : null;

    if (!idToken) {
      throw new Error("Du må være logget inn.");
    }

    const response = await fetch("/api/producer/save-arithmetic-worksheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        worksheet,
        source: "math-arithmetic-generator",
      }),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as SaveResponse) : {};

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Kunne ikke lagre regnearket.");
    }

    return data.id || data.worksheetId || data.lessonId || null;
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const id = await saveWorksheetAndGetId();
      if (!id) {
        setError("Arket ble ikke lagret.");
        return;
      }

      setSavedId(id);
      setSuccess("Regnearket er lagret i Mitt innhold.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre regnearket.");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (!worksheet) return;
    window.print();
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
              321school matematikk
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Regnearter
            </h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Lag mengdetrening, oppstilt regning eller enkle ark med visuell støtte.
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Språk
              </span>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as ArithmeticLanguage)
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="nb">Norsk</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Trinn
              </span>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as ArithmeticLevel)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="grade_1_2">1.–2. trinn</option>
                <option value="grade_3_4">3.–4. trinn</option>
                <option value="grade_5_7" disabled={layout === "visual"}>
                  5.–7. trinn
                </option>
                <option value="grade_8_10" disabled={layout === "visual"}>
                  8.–10. trinn
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Regneart
              </span>
              <select
                value={operation}
                onChange={(event) =>
                  setOperation(event.target.value as ArithmeticOperation)
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="addition">Addisjon</option>
                <option value="subtraction">Subtraksjon</option>
                <option value="multiplication">Multiplikasjon</option>
                <option value="division">Divisjon</option>
                <option value="mixed">Blandet</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Vanskegrad
              </span>
              <select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as ArithmeticDifficulty)
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="easy">Lett</option>
                <option value="medium">Middels</option>
                <option value="hard" disabled={layout === "visual"}>
                  Vanskelig
                </option>
              </select>
            </label>

            <div>
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Oppsett
              </span>
              <div className="grid gap-2">
                {[
                  ["grid", "Mengdetrening"],
                  ["vertical", "Oppstilt under hverandre"],
                  ["visual", "Med figurer på lavt nivå"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const nextLayout = value as ArithmeticLayout;
                      setLayout(nextLayout);
                      setTaskCount(Math.min(taskCount, maxTaskCount(nextLayout)));
                      if (nextLayout === "visual") {
                        if (!supportsVisualLevel(level)) setLevel("grade_1_2");
                        if (!supportsVisualDifficulty(difficulty)) {
                          setDifficulty("easy");
                        }
                      }
                    }}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                      layout === value
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {layout === value ? "✓ " : ""}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Antall oppgaver
              </span>
              <input
                type="number"
                min={4}
                max={taskMax}
                value={taskCount}
                onChange={(event) => setTaskCount(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900">
                    Tallområde
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Forslag for valgt nivå og regneart: {rangeHint}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applySuggestedRange}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
                >
                  Bruk forslag
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={min}
                  onChange={(event) =>
                    setRange((current) => ({
                      ...current,
                      min: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={max}
                  onChange={(event) =>
                    setRange((current) => ({
                      ...current,
                      max: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAnswerKey((value) => !value)}
              className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                showAnswerKey
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {showAnswerKey ? "✓ Vis fasit" : "Vis fasit"}
            </button>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {success}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Lager..." : "Lag regneark"}
            </button>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !worksheet}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? "Lagrer..." : "Lagre"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!worksheet}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Skriv ut
              </button>
            </div>

            {savedId ? (
              <Link
                href={`/${locale}/content`}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm font-black text-sky-900 transition hover:bg-sky-100"
              >
                Åpne i Mitt innhold
              </Link>
            ) : null}
          </div>
        </aside>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {worksheet ? (
            <ArithmeticWorksheetView worksheet={worksheet} printRef={printRef} />
          ) : (
            <div className="grid min-h-[560px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Klar for første regneark
                </h2>
                <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
                  Velg regneart, nivå og oppsett. Forhåndsvisningen kommer her.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          body {
            background: #fff !important;
          }

          aside,
          header,
          nav,
          .sectionHeader,
          .libraryWrap,
          .print\\:hidden {
            display: none !important;
          }

          main {
            padding: 0 !important;
            background: #fff !important;
          }

          main > div {
            display: block !important;
            max-width: none !important;
            padding: 0 !important;
          }

          section {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .arithmetic-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            visibility: visible !important;
          }

          .arithmetic-print-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            visibility: visible !important;
          }

          .arithmetic-print-card {
            padding: 0 !important;
          }

          .arithmetic-brandbar {
            margin-bottom: 10px !important;
            padding-bottom: 8px !important;
          }

          .arithmetic-brandlogo {
            height: 34px !important;
          }

          .arithmetic-brandtitle {
            font-size: 14px !important;
            line-height: 1.1 !important;
          }

          .arithmetic-brandsite {
            font-size: 9px !important;
          }

          .arithmetic-title-wrap {
            margin-bottom: 12px !important;
            padding-bottom: 10px !important;
          }

          .arithmetic-title {
            font-size: 18px !important;
            line-height: 1.15 !important;
          }

          .arithmetic-instructions {
            margin-top: 4px !important;
            font-size: 10px !important;
            line-height: 1.35 !important;
          }

          .arithmetic-identity-grid {
            margin-top: 10px !important;
            gap: 6px !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
          }

          .arithmetic-identity-box {
            border-radius: 8px !important;
            padding: 6px 8px !important;
            font-size: 10px !important;
          }

          .arithmetic-identity-box:last-child {
            grid-column: 1 / -1 !important;
          }

          .arithmetic-grid {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            border-radius: 0 !important;
          }

          .arithmetic-grid-task {
            min-height: 24px !important;
            grid-template-columns: 20px 58px 28px 1fr !important;
            font-size: 10.5px !important;
            line-height: 1.1 !important;
          }

          .arithmetic-grid-index {
            padding: 4px 3px !important;
            font-size: 9px !important;
          }

          .arithmetic-grid-expression {
            padding: 4px 3px 4px 6px !important;
            text-align: right !important;
            white-space: nowrap !important;
          }

          .arithmetic-grid-answer {
            min-height: 24px !important;
          }

          .arithmetic-vertical-grid {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 14px 18px !important;
          }

          .arithmetic-vertical-task {
            border: 0 !important;
            border-radius: 0 !important;
            padding: 0 !important;
            min-height: 74px !important;
          }

          .arithmetic-vertical-head {
            margin-bottom: 4px !important;
            gap: 6px !important;
          }

          .arithmetic-vertical-index {
            width: 18px !important;
            height: 18px !important;
            font-size: 8px !important;
          }

          .arithmetic-vertical-expression {
            display: none !important;
          }

          .arithmetic-vertical-stack {
            gap: 2px !important;
            font-size: 18px !important;
            line-height: 1 !important;
          }

          .arithmetic-vertical-line {
            padding-bottom: 3px !important;
            border-bottom-width: 1.5px !important;
          }

          .arithmetic-vertical-answer {
            height: 24px !important;
          }

          .arithmetic-visual-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px 16px !important;
          }

          .arithmetic-visual-task {
            border-radius: 10px !important;
            padding: 8px !important;
          }

          .arithmetic-visual-head {
            margin-bottom: 5px !important;
            gap: 8px !important;
          }

          .arithmetic-visual-index {
            width: 18px !important;
            height: 18px !important;
            font-size: 8px !important;
          }

          .arithmetic-visual-expression {
            font-size: 14px !important;
            line-height: 1.1 !important;
          }

          .arithmetic-visual-model {
            gap: 4px !important;
            border-radius: 8px !important;
            padding: 6px !important;
          }

          .arithmetic-visual-group {
            border-radius: 7px !important;
            min-height: 26px !important;
            padding: 5px !important;
          }

          .arithmetic-visual-symbol {
            font-size: 13px !important;
            line-height: 1 !important;
          }

          .arithmetic-dot-grid {
            grid-template-columns: repeat(10, 7px) !important;
            gap: 3px !important;
          }

          .arithmetic-dot {
            width: 7px !important;
            height: 7px !important;
          }

          .arithmetic-visual-answer {
            margin-top: 5px !important;
            min-height: 25px !important;
            border-radius: 7px !important;
            padding: 5px 6px !important;
            font-size: 10px !important;
          }
        }
      `}</style>
    </main>
  );
}
