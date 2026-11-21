"use client";
import type { Ref } from "react";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { formatSequencesValue, getSequencesCopy, gradeSequencesTask, gradeSequencesWorksheet, readSequencesAnswer, sequencesAnswerText, sequencesExpected, sequencesFamily, sequencesFieldLabel, sequencesSolution, sequencesTaskPrompt, sequencesValues, type SequencesAnswer, type SequencesTask, type SequencesWorksheet } from "@/lib/math/sequences/worksheet";
import { sequencesPrintPages } from "@/lib/math/sequences/printLayout";
import SequenceSupport, { PatternFigures } from "./SequenceSupport";
import MathText from "../MathTextSupport";
import "../length/length.css";
import "./sequences.css";

function DrawingGrid({answer,label,readOnly,printMode,onChange}:{answer:SequencesAnswer;label:string;readOnly:boolean;printMode:boolean;onChange:(next:Partial<SequencesAnswer>)=>void}){
  return <div className="sequences-drawing" role="group" aria-label={label}>{Array.from({length:36},(_,i)=>printMode?<span key={i}/>:<button type="button" key={i} aria-label={`${label}: ${Math.floor(i/6)+1}, ${i%6+1}`} aria-pressed={answer.cells.includes(i)} disabled={readOnly} onClick={()=>onChange({cells:answer.cells.includes(i)?answer.cells.filter(n=>n!==i):[...answer.cells,i]})}/>)}</div>;
}
export default function SequencesWorksheetView({worksheet,answersByTaskId={},onAnswerChange,readOnly=false,showAutoCheck=false,printMode=false,printRef}:{worksheet:SequencesWorksheet;answersByTaskId?:Record<string,unknown>;onAnswerChange?:(id:string,value:SequencesAnswer)=>void;readOnly?:boolean;showAutoCheck?:boolean;printMode?:boolean;printRef?:Ref<HTMLDivElement>}){
  const common=getMeasurementCopy(worksheet.language),copy=getSequencesCopy(worksheet.language),grade=gradeSequencesWorksheet(worksheet,answersByTaskId);
  const pages=printMode?sequencesPrintPages(worksheet.tasks,worksheet.settings.taskType,worksheet.settings.showSupport):[{tasks:worksheet.tasks,startIndex:0}];
  function field(task:SequencesTask,key:string,answer:SequencesAnswer,label:string,change:(next:Partial<SequencesAnswer>)=>void){
    const fieldLabel=sequencesFieldLabel(task,key,worksheet.language);
    return <label className="sequences-field" key={key}>{fieldLabel}{printMode?<span className="sequences-blank"/>:<input type="text" inputMode="text" aria-label={`${label}: ${fieldLabel}`} maxLength={40} autoComplete="off" readOnly={readOnly} value={answer.fields[key]??""} onChange={event=>change({fields:{...answer.fields,[key]:event.target.value}})}/>}</label>;
  }
  return <div ref={printRef} className={`length-sheet sequences-sheet${printMode?" length-paper":""}${worksheet.settings.showSupport?" sequences-with-support":""}`}>
    {pages.map(({tasks,startIndex},page)=><section className="length-page" key={startIndex}>
      {page===0?<><div className="length-brand"><img src="/logo321ny.png" alt={worksheet.language==="nb"?"321 skole":"321 school"} width={40} height={40}/><div><strong>{worksheet.language==="nb"?"321 skole":"321 school"}</strong><small>321school.com</small></div><span>{common.worksheet}</span></div>
      <h2>{worksheet.title}</h2><div className="length-instructions"><MathText text={worksheet.instructions}/></div>
      {printMode?<div className="length-identity"><span>{common.name}:</span><span>{common.date}:</span><span>{common.className}:</span></div>:<p className="sequences-note">{copy.checkNote}</p>}
      {showAutoCheck&&!printMode?<p className="length-summary">{common.correct}: {grade.correctAuto} · {copy.partialCount}: {grade.partialAuto} · {common.wrong}: {grade.wrongAuto} · {common.unanswered}: {grade.unansweredAuto} · {common.score}: {grade.percentAuto}%</p>:null}</>:<h2 className="length-continuation">{worksheet.title}</h2>}
      <div className="length-tasks sequences-tasks">{tasks.map((task,i)=>{
        const number=startIndex+i+1,label=`${common.task} ${number}`,answer=readSequencesAnswer(printMode?undefined:answersByTaskId[task.id]),result=gradeSequencesTask(task,answersByTaskId[task.id]);
        const change=(next:Partial<SequencesAnswer>)=>onAnswerChange?.(task.id,{...answer,...next});
        return <div className={`length-task sequences-task sequences-notation-${task.notation}${task.type==="figures"?" sequences-figure-task":""}`} key={task.id} data-task-type={task.type}>
          <div className="sequences-heading"><span className="length-number">{number}</span><strong><MathText text={sequencesTaskPrompt(task,worksheet.language)}/></strong></div>
          {task.type==="figures"?<><PatternFigures task={task} language={worksheet.language}/><div className="sequences-figure-answer"><div><span>{copy.draw}</span><DrawingGrid answer={answer} label={`${label}: ${copy.draw}`} printMode={printMode} readOnly={readOnly} onChange={change}/></div><div className="sequences-answer-fields">{Object.keys(sequencesExpected(task)).map(key=>field(task,key,answer,label,change))}</div></div></>:<>
            <p className="sequences-family"><MathText text={sequencesFamily(task,worksheet.language)}/></p>
            <div className="sequences-strip" role="group" aria-label={label}>{sequencesValues(task).map((v,index)=>task.hidden.includes(index)?<label key={index} className="sequences-slot"><span>{copy.term} {index+1}</span>{printMode?<span className="sequences-box"/>:<input aria-label={`${label}: ${copy.term} ${index+1}`} autoComplete="off" readOnly={readOnly} type="text" maxLength={40} value={answer.fields[String(index)]??""} onChange={e=>change({fields:{...answer.fields,[String(index)]:e.target.value}})}/>}</label>:<span className="sequences-given" key={index}>{formatSequencesValue(v,task.notation,worksheet.language)}</span>)}</div>
            {task.type==="rule"?<div className="sequences-answer-fields">{Object.keys(sequencesExpected(task)).map(key=>field(task,key,answer,label,change))}</div>:null}
            {worksheet.settings.showSupport?<SequenceSupport task={task} language={worksheet.language}/>:null}
          </>}
          {printMode?<div className="sequences-working"><span>{copy.explanation}:</span><span/></div>:<label className="sequences-explanation">{copy.explanation}<textarea aria-label={`${label}: ${copy.explanation}`} rows={2} maxLength={2000} readOnly={readOnly} value={answer.working} onChange={event=>change({working:event.target.value})}/></label>}
          {showAutoCheck&&!printMode?<p className={`length-result ${result.isCorrect?"length-correct":"length-wrong"}`}>{!result.isAnswered?common.unanswered:result.isCorrect?common.correct:`${result.isPartial?copy.partial:common.wrong}. ${copy.answer}: ${sequencesAnswerText(task,worksheet.language)}`}</p>:null}
        </div>;
      })}</div>
    </section>)}
    {printMode&&worksheet.showAnswerKey?<section className="length-key sequences-key"><h2>{common.answerKey}</h2><div>{worksheet.tasks.map((task,i)=><div key={task.id}><strong>{i+1}. {sequencesAnswerText(task,worksheet.language)}</strong><p>{sequencesSolution(task,worksheet.language)}</p></div>)}</div></section>:null}
  </div>;
}
