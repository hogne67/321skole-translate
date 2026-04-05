// components/generators/math/geometry/GeometryWorksheetView.tsx
"use client";

import type { RefObject } from "react";
import GeometryFigure from "@/components/generators/math/geometry/GeometryFigure";
import FigureMeta from "@/components/generators/math/geometry/FigureMeta";
import type { MathWorksheet, MathWorksheetTask } from "@/lib/math/geometry/types";

type TFn = (key: string) => string;
type AnswerSpace = "small" | "medium" | "large";
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

function answerSpaceClass(answerSpace: AnswerSpace): string {
  if (answerSpace === "small") return "min-h-[40px]";
  if (answerSpace === "large") return "min-h-[110px]";
  return "min-h-[72px]";
}

function isRawTranslationKey(value: string, key: string) {
  return value === key || value === `mathGeometry.${key}`;
}

function getEmptyStateLabel(t: TFn, emptyStateKey: string) {
  const key = `emptyStates.${emptyStateKey}`;
  const value = t(key);
  return isRawTranslationKey(value, key)
    ? "Generate a geometry worksheet to see a preview."
    : value;
}

function formatAnswerKeyAnswer(task: MathWorksheetTask, t: TFn) {
  if (task.type === "all_in_one") return task.answer;
  if (task.type === "shape_name") return `${t("shapeNameLabel")}: ${task.answer}`;
  return task.answer;
}

export default function GeometryWorksheetView({
  worksheet,
  answerSpace,
  includeHints,
  t,
  tBrand,
  printRef,
  producerName,
  levelLabel,
  showIdentityFields = true,
  showFigureMeta = true,
  emptyStateKey = "generate",
}: {
  worksheet: MathWorksheet;
  answerSpace: AnswerSpace;
  includeHints: boolean;
  t: TFn;
  tBrand: TFn;
  printRef?: RefObject<HTMLDivElement | null>;
  producerName?: string;
  levelLabel?: string;
  showIdentityFields?: boolean;
  showFigureMeta?: boolean;
  emptyStateKey?: string;
}) {
  const tMeasurement = (key: MeasurementKey) => {
    const rawKey = `measurements.${key}`;
    const measurementValue = t(rawKey);
    return isRawTranslationKey(measurementValue, rawKey) ? key : measurementValue;
  };

  return (
    <div
      ref={printRef}
      className="print-root mx-auto max-w-[820px] bg-white text-slate-900 print:max-w-none"
    >
      <div className="print-card">
        <div className="print-brandbar">
          <div className="print-brandleft">
            <img
              src="/logo321ny.png"
              alt={`321 ${tBrand("school")}`}
              className="print-brandlogo"
            />
            <div className="print-brandtext">
              <div className="print-brandtitle">321 {tBrand("school")}</div>
              <div className="print-brandsite">321school.com</div>
            </div>
          </div>

          <div className="print-badge">{t("worksheet")}</div>
        </div>

        <div className="print-title-wrap">
          <div className="print-top-row">
            <div>
              <h3 className="print-title">{worksheet.title}</h3>
              <p className="print-instructions">{worksheet.instructions}</p>

              {(producerName || levelLabel) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {producerName ? (
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {t("producer")}: {producerName}
                    </div>
                  ) : null}

                  {levelLabel ? (
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {t("level")}: {levelLabel}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {showIdentityFields ? (
            <div className="print-meta-grid">
              <div className="print-meta-box">
                <span className="font-medium">{t("name")}:</span>
              </div>
              <div className="print-meta-box">
                <span className="font-medium">{t("date")}:</span>
              </div>
              <div className="print-meta-box sm:col-span-2">
                <span className="font-medium">{t("classLabel")}:</span>
              </div>
            </div>
          ) : null}
        </div>

        {worksheet.tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            {getEmptyStateLabel(t, emptyStateKey)}
          </div>
        ) : (
          <>
            <div className="print-task-list">
              {worksheet.tasks.map((task, idx) => (
                <article key={task.id || String(idx)} className="print-task">
                  <div className="print-task-head">
                    <div className="print-task-num">{idx + 1}</div>
                    <div className="min-w-0">
                      <h4 className="print-task-prompt">{task.prompt}</h4>
                    </div>
                  </div>

                  <div className="print-task-grid">
                    <div className="print-figure-box">
                      <GeometryFigure
                        figure={task.figure}
                        className="h-36 w-full max-w-[260px]"
                      />
                      {showFigureMeta ? (
                        <FigureMeta
                          figure={task.figure}
                          tMeasurement={tMeasurement}
                        />
                      ) : null}
                    </div>

                    <div>
                      <div className={`print-answer-box ${answerSpaceClass(answerSpace)}`}>
                        <span className="print-answer-label">{t("answer")}:</span>
                      </div>

                      {worksheet.showFormulas && task.formula ? (
                        <div className="print-formula">
                          <span className="print-strong">{t("formula")}:</span>
                          <div className="print-pre">{task.formula}</div>
                        </div>
                      ) : null}

                      {includeHints && task.hint ? (
                        <div className="print-hint">
                          <span className="print-strong">{t("hint")}:</span> {task.hint}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {worksheet.showAnswerKey ? (
              <section className="mt-10 border-t-2 border-slate-300 pt-8">
                <div className="print-page-break" />
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-slate-900">
                    {t("answerKeyTitle")}
                  </h3>
                </div>

                <div className="print-task-list">
                  {worksheet.tasks.map((task, idx) => (
                    <article
                      key={`answer-key-${task.id || idx}`}
                      className="print-task"
                      style={{ background: "#ecfdf5" }}
                    >
                      <div className="print-task-head">
                        <div className="print-task-num">{idx + 1}</div>
                        <div className="min-w-0">
                          <h4 className="print-task-prompt">
                            {t("taskLabel")} {idx + 1}
                          </h4>
                          <p className="mt-1 text-sm text-slate-700">{task.prompt}</p>
                        </div>
                      </div>

                      <div className="print-task-grid">
                        <div className="print-figure-box" style={{ background: "#fff" }}>
                          <GeometryFigure
                            figure={task.figure}
                            className="h-36 w-full max-w-[260px]"
                          />
                          {showFigureMeta ? (
                            <FigureMeta
                              figure={task.figure}
                              tMeasurement={tMeasurement}
                            />
                          ) : null}
                        </div>

                        <div>
                          <div className="print-answer-key">
                            <span className="print-strong">{t("answer")}:</span>{" "}
                            <span className="print-pre">
                              {formatAnswerKeyAnswer(task, t)}
                            </span>
                          </div>

                          {task.formula ? (
                            <div className="print-formula">
                              <span className="print-strong">{t("formula")}:</span>{" "}
                              <span className="print-pre">{task.formula}</span>
                            </div>
                          ) : null}

                          {task.explanation ? (
                            <div className="print-explanation">
                              <span className="print-strong">{t("explanation")}:</span>{" "}
                              {task.explanation}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}