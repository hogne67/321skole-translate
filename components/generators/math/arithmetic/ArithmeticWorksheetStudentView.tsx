"use client";

import MathText from "@/components/generators/math/MathTextSupport";

import type { ArithmeticTask, ArithmeticWorksheet } from "@/lib/math/arithmetic/types";
import { normalizeArithmeticTask } from "@/lib/math/arithmetic/normalizeTask";
import { VISUAL_DOT_LIMIT, VISUAL_GROUP_LIMIT } from "@/lib/math/arithmetic/visualLimits";

type AnswersByTaskId = Record<string, unknown>;

function operationSymbol(operation: ArithmeticTask["operation"]) {
  if (operation === "addition") return "+";
  if (operation === "subtraction") return "-";
  if (operation === "multiplication") return "×";
  return "÷";
}

function taskDisplay(task: ArithmeticTask) {
  return task.unknownPosition ? task.prompt : `${task.expression} =`;
}

function MissingAnswerExpression({
  task,
  id,
  value,
  readOnly,
  onAnswerChange,
}: {
  task: ArithmeticTask;
  id: string;
  value: unknown;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  const [before, after] = task.prompt.split("□");

  return (
    <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
      <span>{before}</span>
      <input
        type="text"
        inputMode="numeric"
        value={answerToString(value)}
        readOnly={readOnly}
        onChange={(event) => onAnswerChange?.(id, event.target.value)}
        className="h-9 w-16 rounded-lg border border-dashed border-slate-300 bg-white px-2 text-center text-base font-black text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        aria-label="Svar"
      />
      <span>{after}</span>
    </span>
  );
}

function taskResult(task: ArithmeticTask) {
  if (task.operation === "addition") return task.left + task.right;
  if (task.operation === "subtraction") return task.left - task.right;
  if (task.operation === "multiplication") return task.left * task.right;
  return task.right === 0 ? 0 : task.left / task.right;
}

function MissingVerticalAnswerStack({
  task,
  id,
  value,
  readOnly,
  onAnswerChange,
}: {
  task: ArithmeticTask;
  id: string;
  value: unknown;
  readOnly: boolean;
  onAnswerChange?: (taskId: string, value: unknown) => void;
}) {
  const symbol = operationSymbol(task.operation);
  const result = taskResult(task);
  const input = (
    <input
      type="text"
      inputMode="numeric"
      value={answerToString(value)}
      readOnly={readOnly}
      onChange={(event) => onAnswerChange?.(id, event.target.value)}
      className="h-9 w-16 rounded-lg border border-dashed border-slate-300 bg-white px-2 text-center text-base font-black text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      aria-label="Svar"
    />
  );

  return (
    <div
      className="mx-auto grid w-fit gap-1 font-mono text-2xl font-black leading-none text-slate-950"
      style={{ minWidth: "5ch" }}
    >
      <div className="text-right">
        {task.unknownPosition === "left" ? input : task.left}
      </div>
      <div className="grid grid-cols-[1.5ch_1fr] gap-1 border-b-2 border-slate-950 pb-1">
        <span>{symbol}</span>
        <span className="text-right">
          {task.unknownPosition === "right" ? input : task.right}
        </span>
      </div>
      <div className="grid grid-cols-[1.5ch_1fr] gap-1">
        <span>=</span>
        <span className="text-right">{result}</span>
      </div>
    </div>
  );
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
  const safeCount = Math.max(0, Math.min(VISUAL_DOT_LIMIT, Math.round(count)));
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

function MultiplicationModel({ task }: { task: ArithmeticTask }) {
  const groups = Math.max(0, Math.min(VISUAL_GROUP_LIMIT, Math.round(task.left)));
  const dotsPerGroup = Math.max(0, Math.min(VISUAL_GROUP_LIMIT, Math.round(task.right)));

  return (
    <div className="grid gap-2">
      {Array.from({ length: groups }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <DotGroup
            count={dotsPerGroup}
            tone={index % 2 === 0 ? "primary" : "secondary"}
          />
        </div>
      ))}
      {groups === 0 ? (
        <div className="min-h-10 rounded-xl border border-slate-200 bg-white p-3" />
      ) : null}
    </div>
  );
}

function DivisionModel({ task }: { task: ArithmeticTask }) {
  const divisor = Math.max(1, Math.round(task.right));
  const quotient = Math.max(0, Math.min(VISUAL_GROUP_LIMIT, Math.round(task.answer)));

  return (
    <div className="grid gap-2">
      {Array.from({ length: quotient }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <DotGroup
            count={divisor}
            tone={index % 2 === 0 ? "primary" : "secondary"}
          />
        </div>
      ))}
      {quotient === 0 ? (
        <div className="min-h-10 rounded-xl border border-slate-200 bg-white p-3" />
      ) : null}
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

  if (task.unknownPosition) {
    return (
      <div className="grid grid-cols-[2rem_1fr] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-black text-slate-500">{index + 1}</div>
        <div className="text-right text-base font-black text-slate-950">
          <MissingAnswerExpression
            task={task}
            id={id}
            value={answers[id]}
            readOnly={readOnly}
            onAnswerChange={onAnswerChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[2rem_1fr_5.5rem] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-black text-slate-500">{index + 1}</div>
      <div className="text-right text-base font-black text-slate-950">
        {taskDisplay(task)}
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
      {task.unknownPosition ? (
        <MissingVerticalAnswerStack
          task={task}
          id={id}
          value={answers[id]}
          readOnly={readOnly}
          onAnswerChange={onAnswerChange}
        />
      ) : (
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
      )}
      {!task.unknownPosition ? (
        <div className="mt-4">
          <AnswerInput
            id={id}
            value={answers[id]}
            readOnly={readOnly}
            onAnswerChange={onAnswerChange}
          />
        </div>
      ) : null}
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
  const showSingleGroup =
    task.operation === "addition" || task.operation === "subtraction";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
          {index + 1}
        </div>
        <div className="text-lg font-black text-slate-950">
          {task.unknownPosition ? (
            <MissingAnswerExpression
              task={task}
              id={id}
              value={answers[id]}
              readOnly={readOnly}
              onAnswerChange={onAnswerChange}
            />
          ) : (
            taskDisplay(task)
          )}
        </div>
      </div>
      {!task.unknownPosition ? (
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-3">
          {showSingleGroup ? (
            <>
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
            </>
          ) : task.operation === "multiplication" ? (
            <MultiplicationModel task={task} />
          ) : (
            <DivisionModel task={task} />
          )}
        </div>
      ) : null}
      <div className="mt-3">
        {task.unknownPosition ? null : (
          <AnswerInput
            id={id}
            value={answers[id]}
            readOnly={readOnly}
            onAnswerChange={onAnswerChange}
          />
        )}
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
  const tasks = worksheet.tasks.map(normalizeArithmeticTask);

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
          <MathText text={worksheet.instructions} />
        </p>
      </div>

      {worksheet.layout === "grid" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {tasks.map((task, index) => (
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
          {tasks.map((task, index) => (
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
          {tasks.map((task, index) => (
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
