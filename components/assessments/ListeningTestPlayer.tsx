"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getListeningCopy, listeningText } from "@/lib/listeningTests/copy";
import { listeningScore, type ListeningStudentTest } from "@/lib/listeningTests/types";
import { getListeningStartCopy } from "@/lib/listeningTests/startCopy";
import "./listeningTests.css";

export default function ListeningTestPlayer({test,locale}:{test:ListeningStudentTest;locale:string}) {
  const copy=getListeningCopy(locale), id=useId();
  const startCopy=getListeningStartCopy(locale),perTask=test.level==="A1Start";
  const [current,setCurrent]=useState(0);
  const clip=test.clips?.[current];
  const audio=useRef<HTMLAudioElement>(null), starting=useRef(false);
  const [started,setStarted]=useState(false),[submitted,setSubmitted]=useState(false);
  const [answers,setAnswers]=useState<Record<string,string|boolean>>({});
  const [used,setUsed]=useState(0),[playing,setPlaying]=useState(false),[roundFinished,setRoundFinished]=useState(true),[error,setError]=useState(false);
  const [position,setPosition]=useState(0),[duration,setDuration]=useState(0);
  const score=listeningScore(test,answers);
  useEffect(()=>{const element=audio.current;return()=>element?.pause();},[started,current]);

  async function toggleAudio() {
    const element=audio.current;
    if(!element||starting.current||submitted)return;
    if(playing){element.pause();setPlaying(false);return;}
    if(roundFinished&&used>=test.plays)return;
    starting.current=true;setError(false);
    try{
      if(roundFinished)element.currentTime=0;
      await element.play();
      if(roundFinished)setUsed(previous=>previous+1);
      setRoundFinished(false);setPlaying(true);
    }catch{setError(true);}
    finally{starting.current=false;}
  }
  function reset(){audio.current?.pause();setAnswers({});setCurrent(0);setUsed(0);setPlaying(false);setRoundFinished(true);setError(false);setPosition(0);setSubmitted(false);setStarted(false);}
  function next(){if(starting.current)return;audio.current?.pause();setCurrent(index=>index+1);setUsed(0);setPlaying(false);setRoundFinished(true);setError(false);setPosition(0);setDuration(0);}

  return <section className="listening-player">
    <header><p className="listening-kicker">321skole · {copy.studentTitle} · {perTask?startCopy.label:test.level}</p><h1 dir="auto" lang={test.language}>{test.title}</h1><p>{perTask?startCopy.instructions:copy.instructions}</p><p>{listeningText(perTask?test.playback==="teacher"?startCopy.teacherPolicy:startCopy.playPolicy:test.playback==="teacher"?copy.teacherPolicy:copy.playPolicy,{count:test.plays})}</p>{perTask&&<p className="listening-muted">{startCopy.audioHelp}</p>}{(test.aiVoice||clip?.aiVoice)&&<p className="listening-muted">{copy.aiVoice}</p>}</header>
    {!started?<button type="button" className="listening-button listening-primary" onClick={()=>setStarted(true)}>{copy.start}</button>:<>
      {perTask&&!submitted&&<p role="status" className="listening-kicker">{listeningText(startCopy.progress,{current:current+1,total:test.tasks.length})}</p>}
      {test.playback==="individual"&&(!perTask||!submitted)&&<section className="listening-audio-controls" aria-label={copy.previewAudio}>
        <audio key={clip?.taskId??"main"} ref={audio} src={perTask?clip?.audioDataUrl:test.audioDataUrl} preload="metadata" onEnded={()=>{setPlaying(false);setRoundFinished(true);}} onPause={()=>setPlaying(false)} onError={()=>setError(true)} onTimeUpdate={()=>setPosition(audio.current?.currentTime??0)} onLoadedMetadata={()=>setDuration(audio.current?.duration??0)} />
        <button type="button" className="listening-button listening-primary" disabled={submitted||roundFinished&&used>=test.plays} onClick={toggleAudio}>{playing?copy.pause:used===0?copy.play:roundFinished?copy.replay:copy.resume}</button>
        <span>{listeningText(copy.played,{used,count:test.plays})}</span>
        <progress value={position} max={Number.isFinite(duration)&&duration>0?duration:1} aria-label={copy.previewAudio} />
        {roundFinished&&used>=test.plays&&<p>{copy.noMore}</p>}{error&&<p role="alert">{copy.audioError}</p>}
      </section>}
      <form onSubmit={event=>{event.preventDefault();if(perTask&&current<test.tasks.length-1){next();return;}audio.current?.pause();setPlaying(false);setSubmitted(true);}}>
        {test.tasks.map((task,index)=>{
          if(perTask&&!submitted&&index!==current)return null;
          const options=task.type==="true_false"?[copy.trueLabel,copy.falseLabel]:task.options??[];
          const present=typeof answers[task.id]==="boolean"||typeof answers[task.id]==="string"&&String(answers[task.id]).trim().length>0;
          const correct=present&&answers[task.id]===task.correctAnswer;
          return <fieldset key={task.id} disabled={submitted} className="listening-question"><legend lang={test.language}>{index+1}. {task.prompt}</legend>
            {options.map((option,optionIndex)=>{
              const value=task.type==="true_false"?optionIndex===0:option;
              return <label className="listening-option" key={optionIndex}><input type="radio" name={`${id}-${task.id}`} checked={answers[task.id]===value} onChange={()=>setAnswers(previous=>({...previous,[task.id]:value}))}/><span dir="auto" lang={task.type==="true_false"?locale:test.language}>{option}</span></label>;
            })}
            {submitted&&<p className="listening-feedback">{present?correct?copy.correctMark:copy.wrongMark:copy.missingMark} · {copy.correct}: {task.type==="true_false"?task.correctAnswer?copy.trueLabel:copy.falseLabel:String(task.correctAnswer)}</p>}
          </fieldset>;
        })}
        {!submitted&&(perTask&&current<test.tasks.length-1?<button key="next" className="listening-button listening-primary" type="button" onClick={event=>{event.preventDefault();next();}}>{startCopy.next}</button>:<button key="submit" className="listening-button listening-primary" type="submit">{copy.submit}</button>)}
      </form>
      {submitted&&<section className="listening-result" role="status"><h2>{listeningText(copy.result,{correct:score.correct,total:score.total})}</h2><p>{listeningText(copy.unanswered,{count:score.unanswered})}</p><p>{copy.resultHelp}</p><button type="button" className="listening-button" onClick={reset}>{copy.restart}</button></section>}
    </>}
    <p className="listening-muted">{copy.localOnly}</p>
  </section>;
}
