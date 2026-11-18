"use client";

import type { Ref } from "react";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getScaleCopy, gradeScaleTask, gradeScaleWorksheet, readScaleAnswer, scaleAnswerText, SCALE_UNITS, scaleSolution, scaleTaskHint, scaleTaskPrompt, type ScaleAnswer, type ScaleWorksheet } from "@/lib/math/scale/worksheet";
import { scalePrintPages } from "@/lib/math/scale/printLayout";
import ScaleFigure from "./ScaleFigure";
import MathText from "../MathTextSupport";
import "../length/length.css";
import "./scale.css";

export default function ScaleWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: ScaleWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: ScaleAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getScaleCopy(worksheet.language);
  const grade = gradeScaleWorksheet(worksheet, answersByTaskId), pages = printMode ? scalePrintPages(worksheet.tasks, worksheet.settings.showSupport) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  return <div ref={printRef} className={`length-sheet scale-sheet${printMode ? " length-paper" : ""}${worksheet.settings.showSupport ? " scale-with-support" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={startIndex}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt={worksheet.language === "nb" ? "321 skole" : "321 school"} width={40} height={40} /><div><strong>{worksheet.language === "nb" ? "321 skole" : "321 school"}</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : <p className="scale-note">{copy.checkNote}</p>}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partialCount}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks scale-tasks">{tasks.map((task, i) => {
        const number = startIndex + i + 1, label = `${common.task} ${number}`, answer = readScaleAnswer(printMode ? undefined : answersByTaskId[task.id]);
        const result = gradeScaleTask(task, answersByTaskId[task.id]), change = (next: Partial<ScaleAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task scale-task" key={task.id} data-task-type={task.type}>
          <div className="scale-heading"><span className="length-number">{number}</span><strong><MathText text={scaleTaskPrompt(task, worksheet.language)} /></strong></div>
          <ScaleFigure task={task} language={worksheet.language} />
          {worksheet.settings.showSupport ? <p className="scale-hint"><MathText text={scaleTaskHint(task, worksheet.language)} /></p> : null}
          <div className="scale-working">{printMode ? <><span>{copy.working}:</span><div className="scale-lines" /></> : <label>{copy.working}<textarea rows={2} maxLength={2000} aria-label={`${label}: ${copy.working}`} readOnly={readOnly} value={answer.working} onChange={event => change({ working: event.target.value })} /></label>}</div>
          <div className="scale-answer">{printMode ? <><span>{copy.answer}:</span>{task.type === "find_scale" ? <span className="scale-print-ratio"><span /> : <span /></span> : <span className="scale-blank" />}</> : <>
            {task.type === "find_scale" ? <div className="scale-ratio-input"><span>{copy.ratio}</span><div>
              <label>{copy.drawing}<input type="text" inputMode="decimal" maxLength={40} autoComplete="off" aria-label={`${label}: ${copy.drawing}`} readOnly={readOnly} value={answer.ratioLeft} onChange={event => change({ ratioLeft: event.target.value })} /></label>
              <span aria-hidden="true">:</span>
              <label>{copy.reality}<input type="text" inputMode="decimal" maxLength={40} autoComplete="off" aria-label={`${label}: ${copy.reality}`} readOnly={readOnly} value={answer.ratioRight} onChange={event => change({ ratioRight: event.target.value })} /></label>
            </div></div> : <>
              <label>{copy.answer}<input type="text" inputMode="decimal" maxLength={40} autoComplete="off" aria-label={`${label}: ${copy.answer}`} readOnly={readOnly} value={answer.value} onChange={event => change({ value: event.target.value })} /></label>
              <label>{copy.unit}<select disabled={readOnly} aria-label={`${label}: ${copy.unit}`} value={answer.unit} onChange={event => change({ unit: event.target.value })}><option value="">{copy.chooseUnit}</option>{SCALE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            </>}
          </>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? task.type === "find_scale" ? copy.ratioPartial : copy.partial : common.wrong}. ${common.answer}: ${scaleAnswerText(task, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key scale-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div key={task.id}><strong>{i + 1}. {scaleAnswerText(task, worksheet.language)}</strong><p>{scaleSolution(task, worksheet.language)}</p></div>)}</div></section> : null}
  </div>;
}
