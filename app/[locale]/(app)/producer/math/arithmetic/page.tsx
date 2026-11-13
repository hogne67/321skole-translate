"use client";

import MathGeneratorActions from "@/components/generators/math/MathGeneratorActions";
import MathSpacePicker from "@/components/generators/math/MathSpacePicker";
import { useSavedMathWorksheet } from "@/components/generators/math/useSavedMathWorksheet";
import { useMathWorksheetSave } from "@/components/generators/math/useMathWorksheetSave";
import { sanitizeArithmeticWorksheet } from "@/lib/math/arithmetic/sanitize";
import MathGeneratorBackLink from "@/components/generators/math/MathGeneratorBackLink";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import ArithmeticWorksheetView from "@/components/generators/math/arithmetic/ArithmeticWorksheetView";
import {
  DEFAULT_RULES,
  defaultPresetFor,
  rulesForTaskType,
  taskTypeOptionsFor,
  type RulesState,
} from "@/lib/math/arithmetic/presets";
import { UI_COPY, copyValue } from "@/lib/math/arithmetic/uiCopy";
import { clampVisualRange, constrainVisualConfig, visualOperandLimits } from "@/lib/math/arithmetic/visualLimits";
import { alignDividendRange } from "@/lib/math/arithmetic/ranges";
import type {
  ArithmeticConcreteOperation,
  ArithmeticDifficulty,
  ArithmeticLanguage,
  ArithmeticLayout,
  ArithmeticLevel,
  ArithmeticNumberRange,
  ArithmeticOperation,
  ArithmeticTaskType,
  ArithmeticWorksheet,
} from "@/lib/math/arithmetic/types";

type GenerateResponse =
  | { ok: true; worksheet: ArithmeticWorksheet }
  | { ok: false; error: string };

const MIXED_OPERATION_OPTIONS: ArithmeticConcreteOperation[] = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
];

function normalizeLocale(locale: string): ArithmeticLanguage {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

function maxTaskCount(layout: ArithmeticLayout) {
  if (layout === "grid") return 120;
  if (layout === "vertical") return 36;
  return 18;
}

function defaultTaskCount(layout: ArithmeticLayout) {
  if (layout === "grid") return 100;
  if (layout === "vertical") return 36;
  return 18;
}

export default function ProducerMathArithmeticPage() {
  const locale = useLocale();
  const printRef = useRef<HTMLDivElement | null>(null);
  const [language, setLanguage] = useState(() => normalizeLocale(locale));
  const [level, setLevel] = useState<ArithmeticLevel>("grade_3_4");
  const [operation, setOperation] = useState<ArithmeticOperation>("addition");
  const [difficulty, setDifficulty] = useState<ArithmeticDifficulty>("easy");
  const [taskType, setTaskType] = useState<ArithmeticTaskType>("standard");
  const [layout, setLayout] = useState<ArithmeticLayout>("grid");
  const [taskCount, setTaskCount] = useState(defaultTaskCount("grid"));
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [operandA, setOperandA] = useState<ArithmeticNumberRange>({
    min: 0,
    max: 50,
  });
  const [operandB, setOperandB] = useState<ArithmeticNumberRange>({
    min: 0,
    max: 50,
  });
  const [rules, setRules] = useState<RulesState>(DEFAULT_RULES);
  const [mixedOperations, setMixedOperations] = useState<
    ArithmeticConcreteOperation[]
  >(MIXED_OPERATION_OPTIONS);
  const [worksheet, setWorksheet] = useState<ArithmeticWorksheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const displayedWorksheet = worksheet ? { ...worksheet, showAnswerKey } : null;
  const persistence = useMathWorksheetSave({ worksheet: displayedWorksheet, endpoint: "/api/producer/save-arithmetic-worksheet", language: locale, source: "math-arithmetic-generator" });
  const { savedId, success } = persistence;
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeArithmeticWorksheet(data.arithmeticWorksheet ?? data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setLanguage(result.language); setLevel(result.level); setDifficulty(result.difficulty);
    setOperation(result.operation); setLayout(result.layout); setTaskCount(result.tasks.length); setShowAnswerKey(result.showAnswerKey);
    const config = result.generatorConfig;
    setTaskType(config?.taskType ?? (result.tasks.some(task => !!task.unknownPosition) ? "missing_number" : "standard"));
    setOperandA(config?.operandA ?? { min: Math.min(...result.tasks.map(task => task.left)), max: Math.max(...result.tasks.map(task => task.left)) });
    setOperandB(config?.operandB ?? { min: Math.min(...result.tasks.map(task => task.right)), max: Math.max(...result.tasks.map(task => task.right)) });
    setRules({ ...DEFAULT_RULES, ...config?.rules });
    setMixedOperations(config?.mixedOperations ?? Array.from(new Set(result.tasks.map(task => task.operation))));
    persistence.rememberSaved(id, result);
    return true;
  });

  const copy = UI_COPY[language];
  const taskMax = maxTaskCount(layout);
  const safeTaskCount = Math.max(4, Math.min(taskMax, taskCount));

  const taskTypeOptions = useMemo(
    () => taskTypeOptionsFor(operation, copy, layout),
    [copy, layout, operation]
  );
  const operandLabels = useMemo(() => {
    if (taskType === "missing_number") {
      return operation === "multiplication"
        ? {
            operandA: copy.operandLabels.missingMultiplicationA,
            operandB: copy.operandLabels.missingMultiplicationB,
          }
        : {
            operandA: copy.operandLabels.missingA,
            operandB: copy.operandLabels.missingB,
          };
    }

    if (operation === "addition") {
      return {
        operandA: copy.operandLabels.additionA,
        operandB: copy.operandLabels.additionB,
      };
    }

    if (operation === "subtraction") {
      return {
        operandA: copy.operandLabels.subtractionA,
        operandB: copy.operandLabels.subtractionB,
      };
    }

    if (operation === "multiplication") {
      return {
        operandA: copy.operandLabels.multiplicationA,
        operandB: copy.operandLabels.multiplicationB,
      };
    }

    if (operation === "division") {
      return {
        operandA: copy.operandLabels.divisionA,
        operandB: copy.operandLabels.divisionB,
      };
    }

    return {
      operandA: copy.operandLabels.mixedA,
      operandB: copy.operandLabels.mixedB,
    };
  }, [copy, operation, taskType]);
  const isMissingNumber = taskType === "missing_number";
  const rangeLimits = layout === "visual"
    ? visualOperandLimits(operation, mixedOperations)
    : undefined;

  function applyVisualLimits(
    nextOperation: ArithmeticOperation,
    nextA: ArithmeticNumberRange,
    nextB: ArithmeticNumberRange,
    nextTaskType: ArithmeticTaskType,
    nextRules: RulesState,
    nextMixedOperations = mixedOperations
  ) {
    const config = constrainVisualConfig(nextOperation, {
      taskType: nextTaskType,
      operandA: nextA,
      operandB: nextB,
      rules: nextRules,
      mixedOperations: nextMixedOperations,
    });
    setOperandA(nextOperation === "division"
      ? alignDividendRange(config.operandA, config.operandB)
      : config.operandA);
    setOperandB(config.operandB);
    setTaskType(config.taskType);
    setRules({ ...nextRules, ...config.rules });
  }

  function handleOperationChange(nextOperation: ArithmeticOperation) {
    setOperation(nextOperation);
    if (nextOperation === "mixed") {
      setMixedOperations(MIXED_OPERATION_OPTIONS);
    }

    if (nextOperation === "multiplication" && layout === "vertical") {
      setTaskType("two_digit_by_one_digit");
      setOperandA({ min: 10, max: 99 });
      setOperandB({ min: 2, max: 9 });
      setRules(DEFAULT_RULES);
      return;
    }

    const preset = defaultPresetFor(nextOperation);
    if (layout === "visual") {
      applyVisualLimits(nextOperation, preset.operandA, preset.operandB, preset.taskType, preset.rules, MIXED_OPERATION_OPTIONS);
      return;
    }
    setTaskType(preset.taskType);
    setOperandA(nextOperation === "division"
      ? alignDividendRange(preset.operandA, preset.operandB)
      : preset.operandA);
    setOperandB(preset.operandB);
    setRules(preset.rules);
  }

  function handleTaskTypeChange(nextTaskType: ArithmeticTaskType) {
    setTaskType(nextTaskType);
    setRules((current) => rulesForTaskType(nextTaskType, current));
  }

  function applyLayoutDefaults(nextLayout: ArithmeticLayout) {
    if (nextLayout === "visual") {
      applyVisualLimits(operation, operandA, operandB, taskType, rules);
      return;
    }

    if (operation === "multiplication" && nextLayout === "vertical") {
      setTaskType("two_digit_by_one_digit");
      setOperandA({ min: 10, max: 99 });
      setOperandB({ min: 2, max: 9 });
      setRules(DEFAULT_RULES);
    }
  }

  function updateRange(
    operand: "operandA" | "operandB",
    key: keyof ArithmeticNumberRange,
    value: number
  ) {
    const current = operand === "operandA" ? operandA : operandB;
    const limits = rangeLimits?.[operand];
    const next = {
      ...current,
      [key]: value,
    };
    const range = limits ? clampVisualRange(next, limits) : next;
    const nextA = operand === "operandA" ? range : operandA;
    const nextB = operand === "operandB" ? range : operandB;
    setOperandA(operation === "division" ? alignDividendRange(nextA, nextB) : nextA);
    setOperandB(nextB);
  }

  function toggleMixedOperation(nextOperation: ArithmeticConcreteOperation) {
    const next = mixedOperations.includes(nextOperation)
      ? mixedOperations.length === 1
        ? mixedOperations
        : mixedOperations.filter((operation) => operation !== nextOperation)
      : [...mixedOperations, nextOperation];
    setMixedOperations(next);
    if (layout === "visual") {
      applyVisualLimits(operation, operandA, operandB, taskType, rules, next);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      if (!idToken) {
        setError(copy.loginError);
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
          taskType,
          taskCount: safeTaskCount,
          operandA,
          operandB,
          rules,
          mixedOperations,
          showAnswerKey,
        }),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok) {
        throw new Error("error" in data ? data.error : copy.generateError);
      }

      setWorksheet(data.worksheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.generateError);
    } finally {
      setLoading(false);
    }
  }

  const previewCopy = worksheet ? UI_COPY[worksheet.language] : copy;

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <MathGeneratorBackLink />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
              {copy.sectionLabel}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {copy.title}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {copy.description}
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                {copy.operation}
              </span>
              <select
                value={operation}
                onChange={(event) =>
                  handleOperationChange(event.target.value as ArithmeticOperation)
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="addition">{copy.operations.addition}</option>
                <option value="subtraction">{copy.operations.subtraction}</option>
                <option value="multiplication">
                  {copy.operations.multiplication}
                </option>
                <option value="division">{copy.operations.division}</option>
                <option value="mixed">{copy.operations.mixed}</option>
              </select>
            </label>

            <div>
              <span className="mb-2 block text-sm font-bold text-slate-700">
                {copy.layout}
              </span>
              <div className="grid gap-2">
                {[
                  "grid",
                  "vertical",
                  "visual",
                ].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const nextLayout = value as ArithmeticLayout;
                      setLayout(nextLayout);
                      applyLayoutDefaults(nextLayout);
                      setTaskCount((current) =>
                        Math.min(
                          current === defaultTaskCount(layout)
                            ? defaultTaskCount(nextLayout)
                            : current,
                          maxTaskCount(nextLayout)
                        )
                      );
                    }}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                      layout === value
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {layout === value ? "✓ " : ""}
                    {copy.layouts[value as ArithmeticLayout]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {operation === "mixed" ? (
                <div>
                  <div className="mb-2 text-xs font-bold text-slate-600">
                    {copy.mixedOperations}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MIXED_OPERATION_OPTIONS.map((option) => {
                      const selected = mixedOperations.includes(option);

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleMixedOperation(option)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${
                            selected
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {selected ? "✓ " : ""}
                          {copy.operations[option]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <label className={operation === "mixed" ? "mt-4 block" : "block"}>
                <span className="mb-1.5 block text-xs font-bold text-slate-600">
                  {copy.type}
                </span>
                <select
                  value={taskType}
                  onChange={(event) => {
                    handleTaskTypeChange(event.target.value as ArithmeticTaskType);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {taskTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">
                  {copy.taskCount}
                </span>
                <input
                  type="number"
                  min={4}
                  max={taskMax}
                  value={taskCount}
                  onChange={(event) => setTaskCount(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-4 grid gap-3">
                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-600">
                    {operandLabels.operandA}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={operandA.min}
                      min={rangeLimits?.operandA.min}
                      max={rangeLimits?.operandA.max}
                      onChange={(event) =>
                        updateRange(
                          "operandA",
                          "min",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={operandA.max}
                      min={rangeLimits?.operandA.min}
                      max={rangeLimits?.operandA.max}
                      onChange={(event) =>
                        updateRange(
                          "operandA",
                          "max",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-600">
                    {operandLabels.operandB}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={operandB.min}
                      min={rangeLimits?.operandB.min}
                      max={rangeLimits?.operandB.max}
                      onChange={(event) =>
                        updateRange(
                          "operandB",
                          "min",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={operandB.max}
                      min={rangeLimits?.operandB.min}
                      max={rangeLimits?.operandB.max}
                      onChange={(event) =>
                        updateRange(
                          "operandB",
                          "max",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {isMissingNumber ? (
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                  {copy.operandHint}
                </p>
              ) : null}

              <div className="mt-4 grid gap-2">
                {operation === "addition" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRules((current) => ({
                        ...current,
                        allowCarry: !current.allowCarry,
                      }));
                    }}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${
                      rules.allowCarry
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {rules.allowCarry ? "✓ " : ""}
                    {isMissingNumber ? copy.allowCarryMissing : copy.allowCarry}
                  </button>
                ) : null}

                {operation === "subtraction" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRules((current) => ({
                          ...current,
                          allowBorrow: !current.allowBorrow,
                        }));
                      }}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${
                        rules.allowBorrow
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {rules.allowBorrow ? "✓ " : ""}
                      {isMissingNumber
                        ? copy.allowBorrowMissing
                        : copy.allowBorrow}
                    </button>
                    {layout !== "visual" ? <button
                      type="button"
                      onClick={() => {
                        setRules((current) => ({
                          ...current,
                          allowNegative: !current.allowNegative,
                        }));
                      }}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${
                        rules.allowNegative
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {rules.allowNegative ? "✓ " : ""}
                      {copy.allowNegative}
                    </button> : null}
                  </>
                ) : null}
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
              {showAnswerKey ? `✓ ${copy.answerKey}` : copy.answerKey}
            </button>

            {error || persistence.error || restored.error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error || persistence.error || restored.error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {success}
              </div>
            ) : null}

            <MathGeneratorActions language={locale} generating={loading} saving={persistence.saving} loading={restored.loading} hasWorksheet={!!worksheet}
              onGenerate={() => { void handleGenerate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />

            {savedId ? (
              <Link
                href={`/${locale}/content`}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm font-black text-sky-900 transition hover:bg-sky-100"
              >
                {copy.openContent}
              </Link>
            ) : null}
          </div>
        </aside>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {worksheet ? (
            <ArithmeticWorksheetView
              worksheet={displayedWorksheet!}
              printRef={printRef}
              t={(key) => copyValue(previewCopy.worksheet, key)}
              tBrand={(key) => copyValue(previewCopy.brand, key)}
            />
          ) : (
            <div className="grid min-h-[560px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  {copy.readyTitle}
                </h2>
                <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
                  {copy.readyText}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {persistence.sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}
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
          }
        }
      `}</style>
    </main>
  );
}
