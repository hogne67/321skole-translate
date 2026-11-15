"use client";

import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { PLACE_VALUE_TASKS_PER_PAGE, getPlaceValueCopy, gradePlaceValueTask, gradePlaceValueWorksheet, placeValueColumn, placeValueExponents, placeValueNumberTokens, placeValueTaskAnswer, placeValueTaskPrompt, readPlaceValueAnswer, type PlaceValueAnswer, type PlaceValueSettings, type PlaceValueWorksheet } from "@/lib/math/place-value/worksheet";
import "../length/length.css";
import "./place-value.css";

function PlaceValueTable({ settings, language, label, answer, printMode, readOnly, onChange }: { settings: PlaceValueSettings; language: string; label: string; answer: PlaceValueAnswer; printMode: boolean; readOnly: boolean; onChange: (next: Partial<PlaceValueAnswer>) => void }) {
  const copy = getPlaceValueCopy(language), exponents = placeValueExponents(settings);
  return <div className="place-value-table-scroll" role="region" aria-label={`${label}: ${copy.table}`} tabIndex={0}>
    <table className="place-value-table"><caption className="sr-only">{copy.table}</caption><thead><tr>{exponents.map(exponent => <th key={exponent} scope="col" className={exponent === -1 ? "place-value-decimal-boundary" : ""}>{placeValueColumn(exponent, language)}</th>)}</tr></thead>
      <tbody><tr>{exponents.map((exponent, index) => <td key={exponent} className={exponent === -1 ? "place-value-decimal-boundary" : ""}>{printMode ? <span className="place-value-cell-space" /> : <input aria-label={`${label}: ${placeValueColumn(exponent, language)}`} type="text" inputMode="numeric" autoComplete="off" maxLength={1} readOnly={readOnly} value={answer.table[index]} onChange={event => onChange({ table: answer.table.map((digit, i) => i === index ? event.target.value.replace(/\D/g, "") : digit) })} />}</td>)}</tr></tbody>
    </table>
  </div>;
}

export default function PlaceValueWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: PlaceValueWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: PlaceValueAnswer) => void; readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getPlaceValueCopy(worksheet.language), settings = worksheet.settings, grade = gradePlaceValueWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / PLACE_VALUE_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * PLACE_VALUE_TASKS_PER_PAGE, (i + 1) * PLACE_VALUE_TASKS_PER_PAGE));
  return <div ref={printRef} className={`length-sheet place-value-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {settings.showPlaceValueTable ? <p className="place-value-hint"><MathText text={copy.tableHelp} /></p> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks place-value-tasks">{tasks.map((task, index) => {
        const number = page * PLACE_VALUE_TASKS_PER_PAGE + index + 1, label = `${common.task} ${number}`, answer = readPlaceValueAnswer(printMode ? null : answersByTaskId[task.id], settings.integerDigits + settings.decimalPlaces), result = gradePlaceValueTask(task, settings, answersByTaskId[task.id]);
        const change = (next: Partial<PlaceValueAnswer>) => onAnswerChange?.(task.id, { ...answer, ...next });
        return <div className="length-task place-value-task" key={task.id} data-task-type={task.type}>
          <div className="place-value-heading"><span className="length-number">{number}</span><strong><MathText text={placeValueTaskPrompt(task, settings, worksheet.language)} /></strong></div>
          {task.type === "digit_value" ? <div className="place-value-marked-number" aria-label={copy.markedDigit}>{placeValueNumberTokens(task, settings, worksheet.language).map((token, i) => token.exponent === task.targetExponent ? <mark key={i}>{token.text}</mark> : <span key={i}>{token.text}</span>)}</div> : null}
          {settings.showPlaceValueTable ? <PlaceValueTable settings={settings} language={worksheet.language} label={label} answer={answer} printMode={printMode} readOnly={readOnly} onChange={change} /> : null}
          <div className="place-value-answer">{printMode ? <><span>{copy.answer}:</span><span className="place-value-answer-space" /></> : <label>{copy.answer}<input aria-label={`${label}: ${copy.answer}`} type="text" inputMode="text" autoComplete="off" maxLength={240} value={answer.value} readOnly={readOnly} onChange={event => change({ value: event.target.value })} /></label>}</div>
          {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${placeValueTaskAnswer(task, settings, worksheet.language)}`}</p> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key place-value-key"><h2>{common.answerKey}</h2>{worksheet.tasks.map((task, i) => <div className="place-value-key-item" key={task.id}><strong>{i + 1}.</strong> {placeValueTaskAnswer(task, settings, worksheet.language)}</div>)}</section> : null}
  </div>;
}
