"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { formatNumberLineValue, getNumberLineCopy, gradeNumberLineTask, gradeNumberLineWorksheet, NUMBER_LINE_TASKS_PER_PAGE, numberLinePrompt, numberLineValue, type NumberLineWorksheet } from "@/lib/math/number-line/worksheet";
import NumberLineDiagram from "./NumberLineDiagram";
import "../length/length.css";
import "./numberLine.css";

export default function NumberLineWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: NumberLineWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: string) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getNumberLineCopy(worksheet.language);
  const grade = gradeNumberLineWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / NUMBER_LINE_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * NUMBER_LINE_TASKS_PER_PAGE, (i + 1) * NUMBER_LINE_TASKS_PER_PAGE));
  return <div ref={printRef} className={`length-sheet number-line-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks number-line-tasks">{tasks.map((task, index) => {
        const number = page * NUMBER_LINE_TASKS_PER_PAGE + index + 1;
        const answer = typeof answersByTaskId[task.id] === "string" ? answersByTaskId[task.id] as string : "";
        const result = gradeNumberLineTask(task, answersByTaskId[task.id]), prompt = numberLinePrompt(task, worksheet.settings, worksheet.language);
        const expected = formatNumberLineValue(numberLineValue(task), worksheet.settings.form, worksheet.language);
        return <div className="length-task number-line-task" data-task-type={task.type} key={task.id}>
          <div className="number-line-heading"><span className="length-number">{number}</span><span className="number-line-prompt"><MathText text={prompt} /></span></div>
          <NumberLineDiagram task={task} settings={worksheet.settings} language={worksheet.language} answer={printMode ? undefined : answer}
            onSelect={!printMode && !readOnly && task.type === "place" ? value => onAnswerChange?.(task.id, value) : undefined} />
          {!printMode ? <div className="number-line-answer"><label htmlFor={`number-line-${task.id}`}>{common.answer}:</label><input id={`number-line-${task.id}`} type="text" autoComplete="off" inputMode="text" maxLength={40}
            aria-label={`${common.task} ${number}: ${common.answer}`} value={answer} readOnly={readOnly} onChange={event => onAnswerChange?.(task.id, event.target.value)} />
            {task.type === "place" && !readOnly ? <small>{copy.selectMark}</small> : null}</div> : task.type !== "place" ? <div className="number-line-answer">{common.answer}: <span className="length-answer-space" /></div> : null}
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${common.wrong}. ${common.answer}: ${expected}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key number-line-key"><h2>{common.answerKey}</h2><p className="number-line-key-note">{copy.positionKey}</p><div>{worksheet.tasks.map((task, index) => <p key={task.id}><small>{index + 1}.</small> {formatNumberLineValue(numberLineValue(task), worksheet.settings.form, worksheet.language)} ({copy.mark} {task.targetIndex})</p>)}</div></section> : null}
  </div>;
}
