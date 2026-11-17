import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { grammarFixture } from "./fixtures";
import { GRAMMAR_LEVELS,gradeGrammar,parseGrammarTest } from "./types";
import { LEVEL_GUIDANCE,parseGenerated,reviewAccepted } from "./generation";
import {grammarTargets} from "./targets";
import GrammarTestPlayer from "../../components/assessments/GrammarTestPlayer";
import ReadingTestWorksheet from "../../components/assessments/ReadingTestWorksheet";
test("ten mixed word-choice sentences work for every selectable level",()=>{
  for(const level of GRAMMAR_LEVELS){assert.ok(LEVEL_GUIDANCE[level]);assert.equal(parseGrammarTest({...grammarFixture(),level})?.tasks.length,10);}
});
test("reject incomplete, duplicate or ambiguous-key structures",()=>{
  const original=grammarFixture();
  const mutations=[(v:typeof original)=>v.tasks.pop(),(v:typeof original)=>v.tasks[1].id=v.tasks[0].id,(v:typeof original)=>v.tasks[1].prompt=v.tasks[0].prompt,(v:typeof original)=>v.tasks[0].prompt="Ingen tomrom",(v:typeof original)=>v.tasks[0].prompt="___ og ___",(v:typeof original)=>v.tasks[0].correctAnswer="feil",(v:typeof original)=>v.tasks[0].options=["og","og"],(v:typeof original)=>v.tasks[0].focus="verb",(v:typeof original)=>v.tasks[0].id="__proto__"];
  for(const mutate of mutations){const copy=structuredClone(original);mutate(copy);assert.equal(parseGrammarTest(copy),null);}
});
test("generation cannot accept a short set or change the requested focus",()=>{
  const value={title:"Ordvalg",tasks:grammarTargets("A2","mixed_words").map(target=>({prompt:`I dag: ${target.frame}.`,explanation:"En kort forklaring til riktig form."}))};
  assert.ok(parseGenerated(value,"A2","mixed_words","Hverdag"));assert.equal(parseGenerated(value,"B1","verb","Hverdag"),null);
  assert.equal(parseGenerated({...value,tasks:value.tasks.slice(1)},"A2","mixed_words","Hverdag"),null);
});
test("curated targets prevent ambiguous tense slots and model-supplied answer keys",()=>{
  for(const level of GRAMMAR_LEVELS)for(const focus of ["mixed_words","og_aa","den_det","verb","noun"] as const){
    const targets=grammarTargets(level,focus),draft={title:"Prøve",tasks:targets.map((target,index)=>({prompt:`Eksempel ${index+1}: ${target.frame}.`,explanation:"Velg formen som passer i setningen.",correctAnswer:"injected",options:["bad"]}))};
    const parsed=parseGenerated(draft,level,focus,"");assert.ok(parsed);assert.equal(parsed.tasks[0].correctAnswer,targets[0].correctAnswer);assert.deepEqual(parsed.tasks[0].options,targets[0].options);
    if(focus==="verb"){draft.tasks[0].prompt="I helgen ___ vi sammen.";assert.equal(parseGenerated(draft,level,focus,""),null);}
  }
});
test("independent review needs ten distinct matching ids and every check",()=>{
  const ids=grammarFixture().tasks.map(task=>task.id),review={distinct:true,items:ids.map(id=>({id,uniqueAnswer:true,correctKey:true,focusMatches:true,levelAppropriate:true,explanationCorrect:true,reason:"Bare ett alternativ gir grammatisk riktig setning."}))};
  assert.ok(reviewAccepted(review,ids));
  for(const key of ["uniqueAnswer","correctKey","focusMatches","levelAppropriate","explanationCorrect"]){const copy=structuredClone(review);Object.assign(copy.items[3],{[key]:false});assert.equal(reviewAccepted(copy,ids),false);}
  assert.equal(reviewAccepted({...review,items:review.items.slice(1)},ids),false);
  assert.equal(reviewAccepted({...review,items:[review.items[0],...review.items.slice(0,9)]},ids),false);
  assert.equal(reviewAccepted({...review,distinct:false},ids),false);
});
test("grading separates wrong and missing answers and ignores injected scores or keys",()=>{
  const {tasks}=grammarFixture(),answers={"grammar-1":"å","grammar-2":"å","grammar-3":{correctAnswer:"å"},"grammar-4":"unknown",auto:{percentAuto:100},correctAnswer:"å"};
  const result=gradeGrammar(tasks,answers);
  assert.equal(result.correctAuto,1);assert.equal(result.wrongAuto,1);assert.equal(result.unansweredAuto,8);assert.equal(result.percentAuto,10);
  assert.equal(gradeGrammar(tasks,Object.fromEntries(tasks.map(task=>[task.id,task.correctAnswer]))).percentAuto,100);
});
test("student dropdowns have no answer key or explanations until results are shown",()=>{
  const tasks=grammarFixture().tasks,student=renderToStaticMarkup(<GrammarTestPlayer tasks={tasks} answers={{}}/>),teacher=renderToStaticMarkup(<GrammarTestPlayer tasks={tasks} answers={{}} disabled showResults/>);
  assert.equal((student.match(/<select /g)||[]).length,10);assert.ok(!student.includes(tasks[0].explanation));assert.ok(!student.includes("Riktig svar:"));
  assert.ok(teacher.includes(tasks[0].explanation));assert.ok(teacher.includes("10 ubesvart"));
});
test("paper has all ten tasks with no reading section or key; separate key contains explanations",()=>{
  const test=grammarFixture(),content={...test,sourceText:"",modality:"grammar" as const};
  const pupil=renderToStaticMarkup(<ReadingTestWorksheet content={content} locale="nb" mode="learner"/>),key=renderToStaticMarkup(<ReadingTestWorksheet content={content} locale="nb" mode="key"/>);
  assert.equal((pupil.match(/class="reading-test-sheet-prompt"/g)||[]).length,10);assert.ok(!pupil.includes("Les teksten"));assert.ok(!pupil.includes(test.tasks[0].explanation));assert.ok(key.includes(test.tasks[0].explanation));
});
