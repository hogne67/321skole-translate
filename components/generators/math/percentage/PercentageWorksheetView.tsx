"use client";
import type { Ref } from "react";
import MathText from "../MathTextSupport";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getPercentageCopy, gradePercentageTask, gradePercentageWorksheet, isPercentageChange, percentageFinalValue, percentageTasksPerPage, percentagePrompt, readPercentageAnswer, type PercentageAnswer, type PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import "../length/length.css";
import "./percentage.css";

export default function PercentageWorksheetView({ worksheet, answersByTaskId = {}, onAnswerChange, readOnly = false, showAutoCheck = false, printMode = false, printRef }: {
  worksheet: PercentageWorksheet; answersByTaskId?: Record<string, unknown>; onAnswerChange?: (id: string, value: PercentageAnswer) => void;
  readOnly?: boolean; showAutoCheck?: boolean; printMode?: boolean; printRef?: Ref<HTMLDivElement>;
}) {
  const copy = getPercentageCopy(worksheet.language), common = getMeasurementCopy(worksheet.language);
  const grade = gradePercentageWorksheet(worksheet, answersByTaskId), perPage = percentageTasksPerPage(worksheet.settings);
  const pages = Array.from({ length: Math.ceil(worksheet.tasks.length / perPage) }, (_, i) => worksheet.tasks.slice(i * perPage, (i + 1) * perPage));
  function fitConclusion(element: HTMLTextAreaElement | null) {
    if (!element) return;
    const resize = () => {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight + 2}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== element.clientWidth) {
        width = element.clientWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }
  return <div ref={printRef} className={`length-sheet percentage-sheet${printMode ? " length-paper" : ""}`}>
    {pages.map((tasks, page) => <section className="length-page" key={page}>
      {page === 0 ? <>
        <div className="length-brand"><img src="/logo321ny.png" alt="321 skole" width={40} height={40} /><div><strong>321 skole</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
        <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions} /></div>
        {printMode ? <div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div> : null}
        {showAutoCheck && !printMode ? <p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partial}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p> : null}
      </> : <h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks">{tasks.map((task, i) => {
        const number = page * perPage + i + 1, findPart = task.type === "find_part", findWhole = task.type === "find_whole", changeTask = isPercentageChange(task.type), answer = readPercentageAnswer(answersByTaskId[task.id], task.type), result = gradePercentageTask(task, answer);
        const amountLabel = task.type === "discount" ? copy.discountAmount : copy.increaseAmount;
        const firstLabel = findPart || changeTask ? copy.percentNumber : copy.part, secondLabel = changeTask ? copy.originalPrice : findPart ? copy.whole : copy.hundred;
        const denominatorLabel = findWhole ? copy.percentNumber : findPart || changeTask ? copy.hundred : copy.whole, resultLabel = changeTask ? amountLabel : findWhole ? copy.whole : findPart ? copy.part : copy.percentNumber;
        const slot = (field: keyof PercentageAnswer, label: string) => printMode ? <span className="percentage-blank" aria-label={label} /> : <input type="text" inputMode="decimal" autoComplete="off" maxLength={18} aria-label={`${common.task} ${number}: ${label}`} value={answer[field] ?? ""} readOnly={readOnly} onChange={e => onAnswerChange?.(task.id, { ...answer, [field]: e.target.value })} />;
        return <div className={`length-task percentage-task${changeTask ? " percentage-change-task" : ""}`} data-task-type={task.type} key={task.id}>
          <div className="percentage-prompt"><span className="length-number">{number}</span><span><MathText text={percentagePrompt(task, worksheet.language)} /></span></div>
          <div className="percentage-equation percentage-part-equation">
              <div className="percentage-fraction percentage-part-fraction">
                <div className="percentage-product">
                  <div className="percentage-factor">{worksheet.settings.showSupport ? <span className="percentage-support">{firstLabel}</span> : null}{slot("numerator", firstLabel)}</div>
                  <span className="percentage-times">×</span>
                  <div className="percentage-factor">{worksheet.settings.showSupport ? <span className="percentage-support">{secondLabel}</span> : null}{slot("multiplier", secondLabel)}</div>
                </div><span className="percentage-bar" />{slot("denominator", denominatorLabel)}
                {worksheet.settings.showSupport ? <span className="percentage-support">{denominatorLabel}</span> : null}
              </div><span>=</span><div className="percentage-result">{changeTask && worksheet.settings.showSupport ? <span className="percentage-result-label percentage-support">{amountLabel}</span> : null}{slot(task.type === "find_percentage" ? "percent" : "result", resultLabel)}</div>
          </div>
          {changeTask ? <div className="percentage-equation percentage-change-equation"><span className="percentage-new-price-label">{copy.newPrice}:</span><span>{task.whole}</span><span>{task.type === "discount" ? "−" : "+"}</span>{slot("change", amountLabel)}<span>=</span>{slot("finalValue", copy.newPrice)}</div> : null}
          {printMode ? <div className={`percentage-working${worksheet.settings.showConclusion ? " percentage-conclusion-line" : ""}`}>{worksheet.settings.showConclusion ? `${copy.conclusion}:` : null}</div> : worksheet.settings.showConclusion ? <label className="percentage-conclusion">{copy.conclusion}<textarea rows={1} maxLength={500} aria-label={`${common.task} ${number}: ${copy.conclusion}`} value={answer.conclusion ?? ""} readOnly={readOnly} ref={fitConclusion} onChange={e => onAnswerChange?.(task.id, { ...answer, conclusion: e.target.value })} /></label> : null}
          {showAutoCheck && !printMode ? <div className="percentage-feedback">
            {!result.isAnswered ? <p>{common.unanswered}</p> : changeTask ? <>
              <p className={result.fractionSetupCorrect ? "length-correct" : "length-wrong"}>{copy.setup}: {result.fractionSetupCorrect ? common.correct : `${common.wrong}. ${copy.changeSetupHelp}`} {result.fractionSetupCorrect && !result.directSetup ? copy.equivalentSetup : ""}</p>
              <p className={result.changeCorrect ? "length-correct" : "length-wrong"}>{amountLabel}: {result.changeCorrect ? common.correct : `${common.wrong}. ${common.answer}: ${task.part}`}</p>
              <p className={result.transitionSetupCorrect ? "length-correct" : "length-wrong"}>{copy.newPriceSetup}: {result.transitionSetupCorrect ? common.correct : `${common.wrong}. ${task.type === "discount" ? copy.discountSetupHelp : copy.increaseSetupHelp}`}</p>
              <p className={result.finalCorrect ? "length-correct" : "length-wrong"}>{copy.newPrice}: {result.finalCorrect ? common.correct : `${common.wrong}. ${common.answer}: ${percentageFinalValue(task)}`}</p>
            </> : <>
              <p className={result.setupCorrect ? "length-correct" : "length-wrong"}>{copy.setup}: {result.setupCorrect ? common.correct : common.wrong}. {result.setupCorrect && !result.directSetup ? copy.equivalentSetup : !result.setupCorrect ? /%/.test(answer.numerator + answer.denominator + (answer.multiplier ?? "")) ? copy.numberHelp : findWhole ? copy.wholeSetupHelp : findPart ? copy.partSetupHelp : copy.percentageSetupHelp : ""}</p>
              <p className={result.answerCorrect ? "length-correct" : "length-wrong"}>{resultLabel}: {result.answerCorrect ? common.correct : `${common.wrong}. ${common.answer}: ${findWhole ? task.whole : findPart ? task.part : task.percent}`}</p>
            </>}
          </div> : null}
        </div>;
      })}</div>
    </section>)}
    {printMode && worksheet.showAnswerKey ? <section className="length-key percentage-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task, i) => <div className="percentage-key-task" key={task.id}><p><small>{i + 1}.</small><span className="percentage-key-fraction"><span>{task.type === "find_part" || isPercentageChange(task.type) ? `${task.percent} × ${task.whole}` : `${task.part} × 100`}</span><span>{task.type === "find_whole" ? task.percent : task.type === "find_part" || isPercentageChange(task.type) ? 100 : task.whole}</span></span> = {task.type === "find_whole" ? task.whole : task.type === "find_part" || isPercentageChange(task.type) ? task.part : task.percent}</p>{isPercentageChange(task.type) ? <p className="percentage-key-new-price">{task.whole} {task.type === "discount" ? "−" : "+"} {task.part} = {percentageFinalValue(task)}</p> : null}</div>)}</div></section> : null}
  </div>;
}
