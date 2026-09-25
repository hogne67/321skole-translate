"use client";

import type { ArithmeticTask, ArithmeticWorksheet } from "@/lib/math/arithmetic/types";

type AnswersByTaskId = Record<string, unknown>;

function operationSymbol(operation: ArithmeticTask["operation"]) {
  if (operation === "addition") return "+";
  if (operation === "subtraction") return "-";
  if (operation === "multiplication") return "×";
  return "÷";
}

function taskId(task: ArithmeticTask, index: number) {
  return String(task.id || `task-${index + 1}`);
}

function answerToString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function DotGroup({
  count,
  tone = "primary",
}: {
  count: number;
  tone?: "primary" | "secondary";
}) {
  const safeCount = Math.max(0, Math.min(40, Math.round(count)));
  const dotClass =
    tone === "primary"
      ? "border-sky-700 bg-sky-500"
      : "border-emerald-700 bg-emerald-500";

  return (
    <div className="grid grid-cols-10 gap-1.5">
      {Array.from({ length: safeCount }).map((_, index) => (
        <span
          key={index}
          className={`h-3 w-3 rounded-full border ${dotClass}`}
        />
      ))}
    </div>
  );
}

function AnswerInput({
  id,
  value,
  readOnly,
  onAnswerChange,
}: {
  id: string;
  value: unknown;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={answerToString(value)}
      readOnly={readOnly}
      onChange={(event) => onAnswerChange?.(id, event.target.value)}
      className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
      placeholder="Svar"
    />
  );
}

function GridTask({
  task,
  index,
  answers,
  readOnly,
  onAnswerChange,
}: {
  task: ArithmeticTask;
  index: number;
  answers: AnswersByTaskId;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  const id = taskId(task, index);

  return (
    <div className="grid grid-cols-[2rem_1fr_5.5rem] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-black text-slate-500">{index + 1}</div>
      <div className="text-right text-base font-black text-slate-950">
        {task.expression} =
      </div>
      <AnswerInput
        id={id}
        value={answers[id]}
        readOnly={readOnly}
        onAnswerChange={onAnswerChange}
      />
    </div>
  );
}

function VerticalTask({
  task,
  index,
  answers,
  readOnly,
  onAnswerChange,
}: {
  task: ArithmeticTask;
  index: number;
  answers: AnswersByTaskId;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  const id = taskId(task, index);
  const symbol = operationSymbol(task.operation);
  const maxDigits = Math.max(
    String(task.left).length,
    String(task.right).length,
    String(task.answer).length
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
          {index + 1}
        </div>
      </div>
      <div
        className="mx-auto grid w-fit gap-1 font-mono text-2xl font-black leading-none text-slate-950"
        style={{ minWidth: `${Math.max(4, maxDigits + 2)}ch` }}
      >
        <div className="text-right">{task.left}</div>
        <div className="grid grid-cols-[1.5ch_1fr] gap-1 border-b-2 border-slate-950 pb-1">
          <span>{symbol}</span>
          <span className="text-right">{task.right}</span>
        </div>
      </div>
      <div className="mt-4">
        <AnswerInput
          id={id}
          value={answers[id]}
          readOnly={readOnly}
          onAnswerChange={onAnswerChange}
        />
      </div>
    </article>
  );
}

function VisualTask({
  task,
  index,
  answers,
  readOnly,
  onAnswerChange,
}: {
  task: ArithmeticTask;
  index: number;
  answers: AnswersByTaskId;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  const id = taskId(task, index);
  const showSecondGroup =
    task.operation === "addition" || task.operation === "subtraction";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
          {index + 1}
        </div>
        <div className="text-lg font-black text-slate-950">
          {task.expression} =
        </div>
      </div>
      <div className="grid gap-3 rounded-2xl bg-slate-50 p-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <DotGroup count={task.left} />
        </div>
        {showSecondGroup ? (
          <>
            <div className="text-center text-xl font-black text-slate-700">
              {operationSymbol(task.operation)}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <DotGroup count={task.right} tone="secondary" />
            </div>
          </>
        ) : null}
      </div>
      <div className="mt-3">
        <AnswerInput
          id={id}
          value={answers[id]}
          readOnly={readOnly}
          onAnswerChange={onAnswerChange}
        />
      </div>
    </article>
  );
}

export default function ArithmeticWorksheetStudentView({
  worksheet,
  answersByTaskId,
  onAnswerChange,
  readOnly = false,
}: {
  worksheet: ArithmeticWorksheet;
  answersByTaskId?: AnswersByTaskId;
  onAnswerChange?: (taskId: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const answers = answersByTaskId ?? {};

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
          321school matematikk
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
          {worksheet.title}
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {worksheet.instructions}
        </p>
      </div>

      {worksheet.layout === "grid" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {worksheet.tasks.map((task, index) => (
            <GridTask
              key={task.id || index}
              task={task}
              index={index}
              answers={answers}
              readOnly={readOnly}
              onAnswerChange={onAnswerChange}
            />
          ))}
        </div>
      ) : worksheet.layout === "vertical" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {worksheet.tasks.map((task, index) => (
            <VerticalTask
              key={task.id || index}
              task={task}
              index={index}
              answers={answers}
              readOnly={readOnly}
              onAnswerChange={onAnswerChange}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {worksheet.tasks.map((task, index) => (
            <VisualTask
              key={task.id || index}
              task={task}
              index={index}
              answers={answers}
              readOnly={readOnly}
              onAnswerChange={onAnswerChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}
