"use client";

import { useState, type Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { COORDINATES_TASKS_PER_PAGE, coordinatesAnswerPoints, coordinatesClosed, coordinatesExpected, coordinatesLabel, coordinatesTaskAnswer, coordinatesTaskPrompt, getCoordinatesCopy, gradeCoordinatesTask, gradeCoordinatesWorksheet, readCoordinatesAnswer, type CoordinatesAnswer, type CoordinatesSettings, type CoordinatesTask, type CoordinatesWorksheet } from "@/lib/math/coordinates/worksheet";
import CoordinatesGrid from "./CoordinatesGrid";
import "../length/length.css";
import "./coordinates.css";

function CoordinatesTaskCard({ task, settings, language, number, value, onChange, readOnly, printMode, showAutoCheck }: {
  task: CoordinatesTask; settings: CoordinatesSettings; language: string; number: number; value: unknown; onChange?: (value: CoordinatesAnswer) => void;
  readOnly: boolean; printMode: boolean; showAutoCheck: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const copy = getCoordinatesCopy(language), common = getMeasurementCopy(language), answer = readCoordinatesAnswer(printMode ? undefined : value, task.points.length);
  const label = `${common.task} ${number}`, reflected = task.type === "reflect", plot = task.type !== "read_points", result = gradeCoordinatesTask(task, value);
  function update(index: number, point: { x: string; y: string }) { onChange?.({ points: answer.points.map((p, i) => i === index ? point : p) }); }
  return <div className="length-task coordinates-task" data-task-type={task.type}>
    <div className="coordinates-heading"><span className="length-number">{number}</span><strong><MathText text={coordinatesTaskPrompt(task, language)} /></strong></div>
    {task.type === "place_points" || task.type === "draw_figure" ? <p className="coordinates-targets">{task.points.map((p, i) => <span key={i}>{coordinatesLabel(i)} = ({p.x}, {p.y})</span>)}</p> : null}
    {plot && !printMode && !readOnly ? <div className="coordinates-point-picker"><span>{copy.activePoint}:</span>{task.points.map((_, i) => <button type="button" key={i} aria-label={`${label}: ${copy.activePoint} ${coordinatesLabel(i, reflected)}`} aria-pressed={activeIndex === i} onClick={() => setActiveIndex(i)}>{coordinatesLabel(i, reflected)}</button>)}</div> : null}
    <CoordinatesGrid settings={settings} language={language} label={label} sourcePoints={task.type === "read_points" || reflected ? task.points : []} sourceClosed={reflected && coordinatesClosed(task)}
      answerPoints={plot && !printMode ? coordinatesAnswerPoints(value, task.points.length) : []} answersClosed={coordinatesClosed(task)} reflected={reflected} reflectionAxis={reflected ? task.axis : undefined} activeIndex={activeIndex}
      onSelect={plot && !printMode && !readOnly ? point => update(activeIndex, { x: String(point.x), y: String(point.y) }) : undefined} />
    <p className="coordinates-scale">{copy.gridStep.replace("{step}", String(settings.step))}</p>
    {settings.showSupport ? <p className="coordinates-hint"><MathText text={reflected ? copy.reflectHint : copy.readHint} /></p> : null}
    {plot && !printMode && !readOnly ? <p className="coordinates-hint">{copy.plotHint}</p> : null}
    {!printMode || task.type === "read_points" ? <div className="coordinates-answer-fields">{answer.points.map((p, i) => <div className="coordinates-answer-row" key={i}><strong>{coordinatesLabel(i, reflected)}</strong><span>= (</span>{(["x", "y"] as const).map((axis, j) => <span className="coordinates-coordinate" key={axis}>{j === 1 ? <span>,</span> : null}{printMode ? <span className="coordinates-blank" /> : <input type="text" inputMode="text" autoComplete="off" maxLength={20} aria-label={`${label}: ${copy.point} ${coordinatesLabel(i, reflected)}, ${axis}`} value={p[axis]} readOnly={readOnly} onChange={event => update(i, { ...p, [axis]: event.target.value })} />}</span>)}<span>)</span></div>)}</div> : null}
    {showAutoCheck && !printMode ? <p className={`length-result ${result.isCorrect ? "length-correct" : "length-wrong"}`}>{!result.isAnswered ? common.unanswered : result.isCorrect ? common.correct : `${result.isPartial ? copy.partial : common.wrong}. ${common.answer}: ${coordinatesTaskAnswer(task)}`}</p> : null}
  </div>;
}
export default function CoordinatesWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: CoordinatesWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: CoordinatesAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const common = getMeasurementCopy(worksheet.language), copy = getCoordinatesCopy(worksheet.language), grade = gradeCoordinatesWorksheet(worksheet, answersByTaskId);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / COORDINATES_TASKS_PER_PAGE) }, (_, i) => worksheet.tasks.slice(i * COORDINATES_TASKS_PER_PAGE, (i + 1) * COORDINATES_TASKS_PER_PAGE));
  return <div ref={printRef} className={`length-sheet coordinates-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks coordinates-tasks">{tasks.map((task, i) => <CoordinatesTaskCard key={task.id} task={task} settings={worksheet.settings} language={worksheet.language} number={page * COORDINATES_TASKS_PER_PAGE + i + 1} value={answersByTaskId[task.id]} onChange={value => onAnswerChange?.(task.id, value)} readOnly={readOnly} printMode={printMode} showAutoCheck={showAutoCheck} />)}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key coordinates-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div className="coordinates-key-item" key={task.id}><p><strong>{i + 1}.</strong> {coordinatesTaskAnswer(task)}</p>{coordinatesClosed(task) || task.type === "reflect" ? <CoordinatesGrid settings={worksheet.settings} language={worksheet.language} sourcePoints={task.type === "reflect" ? task.points : []} sourceClosed={task.type === "reflect" && coordinatesClosed(task)} answerPoints={coordinatesExpected(task)} answersClosed={coordinatesClosed(task)} reflected={task.type === "reflect"} reflectionAxis={task.type === "reflect" ? task.axis : undefined} /> : null}</div>)}</div></section> : null}
  </div>;
}
