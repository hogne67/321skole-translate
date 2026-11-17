"use client";

import { useId, type CSSProperties, type Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { algebraTaskAnswer, algebraTaskHint, algebraTaskPrompt, getAlgebraCopy, gradeAlgebraTask, gradeAlgebraWorksheet, readAlgebraAnswer, type AlgebraAnswer, type AlgebraWorksheet } from "@/lib/math/algebra/worksheet";
import { algebraPageCapacity, algebraPrintPages } from "@/lib/math/algebra/printLayout";
import AlgebraAnswerInput from "./AlgebraAnswerInput";
import "../length/length.css";
import "./algebra.css";

export default function AlgebraWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: { worksheet: AlgebraWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: AlgebraAnswer) => void; readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement> }) {
  const common = getMeasurementCopy(worksheet.language), copy = getAlgebraCopy(worksheet.language), grade = gradeAlgebraWorksheet(worksheet, answersByTaskId), inputPrefix = useId();
  const pages = printMode ? algebraPrintPages(worksheet.tasks, worksheet.settings) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  const capacity = algebraPageCapacity(worksheet.settings);
  const rowHeight = (count: number, height: number) => `${(height - (Math.ceil(count / 2) - 1) * 2) / Math.ceil(count / 2)}mm`;
  const printStyle = { "--algebra-first-row": rowHeight(capacity.first, 210), "--algebra-next-row": rowHeight(capacity.following, 252) } as CSSProperties;
  return <div ref={printRef} style={printMode ? printStyle : undefined} className={`length-sheet algebra-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks algebra-tasks">{tasks.map((task, index) => {
        const number = startIndex + index + 1, label = `${common.task} ${number}`, answer = readAlgebraAnswer(printMode ? null : answersByTaskId[task.id]), result = gradeAlgebraTask(task, answersByTaskId[task.id]);
        return <div className="length-task algebra-task" key={task.id} data-task-type={task.type}>
          <div className="algebra-heading"><span className="length-number">{number}</span><strong><MathText text={algebraTaskPrompt(task, worksheet.language)} /></strong></div>
          {worksheet.settings.showSupport ? <p className="algebra-hint"><MathText text={algebraTaskHint(task, worksheet.language)} /></p> : null}
          <div className="algebra-answer">{printMode ? <><span>{copy.answer}:</span><span className="algebra-answer-space" /></> : <AlgebraAnswerInput inputId={`${inputPrefix}-${task.id}`} language={worksheet.language} label={label} value={answer.value} readOnly={readOnly} onChange={value => onAnswerChange?.(task.id, { value })} />}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : <>{result.isPartial ? copy.partial : common.wrong}. {result.reason === "unfinished" ? copy.unfinished : result.reason === "invalid" ? copy.invalidAnswer : ""} {common.answer}: {algebraTaskAnswer(task)}</>}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key algebra-key"><h2>{common.answerKey}</h2>{worksheet.tasks.map((task, i) => <div key={task.id}><strong>{i + 1}.</strong> {algebraTaskAnswer(task)}</div>)}</section> : null}
  </div>;
}
