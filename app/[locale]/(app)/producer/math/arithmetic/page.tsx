"use client";

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

type SaveResponse = {
  ok?: boolean;
  error?: string;
  id?: string;
  worksheetId?: string;
  lessonId?: string;
};

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
  const language = normalizeLocale(locale);
  const level: ArithmeticLevel = "grade_3_4";
  const [operation, setOperation] = useState<ArithmeticOperation>("addition");
  const difficulty: ArithmeticDifficulty = "easy";
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
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setSuccess("");
    setSavedId(null);

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
      setSuccess(copy.generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.generateError);
    } finally {
      setLoading(false);
    }
  }

  async function saveWorksheetAndGetId() {
    if (!worksheet) return null;

    const currentUser = auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : null;

    if (!idToken) {
      throw new Error(copy.loginError);
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
      throw new Error(data.error || copy.saveError);
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
        setError(copy.notSaved);
        return;
      }

      setSavedId(id);
      setSuccess(copy.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (!worksheet) return;
    window.print();
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
              {loading ? copy.generating : copy.generate}
            </button>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !worksheet}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? copy.saving : copy.save}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!worksheet}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {copy.print}
              </button>
            </div>

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
              worksheet={worksheet}
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
