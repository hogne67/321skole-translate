"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { STATISTICS_TASKS_PER_PAGE, getStatisticsCopy, gradeStatisticsTask, gradeStatisticsWorksheet, parseStatisticsNumber, readStatisticsEntries, statisticsTaskAnswer, statisticsTaskPrompt, type StatisticsAnswer, type StatisticsWorksheet } from "@/lib/math/statistics/worksheet";
import StatisticsDiagram from "./StatisticsDiagram";
import StatisticsFrequencyTable from "./StatisticsFrequencyTable";
import "../length/length.css";
import "./statistics.css";

export default function StatisticsWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: StatisticsWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: StatisticsAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getStatisticsCopy(worksheet.language);
  const grade = gradeStatisticsWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / STATISTICS_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * STATISTICS_TASKS_PER_PAGE, (i + 1) * STATISTICS_TASKS_PER_PAGE));
  return <div ref={printRef} className={`length-sheet statistics-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks statistics-tasks">{tasks.map((task, index) => {
        const number = page * STATISTICS_TASKS_PER_PAGE + index + 1, value = answersByTaskId[task.id], label = `${common.task} ${number}`;
        const entries = readStatisticsEntries(printMode ? undefined : value, task.dataset.values.length);
        const result = gradeStatisticsTask(task, value), prompt = statisticsTaskPrompt(task, worksheet.language);
        const answer = typeof value === "string" ? value : "";
        const table = <StatisticsFrequencyTable dataset={task.dataset} language={worksheet.language} label={label} />;
        return <div className="length-task statistics-task" key={task.id} data-task-type={task.type}>
          <div className="statistics-heading"><span className="length-number">{number}</span><strong><MathText text={prompt} /></strong></div>
          <h3>{copy[task.dataset.theme]}</h3>
          {task.type === "frequency_table" ? <>
            <p className="statistics-observations"><strong>{copy.observations}:</strong> {task.observations.join(", ")}</p>
            <StatisticsFrequencyTable dataset={task.dataset} language={worksheet.language} label={label} blank={printMode} entries={printMode ? undefined : entries} readOnly={readOnly} onChange={frequencies => onAnswerChange?.(task.id, { frequencies })} />
          </> : task.type === "central_tendency" ? table : <>
            {task.type === "draw_chart" ? table : null}
            <StatisticsDiagram dataset={task.dataset} chart={task.chart} language={worksheet.language} showSupport={worksheet.settings.showSupport} label={label}
              frequencies={task.type === "draw_chart" ? entries.map(entry => parseStatisticsNumber(entry)?.valueOf() ?? null) : task.dataset.frequencies} student={task.type === "draw_chart"}
              onSelect={task.type === "draw_chart" && !printMode && !readOnly ? (i, frequency) => onAnswerChange?.(task.id, { frequencies: entries.map((entry, j) => i === j ? String(frequency) : entry) }) : undefined} />
            {task.type === "draw_chart" && !printMode && !readOnly ? <p className="statistics-hint">{copy.plotHint}</p> : null}
            {task.type === "draw_chart" && !printMode ? <StatisticsFrequencyTable dataset={task.dataset} language={worksheet.language} label={`${label}: ${copy.studentChart}`} entries={entries} readOnly={readOnly} onChange={frequencies => onAnswerChange?.(task.id, { frequencies })} /> : null}
          </>}
          {task.type === "read_chart" || task.type === "central_tendency" ? <>
            {task.type === "central_tendency" && worksheet.settings.showSupport ? <p className="statistics-hint"><MathText text={copy[`${task.metric}Hint`]} /></p> : null}
            <div className="statistics-answer">{!printMode ? <><label htmlFor={`statistics-${task.id}`}>{common.answer}:</label><input id={`statistics-${task.id}`} aria-label={`${label}: ${common.answer}`} type="text" autoComplete="off" inputMode="text" maxLength={40} value={answer} readOnly={readOnly} onChange={event => onAnswerChange?.(task.id, event.target.value)} /></> : <>{common.answer}: <span className="length-answer-space" /></>}</div>
          </> : null}
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${statisticsTaskAnswer(task, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key statistics-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, index) => <div key={task.id} className="statistics-key-item"><p><strong>{index + 1}.</strong> {statisticsTaskAnswer(task, worksheet.language)}</p>{task.type === "draw_chart" ? <StatisticsDiagram dataset={task.dataset} chart={task.chart} language={worksheet.language} showSupport /> : null}</div>)}</div></section> : null}
  </div>;
}
