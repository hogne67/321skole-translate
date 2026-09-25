"use client";

import type { RefObject } from "react";
import type {
  ArithmeticTask,
  ArithmeticWorksheet,
} from "@/lib/math/arithmetic/types";

type TFn = (key: string) => string;

function fallbackT(t: TFn | undefined, key: string, fallback: string) {
  if (!t) return fallback;
  const value = t(key);
  return value === key ? fallback : value;
}

function operationSymbol(operation: ArithmeticTask["operation"]) {
  if (operation === "addition") return "+";
  if (operation === "subtraction") return "-";
  if (operation === "multiplication") return "×";
  return "÷";
}

function renderDots(count: number, tone: "primary" | "secondary" = "primary") {
  const safeCount = Math.max(0, Math.min(40, Math.round(count)));
  const dotClass =
    tone === "primary"
      ? "border-sky-700 bg-sky-500"
      : "border-emerald-700 bg-emerald-500";

  return (
    <div className="arithmetic-dot-grid grid grid-cols-10 gap-1.5">
      {Array.from({ length: safeCount }).map((_, index) => (
        <span
          key={index}
          className={`arithmetic-dot h-3 w-3 rounded-full border ${dotClass}`}
        />
      ))}
    </div>
  );
}

function VerticalTask({ task, index }: { task: ArithmeticTask; index: number }) {
  const symbol = operationSymbol(task.operation);
  const maxDigits = Math.max(
    String(task.left).length,
    String(task.right).length,
    String(task.answer).length
  );

  return (
    <article className="arithmetic-vertical-task break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <div className="arithmetic-vertical-head mb-3 flex items-center justify-between gap-3">
        <div className="arithmetic-vertical-index flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {index + 1}
        </div>
        <div className="arithmetic-vertical-expression text-xs font-semibold text-slate-500">
          {task.expression}
        </div>
      </div>
      <div
        className="arithmetic-vertical-stack mx-auto grid w-fit gap-1 font-mono text-2xl font-bold leading-none text-slate-950"
        style={{ minWidth: `${Math.max(4, maxDigits + 2)}ch` }}
      >
        <div className="text-right">{task.left}</div>
        <div className="arithmetic-vertical-line grid grid-cols-[1.5ch_1fr] gap-1 border-b-2 border-slate-900 pb-1">
          <span>{symbol}</span>
          <span className="text-right">{task.right}</span>
        </div>
        <div className="arithmetic-vertical-answer h-10 border-b border-dashed border-slate-300" />
      </div>
    </article>
  );
}

function VisualTask({ task, index }: { task: ArithmeticTask; index: number }) {
  const symbol = operationSymbol(task.operation);
  const showSecondGroup =
    task.operation === "addition" || task.operation === "subtraction";

  return (
    <article className="arithmetic-visual-task break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <div className="arithmetic-visual-head mb-3 flex items-start gap-3">
        <div className="arithmetic-visual-index flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {index + 1}
        </div>
        <div>
          <h4 className="arithmetic-visual-expression text-base font-bold text-slate-950">
            {task.prompt}
          </h4>
        </div>
      </div>

      <div className="arithmetic-visual-model grid gap-3 rounded-2xl bg-slate-50 p-3">
        <div className="arithmetic-visual-group rounded-xl border border-slate-200 bg-white p-3">
          {renderDots(task.left)}
        </div>
        {showSecondGroup ? (
          <>
            <div className="arithmetic-visual-symbol text-center text-xl font-black text-slate-700">
              {symbol}
            </div>
            <div className="arithmetic-visual-group rounded-xl border border-slate-200 bg-white p-3">
              {renderDots(task.right, "secondary")}
            </div>
          </>
        ) : null}
      </div>

      <div className="arithmetic-visual-answer mt-3 min-h-12 rounded-xl border border-dashed border-slate-300 bg-white p-3">
        <span className="text-sm font-semibold text-slate-500">Svar:</span>
      </div>
    </article>
  );
}

function GridTask({ task, index }: { task: ArithmeticTask; index: number }) {
  return (
    <div className="arithmetic-grid-task grid min-h-10 grid-cols-[2.5rem_6.25rem_2.75rem_1fr] items-center border-b border-r border-slate-200 text-sm">
      <div className="arithmetic-grid-index border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-500">
        {index + 1}
      </div>
      <div className="arithmetic-grid-expression py-2 pl-3 pr-1 text-right font-semibold text-slate-950">
        {task.expression} =
      </div>
      <div className="arithmetic-grid-answer h-full border-l border-dashed border-slate-200" />
    </div>
  );
}

export default function ArithmeticWorksheetView({
  worksheet,
  printRef,
  t,
  tBrand,
  showIdentityFields = true,
}: {
  worksheet: ArithmeticWorksheet;
  printRef?: RefObject<HTMLDivElement | null>;
  t?: TFn;
  tBrand?: TFn;
  showIdentityFields?: boolean;
}) {
  const worksheetLabel = fallbackT(t, "worksheet", "Arbeidsark");
  const answerKeyTitle = fallbackT(t, "answerKeyTitle", "Fasit");
  const nameLabel = fallbackT(t, "name", "Navn");
  const dateLabel = fallbackT(t, "date", "Dato");
  const classLabel = fallbackT(t, "classLabel", "Klasse");
  const answerLabel = fallbackT(t, "answer", "Svar");
  const schoolLabel = fallbackT(tBrand, "school", "skole");

  return (
    <div
      ref={printRef}
      className="arithmetic-print-root mx-auto max-w-[980px] bg-white text-slate-900"
    >
      <div className="arithmetic-print-card">
        <div className="arithmetic-brandbar mb-5 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/logo321ny.png"
              alt={`321 ${schoolLabel}`}
              className="arithmetic-brandlogo h-12 w-auto shrink-0 object-contain"
            />
            <div className="min-w-0">
              <div className="arithmetic-brandtitle text-lg font-extrabold text-slate-950">
                321 {schoolLabel}
              </div>
              <div className="arithmetic-brandsite text-xs font-semibold text-slate-500">
                321school.com
              </div>
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
            {worksheetLabel}
          </div>
        </div>

        <section className="arithmetic-title-wrap mb-6 border-b border-slate-200 pb-5">
          <h2 className="arithmetic-title text-2xl font-black tracking-tight text-slate-950">
            {worksheet.title}
          </h2>
          <p className="arithmetic-instructions mt-2 text-sm font-semibold leading-6 text-slate-600">
            {worksheet.instructions}
          </p>

          {showIdentityFields ? (
            <div className="arithmetic-identity-grid mt-4 grid gap-3 sm:grid-cols-2">
              <div className="arithmetic-identity-box rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold">{nameLabel}:</span>
              </div>
              <div className="arithmetic-identity-box rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold">{dateLabel}:</span>
              </div>
              <div className="arithmetic-identity-box rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:col-span-2">
                <span className="font-semibold">{classLabel}:</span>
              </div>
            </div>
          ) : null}
        </section>

        {worksheet.layout === "grid" ? (
          <div className="arithmetic-grid grid overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {worksheet.tasks.map((task, index) => (
              <GridTask key={task.id || index} task={task} index={index} />
            ))}
          </div>
        ) : worksheet.layout === "vertical" ? (
          <div className="arithmetic-vertical-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worksheet.tasks.map((task, index) => (
              <VerticalTask key={task.id || index} task={task} index={index} />
            ))}
          </div>
        ) : (
          <div className="arithmetic-visual-grid grid gap-4 sm:grid-cols-2">
            {worksheet.tasks.map((task, index) => (
              <VisualTask key={task.id || index} task={task} index={index} />
            ))}
          </div>
        )}

        {worksheet.showAnswerKey ? (
          <section className="mt-10 border-t-2 border-slate-300 pt-8">
            <h3 className="mb-4 text-2xl font-black text-slate-950">
              {answerKeyTitle}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {worksheet.tasks.map((task, index) => (
                <div
                  key={`answer-${task.id || index}`}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950"
                >
                  {index + 1}. {answerLabel}: {task.answer}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
