"use client";
import type { ReactNode, Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { equationLeft, equationNumerator, equationRight, equationPrompt, equationSteps, formatEquationNumber, getEquationCopy, gradeEquationTask, gradeEquationWorksheet, readEquationAnswer, equationTasksPerPage, OPERATIONS, type EquationAnswer, type EquationStepAnswer, type EquationTask, type EquationWorksheet } from "@/lib/math/equations/worksheet";
import "../length/length.css";
import "./equations.css";

const symbols = { "+": "+", "-": "−", "*": "×", "/": "÷" };
function FractionRow({ top, bottom }: { top: ReactNode; bottom: ReactNode }) { return <span className="equation-fraction"><span>{top}</span><span>{bottom}</span></span>; }
function AppliedOperation({ source, operation, operand, operandType, paper = false }: { source: ReactNode; operation: string; operand: string; operandType?: string; paper?: boolean }) {
  const term = `${operand}${operandType === "x" ? "x" : ""}`;
  const value = paper || !operand ? <><span className="equation-small-blank" />{operandType === "x" ? "x" : null}</> : operand.startsWith("-") ? `(${term})` : term;
  return operation === "/" ? <FractionRow top={source} bottom={<span className="equation-applied">{value}</span>} /> : <span>{operation === "*" ? <>({source})</> : source}<span className="equation-applied"> {operation === "*" ? "×" : operation === "-" ? "−" : operation === "+" ? "+" : <span className="equation-symbol-blank" />} {value}</span></span>;
}
export default function EquationWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: EquationWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: EquationAnswer) => void; readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const copy = getEquationCopy(worksheet.language), common = getMeasurementCopy(worksheet.language), grade = gradeEquationWorksheet(worksheet, answersByTaskId), perPage = equationTasksPerPage(worksheet.settings);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / perPage) }, (_, i) => worksheet.tasks.slice(i * perPage, (i + 1) * perPage));
  const format = (value: number) => formatEquationNumber(value, worksheet.language);
  const originalEquation = (task: EquationTask) => task.type === "divide" ? <FractionRow top="x" bottom={task.coefficient} /> : task.type === "fraction" ? <FractionRow top={equationNumerator(task, worksheet.language)} bottom={task.denominator} /> : equationLeft(task, worksheet.language);
  const variable = (coefficient: ReactNode, constant: number | string = 0) => <span className="equation-linear">{coefficient === 1 || coefficient === "1" ? null : coefficient}x{constant === 0 ? null : typeof constant === "number" ? ` ${constant > 0 ? "+" : "−"} ${format(Math.abs(constant))}` : <>{constant.startsWith("-") ? " − " : " + "}{constant ? constant.replace(/^-/, "").replace(".", worksheet.language === "en" ? "." : ",") : <span className="equation-small-blank" />}</>}</span>;
  return <div ref={printRef} className={`length-sheet equation-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks">{tasks.map((task, index) => {
        const number = page * perPage + index + 1, answer = readEquationAnswer(answersByTaskId[task.id], task), steps = equationSteps(task), result = gradeEquationTask(task, answer);
        const original = originalEquation(task);
        const update = (i: number, field: keyof EquationStepAnswer, value: string) => onAnswerChange?.(task.id, { steps: answer.steps.map((s, j) => j === i ? { ...s, [field]: value } : s) });
        const slot = (i: number, field: "operand" | "right" | "coefficient" | "constant", label: string) => printMode ? <span className="equation-blank" aria-label={label} /> : <input type="text" inputMode={worksheet.settings.allowNegative || field === "constant" ? "text" : "decimal"} autoComplete="off" maxLength={18} title={label} aria-label={`${common.task} ${number}, ${copy.step} ${i + 1}: ${label}`} value={answer.steps[i][field] ?? ""} readOnly={readOnly} onChange={e => update(i, field, e.target.value)} />;
        const carriesLine = task.type === "both_sides" || task.type === "parentheses";
        const writtenConstant = task.type === "parentheses" ? printMode ? "" : answer.steps[0].constant ?? "" : task.constant;
        return <div className={`length-task equation-task${carriesLine || task.type === "fraction" ? " equation-both-task" : ""}`} data-task-type={task.type} key={task.id}>
          <div className="equation-heading"><span className="length-number">{number}</span><div className="equation-original">{original}<span>=</span><span>{equationRight(task, worksheet.language)}</span></div></div>
          {!printMode ? <div className="equation-text-support"><MathText text={equationPrompt(task, worksheet.language)} hideOriginal /></div> : null}
          {steps.map((step, i) => {
            const a = answer.steps[i], writtenCoefficient = !printMode && answer.steps[0].coefficient || <span className="equation-small-blank" />;
            const sourceLeft = i === 0 ? original : carriesLine ? variable(writtenCoefficient, i === 1 ? writtenConstant : 0) : variable(steps[i - 1].coefficient, steps[i - 1].constant ?? 0);
            const sourceRight = i === 0 ? equationRight(task, worksheet.language) : printMode ? <span className="equation-small-blank" /> : answer.steps[i - 1].right || <span className="equation-small-blank" />;
            const nextLeft = step.expand ? <span className="equation-distributed"><span className="equation-coefficient-slot">{slot(i, "coefficient", copy.coefficient)}</span>x + ({slot(i, "constant", copy.constant)})</span> : step.collectX ? variable(<span className="equation-coefficient-slot">{slot(i, "coefficient", copy.coefficient)}</span>, task.constant) : carriesLine && i === 1 ? variable(writtenCoefficient) : variable(step.coefficient, step.constant ?? 0);
            const correctLine = `${step.coefficient === 1 ? "" : step.coefficient}x${step.constant ? ` ${step.constant > 0 ? "+" : "−"} ${format(Math.abs(step.constant))}` : ""} = ${format(step.right)}`;
            return <div className="equation-step" key={i}>
              {!printMode ? <div className="equation-operation">
                {worksheet.settings.showSupport ? <span>{step.clearDenominator ? copy.clearDenominator : step.expand ? copy.expand : step.collectX ? copy.collectX : carriesLine || task.type === "fraction" ? i === 1 ? copy.remove : copy.both : steps.length > 1 && i === 0 ? copy.remove : copy.both}</span> : null}
                <select aria-label={`${common.task} ${number}, ${copy.step} ${i + 1}: ${copy.operation}`} value={a.operation} disabled={readOnly} onChange={e => update(i, "operation", e.target.value)}><option value="">—</option>{OPERATIONS.map(op => <option key={op} value={op}>{symbols[op]}</option>)}</select>{slot(i, "operand", step.expand ? copy.multiplier : copy.operand)}
                {step.collectX ? <select className="equation-term-type" aria-label={`${common.task} ${number}, ${copy.step} ${i + 1}: ${copy.termType}`} value={a.operandType ?? ""} disabled={readOnly} onChange={e => update(i, "operandType", e.target.value)}><option value="">{copy.termType}</option><option value="number">{copy.numberTerm}</option><option value="x">{copy.xTerm}</option></select> : null}
              </div> : null}
              <div className="equation-line equation-expanded">{step.expand ? <><span className="equation-distribution">{["x", `(${format(task.constant)})`].map((term, j) => <span key={j}>{j ? " + " : null}<span className="equation-applied">{printMode || !a.operand ? <span className="equation-small-blank" /> : a.operand.startsWith("-") ? `(${a.operand})` : a.operand} {printMode ? "×" : symbols[a.operation as keyof typeof symbols] ?? <span className="equation-symbol-blank" />}</span> {term}</span>)}</span><span>=</span><span>{sourceRight}</span></> : <><AppliedOperation source={sourceLeft} operation={printMode ? step.operation === "/" ? "/" : "" : a.operation} operand={a.operand} operandType={printMode && step.collectX ? "x" : a.operandType} paper={printMode} /><span>=</span><AppliedOperation source={sourceRight} operation={printMode ? step.operation === "/" ? "/" : "" : a.operation} operand={a.operand} operandType={printMode && step.collectX ? "x" : a.operandType} paper={printMode} /></>}</div>
              <div className="equation-line equation-next">{worksheet.settings.showSupport ? <span className="equation-support">{copy.next}</span> : null}{nextLeft}<span>=</span>{slot(i, "right", copy.next)}</div>
              {showAutoCheck && !printMode ? <div className="equation-feedback">{!result.isAnswered ? <p>{common.unanswered}</p> : <><p className={result.steps[i].setupCorrect ? "length-correct" : "length-wrong"}>{copy.step} {i + 1}, {copy.method}: {result.steps[i].setupCorrect ? common.correct : common.wrong}</p><p className={result.steps[i].answerCorrect ? "length-correct" : "length-wrong"}>{copy.calculation}: {result.steps[i].answerCorrect ? result.steps[i].followThroughCorrect ? copy.followThrough : common.correct : `${common.wrong}. ${common.answer}: ${correctLine}`}</p></>}</div> : null}
            </div>;
          })}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key equation-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div key={task.id}><p><small>{i + 1}.</small> {originalEquation(task)} = {equationRight(task, worksheet.language)}</p>{equationSteps(task).map((s, j) => <p key={j}>{s.expand ? `${copy.expand} (${format(s.operand)})` : `${symbols[s.operation]} ${format(s.operand)}${s.collectX ? "x" : ""}`}: {s.coefficient === 1 ? "x" : `${s.coefficient}x`}{s.constant ? ` ${s.constant > 0 ? "+" : "−"} ${format(Math.abs(s.constant))}` : ""} = {format(s.right)}</p>)}</div>)}</div></section> : null}
  </div>;
}
