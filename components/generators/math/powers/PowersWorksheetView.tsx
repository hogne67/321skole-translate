"use client";

import type { CSSProperties, Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getPowersCopy, gradePowersTask, gradePowersWorksheet, powersTaskAnswer, powersTaskHint, powersTaskPrompt, readPowersAnswer, type PowersAnswer, type PowersWorksheet } from "@/lib/math/powers/worksheet";
import { powersPageCapacity, powersPrintPages } from "@/lib/math/powers/printLayout";
import "../length/length.css";
import "./powers.css";

export default function PowersWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: { worksheet: PowersWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: PowersAnswer) => void; readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement> }) {
  const common = getMeasurementCopy(worksheet.language), copy = getPowersCopy(worksheet.language), grade = gradePowersWorksheet(worksheet, answersByTaskId);
  const pages = printMode ? powersPrintPages(worksheet.tasks, worksheet.settings) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  const capacity = powersPageCapacity(worksheet.settings);
  const rowHeight = (count: number, height: number) => `${(height - (Math.ceil(count / 2) - 1) * 2) / Math.ceil(count / 2)}mm`;
  const printStyle = { "--powers-first-row": rowHeight(capacity.first, 210), "--powers-next-row": rowHeight(capacity.following, 252) } as CSSProperties;
  return <div ref={printRef} style={printMode ? printStyle : undefined} className={`length-sheet powers-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks powers-tasks">{tasks.map((task, index) => {
        const number = startIndex + index + 1, label = `${common.task} ${number}`, answer = readPowersAnswer(printMode ? null : answersByTaskId[task.id]), result = gradePowersTask(task, answersByTaskId[task.id]);
        const powerTask = task.type === "write_power" || task.type === "power_rules";
        const change = (next: Partial<PowersAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task powers-task" key={task.id} data-task-type={task.type}>
          <div className="powers-heading"><span className="length-number">{number}</span><strong><MathText text={powersTaskPrompt(task, worksheet.language)} /></strong></div>
          {worksheet.settings.showSupport ? <p className="powers-hint"><MathText text={powersTaskHint(task, worksheet.language)} /></p> : null}
          <div className="powers-answer">{powerTask ? <><span>{copy.answer}:</span><div className="powers-power-answer">
            {printMode ? <><span className="powers-base-blank" /><span className="powers-exponent-blank" /></> : <>
              <label className="powers-base-field"><span>{copy.base}</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={12} aria-label={`${label}: ${copy.base}`} value={answer.base} readOnly={readOnly} onChange={event => change({ base: event.target.value })} /></label>
              <label className="powers-exponent-field"><span>{copy.exponent}</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={12} aria-label={`${label}: ${copy.exponent}`} value={answer.exponent} readOnly={readOnly} onChange={event => change({ exponent: event.target.value })} /></label>
            </>}
          </div></> : printMode ? <><span>{copy.answer}:</span><span className="powers-answer-space" /></> : <label className="powers-value-field">{copy.answer}<input type="text" inputMode={task.type === "evaluate" ? "numeric" : "text"} autoComplete="off" maxLength={240} aria-label={`${label}: ${copy.answer}`} value={answer.value} readOnly={readOnly} onChange={event => change({ value: event.target.value })} /></label>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${powersTaskAnswer(task)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key powers-key"><h2>{common.answerKey}</h2>{worksheet.tasks.map((task, i) => <div key={task.id}><strong>{i + 1}.</strong> {powersTaskAnswer(task)}</div>)}</section> : null}
  </div>;
}
