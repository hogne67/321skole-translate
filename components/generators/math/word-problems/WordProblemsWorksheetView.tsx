"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { WORD_PROBLEMS_TASKS_PER_PAGE, getWordProblemsCopy, gradeWordProblemsTask, gradeWordProblemsWorksheet, readWordProblemsAnswer, wordProblemsAnswerText, wordProblemsPlan, wordProblemsSymbols, wordProblemsUnitLabel, wordProblemsUnitOptions, type WordProblemsAnswer, type WordProblemsWorksheet } from "@/lib/math/word-problems/worksheet";
import { wordProblemsTaskPrompt } from "@/lib/math/word-problems/prompts";
import "../length/length.css";
import "./word-problems.css";

export default function WordProblemsWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: WordProblemsWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: WordProblemsAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getWordProblemsCopy(worksheet.language), grade = gradeWordProblemsWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / WORD_PROBLEMS_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * WORD_PROBLEMS_TASKS_PER_PAGE, (i + 1) * WORD_PROBLEMS_TASKS_PER_PAGE));
  return <div ref={printRef} className={`length-sheet word-problems-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : <p className="word-problems-note">{copy.checkNote}</p>}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partialCount}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks word-problems-tasks">{tasks.map((task, i) => {
        const number = page * WORD_PROBLEMS_TASKS_PER_PAGE + i + 1, answer = readWordProblemsAnswer(printMode ? undefined : answersByTaskId[task.id]), result = gradeWordProblemsTask(task, answersByTaskId[task.id]);
        const label = `${common.task} ${number}`, change = (next: Partial<WordProblemsAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task word-problems-task" key={task.id} data-task-type={task.type}>
          <div className="word-problems-heading"><span className="length-number">{number}</span><strong><MathText text={wordProblemsTaskPrompt(task, worksheet.language)} /></strong></div>
          {worksheet.settings.showSupport ? <p className="word-problems-hint"><MathText text={task.values.length === 3 ? copy.twoHint : copy.hint} /></p> : null}
          <div className="word-problems-working">{printMode ? <><span>{copy.working}:</span><div className="word-problems-lines" /></> : <label>{copy.working}<textarea aria-label={`${label}: ${copy.working}`} rows={3} maxLength={2000} value={answer.working} readOnly={readOnly} onChange={event => change({ working: event.target.value })} /></label>}</div>
          <div className="word-problems-answer">{printMode ? <><span>{copy.answer}:</span><span className="word-problems-blank" /></> : <>
            <label>{copy.answer}<input type="text" inputMode="decimal" autoComplete="off" maxLength={40} aria-label={`${label}: ${copy.answer}`} value={answer.value} readOnly={readOnly} onChange={event => change({ value: event.target.value })} /></label>
            <label>{copy.unit}<select aria-label={`${label}: ${copy.unit}`} disabled={readOnly} value={answer.unit} onChange={event => change({ unit: event.target.value })}><option value="">{copy.chooseUnit}</option>{wordProblemsUnitOptions(task).map(unit => <option key={unit} value={unit}>{wordProblemsUnitLabel(unit, worksheet.language)}</option>)}</select></label>
          </>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${wordProblemsAnswerText(task, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key word-problems-key"><h2>{common.answerKey}</h2><p>{copy.example}</p>{worksheet.tasks.map((task, i) => {
      return <div className="word-problems-key-item" key={task.id}><strong>{i + 1}. {wordProblemsAnswerText(task, worksheet.language)}</strong><p>{wordProblemsPlan(task).map(step => `${step.left} ${wordProblemsSymbols[step.operation]} ${step.right} = ${step.result}`).join(" · ")}</p></div>;
    })}</section> : null}
  </div>;
}
