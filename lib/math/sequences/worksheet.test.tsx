import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {DEFAULT_SEQUENCES_SETTINGS,SEQUENCES_LEVELS,SEQUENCES_MODES,SEQUENCES_NUMBER_TYPES,figureTask,formatSequencesValue,generateSequencesWorksheet,gradeSequencesTask,gradeSequencesWorksheet,normalizeSequencesSettings,parseSequencesNumber,rational,readSequencesAnswer,romanNumeral,sanitizeSequencesWorksheet,sequencesAnswerText,sequencesExpected,sequencesValues,type SequencesTask} from "./worksheet";
import {sequencesFullPageCounts,sequencesPageCapacity,sequencesPrintPages} from "./printLayout";
import {getAssignmentDerivedState} from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import {mathEditorHref} from "../editor";
import {POST} from "@/app/api/generate-sequences-worksheet/route";
const require=createRequire(import.meta.url);require.extensions[".css"]=()=>{};
const View=require("../../../components/generators/math/sequences/SequencesWorksheetView").default as typeof import("@/components/generators/math/sequences/SequencesWorksheetView").default;
const Support=require("../../../components/generators/math/sequences/SequenceSupport").default as typeof import("@/components/generators/math/sequences/SequenceSupport").default;
const base:SequencesTask={id:"known",type:"continue",notation:"fraction",alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ",start:rational(1,2),rule:{kind:"add",a:rational(1,2),b:rational(0)},hidden:[4,5],figure:null,size:1};
function seeded(seed:number){return()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};}
function fullAnswer(task:SequencesTask,language:string){return {fields:Object.fromEntries(Object.entries(sequencesExpected(task)).map(([key,v])=>[key,formatSequencesValue(v,task.type==="rule"?(v.d===1?"whole":"fraction"):task.notation,language)]))};}

test("known additive, geometric, alternating and growing sequences use exact rational values",()=>{
 assert.deepEqual(sequencesValues(base),[rational(1,2),rational(1),rational(3,2),rational(2),rational(5,2),rational(3)]);
 assert.deepEqual(sequencesValues({...base,start:rational(32),rule:{kind:"multiply",a:rational(1,2),b:rational(0)}}).map(v=>v.n/v.d),[32,16,8,4,2,1]);
 assert.deepEqual(sequencesValues({...base,start:rational(-2),rule:{kind:"alternate",a:rational(3),b:rational(-1)}}).map(v=>v.n),[-2,1,0,3,2,5]);
 assert.deepEqual(sequencesValues({...base,start:rational(1),rule:{kind:"growing",a:rational(2),b:rational(1)}}).map(v=>v.n),[1,3,6,10,15,21]);
 assert.equal(gradeSequencesTask(base,{fields:{4:"2,5",5:"6/2"}}).points,1);
 assert.equal(gradeSequencesTask(base,{fields:{4:"10/4",5:"wrong"}}).points,.5);
 assert.equal(gradeSequencesTask(base,{fields:{4:"",5:""}}).isAnswered,false);
 assert.equal(gradeSequencesTask(base,{working:"I added halves"}).isAnswered,true);
 assert.deepEqual(parseSequencesNumber("−3/6"),rational(-1,2));
 for(const input of ["1/0","1e2","Infinity","1 + 2","<script>","1,2.3","99999999999999999999999999999999999999999"])assert.equal(parseSequencesNumber(input),null);
});
test("rule parameters receive independent credit; notation is explicit for letters and Roman numerals",()=>{
 const task={...base,type:"rule" as const,hidden:[],rule:{kind:"alternate" as const,a:rational(1,2),b:rational(3,4)}};
 assert.equal(gradeSequencesTask(task,{fields:{a:"0.5",b:"6/8"}}).points,1);
 assert.equal(gradeSequencesTask(task,{fields:{a:"1/2",b:""}}).points,.5);
 const roman={...base,notation:"roman" as const,start:rational(1),rule:{kind:"add" as const,a:rational(1),b:rational(0)}};
 assert.equal(gradeSequencesTask(roman,{fields:{4:"v",5:"VI"}}).points,1);
 assert.equal(gradeSequencesTask(roman,{fields:{4:"5",5:"IIIIII"}}).points,0);
 const letters={...roman,notation:"letters" as const,start:rational(24)};
 assert.equal(gradeSequencesTask(letters,{fields:{4:"ø",5:"å"}}).points,1);
 assert.equal(romanNumeral(49),"XLIX");assert.equal(romanNumeral(0),"");
});
test("fraction variants include several denominators and descending number lines still increase to the right",()=>{
 const sheet=generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,taskType:"continue",numberType:"fraction",taskCount:60},"nb",false,seeded(51));
 const denominators=new Set(sheet.tasks.flatMap(t=>sequencesValues(t).map(v=>v.d)));
 for(const d of [2,3,4,5,8])assert.ok(denominators.has(d));
 const descending={...base,type:"rule" as const,notation:"negative" as const,start:rational(6),rule:{kind:"add" as const,a:rational(-3),b:rational(0)},hidden:[]};
 const support=load(renderToStaticMarkup(<Support task={descending} language="nb"/>));
 assert.deepEqual(support("text").map((_,e)=>support(e).text().replaceAll("−","-")).get(),["-9","-6","-3","0","3","6"]);
});
test("all modes, levels, number types and languages round-trip and grade without rounding",()=>{
 for(const taskType of SEQUENCES_MODES)for(const level of SEQUENCES_LEVELS)for(const numberType of SEQUENCES_NUMBER_TYPES)for(const language of ["nb","en","pt"]){
  const sheet=generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,taskType,level,numberType,taskCount:24},language,true,seeded(83));
  assert.deepEqual(sanitizeSequencesWorksheet(JSON.parse(JSON.stringify(sheet))),sheet,`${taskType}/${level}/${numberType}/${language}`);
  const answers=Object.fromEntries(sheet.tasks.map(t=>[t.id,fullAnswer(t,language)]));
  assert.equal(gradeSequencesWorksheet(sheet,answers).percentAuto,100);
  assert.equal(gradeSequencesWorksheet(sheet,{}).unansweredAuto,24);
  if(taskType==="mixed")assert.equal(new Set(sheet.tasks.map(t=>t.type)).size,4);
  const numerical=sheet.tasks.filter(t=>t.type!=="figures");
  if(level==="advanced"&&numerical.length)assert.equal(new Set(numerical.map(t=>t.rule.kind)).size,2);
  for(const t of numerical){assert.ok(!/[{}]|undefined|NaN/.test(sequencesAnswerText(t,language)));if(numberType==="negative")assert.ok(sequencesValues(t).some(v=>v.n<0));}
 }
 // Randomness with no variation still terminates and produces valid tasks.
 assert.ok(sanitizeSequencesWorksheet(generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,numberType:"letters",level:"advanced"},"nb",false,()=>0)));
});
test("shape rules match actual square counts, and pupil drawings do not change automatic scores",()=>{
 for(const [figure,expected]of [["rows",[2,4,6,8,10]],["doubling",[2,4,8,16,32]],["squares",[1,4,9,16,25]],["triangles",[1,3,6,10,15]]]as const){
  const task=figureTask("figure",figure,figure==="rows"||figure==="doubling"?2:1,"nb");
  assert.deepEqual(sequencesValues(task).map(v=>v.n),expected);
  assert.equal(gradeSequencesTask(task,{fields:{3:String(expected[3]),4:"wrong"},cells:Array.from({length:36},(_,i)=>i)}).points,.5);
  assert.equal(gradeSequencesTask(task,{cells:[1]}).points,0);
 }
 assert.deepEqual(readSequencesAnswer({fields:{a:"test",injected:"bad"},cells:[-1,0,0,35,36,1.5],working:"ok"}),{fields:{a:"test"},cells:[0,35],working:"ok"});
});
test("saved data rejects damaged rules, level mismatches, hidden positions and duplicate ids",()=>{
 for(const patch of [{level:"bad"},{numberType:"bad"},{taskCount:61},{taskCount:1.5},{showSupport:0}])assert.throws(()=>normalizeSequencesSettings({...DEFAULT_SEQUENCES_SETTINGS,...patch}));
 const sheet=generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,taskType:"continue"},"nb",false,seeded(3));
 for(const patch of [{notation:"roman"},{start:{n:Infinity,d:1}},{start:{n:1,d:0}},{hidden:[0,1]},{hidden:[4,4]},{figure:"squares"},{id:"bad/id"},{rule:{kind:"multiply",a:{n:0,d:1},b:{n:0,d:1}}}]){
  const changed=structuredClone(sheet);Object.assign(changed.tasks[0],patch);assert.equal(sanitizeSequencesWorksheet(changed),null);
 }
 const duplicate=structuredClone(sheet);duplicate.tasks[1].id=duplicate.tasks[0].id;assert.equal(sanitizeSequencesWorksheet(duplicate),null);
 const forged=sanitizeSequencesWorksheet({...sheet,tasks:sheet.tasks.map(t=>({...t,answer:999,values:[999]}))})!;
 assert.ok(forged);assert.equal("answer" in forged.tasks[0],false);assert.equal("values" in forged.tasks[0],false);
 const figureSheet=generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,taskType:"figures",level:"advanced"});figureSheet.tasks[0].rule.a=rational(4);assert.equal(sanitizeSequencesWorksheet(figureSheet),null);
});
test("full-sheet choices and custom counts keep every task once with consecutive numbering",()=>{
 for(const type of SEQUENCES_MODES)for(const support of [false,true]){
  const cap=sequencesPageCapacity(type,support),counts=sequencesFullPageCounts(type,support);assert.equal(counts[0],cap.first);assert.equal(counts[1],cap.first+cap.following);
  for(let n=1;n<=60;n++){const tasks=Array.from({length:n},(_,i)=>i),pages=sequencesPrintPages(tasks,type,support);assert.deepEqual(pages.flatMap(p=>p.tasks),tasks);assert.equal(pages.at(-1)!.startIndex+pages.at(-1)!.tasks.length,n);}
 }
});
for(const language of ["nb","en","pt"]as const)test(`print, accessible fields, support and Space type recognition (${language})`,()=>{
 const sheet=generateSequencesWorksheet({...DEFAULT_SEQUENCES_SETTINGS,level:"advanced",numberType:"fraction",taskCount:12,showSupport:true},language,true,seeded(19));
 const printed=load(renderToStaticMarkup(<View worksheet={sheet} printMode/>));assert.equal(printed(".length-page").length,2);assert.equal(printed(".length-key").length,1);assert.equal(printed("input,textarea,button").length,0);
 assert.deepEqual(printed(".length-number").map((_,e)=>Number(printed(e).text())).get(),Array.from({length:12},(_,i)=>i+1));
 const pupil=load(renderToStaticMarkup(<View worksheet={sheet} readOnly/>));assert.equal(pupil(".length-key,.length-result").length,0);assert.equal(pupil("textarea[readonly]").length,12);assert.ok(pupil("input,textarea,button").toArray().every(e=>!!pupil(e).attr("aria-label")));
 assert.ok(pupil(".sequences-drawing button:disabled").length>0);
 const support=load(renderToStaticMarkup(<Support task={base} language={language}/>));assert.ok(!support.text().includes("2,5")&&!support.text().includes("2.5"));
 const derived=getAssignmentDerivedState({mathWorksheet:sheet,mathType:"sequences"}as Parameters<typeof getAssignmentDerivedState>[0],null);assert.equal(derived.isSequencesAssignment,true);assert.equal(derived.isGeometryAssignment,false);
 assert.equal(mathEditorHref(language,"saved/id?","sequences"),`/${language}/producer/math/sequences?edit=saved%2Fid%3F`);
});
test("generation API validates settings and returns canonical worksheets",async()=>{
 const response=await POST(new Request("http://localhost/api/generate-sequences-worksheet",{method:"POST",body:JSON.stringify({settings:{...DEFAULT_SEQUENCES_SETTINGS,level:"advanced",numberType:"letters"},language:"nb"})}));assert.equal(response.status,200);assert.ok(sanitizeSequencesWorksheet((await response.json()).worksheet));
 for(const body of ["{","null",JSON.stringify({settings:{...DEFAULT_SEQUENCES_SETTINGS,taskCount:999}})])assert.equal((await POST(new Request("http://localhost/api/generate-sequences-worksheet",{method:"POST",body}))).status,400);
});
