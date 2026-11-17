"use client";

import type { Ref } from "react";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getPythagorasCopy, gradePythagorasTask, gradePythagorasWorksheet, readPythagorasAnswer, pythagorasAnswerText, PYTHAGORAS_UNITS, pythagorasSolution, pythagorasTaskHint, pythagorasTaskPrompt, type PythagorasAnswer, type PythagorasWorksheet } from "@/lib/math/pythagoras/worksheet";
import { pythagorasPrintPages } from "@/lib/math/pythagoras/printLayout";
import PythagorasFigure from "./PythagorasFigure";
import MathText from "../MathTextSupport";
import "../length/length.css";
import "./pythagoras.css";

export default function PythagorasWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: PythagorasWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: PythagorasAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getPythagorasCopy(worksheet.language);
  const grade = gradePythagorasWorksheet(worksheet, answersByTaskId), pages = printMode ? pythagorasPrintPages(worksheet.tasks, worksheet.settings.showSupport) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  return <div ref={printRef} className={`length-sheet pythagoras-sheet${printMode ? " length-paper" : ""}${worksheet.settings.showSupport ? " pythagoras-with-support" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={startIndex}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt={worksheet.language === "nb" ? "321 skole" : "321 school"} width={40} height={40} /><div><strong>{worksheet.language === "nb" ? "321 skole" : "321 school"}</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : <p className="pythagoras-note">{copy.checkNote}</p>}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partialCount}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks pythagoras-tasks">{tasks.map((task, i) => {
        const number = startIndex + i + 1, label = `${common.task} ${number}`, answer = readPythagorasAnswer(printMode ? undefined : answersByTaskId[task.id]);
        const result = gradePythagorasTask(task, answersByTaskId[task.id]), change = (next: Partial<PythagorasAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task pythagoras-task" key={task.id} data-task-type={task.type}>
          <div className="pythagoras-heading"><span className="length-number">{number}</span><strong><MathText text={pythagorasTaskPrompt(task, worksheet.language)} /></strong></div>
          <PythagorasFigure task={task} language={worksheet.language} />
          {worksheet.settings.showSupport ? <p className="pythagoras-hint"><MathText text={pythagorasTaskHint(task, worksheet.language)} /></p> : null}
          <div className="pythagoras-working">{printMode ? <><span>{copy.working}:</span><div className="pythagoras-lines" /></> : <label>{copy.working}<textarea rows={2} maxLength={2000} aria-label={`${label}: ${copy.working}`} readOnly={readOnly} value={answer.working} onChange={event => change({ working: event.target.value })} /></label>}</div>
          <div className="pythagoras-answer">{printMode ? <><span>{copy.answer}:</span><span className="pythagoras-blank" /></> : <>
            {task.type === "check_triangle" ? <label>{copy.answer}<select disabled={readOnly} aria-label={`${label}: ${copy.answer}`} value={answer.value} onChange={event => change({ value: event.target.value, unit: "" })}><option value="">{copy.choose}</option><option value="yes">{copy.yes}</option><option value="no">{copy.no}</option></select></label> : <>
              <label>{copy.answer}<input type="text" inputMode="decimal" maxLength={40} autoComplete="off" aria-label={`${label}: ${copy.answer}`} readOnly={readOnly} value={answer.value} onChange={event => change({ value: event.target.value })} /></label>
              <label>{copy.unit}<select disabled={readOnly} aria-label={`${label}: ${copy.unit}`} value={answer.unit} onChange={event => change({ unit: event.target.value })}><option value="">{copy.chooseUnit}</option>{PYTHAGORAS_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            </>}
          </>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${pythagorasAnswerText(task, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key pythagoras-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div key={task.id}><strong>{i + 1}. {pythagorasAnswerText(task, worksheet.language)}</strong><p>{pythagorasSolution(task, worksheet.language)}</p></div>)}</div></section> : null}
  </div>;
}
