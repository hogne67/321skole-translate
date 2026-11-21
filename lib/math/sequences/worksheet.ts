import { normalizeMathWorksheetLanguage, type MathWorksheetLanguage } from "../taxonomy";
import { getSequencesCopy } from "./copy";
import { SEQUENCES_MAX_TASK_COUNT, sequencesPageCapacity } from "./printLayout";
export { getSequencesCopy } from "./copy";

export const SEQUENCES_TASK_TYPES = ["continue", "missing", "rule", "figures"] as const;
export const SEQUENCES_MODES = [...SEQUENCES_TASK_TYPES, "mixed"] as const;
export const SEQUENCES_LEVELS = ["steps", "multiply", "advanced"] as const;
export const SEQUENCES_NUMBER_TYPES = ["whole", "negative", "decimal", "fraction", "roman", "letters"] as const;
export type SequencesNumberType = typeof SEQUENCES_NUMBER_TYPES[number];
export type SequencesSettings = { taskType: typeof SEQUENCES_MODES[number]; level: typeof SEQUENCES_LEVELS[number]; numberType: SequencesNumberType; taskCount: number; showSupport: boolean };
export type Rational = { n: number; d: number };
export type SequenceRule = { kind: "add" | "multiply" | "alternate" | "growing"; a: Rational; b: Rational };
export type SequencesTask = { id: string; type: typeof SEQUENCES_TASK_TYPES[number]; notation: SequencesNumberType; alphabet: string; start: Rational; rule: SequenceRule; hidden: number[]; figure: "rows" | "doubling" | "squares" | "triangles" | null; size: number };
export type SequencesAnswer = { fields: Record<string, string>; cells: number[]; working: string };
export type SequencesWorksheet = { version: 1; kind: "sequences"; language: MathWorksheetLanguage; title: string; instructions: string; settings: SequencesSettings; tasks: SequencesTask[]; showAnswerKey: boolean };
export const DEFAULT_SEQUENCES_SETTINGS: SequencesSettings = { taskType: "mixed", level: "steps", numberType: "whole", taskCount: sequencesPageCapacity("mixed", false).first, showSupport: false };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
export function rational(n: number, d = 1): Rational {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || !d) throw new Error("INVALID_NUMBER");
  const g = gcd(Math.abs(n), Math.abs(d)); return { n: n / g * Math.sign(d), d: Math.abs(d) / g };
}
const add = (a: Rational, b: Rational) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
const equal = (a: Rational, b: Rational) => a.n * b.d === b.n * a.d;
export function sequencesValues(task: Pick<SequencesTask, "start" | "rule" | "type">): Rational[] {
  const values = [task.start], { rule } = task;
  for (let i = 0; i < (task.type === "figures" ? 4 : 5); i++) {
    const previous = values.at(-1)!;
    values.push(rule.kind === "multiply" ? mul(previous, rule.a) : add(previous, rule.kind === "alternate" ? i % 2 ? rule.b : rule.a : rule.kind === "growing" ? add(rule.a, mul(rational(i), rule.b)) : rule.a));
  }
  return values;
}
export function normalizeSequencesSettings(v: unknown): SequencesSettings {
  if (!record(v) || !SEQUENCES_MODES.includes(v.taskType as SequencesSettings["taskType"]) || !SEQUENCES_LEVELS.includes(v.level as SequencesSettings["level"]) || !SEQUENCES_NUMBER_TYPES.includes(v.numberType as SequencesNumberType) || typeof v.showSupport !== "boolean" || !Number.isInteger(v.taskCount) || Number(v.taskCount) < 1 || Number(v.taskCount) > SEQUENCES_MAX_TASK_COUNT) throw new Error("INVALID_SETTINGS");
  return { taskType: v.taskType as SequencesSettings["taskType"], level: v.level as SequencesSettings["level"], numberType: v.numberType as SequencesNumberType, showSupport: v.showSupport, taskCount: Number(v.taskCount) };
}
export function sequencesAlphabet(language: string) { return `ABCDEFGHIJKLMNOPQRSTUVWXYZ${language === "nb" ? "ÆØÅ" : ""}`; }
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return "";
  let result = "";
  for (const [value, symbol] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) while (n >= value) { result += symbol; n -= value; }
  return result;
}
export function formatSequencesValue(v: Rational, notation: SequencesNumberType, language: string): string {
  if (notation === "roman") return romanNumeral(v.n / v.d);
  if (notation === "letters") return sequencesAlphabet(language)[v.n / v.d - 1] ?? "";
  if (notation === "fraction" && v.d !== 1) return `${v.n}/${v.d}`;
  return (v.n / v.d).toLocaleString(language === "en" ? "en-GB" : language === "pt" ? "pt-PT" : "nb-NO", { useGrouping: false, maximumFractionDigits: 3 });
}
export function parseSequencesNumber(value: string): Rational | null {
  const s = value.trim().replaceAll("−", "-");
  const f = s.match(/^([+-]?\d{1,6})\s*\/\s*([+-]?\d{1,6})$/);
  if (f) return Number(f[2]) ? rational(Number(f[1]), Number(f[2])) : null;
  if (!/^[+-]?\d{1,6}(?:[.,]\d{1,6})?$/.test(s)) return null;
  const parts = s.replace(",", ".").split("."), denominator = 10 ** (parts[1]?.length ?? 0);
  return rational(Number(parts.join("")), denominator);
}
function matches(value: string, expected: Rational, task: SequencesTask, ruleField: boolean) {
  if (!ruleField && (task.notation === "roman" || task.notation === "letters")) return value.trim().toUpperCase() === (task.notation === "roman" ? romanNumeral(expected.n / expected.d) : task.alphabet[expected.n / expected.d - 1]);
  const parsed = parseSequencesNumber(value); return !!parsed && equal(parsed, expected);
}
function ruleOptions(settings: SequencesSettings): SequenceRule[] {
  const units = settings.numberType === "fraction" ? [2,3,4,5,8] : [settings.numberType === "decimal" ? 10 : 1];
  const options = units.flatMap((unit): SequenceRule[] => {
  const rule = (kind: SequenceRule["kind"], a: number, b = 0) => ({ kind, a: rational(a, kind === "multiply" ? 1 : unit), b: rational(b, unit) });
  if (settings.level === "steps") return [1,2,3,4,-1,-2,-3].map(n => rule("add", n));
  if (settings.level === "multiply") return settings.numberType === "letters" ? [2,3,4,-2,-3,-4].map(n => rule("add", n)) : [rule("multiply",2),rule("multiply",3),{kind:"multiply",a:rational(1,2),b:rational(0)}];
  return [rule("alternate",1,2),rule("alternate",2,3),rule("alternate",3,-1),rule("alternate",-1,-2),rule("growing",1,1),rule("growing",2,1),rule("growing",1,2),rule("growing",-1,-1)];
  });
  return [...new Map(options.map(r=>[JSON.stringify(r),r])).values()];
}
function validValues(task: SequencesTask) {
  const values = sequencesValues(task);
  if (values.some(v => Math.abs(v.n / v.d) > 3999 || v.d > 1000)) return false;
  if (task.notation === "letters") return values.every(v => v.d === 1 && v.n >= 1 && v.n <= task.alphabet.length);
  if (task.notation === "roman" || task.notation === "whole") return values.every(v => v.d === 1 && v.n >= 0 && (task.notation !== "roman" || v.n >= 1 && v.n <= 100));
  if (task.notation === "negative") return values.every(v => v.d === 1) && values.some(v => v.n < 0);
  if (task.notation === "decimal") return values.every(v => v.n >= 0 && 1000 % v.d === 0) && values.some(v => v.d > 1);
  return values.every(v => v.n >= 0 && v.d <= 96) && values.some(v => v.d > 1);
}
function candidates(settings: SequencesSettings, language: string): SequencesTask[] {
  const denominator = settings.numberType === "decimal" ? 10 : settings.numberType === "fraction" ? 4 : 1;
  const starts = settings.numberType === "letters" ? Array.from({length:sequencesAlphabet(language).length},(_,i)=>i+1) : [...Array.from({length:41},(_,i)=>i-20),32,64,96,128,-32,-64,-96];
  const out: SequencesTask[] = [];
  for (const start of starts) for (const rule of ruleOptions(settings)) {
    if(settings.numberType==="fraction"&&settings.level!=="multiply"&&start>12)continue;
    const denominators=settings.numberType==="fraction"?(rule.kind==="multiply"?[2,3,4,5,8]:[rule.a.d*rule.b.d/gcd(rule.a.d,rule.b.d)]):[denominator];
    for(const d of denominators){
    const task: SequencesTask = {id:"candidate",type:"continue",notation:settings.numberType,alphabet:sequencesAlphabet(language),start:rational(start,d),rule,hidden:[4,5],figure:null,size:1};
    if (validValues(task)) out.push(task);
    }
  }
  return out;
}
export function figureTask(id: string, figure: NonNullable<SequencesTask["figure"]>, size: number, language: string): SequencesTask {
  const rule: SequenceRule = figure === "doubling" ? {kind:"multiply",a:rational(2),b:rational(0)} : figure === "squares" || figure === "triangles" ? {kind:"growing",a:rational(figure === "squares" ? 3 : 2),b:rational(figure === "squares" ? 2 : 1)} : {kind:"add",a:rational(size),b:rational(0)};
  return {id,type:"figures",notation:"whole",alphabet:sequencesAlphabet(language),start:rational(figure === "rows" || figure === "doubling" ? size : 1),rule,hidden:[3,4],figure,size};
}
export function generateSequencesWorksheet(value: unknown, language = "nb", showAnswerKey = false, random = Math.random): SequencesWorksheet {
  const settings = normalizeSequencesSettings(value), lang = normalizeMathWorksheetLanguage(language), copy = getSequencesCopy(lang), pool = candidates(settings, lang);
  if (!pool.length) throw new Error("INVALID_COMBINATION");
  const pick = (n: number) => Math.min(n - 1, Math.max(0, Math.floor(random() * n)));
  const types = settings.taskType === "mixed" ? [...SEQUENCES_TASK_TYPES] : [settings.taskType];
  for (let i=types.length-1;i>0;i--){const j=pick(i+1);[types[i],types[j]]=[types[j],types[i]];}
  const tasks: SequencesTask[] = Array.from({length:settings.taskCount},(_,i)=>{
    const type = types[i % types.length], id = `sequence-${i+1}`;
    if (type === "figures") return figureTask(id, settings.level === "steps" ? "rows" : settings.level === "multiply" ? "doubling" : Math.floor(i/types.length)%2 ? "triangles" : "squares", settings.level === "advanced" ? 1 : 1+pick(2),lang);
    const family = settings.level === "advanced" ? Math.floor(i/types.length)%2 ? "growing" : "alternate" : null;
    const choices = family ? pool.filter(t=>t.rule.kind===family) : pool;
    return {...choices[pick(choices.length)],id,type,hidden:type==="rule"?[]:type==="continue"?[4,5]:Math.floor(i/types.length)%2?[1,4]:[2,4]};
  });
  return {version:1,kind:"sequences",language:lang,title:copy.title,instructions:copy.instructions,settings,tasks,showAnswerKey};
}
function readRational(v: unknown): Rational {
  if (!record(v) || !Number.isInteger(v.n) || !Number.isInteger(v.d) || Math.abs(Number(v.n)) > 100000 || Number(v.d)<1 || Number(v.d)>1000) throw new Error("number");
  return rational(Number(v.n),Number(v.d));
}
export function sanitizeSequencesWorksheet(value: unknown): SequencesWorksheet | null {
  try {
    if (!record(value) || value.kind!=="sequences" || value.version!==1 || !Array.isArray(value.tasks)) return null;
    const settings=normalizeSequencesSettings(value.settings),language=normalizeMathWorksheetLanguage(value.language),copy=getSequencesCopy(language),ids=new Set<string>();
    if(value.tasks.length!==settings.taskCount)return null;
    const tasks=value.tasks.map((raw):SequencesTask=>{
      if(!record(raw)||typeof raw.id!=="string"||!/^[\w-]{1,80}$/.test(raw.id)||ids.has(raw.id)||!SEQUENCES_TASK_TYPES.includes(raw.type as SequencesTask["type"])||settings.taskType!=="mixed"&&settings.taskType!==raw.type)throw new Error("task");
      ids.add(raw.id);
      if(!record(raw.rule)||!Array.isArray(raw.hidden))throw new Error("rule");
      const task:SequencesTask={id:raw.id,type:raw.type as SequencesTask["type"],notation:raw.notation as SequencesNumberType,alphabet:sequencesAlphabet(language),start:readRational(raw.start),rule:{kind:raw.rule.kind as SequenceRule["kind"],a:readRational(raw.rule.a),b:readRational(raw.rule.b)},hidden:[...raw.hidden] as number[],figure:raw.figure as SequencesTask["figure"],size:Number(raw.size)};
      if(task.type==="figures"){
        const allowed=settings.level==="steps"?["rows"]:settings.level==="multiply"?["doubling"]:["squares","triangles"];
        if(!allowed.includes(String(task.figure))||![1,2].includes(task.size)||settings.level==="advanced"&&task.size!==1||task.notation!=="whole")throw new Error("figure");
        const canonical=figureTask(task.id,task.figure!,task.size,language);
        if(JSON.stringify(task.start)!==JSON.stringify(canonical.start)||JSON.stringify(task.rule)!==JSON.stringify(canonical.rule)||JSON.stringify(task.hidden)!=="[3,4]")throw new Error("figure relation");
        return canonical;
      }
      if(task.notation!==settings.numberType||task.figure!==null||task.size!==1||!ruleOptions(settings).some(r=>r.kind===task.rule.kind&&equal(r.a,task.rule.a)&&equal(r.b,task.rule.b))||!validValues(task))throw new Error("values");
      const hidden=JSON.stringify(task.hidden);
      if(task.type==="rule"?hidden!=="[]":task.type==="continue"?hidden!=="[4,5]":!['[1,4]','[2,4]'].includes(hidden))throw new Error("hidden");
      return task;
    });
    return {version:1,kind:"sequences",language,title:copy.title,instructions:copy.instructions,settings,tasks,showAnswerKey:value.showAnswerKey===true};
  }catch{return null;}
}
export function sequencesExpected(task: SequencesTask): Record<string,Rational> {
  return task.type==="rule" ? {a:task.rule.a,...(task.rule.kind==="alternate"||task.rule.kind==="growing"?{b:task.rule.b}:{})} : Object.fromEntries(task.hidden.map(i=>[String(i),sequencesValues(task)[i]]));
}
export function readSequencesAnswer(value: unknown): SequencesAnswer {
  const fields:Record<string,string>={};
  if(record(value)&&record(value.fields))for(const key of ["0","1","2","3","4","5","a","b"])if(typeof value.fields[key]==="string")fields[key]=(value.fields[key] as string).slice(0,40);
  const cells=record(value)&&Array.isArray(value.cells)?[...new Set(value.cells.filter((v):v is number=>Number.isInteger(v)&&v>=0&&v<36))].sort((a,b)=>a-b):[];
  return {fields,cells,working:record(value)&&typeof value.working==="string"?value.working.slice(0,2000):""};
}
export function gradeSequencesTask(task: SequencesTask,value: unknown){
  const answer=readSequencesAnswer(value),expected=sequencesExpected(task),fields=Object.fromEntries(Object.entries(expected).map(([key,v])=>[key,matches(answer.fields[key]??"",v,task,task.type==="rule")]));
  const points=Object.values(fields).filter(Boolean).length/Object.keys(expected).length;
  const isAnswered=Object.values(answer.fields).some(v=>!!v.trim())||!!answer.working.trim()||answer.cells.length>0;
  return {type:"sequences" as const,points,isCorrect:points===1,isPartial:points>0&&points<1,isAnswered,fields,studentAnswer:answer,correctAnswer:expected};
}
export function gradeSequencesWorksheet(worksheet:SequencesWorksheet,answers:Record<string,unknown>){
  const byTask=Object.fromEntries(worksheet.tasks.map(t=>[t.id,gradeSequencesTask(t,answers[t.id])])),entries=Object.values(byTask);
  const correctAuto=entries.filter(e=>e.isCorrect).length,partialAuto=entries.filter(e=>e.isPartial).length,unansweredAuto=entries.filter(e=>!e.isAnswered).length;
  return {totalAuto:entries.length,correctAuto,partialAuto,wrongAuto:entries.length-correctAuto-partialAuto-unansweredAuto,unansweredAuto,percentAuto:entries.length?Math.round(entries.reduce((s,e)=>s+e.points,0)/entries.length*100):0,byTask};
}
export function sequencesFamily(task:SequencesTask,language:string){return getSequencesCopy(language)[`${task.rule.kind}Family`];}
export function sequencesTaskPrompt(task:SequencesTask,language:string){return getSequencesCopy(language)[`${task.type}Prompt`];}
export function sequencesTaskText(task:SequencesTask,language:string){
  const values=sequencesValues(task).map((v,i)=>task.hidden.includes(i)?"?":formatSequencesValue(v,task.notation,language));
  return [sequencesTaskPrompt(task,language),task.type==="figures"?"":sequencesFamily(task,language),values.join(", ")].filter(Boolean).join(" ");
}
export function sequencesFieldLabel(task:SequencesTask,key:string,language:string){
  const c=getSequencesCopy(language);
  return key==="a"?task.rule.kind==="add"?c.addRule:task.rule.kind==="multiply"?c.multiplyRule:c.firstJump:key==="b"?task.rule.kind==="alternate"?c.secondJump:c.increase:`${task.type==="figures"?c.figure:c.term} ${Number(key)+1}`;
}
export function sequencesAnswerText(task:SequencesTask,language:string){return Object.entries(sequencesExpected(task)).map(([key,v])=>`${sequencesFieldLabel(task,key,language)}: ${formatSequencesValue(v,task.type==="rule"?(v.d===1?"whole":"fraction"):task.notation,language)}`).join(" · ");}
export function sequencesSolution(task:SequencesTask,language:string){return sequencesValues(task).map(v=>formatSequencesValue(v,task.notation,language)).join(", ");}
