import type { AutoGrade } from "@/lib/submissions/types";

export const GRAMMAR_LEVELS = ["A1Start", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const GRAMMAR_FOCUSES = ["mixed_words", "og_aa", "den_det", "verb", "noun"] as const;
export type GrammarLevel = typeof GRAMMAR_LEVELS[number];
export type GrammarFocus = typeof GRAMMAR_FOCUSES[number];
export type GrammarTask = { id: string; order: number; type: "mcq"; prompt: string; options: string[]; correctAnswer: string; explanation: string; focus: Exclude<GrammarFocus,"mixed_words"> };
export type GrammarTest = { version: 1; title: string; language: "nb"; level: GrammarLevel; focus: GrammarFocus; topic: string; tasks: GrammarTask[] };
export const FOCUS_LABELS: Record<GrammarFocus,string> = { mixed_words:"Og/å og den/det", og_aa:"Og eller å", den_det:"Den eller det", verb:"Riktig form av verbet", noun:"Riktig form av substantivet" };
export function validGrammarId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) && !["__proto__","constructor","prototype"].includes(value); }
export function grammarEditHref(locale:string,id:string){ return `/${locale}/tools/grammar-tests?edit=${encodeURIComponent(id)}`; }
function record(raw:unknown):raw is Record<string,unknown>{return !!raw&&typeof raw==="object"&&!Array.isArray(raw);}
function text(raw:unknown,max:number){return typeof raw==="string"&&raw.trim().length>0&&raw.trim().length<=max?raw.trim():null;}
export function parseGrammarTasks(raw:unknown):GrammarTask[]|null {
  if(!Array.isArray(raw)||raw.length!==10)return null;
  const ids=new Set<string>(),sentences=new Set<string>(),tasks:GrammarTask[]=[];
  for(const [i,item] of raw.entries()){
    if(!record(item)||!validGrammarId(item.id)||ids.has(item.id)||item.type!=="mcq")return null;
    const prompt=text(item.prompt,700),explanation=text(item.explanation,800),correct=text(item.correctAnswer,100);
    if(!prompt||prompt.split("___").length!==2||!/(?:^|\s)___(?=[\s.,?!;:]|$)/u.test(prompt)||!explanation||!correct||!Array.isArray(item.options)||item.options.length<2||item.options.length>4)return null;
    const options=item.options.map(option=>text(option,100));
    if(options.some(option=>!option)||new Set(options.map(option=>option!.toLocaleLowerCase("nb"))).size!==options.length||!options.includes(correct))return null;
    const focus=item.focus;
    if(!["og_aa","den_det","verb","noun"].includes(String(focus)))return null;
    if(focus==="og_aa"&&[...options].sort().join("|")!=="og|å")return null;
    if(focus==="den_det"&&[...options].sort().join("|")!=="den|det")return null;
    const normalized=prompt.toLocaleLowerCase("nb").replace(/[\s\p{P}]+/gu,"");
    if(sentences.has(normalized))return null;
    ids.add(item.id);sentences.add(normalized);
    tasks.push({id:item.id,order:i+1,type:"mcq",prompt,options:options as string[],correctAnswer:correct,explanation,focus:focus as GrammarTask["focus"]});
  }
  return tasks;
}
export function parseGrammarTest(raw:unknown):GrammarTest|null {
  if(!record(raw)||raw.version!==1||raw.language!=="nb"||!GRAMMAR_LEVELS.includes(raw.level as GrammarLevel)||!GRAMMAR_FOCUSES.includes(raw.focus as GrammarFocus))return null;
  const title=text(raw.title,160),topic=typeof raw.topic==="string"&&raw.topic.length<=1500?raw.topic.trim():null,tasks=parseGrammarTasks(raw.tasks);
  if(!title||topic===null||!tasks)return null;
  if(raw.focus==="mixed_words" ? tasks.filter(task=>task.focus==="og_aa").length!==5||tasks.filter(task=>task.focus==="den_det").length!==5 : tasks.some(task=>task.focus!==raw.focus))return null;
  return {version:1,title,topic,tasks,language:"nb",level:raw.level as GrammarLevel,focus:raw.focus as GrammarFocus};
}
/** Always grade against the assignment's own tasks, never a client-supplied key or score. */
export function gradeGrammar(tasks:GrammarTask[],raw:unknown):AutoGrade {
  const answers=record(raw)?raw:{};
  const result:AutoGrade={totalAuto:tasks.length,correctAuto:0,wrongAuto:0,unansweredAuto:0,percentAuto:null,byTask:{}};
  for(const task of tasks){
    const value=answers[task.id],answer=typeof value==="string"&&task.options.includes(value)?value:"";
    const isCorrect=answer===task.correctAnswer;
    if(!answer)result.unansweredAuto++;else if(isCorrect)result.correctAuto++;else result.wrongAuto++;
    result.byTask[task.id]={type:"mcq",isCorrect,studentAnswer:answer,correctAnswer:task.correctAnswer};
  }
  result.percentAuto=tasks.length?Math.round(result.correctAuto/tasks.length*100):null;
  return result;
}
