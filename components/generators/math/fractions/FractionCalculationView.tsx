"use client";

import MathText from "@/components/generators/math/MathTextSupport";

import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import { getCalculationCopy } from "@/lib/math/fractions/calculationCopy";
import { gradeFractionWorksheet } from "@/lib/math/fractions/gradeWorksheet";
import { FRACTION_CALCULATION_SYMBOLS } from "@/lib/math/fractions/calculationOperations";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import FractionDisplay from "./FractionDisplay";
import FractionInput from "./FractionInput";
import "./fractionCalculation.css";

export default function FractionCalculationView({ worksheet, answers, onAnswerChange, readOnly, showAutoCheck, printMode, showIdentityFields, showAnswerKey, printRef, embedded }: {
  worksheet: FractionWorksheet; answers: Record<string, unknown>;
  onAnswerChange: (id: string, value: string) => void;
  readOnly: boolean; showAutoCheck: boolean; printMode: boolean;
  showIdentityFields: boolean; showAnswerKey: boolean;
  printRef?: React.RefObject<HTMLDivElement | null>; embedded: boolean;
}) {
  const copy = getFractionCopy(worksheet.language), calc = getCalculationCopy(worksheet.language);
  const grade = gradeFractionWorksheet(worksheet, answers);
  return <div ref={printRef} className={`fraction-worksheet fraction-calculation ${printMode ? "print-root" : ""}`}>
    <header className="fraction-worksheet-header pb-5">
      {!embedded ? <div className="fraction-worksheet-brand mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><img src="/logo321ny.png" alt={`321 ${copy.school}`} className="h-12 w-auto" /><div><div className="text-lg font-extrabold">321 {copy.school}</div><div className="text-xs font-semibold text-slate-500">321school.com</div></div></div>
        <span className="rounded-lg bg-slate-50 px-3 py-1 text-xs text-slate-600">{copy.worksheet}</span>
      </div> : null}
      <h2 className="text-2xl font-bold">{worksheet.title}</h2>
      <p className="mt-2 text-sm text-slate-600"><MathText text={worksheet.calculation?.requireReduced ? calc.reducedInstructions : calc.instructions} /></p>
      {showIdentityFields ? <div className="fraction-worksheet-identity mt-5 grid grid-cols-2 gap-2">
        {[copy.name, copy.date, copy.classLabel].map((label, index) => <div key={label} className={`rounded-lg bg-slate-50 px-3 py-2 text-xs ${index === 2 ? "col-span-2" : ""}`}>{label}:</div>)}
      </div> : null}
    </header>
    {showAutoCheck && !printMode ? <div className="mb-5 border-b border-slate-200 pb-3 text-sm text-slate-600" role="status">
      {copy.correct}: {grade.correctAuto} · {calc.partial}: {grade.partialAuto} · {calc.wrong}: {grade.wrongAuto} · {calc.unanswered}: {grade.unansweredAuto} · {calc.score}: {grade.percentAuto ?? 0}%
    </div> : null}
    <div className="fraction-calculation-tasks">
      {worksheet.tasks.map((task, index) => {
        const id = task.id || `task-${index}`, result = grade.byTask[id], value = typeof answers[id] === "string" ? answers[id] as string : "";
        const feedback = !showAutoCheck || !result.hasAnswer || printMode ? null : result.isCorrect ? copy.correct : result.isPartial ? calc.reduceFeedback : copy.tryAgain;
        return <article key={id} className="fraction-calculation-task">
          <div className="fraction-calculation-expression">
            <span className="fraction-calculation-number">{index + 1}</span>
            {task.calculation ? <><FractionDisplay fraction={task.calculation.left} size="sm" /><span className="font-bold" data-operation={task.calculation.operation}>{FRACTION_CALCULATION_SYMBOLS[task.calculation.operation]}</span><FractionDisplay fraction={task.calculation.right} size="sm" /><span className="font-bold">=</span></> : <span>{task.prompt}</span>}
            {printMode ? <div className="fraction-calculation-blank" aria-label={copy.answer}><div /><span /><div /></div> : <FractionInput
              value={value} disabled={readOnly} language={worksheet.language} compact
              label={`${copy.task} ${index + 1}: ${calc.answerLabel}`}
              onChange={value => onAnswerChange(id, value)}
            />}
          </div>
          {feedback ? <div className={`fraction-calculation-feedback ${result.isCorrect ? "text-emerald-700" : result.isPartial ? "text-amber-800" : "text-red-700"}`}>
            {feedback}{result.isPartial ? " (50%)" : null}
            {readOnly && !result.isCorrect ? <span className="mt-1 flex items-center gap-2"><span>{copy.answer}:</span><FractionDisplay value={result.correctAnswer} size="sm" /></span> : null}
          </div> : null}
        </article>;
      })}
    </div>
    {showAnswerKey ? <section className="fraction-answer-key mt-8 border-t-2 border-slate-300 pt-6">
      <h3 className="mb-5 text-xl font-bold">{copy.answerKeyTitle}</h3>
      <div className="grid gap-4 sm:grid-cols-3">{worksheet.tasks.map((task, index) => <div key={task.id} className="flex items-center gap-3 border-b border-slate-200 pb-2"><span className="text-xs font-semibold">{index + 1}.</span><FractionDisplay value={grade.byTask[task.id || `task-${index}`].correctAnswer} size="sm" /></div>)}</div>
    </section> : null}
  </div>;
}
