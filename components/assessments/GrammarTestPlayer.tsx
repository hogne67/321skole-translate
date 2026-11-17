"use client";
import { useId } from "react";
import { gradeGrammar,type GrammarTask } from "@/lib/grammarTests/types";

export default function GrammarTestPlayer({tasks,answers,onChange,disabled=false,showResults=false}:{tasks:GrammarTask[];answers:Record<string,unknown>;onChange?:(answers:Record<string,unknown>)=>void;disabled?:boolean;showResults?:boolean}){
  const id=useId(),grade=showResults?gradeGrammar(tasks,answers):null;
  return <section className="grammar-player" lang="nb" aria-label="Setninger og grammatikk">
    <p>Velg riktig ord eller form i hver setning.</p>
    {grade&&<p role="status" className="grammar-notice">{grade.correctAuto} av {grade.totalAuto} riktige · {grade.wrongAuto} feil · {grade.unansweredAuto} ubesvart</p>}
    <ol>{tasks.map((task,index)=>{
      const [before,after]=task.prompt.split("___"),value=typeof answers[task.id]==="string"?answers[task.id] as string:"",entry=grade?.byTask[task.id];
      return <li key={task.id}><label htmlFor={`${id}-${task.id}`}><span className="grammar-sr">Setning {index+1}: </span>{before}<select id={`${id}-${task.id}`} aria-label={`Velg ord i setning ${index+1}: ${task.prompt}`} value={task.options.includes(value)?value:""} disabled={disabled} onChange={event=>onChange?.({...answers,[task.id]:event.target.value})}><option value="">Velg …</option>{task.options.map(option=><option key={option} value={option}>{option}</option>)}</select>{after}</label>
        {entry&&<div className={`grammar-result ${entry.isCorrect?"grammar-correct":"grammar-wrong"}`}><strong>{!entry.studentAnswer?"Ubesvart":entry.isCorrect?"Riktig":"Feil"}</strong> · Riktig svar: {task.correctAnswer}<p>{task.explanation}</p></div>}
      </li>;
    })}</ol>
  </section>;
}
