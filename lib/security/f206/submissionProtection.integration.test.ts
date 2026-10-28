/* eslint-disable @typescript-eslint/no-explicit-any -- controlled test transport and test doubles */
import assert from 'node:assert/strict';
import { before, beforeEach, after, afterEach, test, mock } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { studentSubmissionPatch, writingClientIdentity } from '../studentSubmissionPolicy';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithCredential, OAuthProvider, type User } from 'firebase/auth';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField, writeBatch, serverTimestamp } from 'firebase/firestore';
import OpenAI from 'openai';
import { beginSpaceFileUpload, finishSpaceFileUpload, readSpaceFile, SpaceFileError } from '../../spaceFiles.server';

const project='demo-phase2-local', bucketName=`${project}.appspot.com`;
const aliases=['owner','pupil','peer','co','schooladmin','foreign','dual'] as const;
type Alias=typeof aliases[number];
const identities={} as Record<Alias,{uid:string; user:User; app:FirebaseApp}>;
let app:ReturnType<typeof initializeApp>, db:ReturnType<typeof getFirestore>, env:RulesTestEnvironment;
const observations:{id:string;classification:string;finding:string;evidence:unknown}[]=[];
let providerCalls=0;
let providerText="Synthetic feedback";
const uid=(a:Alias)=>identities[a].uid;
const member=(a:Alias,s='room')=>`spaceMembers/${s}_${uid(a)}`;
const submission=(a:Alias)=>`room_task_${uid(a)}`;
const scope=(a:Alias='pupil')=>({spaceId:'room',activityId:'task',submissionId:submission(a),purpose:'audio_reading' as const});
const rules=(a:Alias)=>env.authenticatedContext(uid(a));
const denied=(status:number)=>(error:unknown)=>error instanceof SpaceFileError&&error.status===status;
function result(id:string,classification:string,finding:string,evidence:unknown){observations.push({id,classification,finding,evidence});}
function oidc(subject:string){
 const header=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:'https://synthetic-idp.invalid',aud:'synthetic',sub:subject,email:`${subject}@synthetic.invalid`,email_verified:true})).toString('base64url');
 return new OAuthProvider('oidc.feide').credential({idToken:`${header}.${payload}.`});
}
async function req(a:Alias|null,body:unknown,method='POST'){
 return new Request('http://127.0.0.1/api/synthetic',{method,headers:{'Content-Type':'application/json',...(a?{Authorization:`Bearer ${await identities[a].user.getIdToken()}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
}
async function rejectRules(operation:Promise<unknown>){await assert.rejects(operation,(e:any)=>['permission-denied','storage/unauthorized'].includes(e.code));}
async function readyFile(){
 const session=await beginSpaceFileUpload(uid('pupil'),scope(),'audio/wav',3);
 assert.match(session.uploadUrl,/^http:\/\/127\.0\.0\.1:9297\//);
 const upload=await fetch(session.uploadUrl,{method:'PUT',headers:{'Content-Type':'audio/wav'},body:new Uint8Array([1,2,3])});assert.equal(upload.status,200);
 const saved=await finishSpaceFileUpload(uid('pupil'),session.id);
 await db.doc(`spaces/room/lessons/task/submissions/${submission('pupil')}`).update({audioReading:{storagePath:saved.storagePath}});
 return {...session,...saved};
}
before(async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8287');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
 assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9297');assert.equal(process.env.GOOGLE_CLOUD_PROJECT,project);
 assert.equal(process.env.OPENAI_API_KEY,'isolated-test-no-network');
 for(const key of Object.keys(process.env))assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key),'No inherited cloud credentials');
 assert.ok(process.env.PHASE2_RESULT_DIR?.includes('security-f206-local'));
 app=initializeApp({projectId:project,storageBucket:bucketName});db=getFirestore(app);
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8287,rules:await readFile('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9297,rules:await readFile('storage.rules','utf8')}});
 for(const alias of aliases){const c=clientApp({apiKey:'synthetic-api-key',projectId:project,authDomain:'demo-phase2-local.invalid'},`p2a-${alias}`);connectAuthEmulator(clientAuth(c),'http://127.0.0.1:9097',{disableWarnings:true});const user=(await signInWithCredential(clientAuth(c),oidc(alias))).user;identities[alias]={uid:user.uid,user,app:c};}
});
beforeEach(async()=>{
 await env.clearFirestore();
 // Fixture reset is confined to this owned, empty demo emulator, never a real project.
 for(const alias of aliases){await getAuth(app).updateUser(uid(alias),{disabled:false});identities[alias].user=(await signInWithCredential(clientAuth(identities[alias].app),oidc(alias))).user;
 await db.doc(`users/${uid(alias)}`).set({role:['pupil','peer'].includes(alias)?'student':'teacher',plan:'plus',disabled:false,
 ...(alias==='schooladmin'||alias==='dual'?{schoolId:'schoolA',schoolRole:'school_admin',schoolStatus:'active'}:{})});}
 await db.doc('spaces/room').set({ownerId:uid('owner'),ownerUid:uid('owner'),schoolId:'schoolA',title:'Synthetic room',isOpen:false});
 await db.doc('spaces/dual').set({ownerId:uid('dual'),schoolId:'schoolA',title:'Synthetic own room'});
 await db.doc('spaces/room/lessons/task').set({title:'Synthetic',sourceText:'Synthetic source',tasks:[{id:'q',type:'open',prompt:'Synthetic question'}]});
 await db.doc('spaces/room/writingActivities/writing').set({title:'Synthetic writing'});
 for(const alias of ['pupil','peer','co'] as const)await db.doc(member(alias)).set({spaceId:'room',uid:uid(alias),participantId:uid(alias),role:alias==='co'?'co_teacher':'student',status:'active',active:true,archived:false});
 for(const alias of ['pupil','peer'] as const){const data={uid:uid(alias),participantId:uid(alias),spaceId:'room',assignmentId:'task',status:'submitted',answers:{q:'Synthetic only'},teacherFeedback:{text:'Synthetic teacher feedback'},aiFeedback:{text:'Synthetic AI feedback'}};await db.doc(`spaces/room/lessons/task/submissions/${submission(alias)}`).set(data);await db.doc(`spaceSubmissions/${submission(alias)}`).set(data);}
 providerCalls=0;providerText="Synthetic feedback";mock.method(OpenAI.Responses.prototype,'create',async()=>{providerCalls++;return {output_text:providerText};});
});
afterEach(()=>mock.restoreAll());
after(async()=>{await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'f206-results.json'),JSON.stringify({project,scope:'emulators-and-local-doubles-only',observations},null,2),{flag:'wx'});await env?.cleanup();for(const value of Object.values(identities))await deleteClientApp(value.app);if(app)await deleteApp(app);});

const saveRoute=()=>import("../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
const canonical=(a:Alias="pupil",activity="task")=>`room_${activity}_${uid(a)}`;
const nested=(a:Alias="pupil")=>`spaces/room/lessons/task/submissions/${canonical(a)}`;
const writing=(a:Alias="pupil")=>`spaces/room/writingActivities/writing/submissions/${canonical(a,"writing")}`;
const payload=()=>({uid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",assignmentId:"task",status:"submitted",answers:{q:"Synthetic revised"}});
const context=()=>({params:Promise.resolve({spaceId:"room",assignmentId:"task"})});
const reviewFields=["teacherFeedback","aiFeedback","sectionFeedback","podcastWorkshopFeedback","parentFeedback","aiUsage","podcastWorkshopAiUsage","reviewedBy","reviewedAt"];
async function post(body:unknown){return (await saveRoute()).POST(await req("pupil",body),context());}
async function unchanged(paths:string[],operation:()=>Promise<void>){const before=await Promise.all(paths.map(async p=>(await db.doc(p).get()).data()));await operation();assert.deepEqual(await Promise.all(paths.map(async p=>(await db.doc(p).get()).data())),before);}

test("F206 lessons: ordinary SDK edits/submission/archive preserve feedback and identity",async()=>{
 const n=nested(),i=`spaceSubmissions/${canonical()}`;
 await updateDoc(doc(rules("pupil").firestore(),n),{answers:{q:"Synthetic edited"},status:"draft"});
 await updateDoc(doc(rules("pupil").firestore(),i),{answers:{q:"Synthetic edited"},status:"draft"});
 await updateDoc(doc(rules("pupil").firestore(),n),{status:"submitted",submittedAt:1,studentArchived:true});
 assert.equal((await db.doc(n).get()).get("teacherFeedback.text"),"Synthetic teacher feedback");
 assert.equal((await db.doc(n).get()).get("uid"),uid("pupil"));
 result("positive-lesson-sdk","pass","Ordinary edit, submit and archive succeed",{});
});
test("F206 SDK: existing lesson and index reject identity/scope changes, feedback and deletes",async()=>{
 const paths=[nested(),`spaceSubmissions/${canonical()}`];
 const attacks=[{uid:uid("peer")},{participantId:uid("peer")},{studentUid:uid("peer")},{userId:uid("peer")},{ownerUid:uid("peer")},{ownerId:uid("peer")},{auth:{uid:uid("peer")}},{spaceId:"foreign"},{assignmentId:"foreign"},{activityId:"foreign"},{lessonId:"foreign"},...reviewFields.map(field=>({[field]:{text:"Synthetic forged"}})),{teacherFeedback:deleteField()},{uid:deleteField()},{status:"reviewed"}];
 await unchanged(paths,async()=>{for(const p of paths)for(const attack of attacks)await rejectRules(updateDoc(doc(rules("pupil").firestore(),p),attack));});
 result("negative-existing-sdk","pass","Protected keys cannot be changed or deleted",{attempts:paths.length*attacks.length});
});
test("F206 SDK: lesson creation permits canonical own ID and rejects every injected review field",async()=>{
 const data={uid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",assignmentId:"task",status:"draft",answers:{q:"Synthetic"}};
 await db.doc(nested()).delete();await setDoc(doc(rules("pupil").firestore(),nested()),data);
 for(const key of reviewFields){await db.doc(nested()).delete();await rejectRules(setDoc(doc(rules("pupil").firestore(),nested()),{...data,[key]:null}));}
 result("negative-create-feedback","pass","No review field, including null, on lesson creation",{attempts:reviewFields.length});
});
test("F206 SDK: self-selected, foreign canonical, foreign participant and missing identity creates fail",async()=>{
 await db.doc(nested("peer")).delete();
 const data={...payload(),status:"draft"};
 for(const id of ["self-selected",canonical("peer"),"room_task_future-other-pupil"])await rejectRules(setDoc(doc(rules("pupil").firestore(),`spaces/room/lessons/task/submissions/${id}`),data));
 await db.doc(nested()).delete();
 for(const value of [{...data,uid:uid("peer")},{...data,participantId:uid("peer")},{...data,assignmentId:"other"},{...data,spaceId:"other"},{...data,uid:undefined}]){const cleaned=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined));await rejectRules(setDoc(doc(rules("pupil").firestore(),nested()),cleaned));}
 result("negative-create-identity","pass","No arbitrary ID or forged/missing binding",{});
});
test("F206 index: rejects absent/mismatched source; canonical atomic batch creates both",async()=>{
 const i=`spaceSubmissions/${canonical()}`;await db.doc(i).delete();await db.doc(nested()).delete();
 await rejectRules(setDoc(doc(rules("pupil").firestore(),i),payload()));
 const client=rules("pupil").firestore();const batch=writeBatch(client);batch.set(doc(client,nested()),payload());batch.set(doc(client,i),payload());await batch.commit();
 assert.ok((await db.doc(i).get()).exists);
 await db.doc(nested()).update({participantId:uid("peer")});await rejectRules(updateDoc(doc(client,i),{answers:{q:"Synthetic index overwrite"}}));
 result("index-source-binding","pass","Index is bound to existing or same-batch source identity",{});
});
test("F206 API: positive saves preserve trusted feedback and atomically update work in index",async()=>{
 const response=await post({submissionId:canonical(),payload:payload()});assert.equal(response.status,200,await response.text());
 for(const p of [nested(),`spaceSubmissions/${canonical()}`]){const data=(await db.doc(p).get()).data()!;assert.equal(data.answers.q,"Synthetic revised");assert.equal(data.teacherFeedback.text,"Synthetic teacher feedback");assert.equal(data.aiFeedback.text,"Synthetic AI feedback");}
 result("positive-api","pass","Work saved, feedback preserved in both records",{});
});
test("F206 API: all feedback/owner/scope/auth injections are rejected without partial writes",async()=>{
 const paths=[nested(),`spaceSubmissions/${canonical()}`];
 const attacks=[...reviewFields.map(k=>({[k]:null})),{uid:uid("peer")},{participantId:uid("peer")},{studentUid:uid("peer")},{ownerUid:uid("peer")},{ownerId:uid("peer")},{userId:uid("peer")},{spaceId:"other"},{assignmentId:"other"},{auth:{uid:uid("peer")}},{auth:{uid:uid("pupil"),participantId:uid("peer")}},{auth:{uid:uid("pupil"),role:"admin"}},{status:"reviewed"}];
 await unchanged(paths,async()=>{for(const attack of attacks){const response=await post({submissionId:canonical(),payload:{...payload(),...attack}});assert.equal(response.status,403,await response.text());}});
 result("negative-api-fields","pass","No protected field or metadata is accepted",{attempts:attacks.length});
});
test("F206 API: arbitrary ID, foreign existing record and canonical preemption fail",async()=>{
 for(const id of ["self-selected",canonical("peer"),"room_task_future-other-pupil"]){const response=await post({submissionId:id,payload:payload()});assert.equal(response.status,403,await response.text());}
 assert.equal((await db.doc(nested("peer")).get()).get("uid"),uid("peer"));
 result("negative-api-ids","pass","Document-ID binding enforced for existing and new records",{});
});
test("F206 API: foreign/stale index collision and poisoned participant fail atomically",async()=>{
 const index=`spaceSubmissions/${canonical()}`;await db.doc(index).update({uid:uid("peer"),participantId:uid("peer")});
 await unchanged([nested(),index],async()=>{assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403);});
 await db.doc(index).delete();await db.doc(nested()).update({participantId:uid("peer")});assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403);
 result("index-collision","pass","Conflicting index and stored owner are not silently overwritten",{});
});
test("F206 legacy: UID-only bare ID works, missing ownership and arbitrary legacy ID do not",async()=>{
 const id=uid("pupil"),n=`spaces/room/lessons/task/submissions/${id}`;
 await db.doc(n).set({uid:uid("pupil"),answers:{q:"Synthetic old"},teacherFeedback:{text:"Synthetic retained"}});
 await updateDoc(doc(rules("pupil").firestore(),n),{answers:{q:"Synthetic legacy edit"}});
 assert.equal((await post({submissionId:id,payload:payload()})).status,200);assert.equal((await db.doc(n).get()).get("teacherFeedback.text"),"Synthetic retained");
 await db.doc(nested()).set({answers:{q:"Synthetic ownerless"}});await rejectRules(updateDoc(doc(rules("pupil").firestore(),nested()),{answers:{q:"Synthetic attempt"}}));assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403);
 await db.doc("spaces/room/lessons/task/submissions/random-old-id").set({uid:uid("pupil")});assert.equal((await post({submissionId:"random-old-id",payload:payload()})).status,403);
 result("legacy-compatibility","pass","Positive stored identity needed; UID-form legacy remains editable",{randomLegacyWrite:"blocked"});
});
test("F206 linked identities: new login UID preserves original persisted UID and auth",async()=>{
 const participant="synthetic-stable-participant",original="synthetic-original-login",id=`room_task_${participant}`;
 await db.doc(member("pupil")).update({participantId:participant});const data={uid:original,participantId:participant,spaceId:"room",assignmentId:"task",auth:{uid:original,participantId:participant},teacherFeedback:{text:"Synthetic retained"}};
 await db.doc(`spaces/room/lessons/task/submissions/${id}`).set(data);await db.doc(`spaceSubmissions/${id}`).set(data);
 const response=await post({submissionId:id,payload:{...payload(),participantId:participant,auth:{uid:uid("pupil"),participantId:participant}}});assert.equal(response.status,200,await response.text());
 const saved=(await db.doc(`spaces/room/lessons/task/submissions/${id}`).get()).data()!;assert.equal(saved.uid,original);assert.equal(saved.auth.uid,original);
 await rejectRules(updateDoc(doc(rules("pupil").firestore(),`spaces/room/lessons/task/submissions/${id}`),{uid:uid("pupil")}));
 result("linked-identity","pass","Device linking cannot rewrite historical owner",{});
});
test("F206 writing SDK: create, edit, submit, image profile and improvement request remain allowed",async()=>{
 const data={uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",status:"draft",sectionDrafts:{q:"Synthetic draft"}};
 const client=rules("pupil").firestore();await setDoc(doc(client,writing()),data);
 await updateDoc(doc(client,writing()),{sectionDrafts:{q:"Synthetic revision"},status:"planning_submitted",printProfile:{imageUrl:""},sectionImprovementRequests:{q:{status:"submitted"}}});
 await updateDoc(doc(client,writing()),{finalText:"Synthetic final",status:"submitted"});assert.equal((await db.doc(writing()).get()).get("finalText"),"Synthetic final");
 result("positive-writing","pass","Writing, image profile, improvements and final submission work",{});
});
test("F206 writing SDK: rejects every review field on creation and all binding/review changes",async()=>{
 const data={uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",status:"draft"};
 for(const key of reviewFields)await rejectRules(setDoc(doc(rules("pupil").firestore(),writing()),{...data,[key]:{text:"Synthetic forged"}}));
 await setDoc(doc(rules("pupil").firestore(),writing()),data);
 for(const attack of [{uid:uid("peer")},{studentUid:uid("peer")},{participantId:uid("peer")},{spaceId:"other"},{activityId:"other"},{ownerUid:uid("peer")},...reviewFields.map(k=>({[k]:{text:"Synthetic forged"}}))])await rejectRules(updateDoc(doc(rules("pupil").firestore(),writing()),attack));
 await rejectRules(setDoc(doc(rules("pupil").firestore(),"spaces/room/writingActivities/writing/submissions/self-selected"),data));
 result("negative-writing","pass","Section feedback and all identity/review fields protected",{});
});
test("F206 writing multi-device: client helper preserves stored identity and selected legacy fields",async()=>{
 const participant="synthetic-stable",original="synthetic-first-login",id=`room_writing_${participant}`,target=`spaces/room/writingActivities/writing/submissions/${id}`;
 await db.doc(member("pupil")).update({participantId:participant});const stored={uid:original,studentUid:participant,participantId:participant,spaceId:"room",activityId:"writing",status:"draft"};await db.doc(target).set(stored);
 const identity=writingClientIdentity(stored,{kind:"writingActivities",spaceId:"room",activityId:"writing",submissionId:id,uid:uid("pupil"),participantId:participant});
 await setDoc(doc(rules("pupil").firestore(),target),{...identity,sectionDrafts:{q:"Synthetic second device"}},{merge:true});assert.equal((await db.doc(target).get()).get("uid"),original);
 result("writing-client-identity","pass","Client resends persisted binding rather than replacing UID",{});
});
test("F206 authorized teacher and co-teacher review, section feedback and AI feedback work; schooladmin denied",async()=>{
 await db.doc(writing()).set({uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",status:"submitted"});
 for(const actor of ["owner","co"] as const){
  await updateDoc(doc(rules(actor).firestore(),nested()),{teacherFeedback:{text:"Synthetic authorized teacher"},status:"reviewed"});
  await updateDoc(doc(rules(actor).firestore(),writing()),{sectionFeedback:{q:{text:"Synthetic section",status:"approved"}},updatedAt:1});
  await updateDoc(doc(rules(actor).firestore(),writing()),{status:"reviewed",teacherFeedback:{text:"Synthetic writing review"},updatedAt:2});
 }
 await rejectRules(updateDoc(doc(rules("schooladmin").firestore(),nested()),{teacherFeedback:{text:"Synthetic forbidden"}}));
 const {POST}=await import("../../../app/api/teacher/ai-feedback/route");const response=await POST(await req("owner",{spaceId:"room",assignmentId:"task",subId:canonical()}));assert.equal(response.status,200,await response.text());assert.equal(providerCalls,1);
 assert.equal((await POST(await req("schooladmin",{spaceId:"room",assignmentId:"task",subId:canonical()}))).status,403);assert.equal(providerCalls,1);
 const before=(await db.doc(nested()).get()).get("aiFeedback");assert.equal((await post({submissionId:canonical(),payload:payload()})).status,200);assert.deepEqual((await db.doc(nested()).get()).get("aiFeedback"),before);
 result("teacher-ai-regression","pass","Real review routes with synthetic provider preserve trusted feedback",{});
});
test("F206 geometry submit: rejects injected AI feedback and preserves existing review on resubmission",async()=>{
 const {POST}=await import("../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submit/route");const body={worksheet:{title:"Synthetic"},answersByTaskId:{q:1},auto:null};
 assert.equal((await POST(await req("pupil",{...body,aiFeedback:null}),context())).status,403);
 assert.equal((await POST(await req("pupil",body),context())).status,200);
 const n=`spaces/room/lessons/task/submissions/${uid("pupil")}`;await db.doc(n).update({aiFeedback:{text:"Synthetic trusted"},teacherFeedback:{text:"Synthetic teacher"}});
 assert.equal((await POST(await req("pupil",body),context())).status,200);assert.equal((await db.doc(n).get()).get("aiFeedback.text"),"Synthetic trusted");
 result("geometry-server","pass","Legacy geometry route cannot inject or clear review fields",{});
});
test("F206 private audio regression: own upload/playback and teacher access remain intact",async()=>{
 const file=await readyFile();assert.equal((await readSpaceFile(uid("pupil"),file.id,null)).status,200);assert.equal((await readSpaceFile(uid("owner"),file.id,null)).status,200);await assert.rejects(readSpaceFile(uid("peer"),file.id,null),denied(403));
 result("file-regression","pass","Submission identity policy preserves authorized file binding",{});
});
test("F206 client payload regression: assignment and writing clients no longer submit protected feedback",async()=>{
 const source=await readFile("app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx","utf8");assert.ok(!source.includes("aiFeedback: null"));assert.ok(!source.includes("          aiFeedback,"));
 const fields=studentSubmissionPatch(payload(),undefined,{kind:"lessons",spaceId:"room",activityId:"task",submissionId:canonical(),uid:uid("pupil"),participantId:uid("pupil")});assert.equal(fields.uid,uid("pupil"));
 result("client-payload","pass","Assignment source omits protected feedback, positive patch binds server identity",{});
});
test("F206 teacher missing-index review creates a correctly bound index in the same batch",async()=>{
 const index=`spaceSubmissions/${canonical()}`;await db.doc(index).delete();const client=rules("owner").firestore();
 const review={spaceId:"room",assignmentId:"task",uid:uid("pupil"),participantId:uid("pupil"),teacherFeedback:{text:"Synthetic missing-index review"},status:"reviewed"};
 const batch=writeBatch(client);batch.set(doc(client,nested()),review,{merge:true});batch.set(doc(client,index),review,{merge:true});await batch.commit();
 assert.equal((await db.doc(index).get()).get("participantId"),uid("pupil"));result("teacher-missing-index","pass","Review can safely recreate a missing index",{});
});
async function podcastConfig(){await db.doc("spaces/room/lessons/task").update({podcastWorkshopConfig:{version:1,aiSupport:"coach",aiUsageLimit:5,segments:[{id:"one",title:"Synthetic segment",hint:"Synthetic"}]}});}
test("F206 podcast KI: bound support log remains server-owned; foreign index fails before provider",async()=>{
 await podcastConfig();const {POST}=await import("../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/podcast-ai-support/route");
 const response=await POST(await req("pupil",{sectionId:"ideas",currentText:"Synthetic ideas"}),context());assert.equal(response.status,200,await response.text());assert.equal(providerCalls,1);
 assert.equal((await db.doc(nested()).get()).get("teacherFeedback.text"),"Synthetic teacher feedback");
 await db.doc(`spaceSubmissions/${canonical()}`).update({uid:uid("peer"),participantId:uid("peer")});
 assert.equal((await POST(await req("pupil",{sectionId:"ideas"}),context())).status,403);assert.equal(providerCalls,1);
 result("podcast-support","pass","KI-support preserves feedback and refuses index takeover",{});
});
test("F206 writing KI: own support works and does not overwrite linked UID or teacher review",async()=>{
 const participant="synthetic-writing-participant",original="synthetic-earlier-login";await db.doc(member("pupil")).update({participantId:participant});
 await db.doc("spaces/room/writingActivities/writing").set({id:"writing",ownerUid:uid("owner"),spaceId:"room",title:"Synthetic",level:"A1",language:"nb",genre:"story",templateVersion:1,progression:"free",aiPolicy:{enabled:true,maxUsesTotal:20,licenseRequired:false},rooms:[{id:"draft",title:"Synthetic room",phase:"drafting",sections:[{id:"test-section",title:"Synthetic section",prompt:"Synthetic",fields:[],aiPolicy:{enabled:true,maxUses:5,allowedActions:["continue_guidance"],focus:"Synthetic"}}]}]});
 const id=`room_writing_${participant}`,p=`spaces/room/writingActivities/writing/submissions/${id}`;await db.doc(p).set({uid:original,studentUid:participant,participantId:participant,spaceId:"room",activityId:"writing",teacherFeedback:{text:"Synthetic preserved"}});
 const {POST}=await import("../../../app/api/spaces/[spaceId]/writing-activities/[activityId]/ai-support/route");
 const response=await POST(await req("pupil",{sectionId:"test-section",action:"continue_guidance",sectionText:"Synthetic student text"}),{params:Promise.resolve({spaceId:"room",activityId:"writing"})});assert.equal(response.status,200,await response.text());
 assert.equal((await db.doc(p).get()).get("uid"),original);assert.equal((await db.doc(p).get()).get("teacherFeedback.text"),"Synthetic preserved");
 await db.doc(p).update({participantId:uid("peer")});const calls=providerCalls;
 assert.equal((await POST(await req("pupil",{sectionId:"test-section",action:"continue_guidance"}),{params:Promise.resolve({spaceId:"room",activityId:"writing"})})).status,403);assert.equal(providerCalls,calls);
 result("writing-support","pass","KI-support cannot change bound identity or overtake a record",{});
});
test("F206 creation without source scope, teacher-feedback null and conflicting stored alias fail",async()=>{
 await db.doc(nested()).delete();await rejectRules(setDoc(doc(rules("pupil").firestore(),nested()),{uid:uid("pupil"),participantId:uid("pupil"),status:"draft"}));
 await db.doc(nested()).set({...payload(),studentUid:uid("peer")});assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403);
 result("missing-and-conflicting-fields","pass","Missing scope/owner fields do not grant extra rights",{});
});
test("F206 global index: cross-kind and same-participant conflicting UID cannot be taken over",async()=>{
 const index=`spaceSubmissions/${canonical()}`;
 await db.doc(index).set({uid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"task"});
 await unchanged([nested(),index],async()=>assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403));
 await db.doc(index).set({...payload(),uid:"synthetic-older-but-conflicting-login"});
 await unchanged([nested(),index],async()=>assert.equal((await post({submissionId:canonical(),payload:payload()})).status,403));
 await podcastConfig();const {POST}=await import("../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/podcast-ai-support/route");
 assert.equal((await POST(await req("pupil",{sectionId:"ideas"}),context())).status,403);assert.equal(providerCalls,0);
 result("index-kind-and-source-identity","pass","Index kind and every owner alias must match the source",{});
});
test("F206 writing index SDK: atomic create/edit works; injected reviews and reassignment fail",async()=>{
 const client=rules("pupil").firestore(),index=`spaceSubmissions/${canonical("pupil","writing")}`;
 const data={uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",status:"draft",sectionDrafts:{q:"Synthetic"}};
 const batch=writeBatch(client);batch.set(doc(client,writing()),data);batch.set(doc(client,index),data);await batch.commit();
 await updateDoc(doc(client,index),{sectionDrafts:{q:"Synthetic updated"},status:"submitted"});
 for(const patch of [{uid:uid("peer")},{participantId:uid("peer")},{activityId:"task"},{assignmentId:"writing"},...reviewFields.map(key=>({[key]:null}))])await rejectRules(updateDoc(doc(client,index),patch));
 await db.doc(index).delete();
 for(const key of reviewFields)await rejectRules(setDoc(doc(client,index),{...data,[key]:null}));
 result("writing-index","pass","Writing index uses the same source binding and protected fields",{});
});
test("F206 actual writing client save functions: draft, planning, final submit and print preserve binding",async()=>{
 const source=await readFile("app/[locale]/(app)/student/spaces/[spaceId]/writing/[activityId]/page.tsx","utf8");
 const ast=ts.createSourceFile("writing.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const wanted=new Set(["activeStudentIdentityId","writingSubmissionId","baseSubmissionPayload","saveDraft","savePrintProfileData"]),functions:string[]=[];
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&wanted.has(node.name.text))functions.push(node.getText(ast));ts.forEachChild(node,visit);}visit(ast);assert.equal(functions.length,wanted.size);
 const errors:unknown[]=[],noOp=()=>{},inputs={uid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",submissionBinding:null,activity:{title:"Synthetic"},studentDisplayName:"Synthetic pupil",answersByFieldId:{q:"Synthetic"},sectionDrafts:{q:"Synthetic"},finalText:"Synthetic final",submissionStatus:"submitted",writingClientIdentity,serverTimestamp,doc,setDoc,db:rules("pupil").firestore(),setSaving:noOp,setSavingPrintProfile:noOp,setMsg:noOp,setErr:(e:unknown)=>{if(e)errors.push(e);},setPrintProfile:noOp,t:(key:string)=>key,window:{setTimeout:noOp}};
 const javascript=ts.transpileModule(functions.join("\n"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const client=vm.compileFunction(`${javascript}\nreturn {saveDraft,savePrintProfileData};`,Object.keys(inputs))(...Object.values(inputs));
 for(const status of ["draft","planning_submitted","submitted"]){await client.saveDraft(status);assert.deepEqual(errors,[]);assert.equal((await db.doc(writing()).get()).get("status"),status);}
 await db.doc(writing()).update({teacherFeedback:{text:"Synthetic trusted"},sectionFeedback:{q:{text:"Synthetic trusted section"}}});
 await client.savePrintProfileData({imageUrl:"",title:"Synthetic print"});assert.deepEqual(errors,[]);
 const saved=(await db.doc(writing()).get()).data()!;assert.equal(saved.uid,uid("pupil"));assert.equal(saved.teacherFeedback.text,"Synthetic trusted");assert.equal(saved.sectionFeedback.q.text,"Synthetic trusted section");assert.ok(saved.submittedAt);
 result("actual-writing-client","pass","Unmodified client functions save through actual emulator rules, including timestamps",{});
});
test("F206 API creation: injected review leaves no documents; ordinary initial work creates both",async()=>{
 const index=`spaceSubmissions/${canonical()}`;await db.doc(nested()).delete();await db.doc(index).delete();
 for(const key of reviewFields){assert.equal((await post({submissionId:canonical(),payload:{...payload(),[key]:null}})).status,403);assert.equal((await db.doc(nested()).get()).exists,false);assert.equal((await db.doc(index).get()).exists,false);}
 assert.equal((await post({submissionId:canonical(),payload:payload()})).status,200);for(const p of [nested(),index])assert.equal((await db.doc(p).get()).get("uid"),uid("pupil"));
 result("api-create","pass","Review injection on first write is rejected without partial creation",{});
});
test("F206 writing teacher KI: authorized suggestions and review work; pupil and schooladmin denied",async()=>{
 await db.doc("spaces/room/writingActivities/writing").set({id:"writing",ownerUid:uid("owner"),spaceId:"room",title:"Synthetic",level:"A1",language:"nb",genre:"story",templateVersion:1,rooms:[{id:"planning",phase:"planning",title:"Synthetic",sections:[{id:"test-section",title:"Synthetic",prompt:"Synthetic",fields:[]}]}]});
 await db.doc(writing()).set({uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing",sectionDrafts:{"test-section":"Synthetic pupil work"},status:"planning_submitted"});
 providerText=JSON.stringify({suggestions:[{sectionId:"test-section",status:"approved",text:"Synthetic teacher suggestion"}]});
 const {POST}=await import("../../../app/api/teacher/spaces/[spaceId]/writing-activities/[activityId]/submissions/[subId]/section-feedback-suggestions/route");
 const ctx={params:Promise.resolve({spaceId:"room",activityId:"writing",subId:canonical("pupil","writing")})};
 for(const actor of ["owner","co"] as const){const response=await POST(await req(actor,{phase:"planning"}),ctx);assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.suggestions[0].text,"Synthetic teacher suggestion");await updateDoc(doc(rules(actor).firestore(),writing()),{sectionFeedback:{"test-section":data.suggestions[0]},updatedAt:serverTimestamp()});}
 for(const actor of ["pupil","schooladmin","foreign"] as const)assert.equal((await POST(await req(actor,{phase:"planning"}),ctx)).status,403);
 assert.equal(providerCalls,2);assert.equal((await db.doc(writing()).get()).get("uid"),uid("pupil"));
 result("writing-teacher-ki","pass","Authorized KI suggestion/review flow survives; administrative role grants no review access",{});
});
test("F206 teacher lesson KI: missing index retains source binding and pupil can save afterward",async()=>{
 const index=`spaceSubmissions/${canonical()}`;await db.doc(index).delete();
 const {POST}=await import("../../../app/api/teacher/ai-feedback/route");const response=await POST(await req("owner",{spaceId:"room",assignmentId:"task",subId:canonical()}));assert.equal(response.status,200,await response.text());
 const source=(await db.doc(nested()).get()).data()!,saved=(await db.doc(index).get()).data()!;
 assert.equal(saved.uid,source.uid);assert.equal(saved.participantId,source.participantId);assert.equal(saved.assignmentId,"task");
 assert.equal((await post({submissionId:canonical(),payload:payload()})).status,200);
 result("teacher-ki-missing-index","pass","Teacher KI creates bound index without blocking later pupil saves",{});
});
test("F206 teacher lesson KI: conflicting index fails before provider; concurrent owner change stops writes",async()=>{
 const index=`spaceSubmissions/${canonical()}`;await db.doc(index).update({uid:uid("peer")});
 const {POST}=await import("../../../app/api/teacher/ai-feedback/route"),body={spaceId:"room",assignmentId:"task",subId:canonical()};
 assert.equal((await POST(await req("owner",body))).status,403);assert.equal(providerCalls,0);
 await db.doc(index).delete();const original=(await db.doc(nested()).get()).get("aiFeedback");
 mock.method(OpenAI.Responses.prototype,"create",async()=>{providerCalls++;await db.doc(nested()).update({participantId:uid("peer")});return {output_text:"Synthetic stale feedback"};});
 assert.equal((await POST(await req("owner",body))).status,403);assert.equal(providerCalls,1);assert.deepEqual((await db.doc(nested()).get()).get("aiFeedback"),original);assert.equal((await db.doc(index).get()).exists,false);
 result("teacher-ki-identity-race","pass","Conflicting index and changed ownership stop review without partial writes",{});
});

