import { getListeningCopy } from "./copy";
import { listeningStudentTest, listeningTestError, listeningHasAudio, type ListeningTest } from "./types";
import { getListeningStartCopy } from "./startCopy";

export function escapeListeningHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);
}
export function serializeListeningData(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4,"0")}`);
}

const OFFLINE_SCRIPT=String.raw`
"use strict";
(()=>{
  const data=JSON.parse(document.getElementById("listening-data").textContent),test=data.test,c=data.copy,s=data.startCopy,perTask=test.level==="A1Start";
  const byId=id=>document.getElementById(id),format=(s,v)=>s.replace(/\{(\w+)\}/g,(m,k)=>k in v?String(v[k]):m);
  const audio=byId("audio"),play=byId("play"),start=byId("start"),form=byId("questions"),controls=byId("audio-controls");
  let answers=Object.create(null),used=0,playing=false,finished=true,submitted=false,starting=false;
  let current=0;const fields=[];
  function selectClip(){
    fields.forEach((field,index)=>field.hidden=perTask&&index!==current);
    byId("step").hidden=!perTask;byId("step").textContent=perTask?format(s.progress,{current:current+1,total:test.tasks.length}):"";
    byId("submit").textContent=perTask&&current<test.tasks.length-1?s.next:c.submit;
    if(test.playback==="individual")audio.src=perTask?test.clips[current].audioDataUrl:test.audioDataUrl;
  }
  function text(id,value){byId(id).textContent=value;}
  function update(){
    play.disabled=submitted||(finished&&used>=test.plays);
    play.textContent=playing?c.pause:used===0?c.play:finished?c.replay:c.resume;
    text("played",format(c.played,{used:used,count:test.plays}));
    byId("no-more").hidden=!(finished&&used>=test.plays);
  }
  function reset(){
    audio.pause();audio.currentTime=0;answers=Object.create(null);current=0;used=0;playing=false;finished=true;submitted=false;
    form.reset();form.querySelectorAll("input").forEach(input=>input.disabled=false);
    form.querySelectorAll(".feedback").forEach(item=>{item.hidden=true;item.textContent="";});
    form.hidden=true;controls.hidden=true;start.hidden=false;byId("step").hidden=true;byId("result").hidden=true;byId("submit").hidden=false;byId("audio-error").hidden=true;update();
  }
  text("title",test.title);text("kind",c.studentTitle+" · "+(perTask?s.label:test.level));text("instructions",perTask?s.instructions+" "+s.audioHelp:c.instructions);
  text("policy",format(perTask?test.playback==="teacher"?s.teacherPolicy:s.playPolicy:test.playback==="teacher"?c.teacherPolicy:c.playPolicy,{count:test.plays}));
  text("privacy",c.localOnly);text("voice",test.aiVoice||test.clips?.some(clip=>clip.aiVoice)?c.aiVoice:"");start.textContent=c.start;
  text("audio-error",c.audioError);text("no-more",c.noMore);text("submit",c.submit);text("result-help",c.resultHelp);text("restart",c.restart);
  test.tasks.forEach((task,index)=>{
    const field=document.createElement("fieldset"),legend=document.createElement("legend");legend.textContent=(index+1)+". "+task.prompt;legend.lang=test.language;field.append(legend);
    const options=task.type==="true_false"?[c.trueLabel,c.falseLabel]:task.options;
    options.forEach((option,optionIndex)=>{
      const label=document.createElement("label"),radio=document.createElement("input"),span=document.createElement("span");
      radio.type="radio";radio.name="question-"+index;radio.value=String(optionIndex);
      radio.addEventListener("change",()=>{answers[task.id]=task.type==="true_false"?optionIndex===0:option;});
      span.textContent=option;span.dir="auto";label.append(radio,span);field.append(label);
    });
    const feedback=document.createElement("p");feedback.className="feedback";feedback.hidden=true;field.append(feedback);form.insertBefore(field,byId("submit"));fields.push(field);
  });
  start.onclick=()=>{start.hidden=true;form.hidden=false;controls.hidden=test.playback==="teacher";selectClip();update();};
  play.onclick=async()=>{
    if(starting||submitted)return;if(playing){audio.pause();playing=false;update();return;}
    if(finished&&used>=test.plays)return;starting=true;byId("audio-error").hidden=true;
    try{if(finished)audio.currentTime=0;await audio.play();if(finished)used++;finished=false;playing=true;update();}
    catch{byId("audio-error").hidden=false;}finally{starting=false;}
  };
  audio.onended=()=>{finished=true;playing=false;update();};audio.onpause=()=>{playing=false;update();};
  audio.onerror=()=>{byId("audio-error").hidden=false;};
  audio.onloadedmetadata=()=>{byId("progress").max=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:1;};
  audio.ontimeupdate=()=>{byId("progress").value=audio.currentTime;};
  form.onsubmit=event=>{
    event.preventDefault();if(starting)return;audio.pause();
    if(perTask&&current<test.tasks.length-1){current++;used=0;playing=false;finished=true;audio.currentTime=0;byId("progress").value=0;byId("audio-error").hidden=true;selectClip();update();return;}
    submitted=true;playing=false;fields.forEach(field=>field.hidden=false);byId("step").hidden=true;if(perTask)controls.hidden=true;
    let correct=0,answered=0;
    test.tasks.forEach((task,index)=>{
      const value=answers[task.id],present=typeof value==="boolean"||(typeof value==="string"&&value.trim().length>0),ok=present&&value===task.correctAnswer;
      if(present)answered++;if(ok)correct++;
      const answer=task.type==="true_false"?(task.correctAnswer?c.trueLabel:c.falseLabel):task.correctAnswer;
      const feedback=form.querySelectorAll(".feedback")[index];feedback.textContent=(present?(ok?c.correctMark:c.wrongMark):c.missingMark)+" · "+c.correct+": "+answer;feedback.hidden=false;
    });
    form.querySelectorAll("input").forEach(input=>input.disabled=true);byId("submit").hidden=true;
    text("result-title",format(c.result,{correct:correct,total:test.tasks.length}));text("unanswered",format(c.unanswered,{count:test.tasks.length-answered}));byId("result").hidden=false;update();
  };
  byId("restart").onclick=reset;update();
})();`;

const OFFLINE_CSS=`body{margin:0;background:#f1f5f9;color:#0f172a;font:16px/1.6 Arial,sans-serif}*{box-sizing:border-box}main{max-width:860px;margin:24px auto;padding:26px;background:white;border:1px solid #cbd5e1;border-radius:14px}h1{font-size:28px;line-height:1.25}h2{font-size:22px}button{font:inherit;font-weight:bold;padding:10px 16px;min-height:42px;border:1px solid #075985;border-radius:8px;background:#075985;color:white;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #0284c7;outline-offset:3px}fieldset{min-width:0;margin:20px 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px}legend{font-weight:bold;max-width:100%;padding:0 6px}label{display:flex;gap:10px;align-items:baseline;margin:10px 0}input{accent-color:#075985}#audio-controls,#result{margin:20px 0;padding:16px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:12px}progress{width:100%}.muted{color:#475569;font-size:13px}.feedback{font-size:14px;font-weight:bold}#kind{color:#075985;font-weight:bold;font-size:14px}[hidden]{display:none!important}@media(max-width:600px){main{margin:0;padding:16px;border-radius:0;border:0}h1{font-size:24px}}@media print{body{background:white}main{border:0;padding:0;margin:0;max-width:none}button,#audio-controls,#privacy{display:none}fieldset{break-inside:avoid}}`;

export function listeningStudentHtml(test: ListeningTest, locale: string): string {
  if(listeningTestError(test)||test.playback==="individual"&&!listeningHasAudio(test))throw new Error("Listening test is not ready");
  const source=getListeningCopy(locale);
  const keys=["studentTitle","instructions","playPolicy","teacherPolicy","localOnly","start","play","pause","resume","replay","played","noMore","submit","result","unanswered","resultHelp","restart","correctMark","wrongMark","missingMark","correct","trueLabel","falseLabel","audioError","aiVoice"] as const;
  const copy=Object.fromEntries(keys.map(key=>[key,source[key]]));
  const language=locale==="en"||locale==="pt"?locale:"nb";
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src data: blob:; base-uri 'none'; form-action 'none'"><title>${escapeListeningHtml(test.title)}</title><style>${OFFLINE_CSS}</style></head><body><main><header><p id="kind"></p><h1 id="title"></h1><p id="instructions"></p><p id="policy"></p><p id="voice" class="muted"></p></header><button id="start" type="button"></button><section id="audio-controls" hidden><audio id="audio" preload="metadata"></audio><button id="play" type="button"></button><p id="played"></p><progress id="progress" max="1" value="0" aria-label="Audio"></progress><p id="no-more" hidden></p><p id="audio-error" role="alert" hidden></p></section><p id="step" role="status" hidden></p><form id="questions" hidden><button id="submit" type="submit"></button></form><section id="result" role="status" hidden><h2 id="result-title"></h2><p id="unanswered"></p><p id="result-help"></p><button id="restart" type="button"></button></section><p id="privacy" class="muted"></p></main><script type="application/json" id="listening-data">${serializeListeningData({test:listeningStudentTest(test),copy,...(test.level==="A1Start"?{startCopy:getListeningStartCopy(locale)}:{})})}</script><script>${OFFLINE_SCRIPT}</script></body></html>`;
}
