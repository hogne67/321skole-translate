"use client";
import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { COMPARISON_SIGNS, formatComparisonValue, getComparisonCopy, gradeComparisonTask, gradeComparisonWorksheet, type ComparisonValue, type ComparisonWorksheet } from "@/lib/math/comparison/worksheet";
import ComparisonVisual from "./ComparisonVisual";
import "../length/length.css";
import "./comparison.css";

export function ComparisonNumber({ value, language }: { value: ComparisonValue; language: string }) {
  return value.form === "fraction" ? <span className="comparison-fraction" aria-label={formatComparisonValue(value, language)}><span>{value.numerator}</span><span>{value.denominator}</span></span> : <span>{formatComparisonValue(value, language)}</span>;
}
export default function ComparisonWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: ComparisonWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: string) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const copy = getComparisonCopy(worksheet.language), common = getMeasurementCopy(worksheet.language);
  const grade = gradeComparisonWorksheet(worksheet, answersByTaskId);
  const perPage = worksheet.settings.visualSupport ? 12 : 36;
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / perPage) }, (_, i) => worksheet.tasks.slice(i * perPage, (i + 1) * perPage));
  const labels = { "<": copy.less, "=": copy.equal, ">": copy.greater };
  return <div ref={printRef} className={`length-sheet comparison-sheet${worksheet.settings.visualSupport ? " comparison-supported" : ""}${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks comparison-tasks">{tasks.map((task, i) => {
        const number = page * perPage + i + 1;
        const result = gradeComparisonTask(task, answersByTaskId[task.id]);
        const answer = COMPARISON_SIGNS.includes(answersByTaskId[task.id] as "<") ? String(answersByTaskId[task.id]) : "";
        const label = `${common.task} ${number}: ${formatComparisonValue(task.left, worksheet.language)}, ${copy.comparison}, ${formatComparisonValue(task.right, worksheet.language)}`;
        return <div className="length-task comparison-task" key={task.id}>
          <div className="comparison-equation"><span className="length-number">{number}</span>
            <div className="comparison-side"><div className="comparison-value"><ComparisonNumber value={task.left} language={worksheet.language} /></div>{worksheet.settings.visualSupport ? <ComparisonVisual value={task.left} language={worksheet.language} /> : null}</div>
            <div className="comparison-sign">{printMode ? <span className="comparison-blank" aria-label={label} /> : readOnly ? <span className="comparison-readonly" aria-label={`${label}: ${answer || common.unanswered}`}>{answer}</span> : <select aria-label={label} value={answer} onChange={e => onAnswerChange?.(task.id, e.target.value)}><option value="" aria-label={common.unanswered}></option>{COMPARISON_SIGNS.map(sign => <option value={sign} key={sign} aria-label={labels[sign]}>{sign}</option>)}</select>}</div>
            <div className="comparison-side"><div className="comparison-value"><ComparisonNumber value={task.right} language={worksheet.language} /></div>{worksheet.settings.visualSupport ? <ComparisonVisual value={task.right} language={worksheet.language} /> : null}</div>
          </div>
          {showAutoCheck && !printMode ? <div className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${common.wrong}. ${common.answer}: ${result.correctAnswer}`}</div> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <p key={task.id}><small>{i + 1}.</small> <ComparisonNumber value={task.left} language={worksheet.language} /> {gradeComparisonTask(task, null).correctAnswer} <ComparisonNumber value={task.right} language={worksheet.language} /></p>)}</div></section> : null}
  </div>;
}
