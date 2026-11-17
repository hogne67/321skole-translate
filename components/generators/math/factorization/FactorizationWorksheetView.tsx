"use client";

import type { CSSProperties, Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { canonicalFactorTree, factorPairs, factorizationTaskAnswer, factorizationTaskPrompt, getFactorizationCopy, gradeFactorizationTask, gradeFactorizationWorksheet, readFactorizationAnswer, type FactorizationAnswer, type FactorizationWorksheet } from "@/lib/math/factorization/worksheet";
import { factorizationPageCapacity, factorizationPrintPages } from "@/lib/math/factorization/printLayout";
import FactorizationTree from "./FactorizationTree";
import "../length/length.css";
import "./factorization.css";

export default function FactorizationWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: { worksheet: FactorizationWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: FactorizationAnswer) => void; readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement> }) {
  const common = getMeasurementCopy(worksheet.language), copy = getFactorizationCopy(worksheet.language), grade = gradeFactorizationWorksheet(worksheet, answersByTaskId);
  const pages = printMode ? factorizationPrintPages(worksheet.tasks, worksheet.settings) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  const capacity = factorizationPageCapacity(worksheet.settings);
  const rowHeight = (count: number, height: number) => `${(height - (Math.ceil(count / 2) - 1) * 2) / Math.ceil(count / 2)}mm`;
  const printStyle = { "--factorization-first-row": rowHeight(capacity.first, 210), "--factorization-next-row": rowHeight(capacity.following, 252) } as CSSProperties;
  return <div ref={printRef} style={printMode ? printStyle : undefined} className={`length-sheet factorization-sheet${worksheet.settings.taskType === "mixed" ? " factorization-mixed" : ""}${printMode ? " length-paper" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks factorization-tasks">{tasks.map((task, index) => {
        const number = startIndex + index + 1, label = `${common.task} ${number}`, answer = readFactorizationAnswer(printMode ? null : answersByTaskId[task.id]), result = gradeFactorizationTask(task, answersByTaskId[task.id], worksheet.settings);
        const change = (next: Partial<FactorizationAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        const rowCount = factorPairs(task.number).length, pairs = Array.from({ length: Math.max(rowCount, answer.pairs.length) }, (_, i) => answer.pairs[i] ?? { left: "", right: "" });
        return <div className="length-task factorization-task" key={task.id} data-task-type={task.type}>
          <div className="factorization-heading"><span className="length-number">{number}</span><strong><MathText text={factorizationTaskPrompt(task, worksheet.language)} /></strong></div>
          {worksheet.settings.showSupport && task.type !== "factor_tree" ? <p className="factorization-hint"><MathText text={task.type === "factor_pairs" ? copy.pairHint : task.type === "missing_factor" ? copy.missingHint : copy.primeHint} /></p> : null}
          {task.type === "factor_pairs" ? <div className="factor-pairs">{pairs.map((pair, i) => <div className="factor-pair-row" key={i}><span className="factor-pair-index">{i + 1}.</span>{printMode ? <><span className="factor-pair-blank" /><span>×</span><span className="factor-pair-blank" /></> : <><input type="text" inputMode="numeric" autoComplete="off" maxLength={12} aria-label={`${label}: ${copy.pair} ${i + 1}, ${copy.leftFactor}`} value={pair.left} readOnly={readOnly} onChange={event => change({ pairs: pairs.map((p, n) => n === i ? { ...p, left: event.target.value } : p) })} /><span>×</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={12} aria-label={`${label}: ${copy.pair} ${i + 1}, ${copy.rightFactor}`} value={pair.right} readOnly={readOnly} onChange={event => change({ pairs: pairs.map((p, n) => n === i ? { ...p, right: event.target.value } : p) })} /></>}<span>= {task.number}</span></div>)}</div>
            : task.type === "factor_tree" ? <FactorizationTree number={task.number} nodes={answer.nodes} language={worksheet.language} label={label} printMode={printMode} readOnly={readOnly} onChange={nodes => change({ nodes })} />
              : <div className="factorization-answer">{printMode ? <><span>{copy.answer}:</span><span className="factorization-answer-space" /></> : <label>{copy.answer}<input type="text" inputMode={task.type === "missing_factor" ? "numeric" : "text"} autoComplete="off" maxLength={240} aria-label={`${label}: ${copy.answer}`} value={answer.value} readOnly={readOnly} onChange={event => change({ value: event.target.value })} /></label>}</div>}
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${factorizationTaskAnswer(task, worksheet.settings)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key factorization-key"><h2>{common.answerKey}</h2>{worksheet.tasks.map((task, i) => <div className="factorization-key-item" key={task.id}><strong>{i + 1}.</strong> {factorizationTaskAnswer(task, worksheet.settings)}{task.type === "factor_tree" ? <><p>{copy.treeExample}</p><FactorizationTree number={task.number} nodes={canonicalFactorTree(task.number)} language={worksheet.language} label={`${common.task} ${i + 1}`} answerKey printMode /></> : null}</div>)}</section> : null}
  </div>;
}
