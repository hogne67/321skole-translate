"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { CLOCK_TASKS_PER_PAGE, clockTaskAnswer, clockTaskPrompt, formatClockTime, getClockCopy, gradeClockTask, gradeClockWorksheet, readClockHandsAnswer, type ClockAnswer, type ClockWorksheet } from "@/lib/math/clock/worksheet";
import ClockDiagram from "./ClockDiagram";
import "../length/length.css";
import "./clock.css";

export default function ClockWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: ClockWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: ClockAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getClockCopy(worksheet.language), settings = worksheet.settings;
  const grade = gradeClockWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / CLOCK_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * CLOCK_TASKS_PER_PAGE, (i + 1) * CLOCK_TASKS_PER_PAGE));
  const diagram = (time: number) => <ClockDiagram hour={Math.floor(time / 60)} minute={time % 60} showSupport={settings.showSupport} language={worksheet.language} />;
  return <div ref={printRef} className={`length-sheet clock-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks clock-tasks">{tasks.map((task, index) => {
        const number = page * CLOCK_TASKS_PER_PAGE + index + 1, value = answersByTaskId[task.id];
        const answer = typeof value === "string" ? value : "", hands = readClockHandsAnswer(printMode ? undefined : value);
        const result = gradeClockTask(task, value, settings), expected = clockTaskAnswer(task, settings, worksheet.language);
        const label = `${common.task} ${number}`;
        return <div className="length-task clock-task" data-task-type={task.type} key={task.id}>
          <div className="clock-heading"><span className="length-number">{number}</span><MathText text={clockTaskPrompt(task, settings, worksheet.language)} /></div>
          {task.type === "elapsed" ? <div className="clock-pair">{([task.startMinutes, task.endMinutes]).map((time, i) => <div key={i}>{diagram(time)}<span>{i === 0 ? copy.start : copy.end} {formatClockTime(time, settings.timeFormat)}</span></div>)}</div>
            : task.type === "read_analog" ? <div className="clock-face">{diagram(task.timeMinutes)}{settings.timeFormat === "24h" ? <small>{task.timeMinutes < 720 ? copy.periodMorning : copy.periodAfternoon}</small> : null}</div>
            : <div className="clock-face"><ClockDiagram hour={/^\d{1,2}$/.test(hands.hour) && Number(hands.hour) >= 1 && Number(hands.hour) <= 12 ? Number(hands.hour) : null} minute={/^\d{1,2}$/.test(hands.minute) && Number(hands.minute) <= 59 ? Number(hands.minute) : null} showSupport={settings.showSupport} language={worksheet.language} /></div>}
          {task.type === "draw_hands" ? !printMode ? <div className="clock-answer clock-hand-controls">{(["hour", "minute"] as const).map(key => <label key={key}>{copy[key === "hour" ? "hourHand" : "minuteHand"]}<select aria-label={`${label}: ${copy[key === "hour" ? "hourHand" : "minuteHand"]}`} disabled={readOnly} value={hands[key]} onChange={event => onAnswerChange?.(task.id, { ...hands, [key]: event.target.value })}>
            <option value="">—</option>{Array.from({ length: key === "hour" ? 12 : 60 }, (_, i) => key === "hour" ? i + 1 : i).map(value => <option key={value} value={value}>{String(value).padStart(key === "minute" ? 2 : 1, "0")}</option>)}
          </select></label>)}</div> : null
            : <div className="clock-answer">{!printMode ? <><label htmlFor={`clock-${task.id}`}>{common.answer}:</label><input id={`clock-${task.id}`} aria-label={`${label}: ${common.answer}`} type="text" inputMode={task.type === "elapsed" ? "numeric" : "text"} maxLength={12} autoComplete="off" value={answer} readOnly={readOnly} onChange={event => onAnswerChange?.(task.id, event.target.value)} /></> : <>{common.answer}: <span className="length-answer-space" /></>}{task.type === "elapsed" ? <span>{copy.minutesShort}</span> : null}</div>}
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${expected}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key clock-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, index) => <div className="clock-key-item" key={task.id}><p>{index + 1}. {clockTaskAnswer(task, settings, worksheet.language)}</p>{task.type === "draw_hands" ? diagram(task.timeMinutes) : null}</div>)}</div></section> : null}
  </div>;
}
