// components/generators/math/geometry/GeometryAutoCheckTaskList.tsx
"use client";

import type { MathWorksheet, MathWorksheetTask } from "@/lib/math/geometry/types";

type TFn = (key: string, values?: Record<string, unknown>) => string;

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

function stringifyValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fallback(label: string, fallbackText: string) {
  return label === fallbackText || label.includes(".") ? fallbackText : label;
}

function readExpectedFromTask(task: MathWorksheetTask, t?: TFn): string | null {
  if (!task.expected) return null;

  const labelShapeName = t ? fallback(t("shapeNameLabel"), "Shape name") : "Shape name";
  const labelPerimeter = t ? fallback(t("perimeter"), "Perimeter") : "Perimeter";
  const labelArea = t ? fallback(t("area"), "Area") : "Area";

  if (task.type === "shape_name") {
    return task.expected.shapeName ?? null;
  }

  if (task.type === "perimeter") {
    if (task.expected.perimeterValue == null) return null;
    return `${task.expected.perimeterValue} cm`;
  }

  if (task.type === "area") {
    if (task.expected.areaValue == null) return null;
    return `${task.expected.areaValue} cm²`;
  }

  const parts: string[] = [];

  if (task.expected.shapeName) {
    parts.push(`${labelShapeName}: ${task.expected.shapeName}`);
  }
  if (task.expected.perimeterValue != null) {
    parts.push(`${labelPerimeter}: ${task.expected.perimeterValue} cm`);
  }
  if (task.expected.areaValue != null) {
    parts.push(`${labelArea}: ${task.expected.areaValue} cm²`);
  }

  return parts.join(" | ") || null;
}

function readStudentAnswerRaw(
  answersByTaskId: Record<string, unknown> | undefined,
  taskId: string
): unknown {
  return answersByTaskId?.[taskId] ?? null;
}

function readStudentAnswerFallback(
  task: MathWorksheetTask,
  answersByTaskId: Record<string, unknown> | undefined,
  t?: TFn
): string | null {
  const raw = readStudentAnswerRaw(answersByTaskId, task.id);

  if (!isRecord(raw)) return null;

  const labelShapeName = t ? fallback(t("shapeNameLabel"), "Shape name") : "Shape name";
  const labelPerimeter = t ? fallback(t("perimeter"), "Perimeter") : "Perimeter";
  const labelArea = t ? fallback(t("area"), "Area") : "Area";

  if (task.type === "shape_name") {
    const value = raw.shapeName;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  if (task.type === "perimeter") {
    const value = raw.perimeterValue;
    return typeof value === "number" && Number.isFinite(value) ? `${value} cm` : null;
  }

  if (task.type === "area") {
    const value = raw.areaValue;
    return typeof value === "number" && Number.isFinite(value) ? `${value} cm²` : null;
  }

  const parts: string[] = [];

  if (typeof raw.shapeName === "string" && raw.shapeName.trim()) {
    parts.push(`${labelShapeName}: ${raw.shapeName.trim()}`);
  }
  if (typeof raw.perimeterValue === "number" && Number.isFinite(raw.perimeterValue)) {
    parts.push(`${labelPerimeter}: ${raw.perimeterValue} cm`);
  }
  if (typeof raw.areaValue === "number" && Number.isFinite(raw.areaValue)) {
    parts.push(`${labelArea}: ${raw.areaValue} cm²`);
  }

  return parts.join(" | ") || null;
}

function readStatus(
  result: GeometryTaskResultLike | undefined
): "correct" | "partial" | "wrong" | "unanswered" {
  if (result?.status === "correct") return "correct";
  if (result?.status === "partial") return "partial";
  if (result?.status === "wrong") return "wrong";
  if (result?.status === "unanswered") return "unanswered";

  if (result?.isCorrect === true) return "correct";
  if (result?.isCorrect === null) return "unanswered";
  if (typeof result?.score === "number" && result.score > 0) return "partial";
  if (result?.isCorrect === false) return "wrong";

  return "unanswered";
}

function resultTone(status: "correct" | "partial" | "wrong" | "unanswered") {
  if (status === "correct") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "wrong") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function resultLabel(
  status: "correct" | "partial" | "wrong" | "unanswered",
  t?: TFn
) {
  if (status === "correct") {
    return t ? fallback(t("correct"), "Correct") : "Correct";
  }
  if (status === "partial") {
    return t ? fallback(t("partialSingular"), "Partially correct") : "Partially correct";
  }
  if (status === "wrong") {
    return t ? fallback(t("wrong"), "Wrong") : "Wrong";
  }
  return t ? fallback(t("unanswered"), "Unanswered") : "Unanswered";
}

function partTone(isCorrect: boolean | null | undefined) {
  if (isCorrect === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (isCorrect === false) {
    return "border-red-200 bg-red-50 text-red-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function partLabel(isCorrect: boolean | null | undefined, t?: TFn) {
  if (isCorrect === true) {
    return t ? fallback(t("correct"), "Correct") : "Correct";
  }
  if (isCorrect === false) {
    return t ? fallback(t("wrong"), "Wrong") : "Wrong";
  }
  return t ? fallback(t("unanswered"), "Unanswered") : "Unanswered";
}

function readOrderedParts(
  result: GeometryTaskResultLike | undefined
): GeometryTaskPartLike[] {
  if (!isRecord(result?.parts)) return [];

  const parts = result.parts as Record<string, GeometryTaskPartLike | undefined>;

  return ["shapeName", "perimeter", "area"]
    .map((key) => parts[key])
    .filter((part): part is GeometryTaskPartLike => !!part);
}

export default function GeometryAutoCheckTaskList({
  worksheet,
  auto,
  answersByTaskId,
  t,
  title,
}: {
  worksheet: MathWorksheet;
  auto: GeometryAutoLike | null | undefined;
  answersByTaskId?: Record<string, unknown>;
  t?: TFn;
  title?: string;
}) {
  if (!worksheet?.tasks?.length) return null;

  const heading =
    title ||
    (t ? fallback(t("autoTaskResultsTitle"), "Results by task") : "Results by task");

  const labelTask = t ? fallback(t("task"), "Task") : "Task";
  const labelScore = t ? fallback(t("score"), "Score") : "Score";
  const labelExpected = t ? fallback(t("expectedAnswer"), "Expected answer") : "Expected answer";
  const labelStudent = t ? fallback(t("studentAnswer"), "Student answer") : "Student answer";
  const labelDetails = t ? fallback(t("details"), "Details") : "Details";
  const labelPart = t ? fallback(t("part"), "Part") : "Part";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{heading}</h2>

      <div className="grid gap-3">
        {worksheet.tasks.map((task, index) => {
          const taskId = task.id;
          const result = getTaskResult(auto, taskId);
          const status = readStatus(result);
          const expected = result?.expected ?? readExpectedFromTask(task, t);
          const studentAnswer =
            result?.studentAnswer ?? readStudentAnswerFallback(task, answersByTaskId, t);
          const percent =
            typeof result?.score === "number" && Number.isFinite(result.score)
              ? Math.round(result.score * 100)
              : null;
          const parts = readOrderedParts(result);

          return (
            <div
              key={task.id}
              className={`rounded-2xl border p-4 ${resultTone(status)}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {labelTask} {index + 1}
                  </div>
                  <div className="mt-1 text-sm">{task.prompt}</div>
                </div>

                <div className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold">
                  {resultLabel(status, t)}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm">
                <div>
                  <span className="font-semibold">{labelScore}:</span>{" "}
                  {percent != null ? `${percent} %` : "—"}
                </div>

                {parts.length > 0 ? (
                  <div className="mt-1">
                    <div className="mb-2 font-semibold">{labelDetails}:</div>

                    <div className="grid gap-2">
                      {parts.map((part, partIndex) => {
                        const label =
                          typeof part.label === "string" && part.label.trim()
                            ? part.label
                            : `${labelPart} ${partIndex + 1}`;

                        return (
                          <div
                            key={`${task.id}-part-${partIndex}`}
                            className={`rounded-xl border p-3 ${partTone(part.isCorrect)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="font-semibold">{label}</div>
                              <div className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-semibold">
                                {partLabel(part.isCorrect, t)}
                              </div>
                            </div>

                            <div className="mt-2 grid gap-1 text-sm">
                              <div>
                                <span className="font-semibold">{labelStudent}:</span>{" "}
                                <span className="whitespace-pre-wrap">
                                  {stringifyValue(part.actual)}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold">{labelExpected}:</span>{" "}
                                <span className="whitespace-pre-wrap">
                                  {stringifyValue(part.expected)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="font-semibold">{labelStudent}:</span>{" "}
                      <span className="whitespace-pre-wrap">
                        {stringifyValue(studentAnswer)}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold">{labelExpected}:</span>{" "}
                      <span className="whitespace-pre-wrap">
                        {stringifyValue(expected)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}