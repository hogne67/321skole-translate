"use client";
import { useEffect,useRef,useState } from "react";
import { onAuthStateChanged,getAuth } from "firebase/auth";
import { speechHeaders } from "@/lib/audio/headers.client";
import type { GrammarAudioPart,GrammarAudioSource } from "./audio";

export function useGrammarAudio(source: GrammarAudioSource | undefined, results: boolean) {
  const current = useRef<{controller:AbortController;audio:HTMLAudioElement|null}|null>(null);
  const [active,setActive] = useState<string|null>(null), [error,setError] = useState("");
  const key = JSON.stringify(source ?? null);
  function stop() { const run=current.current;current.current=null;run?.controller.abort();run?.audio?.pause();setActive(null); }
  useEffect(() => { stop(); return stop; },[key,results]);
  useEffect(() => {
    let initial=true,uid:string|null=null;
    return onAuthStateChanged(getAuth(),user=>{if(!initial&&uid!==(user?.uid??null))stop();initial=false;uid=user?.uid??null;});
  },[]);
  async function play(taskId:string) {
    stop();setError("");if(!source)return;
    const run={controller:new AbortController(),audio:null as HTMLAudioElement|null};current.current=run;setActive(taskId);
    try {
      const user=getAuth().currentUser;
      const response=await fetch("/api/grammar-tests/audio",{method:"POST",signal:run.controller.signal,headers:await speechHeaders(),body:JSON.stringify({...source,taskId,mode:results?"solution":"gap"})});
      if(getAuth().currentUser!==user)throw Error("Logg inn på nytt for å bruke lyd.");
      const data=await response.json();if(!response.ok)throw Error(data.error||"Kunne ikke spille av lyd.");
      if(!Array.isArray(data.parts)||data.parts.length<1||data.parts.length>3)throw Error("Ugyldig lyd.");
      for(const part of data.parts as GrammarAudioPart[]) {
        run.controller.signal.throwIfAborted();
        if(part.kind==="pause") {
          if(part.milliseconds!==1000)throw Error("Ugyldig pause.");
          await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error("Avbrutt"));};const timer=window.setTimeout(()=>{run.controller.signal.removeEventListener("abort",abort);resolve();},part.milliseconds);run.controller.signal.addEventListener("abort",abort,{once:true});});
        } else {
          if(part.kind!=="audio"||typeof part.url!=="string"||part.url.length>2_700_000||!/^data:audio\/mpeg;base64,[A-Za-z0-9+/]+=*$/u.test(part.url))throw Error("Ugyldig lyd.");
          const audio=new Audio(part.url);run.audio=audio;
          await new Promise<void>((resolve,reject)=>{
            const cleanup=()=>{audio.onended=null;audio.onerror=null;run.controller.signal.removeEventListener("abort",abort);};
            const abort=()=>{audio.pause();cleanup();reject(Error("Avbrutt"));};
            audio.onended=()=>{cleanup();resolve();};audio.onerror=()=>{cleanup();reject(Error("Kunne ikke spille av lyd."));};
            run.controller.signal.addEventListener("abort",abort,{once:true});
            void audio.play().catch(()=>{cleanup();reject(Error("Kunne ikke starte lyd. Trykk på lydknappen igjen."));});
          });
        }
      }
    } catch(cause) { if(!run.controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kunne ikke spille av lyd."); }
    finally { if(current.current===run){current.current=null;setActive(null);} }
  }
  return {play,stop,active,error};
}
