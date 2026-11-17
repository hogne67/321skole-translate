"use client";

import type { Ref } from "react";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getVolumeCopy, gradeVolumeTask, gradeVolumeWorksheet, readVolumeAnswer, volumeAnswerText, volumeAnswerUnits, volumeSolution, volumeTaskHint, volumeTaskPrompt, volumeUnitLabel, type VolumeAnswer, type VolumeWorksheet } from "@/lib/math/volume/worksheet";
import { volumePrintPages } from "@/lib/math/volume/printLayout";
import VolumeFigure from "./VolumeFigure";
import MathText from "../MathTextSupport";
import "../length/length.css";
import "./volume.css";

export default function VolumeWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: VolumeWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: VolumeAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getVolumeCopy(worksheet.language);
  const grade = gradeVolumeWorksheet(worksheet, answersByTaskId), pages = printMode ? volumePrintPages(worksheet.tasks, worksheet.settings.showSupport) : [{ tasks: worksheet.tasks, startIndex: 0 }];
  return <div ref={printRef} className={`length-sheet volume-sheet${printMode ? " length-paper" : ""}${worksheet.settings.showSupport ? " volume-with-support" : ""}`}>
    {pages.map(({ tasks, startIndex }, page) => <section className="length-page" key={startIndex}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt={worksheet.language === "nb" ? "321 skole" : "321 school"} width={40} height={40} /><div><strong>{worksheet.language === "nb" ? "321 skole" : "321 school"}</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : <p className="volume-note">{copy.checkNote}</p>}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partialCount}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks volume-tasks">{tasks.map((task, i) => {
        const number = startIndex + i + 1, label = `${common.task} ${number}`, answer = readVolumeAnswer(printMode ? undefined : answersByTaskId[task.id]);
        const result = gradeVolumeTask(task, answersByTaskId[task.id]), change = (next: Partial<VolumeAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task volume-task" key={task.id} data-task-type={task.type}>
          <div className="volume-heading"><span className="length-number">{number}</span><strong><MathText text={volumeTaskPrompt(task, worksheet.language)} /></strong></div>
          <VolumeFigure task={task} language={worksheet.language} />
          {worksheet.settings.showSupport ? <p className="volume-hint"><MathText text={volumeTaskHint(task, worksheet.language)} /></p> : null}
          <div className="volume-working">{printMode ? <><span>{copy.working}:</span><div className="volume-lines" /></> : <label>{copy.working}<textarea rows={2} maxLength={2000} aria-label={`${label}: ${copy.working}`} readOnly={readOnly} value={answer.working} onChange={event => change({ working: event.target.value })} /></label>}</div>
          <div className="volume-answer">{printMode ? <><span>{copy.answer}:</span><span className="volume-blank" /></> : <>
            <label>{copy.answer}<input type="text" inputMode="decimal" maxLength={40} autoComplete="off" aria-label={`${label}: ${copy.answer}`} readOnly={readOnly} value={answer.value} onChange={event => change({ value: event.target.value })} /></label>
            <label>{copy.unit}<select disabled={readOnly} aria-label={`${label}: ${copy.unit}`} value={answer.unit} onChange={event => change({ unit: event.target.value })}><option value="">{copy.chooseUnit}</option>{volumeAnswerUnits(task).map(unit => <option key={unit} value={unit}>{volumeUnitLabel(unit)}</option>)}</select></label>
          </>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${volumeAnswerText(task, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key volume-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div key={task.id}><strong>{i + 1}. {volumeAnswerText(task, worksheet.language)}</strong><p>{volumeSolution(task, worksheet.language)}</p></div>)}</div></section> : null}
  </div>;
}
