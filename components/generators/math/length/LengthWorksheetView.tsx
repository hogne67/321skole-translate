"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { formatMeasurement, getMeasurementCopy, gradeMeasurementTask, gradeMeasurementWorksheet, type MeasurementWorksheet } from "@/lib/math/measurement/worksheet";
import "./length.css";

export default function LengthWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: MeasurementWorksheet;
  answersByTaskId?: Record<string, unknown>;
  onAnswerChange?: (id: string, value: string) => void;
  readOnly?: boolean;
  showAutoCheck?: boolean;
  printMode?: boolean;
  printRef?: Ref<HTMLDivElement>;
}) {
  const copy = getMeasurementCopy(worksheet.language);
  const grade = gradeMeasurementWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / 36) }, (_, i) => worksheet.tasks.slice(i * 36, (i + 1) * 36));
  return <div ref={printRef} className={`length-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{copy.worksheet}</span></div>
        <h2>{worksheet.title}</h2>
        <div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{copy.name}:</span><span>{copy.date}:</span><span>{copy.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{copy.correct}: {grade.correctAuto} · {copy.wrong}: {grade.wrongAuto} · {copy.unanswered}: {grade.unansweredAuto} · {copy.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks">
        {tasks.map((task, i) => {
          const result = gradeMeasurementTask(task, answersByTaskId[task.id]);
          const answer = answersByTaskId[task.id];
          const value = typeof answer === "string" || typeof answer === "number" ? String(answer) : "";
          const label = `${copy.task} ${page * 36 + i + 1}: ${formatMeasurement(task.quantity, worksheet.language)} ${task.fromUnit} = ${copy.answer} ${task.toUnit}`;
          return <div className="length-task" key={task.id}>
            <div className="length-equation"><span className="length-number">{page * 36 + i + 1}</span><span className="length-source">{formatMeasurement(task.quantity, worksheet.language)} {task.fromUnit}</span><span>=</span>
              <span className="length-answer-group">{printMode ? <span className="length-answer-space" aria-label={label} /> : <input type="text" inputMode={worksheet.settings.allowDecimals ? "decimal" : "numeric"} aria-label={label} style={{ width: Math.max(88, task.answer.length * 8 + 16) }} value={value} maxLength={24} autoComplete="off" readOnly={readOnly} onChange={e => onAnswerChange?.(task.id, e.target.value)} />}
              <span className="length-unit">{task.toUnit}</span></span>
            </div>
            {showAutoCheck && !printMode ? <div className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? copy.unanswered : result.isCorrect ? copy.correct : `${copy.wrong}. ${copy.answer}: ${formatMeasurement(task.answer, worksheet.language)} ${task.toUnit}`}</div> : null}
          </div>;
        })}
      </div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key"><h2>{copy.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <p key={task.id}><small>{i + 1}.</small> {formatMeasurement(task.answer, worksheet.language)} {task.toUnit}</p>)}</div></section> : null}
  </div>;
}
