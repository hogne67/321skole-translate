"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AssessmentBackLink from "./AssessmentBackLink";
import ReadingTestPrintPreview from "./ReadingTestPrintPreview";
import ListeningTestPlayer from "./ListeningTestPlayer";
import { LANGUAGES } from "@/lib/languages";
import { listeningGenerationPolicy } from "@/lib/listeningTests/guidance";
import type { CefrLevel } from "@/lib/readingTests/generationGuidance";
import type { PrintableReadingTask, ReadingTestPrintContent } from "@/lib/readingTests/print";
import { getListeningCopy, listeningText } from "@/lib/listeningTests/copy";
import { LISTENING_AUDIO_TYPES, MAX_LISTENING_AUDIO_BYTES, listeningFilename, listeningStudentTest, listeningTestError, listeningTestFromGenerated, parseListeningTest, validListeningAudio, type ListeningTest } from "@/lib/listeningTests/types";
import { listeningStudentHtml } from "@/lib/listeningTests/export";
import { listeningEditHref } from "@/lib/listeningTests/persistence";
import { ListeningClientError, loadSavedListeningTest, saveListeningTest, type ListeningSavedVersion } from "@/lib/listeningTests/saved.client";
import "./listeningTests.css";

const LEVELS:CefrLevel[]=["A1","A2","B1","B2","C1","C2"];
function download(blob:Blob,filename:string){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10_000);}
function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Audio could not be opened"));reader.readAsDataURL(blob);});}

export default function ListeningTestTool({locale}:{locale:string}) {
  const copy=getListeningCopy(locale);
  const params=useSearchParams(),router=useRouter(),editId=params.get("edit")?.trim()??"";
  const [test,setTest]=useState<ListeningTest>({version:1,title:copy.studentTitle,level:"A2",language:"nb",script:"",tasks:[],plays:2,playback:"individual"});
  const [customTopic,setCustomTopic]=useState<string|null>(null);
  const [busy,setBusy]=useState<"generate"|"audio"|"save"|"load"|null>(null),[error,setError]=useState<string|null>(null),[cancelled,setCancelled]=useState(false),[digital,setDigital]=useState(false);
  const [saved,setSaved]=useState<{version:ListeningSavedVersion;test:ListeningTest;uid:string}|null>(null);
  const loadedId=useRef("");
  const controller=useRef<AbortController|null>(null);
  const requestStartedAt=useRef(0);
  const [seconds,setSeconds]=useState(0);
  const topic=customTopic??copy.topics[test.level];
  const valid=!listeningTestError(test),hasAudio=validListeningAudio(test.audioDataUrl);
  const printContent=useMemo<ReadingTestPrintContent>(()=>({title:test.title,sourceText:test.script,level:test.level,language:test.language,tasks:test.tasks,modality:"listening",plays:test.plays}),[test]);
  useEffect(()=>()=>{const pending=controller.current;controller.current=null;pending?.abort();},[]);
  useEffect(()=>{
    if(!editId||loadedId.current===editId)return;
    const active=new AbortController();controller.current=active;
    async function load(){
      await Promise.resolve();if(active.signal.aborted)return;
      setBusy("load");setError(null);requestStartedAt.current=Date.now();setSeconds(0);
      try{
        const restored=await loadSavedListeningTest(editId,AbortSignal.any([active.signal,AbortSignal.timeout(60_000)]));active.signal.throwIfAborted();
        if(controller.current!==active)return;
        setTest(restored.test);setCustomTopic(null);setSaved({version:restored.version,test:restored.test,uid:getAuth().currentUser?.uid??""});loadedId.current=editId;
      }catch(cause){if(controller.current===active)setError(cause instanceof ListeningClientError&&cause.status===401?copy.signIn:copy.loadError);}
      finally{if(controller.current===active){controller.current=null;setBusy(null);}}
    }
    void load();return()=>{if(controller.current===active)controller.current=null;active.abort();};
  },[editId,copy.loadError,copy.signIn]);
  useEffect(()=>{
    if(!busy)return;
    const active=controller.current;
    const timer=window.setInterval(()=>{if(controller.current===active)setSeconds(Math.floor((Date.now()-requestStartedAt.current)/1000));},1000);
    return()=>window.clearInterval(timer);
  },[busy]);

  function change(patch:Partial<ListeningTest>,clearAudio=false){setTest(previous=>({...previous,...patch,...(patch.tasks?{tasks:patch.tasks.map((task,index)=>({...task,order:index+1}))}:{}),...(clearAudio?{audioDataUrl:undefined,aiVoice:undefined}:{})}));setError(null);}
  function changeTask(index:number,patch:Partial<PrintableReadingTask>){setTest(previous=>({...previous,tasks:previous.tasks.map((task,i)=>i===index?{...task,...patch}:task)}));}
  function addTask(type:PrintableReadingTask["type"]){setTest(previous=>({...previous,tasks:[...previous.tasks,{id:crypto.randomUUID(),type,order:previous.tasks.length+1,prompt:"",...(type==="true_false"?{correctAnswer:true}:{options:["","",""],correctAnswer:""})}]}));}
  function cancel(){const pending=controller.current;controller.current=null;pending?.abort();setBusy(null);setCancelled(true);setError(null);}

  async function save(){
    if(controller.current||!valid)return;
    const active=new AbortController();controller.current=active;requestStartedAt.current=Date.now();setSeconds(0);setBusy("save");setError(null);setCancelled(false);
    try{
      const user=getAuth().currentUser;if(!user||user.isAnonymous||saved&&saved.uid!==user.uid)throw new ListeningClientError(401);
      const version=await saveListeningTest(test,saved?.version??null,AbortSignal.any([active.signal,AbortSignal.timeout(120_000)]));active.signal.throwIfAborted();
      if(controller.current!==active)return;
      setSaved({version,test,uid:user.uid});loadedId.current=version.id;router.replace(listeningEditHref(locale,version.id),{scroll:false});
    }catch(cause){if(controller.current===active)setError(cause instanceof ListeningClientError?cause.status===401?copy.signIn:cause.status===409?copy.saveConflict:copy.saveError:copy.saveError);}
    finally{if(controller.current===active){controller.current=null;setBusy(null);}}
  }

  async function request(kind:"generate"|"audio") {
    if(controller.current)return;
    const active=new AbortController();controller.current=active;requestStartedAt.current=Date.now();setSeconds(0);setBusy(kind);setError(null);setCancelled(false);
    const timeout=AbortSignal.timeout(kind==="generate"?listeningGenerationPolicy(test.level).totalMs+15_000:60_000);
    const signal=AbortSignal.any([active.signal,timeout]);
    try {
      const user=getAuth().currentUser;if(!user)throw Error(copy.signIn);
      const token=await user.getIdToken();signal.throwIfAborted();
      const response=await fetch(`/api/listening-tests/${kind==="generate"?"generate":"audio"}`,{method:"POST",signal,headers:{"Content-Type":"application/json",authorization:`Bearer ${token}`},
        body:JSON.stringify(kind==="generate"?{level:test.level,language:test.language,topic,audience:"learners"}:{level:test.level,language:test.language,script:test.script})});
      if(!response.ok){if(response.status===504)throw Error(copy.timeout);if(response.status===401)throw Error(copy.signIn);if(response.status===403)throw Error(copy.accessError);throw Error(kind==="generate"?copy.generationError:copy.audioError);}
      if(kind==="generate"){
        const value=await response.json();signal.throwIfAborted();if(controller.current!==active)return;
        const next=listeningTestFromGenerated(value.listeningTest,test.plays,test.playback);
        if(!next)throw Error(copy.generationError);setTest(next);
      }else{
        const blob=await response.blob();
        if(!blob.size||blob.size>MAX_LISTENING_AUDIO_BYTES||blob.type!=="audio/mpeg")throw Error(copy.audioError);
        const url=await dataUrl(blob);signal.throwIfAborted();if(controller.current!==active)return;
        setTest(previous=>({...previous,audioDataUrl:url,aiVoice:true}));
      }
    }catch(cause){if(controller.current===active)setError(timeout.aborted?copy.timeout:cause instanceof Error?cause.message:copy.generationError);}
    finally{if(controller.current===active){controller.current=null;setBusy(null);}}
  }

  async function uploadAudio(file?:File){
    if(!file)return;setError(null);
    const source={script:test.script,level:test.level,language:test.language};
    const fallback:Record<string,string>={mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",m4a:"audio/mp4",mp4:"audio/mp4",webm:"audio/webm"};
    const type=LISTENING_AUDIO_TYPES.includes(file.type)?file.type:fallback[file.name.split(".").pop()?.toLowerCase()??""];
    if(file.size>MAX_LISTENING_AUDIO_BYTES||file.size===0||!type){setError(copy.audioLimit);return;}
    try{const url=await dataUrl(new Blob([file],{type}));if(!validListeningAudio(url))throw Error();setTest(previous=>previous.script===source.script&&previous.level===source.level&&previous.language===source.language?{...previous,audioDataUrl:url,aiVoice:false}:previous);}catch{setError(copy.audioError);}
  }
  async function openPack(file?:File){
    if(!file)return;setError(null);
    if(file.size>MAX_LISTENING_AUDIO_BYTES*1.5+100_000){setError(copy.invalidPack);return;}
    try{const next=parseListeningTest(JSON.parse(await file.text()));if(!next)throw Error();setTest(next);setCustomTopic(null);setCancelled(false);setSaved(null);loadedId.current="";router.replace(`/${locale}/tools/listening-tests`,{scroll:false});}catch{setError(copy.invalidPack);}
  }
  function downloadAudio(){
    if(!validListeningAudio(test.audioDataUrl))return;
    const [head,base64]=test.audioDataUrl.split(","),binary=atob(base64),bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const type=head.slice(5,head.indexOf(";"));const extension=type.includes("wav")?"wav":type.includes("ogg")?"ogg":type.includes("webm")?"webm":type.includes("mp4")?"m4a":"mp3";
    download(new Blob([bytes],{type}),`${listeningFilename(test.title)}.${extension}`);
  }

  if(digital)return <main className="listening-tool"><button type="button" className="listening-button" onClick={()=>setDigital(false)}>{copy.closeDigital}</button><ListeningTestPlayer test={listeningStudentTest(test)} locale={locale}/></main>;
  return <main className="listening-tool">
    <AssessmentBackLink locale={locale}/><header><p className="listening-kicker">{copy.firstVersion}</p><h1>{copy.title}</h1><p>{copy.subtitle}</p></header>
    {busy==="load"&&<p role="status">{copy.loading}</p>}
    {error&&<p className="listening-error" role="alert">{error}</p>}{cancelled&&<p role="status">{copy.cancelled}</p>}
    <section className="listening-panel"><h2>{copy.settings}</h2>
      <div className="listening-grid"><label>{copy.level}<select value={test.level} disabled={!!busy} onChange={event=>change({level:event.target.value as CefrLevel},true)}>{LEVELS.map(level=><option key={level}>{level}</option>)}</select></label>
        <label>{copy.language}<select value={test.language} disabled={!!busy} onChange={event=>change({language:event.target.value},true)}>{LANGUAGES.map(language=><option key={language.code} value={language.code}>{language.label}</option>)}</select></label></div>
      <label style={{marginTop:14}}>{copy.topic}<textarea rows={3} value={topic} disabled={!!busy} onChange={event=>setCustomTopic(event.target.value)}/></label>
      <div className="listening-actions"><button className="listening-button listening-primary" disabled={!!busy} onClick={()=>request("generate")}>{busy==="generate"?copy.generating:copy.generate}</button>{(busy==="generate"||busy==="audio")&&<button className="listening-button" onClick={cancel}>{copy.cancel}</button>}{customTopic!==null&&<button className="listening-button" disabled={!!busy} onClick={()=>setCustomTopic(null)}>{copy.suggestion}</button>}</div>
      {(busy==="generate"||busy==="audio"||busy==="save")&&<div role="status"><p>{busy==="generate"?copy.generating:busy==="save"?copy.saving:copy.makingAudio}</p><p aria-live="off" className="listening-muted">{listeningText(copy.elapsed,{seconds})}</p></div>}<p className="listening-muted">{copy.budget}</p>
      <label className="listening-muted">{copy.openPack}<input type="file" accept=".json,application/json" disabled={!!busy} onChange={event=>{void openPack(event.target.files?.[0]);event.target.value="";}}/></label>
    </section>
    <section className="listening-panel"><h2>{copy.edit}</h2><label>{copy.testTitle}<input value={test.title} maxLength={200} disabled={!!busy} onChange={event=>change({title:event.target.value})}/></label>
      <label style={{marginTop:14}}>{copy.script}<textarea rows={8} value={test.script} maxLength={4000} disabled={!!busy} onChange={event=>change({script:event.target.value},true)}/></label><p className="listening-muted">{copy.scriptHelp}</p>
      {test.tasks.map((task,index)=><article className="listening-editor-task" key={task.id}>
        <div className="listening-task-header"><strong>{index+1}. {copy[task.type]}</strong><button className="listening-button" disabled={!!busy} onClick={()=>change({tasks:test.tasks.filter((_,i)=>i!==index)})}>{copy.remove}</button></div>
        <label>{copy.prompt}<input value={task.prompt} maxLength={500} disabled={!!busy} onChange={event=>changeTask(index,{prompt:event.target.value})}/></label>
        {task.type!=="true_false"&&(task.options??[]).map((option,optionIndex)=><label key={optionIndex}>{copy.options} {optionIndex+1}<input value={option} maxLength={500} disabled={!!busy} onChange={event=>{
          const options=[...(task.options??[])];options[optionIndex]=event.target.value;changeTask(index,{options,correctAnswer:task.correctAnswer===option?event.target.value:task.correctAnswer});
        }}/></label>)}
        <label>{copy.correct}<select disabled={!!busy} value={String(task.correctAnswer??"")} onChange={event=>changeTask(index,{correctAnswer:task.type==="true_false"?event.target.value==="true":event.target.value})}>
          {task.type==="true_false"?<><option value="true">{copy.trueLabel}</option><option value="false">{copy.falseLabel}</option></>:(task.options??[]).map((option,i)=><option key={i} value={option}>{option||`${copy.options} ${i+1}`}</option>)}
        </select></label>
      </article>)}
      <div className="listening-actions">{(["mcq","true_false","best_summary"] as const).map(type=><button key={type} className="listening-button" disabled={!!busy||test.tasks.length>=24} onClick={()=>addTask(type)}>+ {copy[type]}</button>)}</div>
    </section>
    <section className="listening-panel"><h2>{copy.sound}</h2><div className="listening-actions"><button className="listening-button listening-primary" disabled={!!busy||!test.script.trim()} onClick={()=>request("audio")}>{busy==="audio"?copy.makingAudio:copy.makeAudio}</button>
      <label>{copy.uploadAudio}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg,.m4a,.webm" disabled={!!busy||!test.script.trim()} onChange={event=>{void uploadAudio(event.target.files?.[0]);event.target.value="";}}/></label></div>
      {hasAudio&&<><p className="listening-muted">{test.aiVoice?copy.aiVoice:copy.ownVoice}</p><audio controls src={test.audioDataUrl} aria-label={copy.previewAudio}/></>}
      <p className="listening-note">{copy.check}</p><div className="listening-grid"><label>{copy.plays}<select value={test.plays} disabled={!!busy} onChange={event=>change({plays:Number(event.target.value)})}>{[1,2,3].map(count=><option key={count}>{count}</option>)}</select></label>
        <label>{copy.playback}<select value={test.playback} disabled={!!busy} onChange={event=>change({playback:event.target.value==="teacher"?"teacher":"individual"})}><option value="individual">{copy.individual}</option><option value="teacher">{copy.teacher}</option></select></label></div>
    </section>
    <section className="listening-panel"><h2>{copy.use}</h2>{!valid&&test.script.trim()&&<p className="listening-muted">{copy.invalid}</p>}<p className="listening-muted">{copy.readyHelp}</p>
      <div className="listening-actions"><button className="listening-button listening-primary" disabled={!!busy||!valid||saved?.test===test} onClick={save}>{busy==="save"?copy.saving:copy.saveContent}</button><Link className="listening-button" href={`/${locale}/content`}>{copy.myContent}</Link></div>
      {saved&&<p role="status" className="listening-muted">{saved.test===test?copy.saved:copy.unsaved}</p>}
      <div className="listening-actions"><button className="listening-button listening-primary" disabled={!!busy||!valid||!hasAudio} onClick={()=>setDigital(true)}>{copy.tryDigital}</button>
        <button className="listening-button" disabled={!!busy||!valid||!hasAudio} onClick={()=>download(new Blob([listeningStudentHtml(test,locale)],{type:"text/html;charset=utf-8"}),`${listeningFilename(test.title)}.html`)}>{copy.downloadDigital}</button>
        <button className="listening-button" disabled={!hasAudio||!!busy} onClick={downloadAudio}>{copy.downloadAudio}</button>
        <button className="listening-button" disabled={!valid||!!busy} onClick={()=>download(new Blob([JSON.stringify(test,null,2)],{type:"application/json"}),`${listeningFilename(test.title)}.json`)}>{copy.savePack}</button>
      </div><p className="listening-muted">{copy.fileHelp}</p>
      {valid&&<ReadingTestPrintPreview content={printContent} locale={locale}/>}
    </section>
  </main>;
}
