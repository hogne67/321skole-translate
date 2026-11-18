import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after,before,beforeEach,mock,test } from "node:test";
import { initializeApp,deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth,type DecodedIdToken } from "firebase-admin/auth";
import { initializeTestEnvironment,assertFails } from "@firebase/rules-unit-testing";
import { getDoc,doc } from "firebase/firestore";
import { saveGrammar,loadGrammar,GrammarSaveError } from "./saved.server";
import { grammarFixture } from "./fixtures";
import { POST as assign } from "../../app/api/teacher/spaces/[spaceId]/assign/route";
import { POST as submit } from "../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route";
import { GET as getSaved } from "../../app/api/grammar-tests/saved/[id]/route";
import { POST as audio } from "../../app/api/grammar-tests/audio/route";
import { POST as tts } from "../../app/api/tts/route";
import { Speech } from "openai/resources/audio/speech";
import { createHash } from "node:crypto";
import { reserveSpeechUsage,speechLimits,SpeechError } from "../audio/speech.server";
const projectId="demo-grammar-beta-local";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8286","Only the isolated local emulator is allowed");
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,projectId);
const app=initializeApp({projectId}),db=getFirestore(app),owner={uid:"owner",email_verified:true,auth_time:1000,firebase:{sign_in_provider:"password"}} as DecodedIdToken;
let env:Awaited<ReturnType<typeof initializeTestEnvironment>>;
let speechInputs:string[]=[];
process.env.OPENAI_API_KEY="isolated-test-no-network";
function request(uid:string,body?:unknown){return new Request("https://synthetic.invalid",{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${uid}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{host:"127.0.0.1",port:8286,rules:readFileSync("firestore.rules","utf8")}});
  mock.method(getAuth(app),"verifyIdToken",async(token:string)=>{if(token==="invalid")throw Object.assign(Error("invalid"),{code:"auth/invalid-id-token"});return {...owner,uid:token,...(token==="anonymous"?{firebase:{sign_in_provider:"anonymous"}}:{})};});
  mock.method(Speech.prototype,"create",async(body:{input:string})=>{speechInputs.push(body.input);return new Response(new Uint8Array([1,2,3]),{headers:{"Content-Type":"audio/mpeg"}});});
});
beforeEach(async()=>{
  await env.clearFirestore();
  speechInputs=[];
  for(const [uid,role] of [["owner","teacher"],["peer","teacher"],["pupil","student"],["outsider","student"]])await db.doc(`users/${uid}`).set({role,plan:"plus"});
  await db.doc("spaces/room").set({ownerId:"owner",title:"Synthetic class",isOpen:true,status:"active"});
  await db.doc("spaceMembers/room_pupil").set({spaceId:"room",uid:"pupil",participantId:"pupil",role:"student",status:"active",active:true});
  await db.doc("users/pupil").update({studentAccessMode:"space_only"});
});

async function sharedAudioTest(enabled:boolean,label:string){
  const test={...grammarFixture(),audioEnabled:enabled,tasks:grammarFixture().tasks.map(task=>({...task,prompt:`${label}: ${task.prompt}`}))};
  const saved=await saveGrammar(owner,{test});
  const response=await assign(request("owner",{sourceType:"myContent",sourceId:saved.id}),{params:Promise.resolve({spaceId:"room"})});
  assert.equal(response.status,200);const {assignmentId}=await response.json();
  return {saved,test,assignmentId,scope:{spaceId:"room",assignmentId,taskId:test.tasks[0].id}};
}
test("audio is off by default; teacher choice follows a frozen assignment snapshot",async()=>{
  const {saved,test,assignmentId,scope}=await sharedAudioTest(false,"Off switch");
  assert.equal((await db.doc(`spaces/room/lessons/${assignmentId}`).get()).get("grammarAudioEnabled"),false);
  assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,403);
  const updated=await saveGrammar(owner,{...saved,test:{...test,audioEnabled:true}});
  assert.equal((await loadGrammar("owner",saved.id)).test.audioEnabled,true);
  assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,403);
  assert.equal((await audio(request("owner",{lessonId:saved.id,revision:saved.revision,taskId:scope.taskId,mode:"gap"}))).status,409);
  assert.equal((await audio(request("peer",{lessonId:saved.id,revision:updated.revision,taskId:scope.taskId,mode:"gap"}))).status,404);
  assert.equal(speechInputs.length,0);
});
test("pupil hears two sides with an explicit pause; solution is denied until submission and uses the correct key",async()=>{
  const {scope,assignmentId}=await sharedAudioTest(true,"Gap playback");
  assert.equal((await audio(new Request("https://synthetic.invalid",{method:"POST",body:JSON.stringify({...scope,mode:"gap"})}))).status,401);
  assert.equal((await audio(request("invalid",{...scope,mode:"gap"}))).status,401);
  assert.equal((await audio(request("pupil",{...scope,mode:"solution"}))).status,403);
  const gap=await audio(request("pupil",{...scope,mode:"gap",text:"Injected full answer"}));assert.equal(gap.status,200);
  const packet=await gap.json();assert.deepEqual(packet.parts.map((part:{kind:string})=>part.kind),["audio","pause","audio"]);assert.equal(packet.parts[1].milliseconds,1000);
  assert.deepEqual(speechInputs,["Gap playback: Jeg liker","lese bøker."]);
  const counter=db.doc(`ttsUsage/${createHash("sha256").update("pupil").digest("hex")}`),before=(await counter.get()).data()!;
  const repeated=await audio(request("pupil",{...scope,mode:"gap"}));assert.equal(repeated.status,200);assert.equal(speechInputs.length,2);assert.equal((await counter.get()).get("characters"),before.characters);
  const submitted=await submit(request("pupil",{payload:{uid:"pupil",participantId:"pupil",status:"submitted",answers:{"grammar-1":"og"}}}),{params:Promise.resolve({spaceId:"room",assignmentId})});assert.equal(submitted.status,200);
  const solution=await audio(request("pupil",{...scope,mode:"solution",text:"Injected incorrect answer"}));assert.equal(solution.status,200);assert.equal((await solution.json()).parts.length,1);
  assert.equal(speechInputs.at(-1),"Gap playback: Jeg liker å lese bøker.");
  await assertFails(getDoc(doc(env.authenticatedContext("pupil").firestore(),counter.path)));
});
test("warm audio does not bypass teacher controls, source ownership, disabled accounts or removed membership",async()=>{
  const {scope,saved}=await sharedAudioTest(true,"Access controls");
  assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,200);
  assert.equal((await audio(request("outsider",{...scope,mode:"gap"}))).status,403);
  assert.equal((await audio(request("peer",{lessonId:saved.id,revision:saved.revision,taskId:scope.taskId,mode:"solution"}))).status,404);
  await db.doc("users/pupil").update({disabled:true});assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,403);
  await db.doc("users/pupil").update({disabled:false});await db.doc("spaceMembers/room_pupil").update({status:"removed"});assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,403);
  assert.equal((await audio(request("owner",{lessonId:saved.id,revision:saved.revision,taskId:scope.taskId,mode:"solution"}))).status,200);
  await db.doc(`lessons/${saved.id}`).update({ownerId:"pupil"});
  assert.equal((await audio(request("pupil",{lessonId:saved.id,revision:saved.revision,taskId:scope.taskId,mode:"gap"}))).status,403);
  await db.doc(`spaces/room/lessons/${scope.assignmentId}`).update({grammarAudioEnabled:false});assert.equal((await audio(request("owner",{...scope,mode:"gap"}))).status,403);
});
test("the general TTS route requires login and preserves ordinary Space audio without bypassing grammar controls",async()=>{
  const body={lessonId:"ordinary",spaceId:"room",text:"Synthetic ordinary lesson",lang:"nb"};
  assert.equal((await tts(new Request("https://synthetic.invalid",{method:"POST",body:JSON.stringify(body)}))).status,401);
  await db.doc("spaces/room/lessons/ordinary").set({lessonType:"text",status:"active"});
  assert.equal((await tts(request("pupil",body))).status,200);
  assert.equal((await tts(request("outsider",body))).status,403);
  assert.equal((await tts(request("pupil",{...body,spaceId:undefined}))).status,403);
  assert.equal((await tts(request("unonboarded",{...body,spaceId:undefined}))).status,403);
  assert.equal((await tts(request("owner",{...body,text:"x".repeat(4001)}))).status,400);
  assert.equal((await tts(request("owner",{...body,spaceId:undefined,text:"Synthetic author preview"}))).status,200);
  const {scope}=await sharedAudioTest(false,"Generic bypass");
  assert.equal((await tts(request("pupil",{...body,lessonId:scope.assignmentId}))).status,403);
  const feedbackRequest={...body,lessonId:scope.assignmentId,purpose:"teacher_feedback",text:"Synthetic feedback playback"};
  assert.equal((await tts(request("pupil",feedbackRequest))).status,403);
  const submissionId=`room_${scope.assignmentId}_pupil`;
  await db.doc(`spaces/room/lessons/${scope.assignmentId}/submissions/${submissionId}`).set({uid:"pupil",participantId:"pupil",spaceId:"room",assignmentId:scope.assignmentId,status:"reviewed",teacherFeedback:{text:"Synthetic feedback"}});
  assert.equal((await tts(request("pupil",feedbackRequest))).status,200);
  assert.equal((await tts(request("outsider",feedbackRequest))).status,403);
  await db.doc("users/anonymous").set({role:"student"});await db.doc("spaceMembers/room_anonymous").set({spaceId:"room",uid:"anonymous",participantId:"anonymous",role:"student",status:"active",active:true});
  assert.equal((await tts(request("anonymous",{...body,text:"Synthetic anonymous Space audio"}))).status,200);
});
test("parallel requests cannot exceed character or request limits",async()=>{
  const account={uid:"pupil",role:"student",anonymous:false},limit=speechLimits(account).dayCharacters;
  await reserveSpeechUsage(account,"characters",limit-5);
  const attempts=await Promise.allSettled([reserveSpeechUsage(account,"characters",4),reserveSpeechUsage(account,"characters",4)]);
  assert.equal(attempts.filter(result=>result.status==="fulfilled").length,1);
  assert.ok(attempts.some(result=>result.status==="rejected"&&result.reason instanceof SpeechError&&result.reason.status===429));
  const hash=createHash("sha256").update(account.uid).digest("hex");assert.equal((await db.doc(`ttsUsage/${hash}`).get()).get("characters"),limit-1);
  const now=Date.now();
  for(let i=0;i<59;i++)await reserveSpeechUsage({...account,uid:"rate-pupil"},"request",0,now);
  const requests=await Promise.allSettled([reserveSpeechUsage({...account,uid:"rate-pupil"},"request",0,now),reserveSpeechUsage({...account,uid:"rate-pupil"},"request",0,now)]);
  assert.equal(requests.filter(result=>result.status==="fulfilled").length,1);
  const {scope}=await sharedAudioTest(true,"Quota blocked");
  assert.equal((await audio(request("pupil",{...scope,mode:"gap"}))).status,429);assert.equal(speechInputs.length,0);
});
after(async()=>{mock.restoreAll();await env?.cleanup();await deleteApp(app);});
test("private save/reopen preserves all ten items without creating learner results",async()=>{
  const test=grammarFixture(),saved=await saveGrammar(owner,{test}),opened=await loadGrammar("owner",saved.id),raw=(await db.doc(`lessons/${saved.id}`).get()).data()!;
  assert.deepEqual(opened.test,test);assert.equal(raw.visibility,"private");assert.equal(raw.published,false);assert.equal(raw.beta,true);assert.equal(raw.tasks.length,10);assert.equal(raw.answers,undefined);
  assert.equal((await db.collection("spaceSubmissions").get()).size,0);
  assert.equal((await getSaved(request("peer"),{params:Promise.resolve({id:saved.id})})).status,404);
  await assertFails(getDoc(doc(env.authenticatedContext("pupil").firestore(),`lessons/${saved.id}`)));
  await assert.rejects(saveGrammar({...owner,uid:"peer"},{...saved,test}),(error:unknown)=>error instanceof GrammarSaveError&&error.status===404);
});
test("revision conflicts protect newer edits and a revoked account cannot save",async()=>{
  const test=grammarFixture(),first=await saveGrammar(owner,{test}),second=await saveGrammar(owner,{...first,test:{...test,title:"Ny tittel"}});
  assert.notEqual(second.revision,first.revision);
  await assert.rejects(saveGrammar(owner,{...first,test}),(error:unknown)=>error instanceof GrammarSaveError&&error.status===409);
  await db.doc("users/owner").update({authRevokedBefore:1001});
  await assert.rejects(saveGrammar(owner,{...second,test}));
});
test("teacher shares a frozen snapshot; pupil sends answers and server grades both teacher copies",async()=>{
  const test=grammarFixture(),saved=await saveGrammar(owner,{test});
  const shared=await assign(request("owner",{sourceType:"myContent",sourceId:saved.id}),{params:Promise.resolve({spaceId:"room"})});
  assert.equal(shared.status,200,await shared.clone().text());
  const response=await shared.json(),assignmentId=response.assignmentId;
  assert.equal(typeof assignmentId,"string",JSON.stringify(response));
  const snapshot=(await db.doc(`spaces/room/lessons/${assignmentId}`).get()).data()!;
  assert.equal(snapshot.lessonType,"grammar_test");assert.deepEqual(snapshot.tasks,test.tasks);
  await saveGrammar(owner,{...saved,test:{...test,title:"Edited after sharing",tasks:test.tasks.map((task,index)=>index?task:{...task,correctAnswer:"og"})}});
  const ctx={params:Promise.resolve({spaceId:"room",assignmentId})},payload={uid:"pupil",participantId:"pupil",status:"submitted",answers:{"grammar-1":"å","grammar-2":"å"},auto:{correctAuto:10,percentAuto:100}};
  assert.equal((await submit(request("outsider",{payload}),ctx)).status,403);
  const result=await submit(request("pupil",{payload}),ctx);assert.equal(result.status,200,await result.clone().text());
  const {submissionId}=await result.json();
  for(const path of [`spaces/room/lessons/${assignmentId}/submissions/${submissionId}`,`spaceSubmissions/${submissionId}`]){
    const data=(await db.doc(path).get()).data()!;assert.equal(data.status,"submitted");assert.equal(data.auto.correctAuto,1);assert.equal(data.auto.wrongAuto,1);assert.equal(data.auto.unansweredAuto,8);assert.equal(data.auto.percentAuto,10);assert.deepEqual(data.answers,payload.answers);
  }
  // An unrelated member cannot choose another learner's submission id.
  await db.doc("spaceMembers/room_outsider").set({spaceId:"room",uid:"outsider",participantId:"outsider",role:"student",status:"active",active:true});
  assert.equal((await submit(request("outsider",{submissionId,payload:{...payload,uid:"outsider",participantId:"outsider"}}),ctx)).status,403);
});
