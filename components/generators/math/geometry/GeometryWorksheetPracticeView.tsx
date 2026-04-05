// components/generators/math/geometry/GeometryWorksheetPracticeView.tsx
"use client";

import GeometryFigure from "@/components/generators/math/geometry/GeometryFigure";
import FigureMeta from "@/components/generators/math/geometry/FigureMeta";
import type { MathWorksheet, MathWorksheetTask } from "@/lib/math/geometry/types";

type TFn = (key: string) => string;

type MeasurementKey =
  | "length"
  | "width"
  | "side"
  | "base"
  | "height"
  | "topBase"
  | "leftSide"
  | "rightSide"
  | "radius";

export type GeometryPracticeAnswer = {
  taskId: string;
  shapeName?: string;
  perimeterValue?: number | null;
  areaValue?: number | null;
  updatedAt?: unknown;
};

export type GeometryPracticeAnswersByTaskId = Record<
  string,
  GeometryPracticeAnswer
>;

function getTaskAnswer(
  answersByTaskId: GeometryPracticeAnswersByTaskId | undefined,
  taskId: string
): GeometryPracticeAnswer {
  return answersByTaskId?.[taskId] ?? { taskId };
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(",", ".")
    .replace(/\s+/g, "")
    .replace(/cm²|cm2|cm/gi, "");

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function isRawTranslationKey(value: string, key: string) {
  return value === key || value === `mathGeometry.${key}`;
}

function safeT(t: TFn, key: string, fallback: string) {
  const value = t(key);
  return isRawTranslationKey(value, key) ? fallback : value;
}

function getShapeNameLabel(t: TFn) {
  return safeT(t, "writeShapeName", "Write the name of the shape");
}

function getPerimeterAnswerLabel(t: TFn) {
  return safeT(t, "writePerimeterAnswer", "Write the perimeter");
}

function getAreaAnswerLabel(t: TFn) {
  return safeT(t, "writeAreaAnswer", "Write the area");
}

function getAnswerLabel(t: TFn) {
  return safeT(t, "answer", "Answer");
}

function getWorksheetLabel(t: TFn) {
  return safeT(t, "worksheet", "Worksheet");
}

function getProducerLabel(t: TFn) {
  return safeT(t, "producer", "Producer");
}

function getLevelLabel(t: TFn) {
  return safeT(t, "level", "Level");
}

function getNameLabel(t: TFn) {
  return safeT(t, "name", "Name");
}

function getDateLabel(t: TFn) {
  return safeT(t, "date", "Date");
}

function getClassLabel(t: TFn) {
  return safeT(t, "classLabel", "Class");
}

function getFormulaLabel(t: TFn) {
  return safeT(t, "formula", "Formula");
}

function getHintLabel(t: TFn) {
  return safeT(t, "hint", "Hint");
}

function getExplanationLabel(t: TFn) {
  return safeT(t, "explanation", "Explanation");
}

function getEmptyStateLabel(t: TFn, emptyStateKey: string) {
  return safeT(
    t,
    `emptyStates.${emptyStateKey}`,
    "Generate a geometry worksheet to see a preview."
  );
}

function getNumberOnlyHelp(t: TFn) {
  return safeT(t, "numberOnlyHelp", "Write only the number");
}

function renderTaskInputs({
  task,
  answer,
  onAnswerChange,
  t,
}: {
  task: MathWorksheetTask;
  answer: GeometryPracticeAnswer;
  onAnswerChange?: (taskId: string, patch: Partial<GeometryPracticeAnswer>) => void;
  t: TFn;
}) {
  if (task.type === "shape_name") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getShapeNameLabel(t)}
        </label>
        <input
          type="text"
          value={answer.shapeName ?? ""}
          onChange={(e) =>
            onAnswerChange?.(task.id, {
              taskId: task.id,
              shapeName: e.target.value,
              updatedAt: Date.now(),
            })
          }
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </div>
    );
  }

  if (task.type === "perimeter") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getPerimeterAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={answer.perimeterValue ?? ""}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              onAnswerChange?.(task.id, {
                taskId: task.id,
                perimeterValue: toNullableNumber(e.target.value),
                updatedAt: Date.now(),
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
      </div>
    );
  }

  if (task.type === "area") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getAreaAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={answer.areaValue ?? ""}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              onAnswerChange?.(task.id, {
                taskId: task.id,
                areaValue: toNullableNumber(e.target.value),
                updatedAt: Date.now(),
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm²</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getShapeNameLabel(t)}
        </label>
        <input
          type="text"
          value={answer.shapeName ?? ""}
          onChange={(e) =>
            onAnswerChange?.(task.id, {
              taskId: task.id,
              shapeName: e.target.value,
              updatedAt: Date.now(),
            })
          }
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getPerimeterAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={answer.perimeterValue ?? ""}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              onAnswerChange?.(task.id, {
                taskId: task.id,
                perimeterValue: toNullableNumber(e.target.value),
                updatedAt: Date.now(),
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getAreaAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={answer.areaValue ?? ""}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              onAnswerChange?.(task.id, {
                taskId: task.id,
                areaValue: toNullableNumber(e.target.value),
                updatedAt: Date.now(),
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm²</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
      </div>
    </div>
  );
}

function renderExpectedAnswer(task: MathWorksheetTask, t: TFn) {
  if (!task.expected) return null;

  if (task.type === "shape_name" && task.expected.shapeName) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <span className="font-semibold">{getAnswerLabel(t)}:</span>{" "}
        {task.expected.shapeName}
      </div>
    );
  }

  if (task.type === "perimeter" && task.expected.perimeterValue != null) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <span className="font-semibold">{getAnswerLabel(t)}:</span>{" "}
        {task.expected.perimeterValue} cm
      </div>
    );
  }

  if (task.type === "area" && task.expected.areaValue != null) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <span className="font-semibold">{getAnswerLabel(t)}:</span>{" "}
        {task.expected.areaValue} cm²
      </div>
    );
  }

  if (task.type === "all_in_one") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div>
          <span className="font-semibold">{getShapeNameLabel(t)}:</span>{" "}
          {task.expected.shapeName ?? "—"}
        </div>
        <div>
          <span className="font-semibold">{getPerimeterAnswerLabel(t)}:</span>{" "}
          {task.expected.perimeterValue ?? "—"} cm
        </div>
        <div>
          <span className="font-semibold">{getAreaAnswerLabel(t)}:</span>{" "}
          {task.expected.areaValue ?? "—"} cm²
        </div>
      </div>
    );
  }

  return null;
}

export default function GeometryWorksheetPracticeView({
  worksheet,
  t,
  tBrand,
  answersByTaskId,
  onAnswerChange,
  showIdentityFields = false,
  showFigureMeta = true,
  includeHints = true,
  showExpectedAnswers = false,
  producerName,
  levelLabel,
  emptyStateKey = "generate",
}: {
  worksheet: MathWorksheet;
  t: TFn;
  tBrand: TFn;
  answersByTaskId?: GeometryPracticeAnswersByTaskId;
  onAnswerChange?: (taskId: string, patch: Partial<GeometryPracticeAnswer>) => void;
  showIdentityFields?: boolean;
  showFigureMeta?: boolean;
  includeHints?: boolean;
  showExpectedAnswers?: boolean;
  producerName?: string;
  levelLabel?: string;
  emptyStateKey?: string;
}) {
  const tMeasurement = (key: MeasurementKey) => {
    const rawKey = `measurements.${key}`;
    const measurementValue = t(rawKey);
    return isRawTranslationKey(measurementValue, rawKey) ? key : measurementValue;
  };

  return (
    <div className="mx-auto max-w-[980px] bg-white text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo321ny.png"
                alt={`321 ${tBrand("school")}`}
                className="h-12 w-auto object-contain"
              />
              <div>
                <div className="text-lg font-extrabold text-slate-900">
                  321 {tBrand("school")}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  321school.com
                </div>
              </div>
            </div>

            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
              {getWorksheetLabel(t)}
            </div>
          </div>

          <div className="mt-5">
            <h2 className="text-2xl font-bold text-slate-900">{worksheet.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{worksheet.instructions}</p>

            {(producerName || levelLabel) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {producerName ? (
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    {getProducerLabel(t)}: {producerName}
                  </div>
                ) : null}

                {levelLabel ? (
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    {getLevelLabel(t)}: {levelLabel}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {showIdentityFields ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-medium">{getNameLabel(t)}:</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-medium">{getDateLabel(t)}:</span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:col-span-2">
                <span className="font-medium">{getClassLabel(t)}:</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-6">
          {worksheet.tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              {getEmptyStateLabel(t, emptyStateKey)}
            </div>
          ) : (
            <div className="grid gap-5">
              {worksheet.tasks.map((task, idx) => {
                const answer = getTaskAnswer(answersByTaskId, task.id);

                return (
                  <article
                    key={task.id || String(idx)}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900">
                          {task.prompt}
                        </h3>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex min-h-[170px] items-center justify-center">
                          <GeometryFigure
                            figure={task.figure}
                            className="h-36 w-full max-w-[260px]"
                          />
                        </div>

                        {showFigureMeta ? (
                          <div className="mt-3">
                            <FigureMeta
                              figure={task.figure}
                              tMeasurement={tMeasurement}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        {renderTaskInputs({
                          task,
                          answer,
                          onAnswerChange,
                          t,
                        })}

                        {worksheet.showFormulas && task.formula ? (
                          <div className="rounded-2xl bg-blue-50 p-4 text-sm text-slate-800">
                            <span className="font-semibold">{getFormulaLabel(t)}:</span>
                            <div className="whitespace-pre-line">{task.formula}</div>
                          </div>
                        ) : null}

                        {includeHints && task.hint ? (
                          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-slate-800">
                            <span className="font-semibold">{getHintLabel(t)}:</span>{" "}
                            {task.hint}
                          </div>
                        ) : null}

                        {showExpectedAnswers ? renderExpectedAnswer(task, t) : null}

                        {task.explanation ? (
                          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                            <span className="font-semibold">{getExplanationLabel(t)}:</span>{" "}
                            {task.explanation}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}