import assert from "node:assert/strict";
import test from "node:test";
import {load} from "cheerio";
import {renderToStaticMarkup} from "react-dom/server";
import {exampleStartListeningTest as fixture} from "./fixtures";
import {listeningHasAudio,listeningStudentTest,parseListeningTest} from "./types";
import {listeningMetadata,parseListeningMetadata,parseSavedListeningAudio,listeningAudioPath} from "./persistence";
import {parseStartGenerated,startReviewAccepted} from "./startGeneration";
import {listeningStudentHtml} from "./export";
import Worksheet from "../../components/assessments/ReadingTestWorksheet";
const audio="data:audio/mpeg;base64,SUQzBAAAAA==";
const ready={...fixture,clips:fixture.clips!.map(clip=>({...clip,audioDataUrl:audio,aiVoice:true}))};
test("A1 Start requires four correctly bound independent MCQ clips",()=>{
  assert.ok(parseListeningTest(fixture));assert.ok(parseListeningTest(ready));
  for(const value of [{...fixture,clips:fixture.clips!.slice(1)},{...fixture,clips:[...fixture.clips!].reverse()},{...fixture,script:"Unrelated script"},{...fixture,tasks:fixture.tasks.slice(1)},{...fixture,audioDataUrl:audio},{...fixture,tasks:fixture.tasks.map(task=>({...task,type:"true_false",correctAnswer:true}))}])assert.equal(parseListeningTest(value),null);
});
test("drafts may lack audio, but digital export requires every recording",()=>{
  assert.equal(listeningHasAudio(fixture),false);assert.equal(listeningHasAudio(ready),true);assert.throws(()=>listeningStudentHtml(fixture,"nb"));
  assert.equal(listeningHasAudio({...ready,clips:ready.clips.map((clip,i)=>i===2?{...clip,audioDataUrl:undefined}:clip)}),false);
});
test("student projections and offline files omit every teacher script",()=>{
  const student=listeningStudentTest(ready),html=listeningStudentHtml(ready,"nb"),$=load(html),data=JSON.parse($("#listening-data").text());
  for(const clip of ready.clips){assert.ok(!html.includes(clip.script));assert.equal("script" in student.clips![0],false);}
  assert.equal(data.test.clips.length,4);assert.equal($("audio").length,1);assert.equal($("script[src],link[href]").length,0);
  const shared=listeningStudentTest({...ready,playback:"teacher"});assert.ok(shared.clips?.every(clip=>clip.audioDataUrl===undefined));
});
test("saved metadata strips all audio and private file paths remain bound to clip ids",()=>{
  const metadata=listeningMetadata(ready);assert.equal(JSON.stringify(metadata).includes("base64"),false);assert.ok(parseListeningMetadata(metadata));assert.equal(parseListeningMetadata(ready),null);
  const saved={contentType:"audio/mpeg",size:9,sha256:"a".repeat(64),saveId:"version",generation:"101",clipId:"start-1",storagePath:listeningAudioPath("owner","test","version","start-1")};
  assert.ok(parseSavedListeningAudio(saved,"owner","test","start-1"));assert.equal(parseSavedListeningAudio(saved,"owner","test","start-2"),null);assert.equal(parseSavedListeningAudio(saved,"other","test","start-1"),null);
});
test("generation validates counts, script length, independent wording and strict reviewer coverage",()=>{
  const packet={title:fixture.title,items:fixture.tasks.map((task,index)=>({...task,script:fixture.clips![index].script}))};
  assert.ok(parseStartGenerated(packet,"nb"));assert.equal(parseStartGenerated({...packet,items:[...packet.items.slice(0,3),packet.items[0]]},"nb"),null);
  assert.equal(parseStartGenerated({...packet,items:packet.items.map(item=>({...item,script:"Hei!"}))},"nb"),null);
  const items=fixture.tasks.map(task=>({id:task.id,standalone:true,oneCorrectAnswer:true,simpleLanguage:true,directInformation:true,explanation:"Supported by this clip alone."}));
  assert.equal(startReviewAccepted({distinctTargets:true,items}),true);assert.equal(startReviewAccepted({distinctTargets:true,items:items.slice(1)}),false);assert.equal(startReviewAccepted({distinctTargets:true,items:items.map(item=>({...item,oneCorrectAnswer:false}))}),false);
});
test("paper has all four questions and the teacher key has four separately labelled scripts",()=>{
  const content={title:ready.title,sourceText:ready.script,level:ready.level,language:ready.language,tasks:ready.tasks,modality:"listening" as const,plays:2,listeningClips:ready.clips};
  const learner=load(renderToStaticMarkup(<Worksheet content={content} locale="nb" mode="learner"/>)),key=load(renderToStaticMarkup(<Worksheet content={content} locale="nb" mode="key"/>));
  assert.equal(learner(".reading-test-sheet-task").length,4);assert.equal(learner(".reading-test-sheet-source").length,0);assert.equal(key(".reading-test-sheet-source h4").length,4);assert.equal(key(".reading-test-sheet-answer").length,4);
});
