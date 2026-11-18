"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { getAuth,onAuthStateChanged } from "firebase/auth";
import { useRouter,useSearchParams } from "next/navigation";
import Link from "next/link";
import AssessmentBackLink from "./AssessmentBackLink";
import GrammarTestPlayer from "./GrammarTestPlayer";
import ReadingTestPrintPreview from "./ReadingTestPrintPreview";
import MathSpacePicker from "@/components/generators/math/MathSpacePicker";
import { GRAMMAR_LEVELS,FOCUS_LABELS,grammarEditHref,parseGrammarTest,validGrammarId,type GrammarTest,type GrammarTask,type GrammarFocus,type GrammarLevel } from "@/lib/grammarTests/types";
import type { ReadingTestPrintContent } from "@/lib/readingTests/print";
import "./grammarTests.css";

type Version={id:string;revision:string};
export default function GrammarTestTool({locale}:{locale:string}){
  const router=useRouter(),params=useSearchParams(),editId=params.get("edit")??"";
  const [level,setLevel]=useState<GrammarLevel>("A2"),[kind,setKind]=useState("word"),[wordFocus,setWordFocus]=useState<GrammarFocus>("mixed_words"),[topic,setTopic]=useState("");
  const [test,setTest]=useState<GrammarTest|null>(null),[saved,setSaved]=useState<{version:Version;json:string}|null>(null);
  const [busy,setBusy]=useState<"generate"|"save"|"load"|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [preview,setPreview]=useState(false),[answers,setAnswers]=useState<Record<string,unknown>>({}),[checked,setChecked]=useState(false),[sharing,setSharing]=useState(false),[seconds,setSeconds]=useState(0);
  const pending=useRef<AbortController|null>(null),loaded=useRef(""),owner=useRef<string|null>(null);
  const focus=kind==="word"?wordFocus:kind as GrammarFocus;
  const valid=!!parseGrammarTest(test),unchanged=!!test&&saved?.json===JSON.stringify(test);
  const printable=useMemo<ReadingTestPrintContent>(()=>({title:test?.title??"",sourceText:"",level:test?.level??level,language:"nb",tasks:test?.tasks??[],modality:"grammar"}),[test,level]);
  useEffect(()=>{
    const unsubscribe=onAuthStateChanged(getAuth(),user=>{
      const uid=user?.uid??"";
      if(owner.current!==null&&owner.current!==uid){pending.current?.abort();pending.current=null;setBusy(null);setTest(null);setSaved(null);setAnswers({});setPreview(false);setSharing(false);loaded.current="";setError("");}
      owner.current=uid;
    });
    return()=>{unsubscribe();pending.current?.abort();};
  },[]);
  useEffect(()=>{if(!busy)return;setSeconds(0);const start=Date.now(),timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>window.clearInterval(timer);},[busy]);
  async function request(url:string,body:unknown,controller:AbortController){
    const user=getAuth().currentUser;if(!user||user.isAnonymous)throw Error("Logg inn for å lage og lagre prøver.");
    const token=await user.getIdToken();
    const response=await fetch(url,{method:body===undefined?"GET":"POST",cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115_000)]),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(getAuth().currentUser!==user)throw Error("Kontoen er endret. Åpne prøven på nytt.");
    const data=await response.json();if(!response.ok)throw Error(data.error||"Kunne ikke fullføre. Prøv igjen.");controller.signal.throwIfAborted();return data;
  }
  useEffect(()=>{
    if(!editId||loaded.current===editId)return;
    const controller=new AbortController();pending.current?.abort();pending.current=controller;
    async function load(){
      await Promise.resolve();if(controller.signal.aborted)return;
      setBusy("load");setError("");
      try{
        if(!validGrammarId(editId))throw Error("Ugyldig prøve.");
        const data=await request(`/api/grammar-tests/saved/${editId}`,undefined,controller),restored=parseGrammarTest(data.test);
        if(!restored||!validGrammarId(data.revision)||data.id!==editId)throw Error("Kunne ikke åpne prøven.");
        if(pending.current!==controller)return;
        setTest(restored);setLevel(restored.level);setKind(["verb","noun"].includes(restored.focus)?restored.focus:"word");setWordFocus(["verb","noun"].includes(restored.focus)?"mixed_words":restored.focus);setTopic(restored.topic);setSaved({version:{id:editId,revision:data.revision},json:JSON.stringify(restored)});loaded.current=editId;
      }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kunne ikke åpne prøven.");}
      finally{if(pending.current===controller){pending.current=null;setBusy(null);}}
    }
    void load();return()=>controller.abort();
  },[editId]);
  async function run(action:"generate"|"save"){
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setBusy(action);setError("");setNotice("");
    try{
      if(action==="generate"){
        const data=await request("/api/grammar-tests/generate",{level,focus,topic},controller),generated=parseGrammarTest(data.test);
        if(!generated)throw Error("Generatoren ga en ufullstendig prøve. Prøv igjen.");
        setTest(generated);setAnswers({});setChecked(false);setPreview(false);
        // A new generation is a new test, so it cannot silently overwrite the open saved test.
        setSaved(null);loaded.current="";router.replace(`/${locale}/tools/grammar-tests`,{scroll:false});
      }else{
        if(!parseGrammarTest(test))throw Error("Kontroller at prøven har 10 ulike setninger med ett tomrom, unike alternativer og gyldig fasit.");
        const data=await request("/api/grammar-tests/saved",{test,...saved?.version},controller);
        if(!validGrammarId(data.id)||!validGrammarId(data.revision))throw Error("Kunne ikke bekrefte lagringen.");
        setSaved({version:data,json:JSON.stringify(test)});loaded.current=data.id;router.replace(grammarEditHref(locale,data.id),{scroll:false});setNotice("Lagret i Mitt innhold. Del prøven til et Space for å få elevens innlevering.");
      }
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kunne ikke fullføre. Prøv igjen.");}
    finally{if(pending.current===controller){pending.current=null;setBusy(null);}}
  }
  function changeTask(index:number,patch:Partial<GrammarTask>){setTest(previous=>previous?{...previous,tasks:previous.tasks.map((task,i)=>i===index?{...task,...patch}:task)}:null);setChecked(false);setNotice("");}
  function cancel(){pending.current?.abort();pending.current=null;setBusy(null);setNotice("Avbrutt. Du kan prøve igjen.");}
  return <main className="grammar-tool">
    <AssessmentBackLink locale={locale}/>
    <header><span className="grammar-beta">Beta · Norsk bokmål</span><h1>Setninger og grammatikk</h1><p>Lag 10 setninger med ordvalg og automatisk retting. Bruk prøven i Spaces eller på papir.</p></header>
    <section className="grammar-panel" aria-labelledby="grammar-create"><h2 id="grammar-create">1. Lag prøve</h2>
      <div className="grammar-grid"><label>Nivå<select value={level} disabled={!!busy} onChange={event=>setLevel(event.target.value as GrammarLevel)}>{GRAMMAR_LEVELS.map(value=><option key={value} value={value}>{value==="A1Start"?"A1 Start":value}</option>)}</select></label>
      <label>Oppgavetype<select value={kind} disabled={!!busy} onChange={event=>setKind(event.target.value)}><option value="word">Velg riktig ord</option><option value="verb">Velg riktig form av verbet</option><option value="noun">Velg riktig form av substantivet</option></select></label>
      {kind==="word"&&<label>Ordpar<select value={wordFocus} disabled={!!busy} onChange={event=>setWordFocus(event.target.value as GrammarFocus)}>{(["mixed_words","og_aa","den_det"] as const).map(value=><option key={value} value={value}>{FOCUS_LABELS[value]}</option>)}</select></label>}</div>
      <label>Tema eller situasjon (valgfritt)<textarea value={topic} maxLength={1500} disabled={!!busy} placeholder="For eksempel en bursdag, skolehverdag eller arbeid." onChange={event=>setTopic(event.target.value)}/></label>
      <p className="grammar-help">Nivået tilpasser språket og setningene. Ordvalg gir 5 setninger med og/å og 5 med den/det når begge er valgt. Prøven er ikke en standardisert nivåtest.</p>
      <div className="grammar-actions"><button type="button" className="grammar-primary" disabled={!!busy} onClick={()=>void run("generate")}>{busy==="generate"?"Lager og kontrollerer prøven …":"Generer 10 setninger"}</button>{busy&&<button type="button" onClick={cancel}>Avbryt</button>}</div>
      {busy&&<p role="status">{busy==="generate"?"Kontrollerer at setningene har ett riktig svar.":busy==="load"?"Åpner prøven …":"Lagrer …"} {seconds} sekunder</p>}
    </section>
    {error&&<p role="alert" className="grammar-error">{error}</p>}{notice&&<p role="status" className="grammar-notice">{notice}</p>}
    {test&&<>
      <section className="grammar-panel"><h2>2. Se over setninger og fasit</h2><p className="grammar-help">{test.level==="A1Start"?"A1 Start":test.level} · {FOCUS_LABELS[test.focus]}. Endre setningene ved behov. Bruk ___ for tomrommet. Etter egne endringer må du kontrollere at bare ett alternativ passer.</p>
        <label>Tittel<input value={test.title} maxLength={160} disabled={!!busy} onChange={event=>setTest({...test,title:event.target.value})}/></label>
        {test.tasks.map((task,index)=><fieldset className="grammar-editor" key={task.id} disabled={!!busy}><legend>Setning {index+1}</legend><label>Setning med tomrom<textarea value={task.prompt} maxLength={700} onChange={event=>changeTask(index,{prompt:event.target.value})}/></label>
          <div className="grammar-grid">{task.options.map((option,i)=><label key={i}>Alternativ {i+1}<input value={option} maxLength={100} onChange={event=>{const options=task.options.map((value,n)=>n===i?event.target.value:value);changeTask(index,{options,...(task.correctAnswer===option?{correctAnswer:event.target.value}:{})});}}/></label>)}<label>Riktig svar<select value={task.correctAnswer} onChange={event=>changeTask(index,{correctAnswer:event.target.value})}>{task.options.map((option,i)=><option key={i} value={option}>{option||"Tomt alternativ"}</option>)}</select></label></div>
          <label>Forklaring til fasiten<textarea value={task.explanation} maxLength={800} onChange={event=>changeTask(index,{explanation:event.target.value})}/></label>
        </fieldset>)}
      </section>
      <section className="grammar-panel"><h2>3. Bruk prøven</h2><p>Lagre prøven i Mitt innhold og del den til et Space. Eleven velger svar og trykker «Send til lærer». Du ser elevens svar og automatisk retting i innleveringen.</p>
        <label className="grammar-audio-setting"><input type="checkbox" checked={test.audioEnabled} disabled={!!busy} onChange={event=>setTest({...test,audioEnabled:event.target.checked})}/> Tillat lydstøtte</label>
        <p className="grammar-help">Eleven kan høre setningen med pause ved tomrommet. Etter retting kan hele fasitsetningen høres. Valget følger prøven ved deling til Space. Lagre og del på nytt for å endre valget i en utdelt prøve.</p>
        {!valid&&<p className="grammar-error">Kontroller alle setninger, alternativer og fasit før du lagrer eller deler.</p>}
        <div className="grammar-actions"><button type="button" className="grammar-primary" disabled={!valid||!!busy||unchanged} onClick={()=>void run("save")}>{unchanged?"Lagret i Mitt innhold":"Lagre i Mitt innhold"}</button><button type="button" disabled={!valid||!!busy||!unchanged} onClick={()=>setSharing(true)}>Del til Space</button><button type="button" disabled={!valid||!!busy} onClick={()=>{setPreview(!preview);setAnswers({});setChecked(false);}}>Prøv elevvisningen</button><Link href={`/${locale}/content`}>Mitt innhold</Link></div>
        {!unchanged&&saved&&<p className="grammar-help">Lagre endringene før du deler.</p>}
        <ReadingTestPrintPreview content={printable} locale={locale}/>
        {preview&&<div><h3>Forhåndsvisning for læreren</h3><p className="grammar-help">Svar her sendes ikke inn.</p><GrammarTestPlayer tasks={test.tasks} answers={answers} onChange={setAnswers} disabled={checked} showResults={checked} audioEnabled={test.audioEnabled} audioSource={unchanged&&saved?{lessonId:saved.version.id,revision:saved.version.revision}:undefined}/><div className="grammar-actions"><button type="button" onClick={()=>setChecked(true)} disabled={checked}>Rett svarene</button><button type="button" onClick={()=>{setAnswers({});setChecked(false);}}>Prøv på nytt</button></div></div>}
      </section>
    </>}
    {sharing&&unchanged&&saved&&test&&<MathSpacePicker worksheetId={saved.version.id} title={test.title} language="nb" onClose={()=>setSharing(false)} onShared={()=>{setSharing(false);setNotice("Prøven er delt til Space. Elevene kan nå sende svarene til læreren.");}}/>}
  </main>;
}
