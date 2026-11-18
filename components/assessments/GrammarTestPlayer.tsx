"use client";
import { useId } from "react";
import { gradeGrammar,type GrammarTask } from "@/lib/grammarTests/types";
import { useGrammarAudio } from "@/lib/grammarTests/useGrammarAudio";
import type { GrammarAudioSource } from "@/lib/grammarTests/audio";

export default function GrammarTestPlayer({tasks,answers,onChange,disabled=false,showResults=false,audioEnabled=false,audioSource}:{tasks:GrammarTask[];answers:Record<string,unknown>;onChange?:(answers:Record<string,unknown>)=>void;disabled?:boolean;showResults?:boolean;audioEnabled?:boolean;audioSource?:GrammarAudioSource}){
  const id=useId(),grade=showResults?gradeGrammar(tasks,answers):null;
  const audio=useGrammarAudio(audioEnabled?audioSource:undefined,showResults);
  return <section className="grammar-player" lang="nb" aria-label="Setninger og grammatikk">
    <p>Velg riktig ord eller form i hver setning.</p>
    {audioEnabled&&<div className="grammar-audio-bar"><p>{showResults?"Du kan høre hele setningen med riktig svar.":"Du kan høre setningen med en pause ved tomrommet."}</p>{!audioSource&&<p>Lagre endringene for å prøve lydstøtten.</p>}{audio.active&&<button type="button" onClick={audio.stop}>Stopp lyd</button>}{audio.error&&<p role="alert">{audio.error}</p>}</div>}
    {grade&&<p role="status" className="grammar-notice">{grade.correctAuto} av {grade.totalAuto} riktige · {grade.wrongAuto} feil · {grade.unansweredAuto} ubesvart</p>}
    <ol>{tasks.map((task,index)=>{
      const [before,after]=task.prompt.split("___"),value=typeof answers[task.id]==="string"?answers[task.id] as string:"",entry=grade?.byTask[task.id];
      return <li key={task.id}><label htmlFor={`${id}-${task.id}`}><span className="grammar-sr">Setning {index+1}: </span>{before}<select id={`${id}-${task.id}`} aria-label={`Velg ord i setning ${index+1}: ${task.prompt}`} value={task.options.includes(value)?value:""} disabled={disabled} onChange={event=>onChange?.({...answers,[task.id]:event.target.value})}><option value="">Velg …</option>{task.options.map(option=><option key={option} value={option}>{option}</option>)}</select>{after}</label>
        {audioEnabled&&<button type="button" className="grammar-audio-button" disabled={!audioSource} aria-label={`${showResults?"Hør hele setningen":"Hør setning"} ${index+1}`} aria-pressed={audio.active===task.id} onClick={()=>void audio.play(task.id)}>{audio.active===task.id?"◼ Spiller av …":"🔊 " + (showResults?"Hør hele setningen":"Hør setningen")}</button>}
        {entry&&<div className={`grammar-result ${entry.isCorrect?"grammar-correct":"grammar-wrong"}`}><strong>{!entry.studentAnswer?"Ubesvart":entry.isCorrect?"Riktig":"Feil"}</strong> · Riktig svar: {task.correctAnswer}<p>{task.explanation}</p></div>}
      </li>;
    })}</ol>
  </section>;
}
