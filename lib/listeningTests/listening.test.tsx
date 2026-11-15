import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { exampleListeningTest } from "./fixtures";
import { listeningScore, listeningStudentTest, listeningTestError, parseListeningTest, validListeningAudio, shuffleListeningOptions } from "./types";
import { listeningStudentHtml, serializeListeningData } from "./export";
import { evaluateListeningScope } from "./guidance";
import { reviewReadingTest } from "../readingTests/semanticReview";
import { revisedA2 } from "../readingTests/semanticReview.fixtures";
import ReadingTestWorksheet from "../../components/assessments/ReadingTestWorksheet";
import { getListeningCopy } from "./copy";

const audio="data:audio/mpeg;base64,SUQzBAAAAA==";
const ready={...exampleListeningTest,audioDataUrl:audio};

test("teacher packages round-trip all three question types without accepting remote audio",()=>{
  assert.equal(listeningTestError(ready),null);
  assert.deepEqual(parseListeningTest(JSON.parse(JSON.stringify(ready)))?.tasks,ready.tasks.map((task,index)=>({...task,options:task.options,order:index+1})));
  assert.equal(parseListeningTest({...ready,audioDataUrl:"https://example.com/tracking.mp3"}),null);
  assert.equal(validListeningAudio("data:text/html;base64,AAAA"),false);
  assert.equal(validListeningAudio("data:audio/mpeg;base64,AAAA\" onerror=\"alert(1)"),false);
});

test("invalid or incomplete answer keys cannot become a usable test",()=>{
  assert.equal(listeningTestError({...ready,tasks:[]}),"tasks");
  assert.equal(parseListeningTest({...ready,tasks:[{...ready.tasks[0],correctAnswer:"Not an option"}]}),null);
  assert.equal(parseListeningTest({...ready,tasks:[{...ready.tasks[0],options:["same","same"]}]}),null);
  assert.equal(parseListeningTest({...ready,tasks:[ready.tasks[0],ready.tasks[0]]}),null);
  assert.equal(parseListeningTest({...ready,script:"a".repeat(4001)}),null);
  assert.equal(parseListeningTest({...ready,plays:0}),null);
});

test("false counts as an answered response; blanks do not become incorrect answers",()=>{
  assert.deepEqual(listeningScore(ready,{false:false,information:"Wrong"}),{correct:1,answered:2,unanswered:4,total:6});
  assert.deepEqual(listeningScore(ready,{}),{correct:0,answered:0,unanswered:6,total:6});
});

test("shuffling answer positions preserves the key, true/false order and original teacher content",()=>{
  const before=structuredClone(ready.tasks),shuffled=shuffleListeningOptions(ready.tasks,()=>0);
  assert.deepEqual(ready.tasks,before);
  assert.notDeepEqual(shuffled[0].options,ready.tasks[0].options);
  assert.equal(shuffled[0].correctAnswer,ready.tasks[0].correctAnswer);
  assert.equal(shuffled[3],ready.tasks[3]);
  for(const task of shuffled){if(task.options)assert.ok(task.options.includes(String(task.correctAnswer)));}
});

test("student data excludes the manuscript, and teacher playback does not distribute the audio",()=>{
  assert.equal("script" in listeningStudentTest(ready),false);
  assert.equal(listeningStudentTest(ready).audioDataUrl,audio);
  assert.equal(listeningStudentTest({...ready,playback:"teacher"}).audioDataUrl,undefined);
});

test("offline files contain no transcript, external resources or learner data storage",()=>{
  const pack={...ready,script:"UNIQUE_TEACHER_MANUSCRIPT_73910",title:"</script><img src=x onerror=alert(1)>"};
  const html=listeningStudentHtml(pack,"nb"),$=load(html);
  assert.equal($("script[src],link[href],img,iframe").length,0);
  assert.equal($("script").length,2);
  assert.ok(!html.includes(pack.script));
  assert.ok(!html.includes(pack.title));
  assert.ok(!html.includes("localStorage")&&!html.includes("fetch("));
  const data=JSON.parse($("#listening-data").text());
  assert.equal(data.test.title,pack.title);
  assert.equal(data.test.script,undefined);
  assert.ok($("meta[http-equiv='Content-Security-Policy']").attr("content")?.includes("default-src 'none'"));
  assert.ok(!serializeListeningData({text:"</script>\u2028&"}).includes("</script>"));
  assert.throws(()=>listeningStudentHtml(exampleListeningTest,"nb"),/not ready/);
});

test("learner print has all questions but no transcript; the separate key includes the script",()=>{
  const content={title:ready.title,sourceText:ready.script,level:ready.level,language:ready.language,tasks:ready.tasks,modality:"listening" as const,plays:2};
  for(const locale of ["nb","en","pt"]){
    const copy=getListeningCopy(locale);
    const $=load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale={locale} mode="learner" layout="new_page"/>));
    assert.equal($(".reading-test-sheet-task").length,6);
    assert.equal($(".reading-test-sheet-source,.reading-test-sheet-answer,.reading-test-questions-new-page").length,0);
    assert.ok(!$.text().includes(ready.script.split("\n\n")[0]));
    assert.ok($.text().includes(copy.printInstructions));
    const key=load(renderToStaticMarkup(<ReadingTestWorksheet content={content} locale={locale} mode="key"/>));
    assert.ok(key.text().includes(ready.script.split("\n\n")[0]));
    assert.equal(key(".reading-test-sheet-answer").length,6);
    assert.ok(key.text().includes(copy.scriptPrint));
  }
});

test("listening-specific review fails closed on missing scope and any visual or multi-voice dependency",()=>{
  const valid={understandableWithoutScript:true,questionsUseOnlyHeardInformation:true,singleVoiceScript:true,explanation:"All questions depend only on the spoken information."};
  assert.equal(evaluateListeningScope(valid).accepted,true);
  assert.equal(evaluateListeningScope(null).accepted,false);
  for(const key of ["understandableWithoutScript","questionsUseOnlyHeardInformation","singleVoiceScript"]){assert.equal(evaluateListeningScope({...valid,[key]:false}).accepted,false);}
});

test("the shared reviewer adds required listening checks while preserving independent evidence and hidden skill labels",async()=>{
  const result=await reviewReadingTest(revisedA2,"A2","gpt-5-mini",async request=>{
    assert.equal(request.text?.format?.type,"json_schema");
    if(request.text?.format?.type==="json_schema"){
      const schema=request.text.format.schema as {required:string[]};
      assert.ok(schema.required.includes("listeningScopeCheck"));
      assert.equal(request.text.format.name,"a2_listening_content_review");
    }
    const input=request.input as {role:string;content:string}[];
    assert.ok(input[0].content.includes("VERBATIM SCRIPT"));
    const data=JSON.parse(input[1].content);assert.equal(data.tasks[0].evidence,undefined);assert.equal(data.tasks[0].skill,undefined);
    return {output_text:JSON.stringify({listeningScopeCheck:{understandableWithoutScript:true,questionsUseOnlyHeardInformation:true,singleVoiceScript:true,explanation:"Okay"}})};
  },"listening");
  assert.equal(result.accepted,false,"listening scope alone cannot replace the main content review");
});
