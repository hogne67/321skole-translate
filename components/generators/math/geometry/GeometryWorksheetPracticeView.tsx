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
  perimeterText?: string;
  areaText?: string;
  updatedAt?: unknown;
};

export type GeometryPracticeAnswersByTaskId = Record<
  string,
  GeometryPracticeAnswer
>;

type GeometryTaskPartLike = {
  key?: unknown;
  label?: unknown;
  isCorrect?: boolean | null;
  expected?: unknown;
  actual?: unknown;
};

type GeometryTaskResultLike = {
  isCorrect?: boolean | null;
  status?: "correct" | "partial" | "wrong" | "unanswered" | string;
  score?: number | null;
  expected?: unknown;
  studentAnswer?: unknown;
  method?: unknown;
  parts?: Record<string, GeometryTaskPartLike | undefined>;
};

type GeometryAutoLike = {
  byTaskId?: Record<string, GeometryTaskResultLike | undefined>;
  byTask?: Record<string, GeometryTaskResultLike | undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTaskMap(
  auto: GeometryAutoLike | null | undefined
): Record<string, GeometryTaskResultLike | undefined> {
  if (isRecord(auto?.byTaskId)) {
    return auto.byTaskId as Record<string, GeometryTaskResultLike | undefined>;
  }
  if (isRecord(auto?.byTask)) {
    return auto.byTask as Record<string, GeometryTaskResultLike | undefined>;
  }
  return {};
}

function getTaskResult(
  auto: GeometryAutoLike | null | undefined,
  taskId: string
): GeometryTaskResultLike | undefined {
  const taskMap = readTaskMap(auto);
  return taskMap[taskId];
}

function readPart(
  result: GeometryTaskResultLike | undefined,
  key: "shapeName" | "perimeter" | "area"
): GeometryTaskPartLike | undefined {
  if (!isRecord(result?.parts)) return undefined;
  const parts = result.parts as Record<string, GeometryTaskPartLike | undefined>;
  return parts[key];
}

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
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/cm²|cm2|cm/gi, "");

  if (!normalized) return null;
  if (normalized === "-" || normalized === "." || normalized === "-.") return null;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumberForInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

function getPerimeterInputValue(answer: GeometryPracticeAnswer): string {
  if (typeof answer.perimeterText === "string") return answer.perimeterText;
  return formatNumberForInput(answer.perimeterValue);
}

function getAreaInputValue(answer: GeometryPracticeAnswer): string {
  if (typeof answer.areaText === "string") return answer.areaText;
  return formatNumberForInput(answer.areaValue);
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

function getCorrectLabel(t: TFn) {
  return safeT(t, "correct", "Correct");
}

function getWrongLabel(t: TFn) {
  return safeT(t, "wrong", "Wrong");
}

function getPartialLabel(t: TFn) {
  return safeT(t, "partialSingular", "Partially correct");
}

function getUnansweredLabel(t: TFn) {
  return safeT(t, "unanswered", "Unanswered");
}

function fieldStateClass(
  value: boolean | null | undefined
): {
  input: string;
  badge: string;
  label: "correct" | "wrong" | "unanswered";
} {
  if (value === true) {
    return {
      input:
        "border-emerald-400 bg-emerald-50 text-emerald-950 focus:border-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-900",
      label: "correct",
    };
  }

  if (value === false) {
    return {
      input:
        "border-red-400 bg-red-50 text-red-950 focus:border-red-500",
      badge: "border-red-200 bg-red-50 text-red-900",
      label: "wrong",
    };
  }

  return {
    input:
      "border-slate-300 bg-white text-slate-900 focus:border-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    label: "unanswered",
  };
}

function taskStatusClass(
  status: string | undefined
): {
  border: string;
  badge: string;
  label: "correct" | "wrong" | "partial" | "unanswered";
} {
  if (status === "correct") {
    return {
      border: "border-emerald-300",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-900",
      label: "correct",
    };
  }

  if (status === "partial") {
    return {
      border: "border-amber-300",
      badge: "border-amber-200 bg-amber-50 text-amber-900",
      label: "partial",
    };
  }

  if (status === "wrong") {
    return {
      border: "border-red-300",
      badge: "border-red-200 bg-red-50 text-red-900",
      label: "wrong",
    };
  }

  return {
    border: "border-slate-200",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    label: "unanswered",
  };
}

function statusText(
  label: "correct" | "wrong" | "partial" | "unanswered",
  t: TFn
) {
  if (label === "correct") return getCorrectLabel(t);
  if (label === "wrong") return getWrongLabel(t);
  if (label === "partial") return getPartialLabel(t);
  return getUnansweredLabel(t);
}

function InlineBadge({
  state,
  t,
}: {
  state: boolean | null | undefined;
  t: TFn;
}) {
  const cls = fieldStateClass(state);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls.badge}`}
    >
      {statusText(cls.label, t)}
    </span>
  );
}

function TaskBadge({
  status,
  t,
}: {
  status: string | undefined;
  t: TFn;
}) {
  const cls = taskStatusClass(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls.badge}`}
    >
      {statusText(cls.label, t)}
    </span>
  );
}

function FeedbackLine({
  state,
  expected,
  t,
}: {
  state: boolean | null | undefined;
  expected?: unknown;
  t: TFn;
}) {
  if (state === null || state === undefined) return null;

  const expectedText =
    typeof expected === "string"
      ? expected.trim()
      : typeof expected === "number"
        ? String(expected)
        : "";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <InlineBadge state={state} t={t} />
      {state === false && expectedText ? (
        <span className="text-slate-600">
          {getAnswerLabel(t)}: {expectedText}
        </span>
      ) : null}
    </div>
  );
}

function renderTaskInputs({
  task,
  answer,
  onAnswerChange,
  readOnly = false,
  t,
  showInlineFeedback,
  auto,
}: {
  task: MathWorksheetTask;
  answer: GeometryPracticeAnswer;
  onAnswerChange?: (taskId: string, patch: Partial<GeometryPracticeAnswer>) => void;
  readOnly?: boolean;
  t: TFn;
  showInlineFeedback?: boolean;
  auto?: GeometryAutoLike | null;
}) {
  const result = showInlineFeedback ? getTaskResult(auto, task.id) : undefined;
  const shapePart = showInlineFeedback ? readPart(result, "shapeName") : undefined;
  const perimeterPart = showInlineFeedback ? readPart(result, "perimeter") : undefined;
  const areaPart = showInlineFeedback ? readPart(result, "area") : undefined;

  const updateAnswer = (patch: Partial<GeometryPracticeAnswer>) => {
    onAnswerChange?.(task.id, {
      ...answer,
      ...patch,
      taskId: task.id,
      updatedAt: Date.now(),
    });
  };

  if (task.type === "shape_name") {
    const field = fieldStateClass(shapePart?.isCorrect);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getShapeNameLabel(t)}
        </label>
        <input
          type="text"
          value={answer.shapeName ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            updateAnswer({
              shapeName: e.target.value,
            })
          }
          className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
              ? field.input
              : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
            }`}
        />
        {showInlineFeedback ? (
          <FeedbackLine state={shapePart?.isCorrect} expected={shapePart?.expected} t={t} />
        ) : null}
      </div>
    );
  }

  if (task.type === "perimeter") {
    const field = fieldStateClass(perimeterPart?.isCorrect);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getPerimeterAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={getPerimeterInputValue(answer)}
            disabled={readOnly}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              updateAnswer({
                perimeterText: e.target.value,
                perimeterValue: toNullableNumber(e.target.value),
              })
            }
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
                ? field.input
                : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
              }`}
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
        {showInlineFeedback ? (
          <FeedbackLine state={perimeterPart?.isCorrect} expected={perimeterPart?.expected} t={t} />
        ) : null}
      </div>
    );
  }

  if (task.type === "area") {
    const field = fieldStateClass(areaPart?.isCorrect);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getAreaAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={getAreaInputValue(answer)}
            placeholder={getNumberOnlyHelp(t)}
            disabled={readOnly}
            onChange={(e) =>
              updateAnswer({
                areaText: e.target.value,
                areaValue: toNullableNumber(e.target.value),
              })
            }
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
                ? field.input
                : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
              }`}
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm²</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
        {showInlineFeedback ? (
          <FeedbackLine state={areaPart?.isCorrect} expected={areaPart?.expected} t={t} />
        ) : null}
      </div>
    );
  }

  const shapeField = fieldStateClass(shapePart?.isCorrect);
  const perimeterField = fieldStateClass(perimeterPart?.isCorrect);
  const areaField = fieldStateClass(areaPart?.isCorrect);

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getShapeNameLabel(t)}
        </label>
        <input
          type="text"
          value={answer.shapeName ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            updateAnswer({
              shapeName: e.target.value,
            })
          }
          className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
              ? shapeField.input
              : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
            }`}
        />
        {showInlineFeedback ? (
          <FeedbackLine state={shapePart?.isCorrect} expected={shapePart?.expected} t={t} />
        ) : null}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getPerimeterAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={getPerimeterInputValue(answer)}
            placeholder={getNumberOnlyHelp(t)}
            disabled={readOnly}
            onChange={(e) =>
              updateAnswer({
                perimeterText: e.target.value,
                perimeterValue: toNullableNumber(e.target.value),
              })
            }
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
                ? perimeterField.input
                : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
              }`}
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
        {showInlineFeedback ? (
          <FeedbackLine state={perimeterPart?.isCorrect} expected={perimeterPart?.expected} t={t} />
        ) : null}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {getAreaAnswerLabel(t)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            disabled={readOnly}
            value={getAreaInputValue(answer)}
            placeholder={getNumberOnlyHelp(t)}
            onChange={(e) =>
              updateAnswer({
                areaText: e.target.value,
                areaValue: toNullableNumber(e.target.value),
              })
            }
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${showInlineFeedback
                ? areaField.input
                : "border-slate-300 bg-white text-slate-900 focus:border-slate-400"
              }`}
          />
          <span className="shrink-0 text-sm font-medium text-slate-600">cm²</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">{getNumberOnlyHelp(t)}</div>
        {showInlineFeedback ? (
          <FeedbackLine state={areaPart?.isCorrect} expected={areaPart?.expected} t={t} />
        ) : null}
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
  readOnly = false,
  showIdentityFields = false,
  showFigureMeta = true,
  includeHints = true,
  showExpectedAnswers = false,
  showExplanations = false,
  producerName,
  levelLabel,
  emptyStateKey = "generate",
  auto,
  showInlineFeedback = false,
}: {
  worksheet: MathWorksheet;
  t: TFn;
  tBrand: TFn;
  answersByTaskId?: GeometryPracticeAnswersByTaskId;
  onAnswerChange?: (taskId: string, patch: Partial<GeometryPracticeAnswer>) => void;
  readOnly?: boolean;
  showIdentityFields?: boolean;
  showFigureMeta?: boolean;
  includeHints?: boolean;
  showExpectedAnswers?: boolean;
  showExplanations?: boolean;
  producerName?: string;
  levelLabel?: string;
  emptyStateKey?: string;
  auto?: GeometryAutoLike | null;
  showInlineFeedback?: boolean;
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
                const result = showInlineFeedback ? getTaskResult(auto, task.id) : undefined;
                const taskCls = taskStatusClass(result?.status);

                return (
                  <article
                    key={task.id || String(idx)}
                    className={`rounded-3xl border bg-white p-5 shadow-sm ${showInlineFeedback ? taskCls.border : "border-slate-200"
                      }`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-slate-900">
                            {task.prompt}
                          </h3>
                        </div>
                      </div>

                      {showInlineFeedback ? (
                        <TaskBadge status={result?.status} t={t} />
                      ) : null}
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
                          readOnly,
                          t,
                          auto,
                          showInlineFeedback,
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

                        {showExplanations && task.explanation ? (
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