/* eslint-disable @typescript-eslint/no-explicit-any -- controlled test transport and test doubles */
import assert from 'node:assert/strict';
import { before, beforeEach, after, afterEach, test, mock } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { getAdmin } from '../../firebaseAdmin';
import { accountCheckedAuth, AccountAccessError } from '../accountAccess.server';
import { manageAccountAccess } from '../manageAccountAccess.server';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithCredential, OAuthProvider, type User } from 'firebase/auth';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, getBytes } from 'firebase/storage';
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
 assert.ok(process.env.PHASE2_RESULT_DIR?.includes('security-f201-local'));
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
after(async()=>{await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'f201-results.json'),JSON.stringify({project,scope:'emulators-and-local-doubles-only',observations},null,2),{flag:'wx'});await env?.cleanup();for(const value of Object.values(identities))await deleteClientApp(value.app);if(app)await deleteApp(app);});

const nested=()=>`spaces/room/lessons/task/submissions/${submission("pupil")}`;
const writing=()=>`spaces/room/writingActivities/writing/submissions/room_writing_${uid("pupil")}`;
const payload=()=>({uid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",assignmentId:"task",answers:{q:"Synthetic revised"},status:"submitted"});
const lessonCtx=()=>({params:Promise.resolve({spaceId:"room",assignmentId:"task"})});
const memberCtx=()=>({params:Promise.resolve({spaceId:"room",memberId:`room_${uid("pupil")}`})});
const globalDenied=(response:Response)=>assert.ok([401,403].includes(response.status),`Expected access denial, got ${response.status}`);
async function ruleRead(a:Alias,p:string,authTime?:number){return getDoc(doc((authTime===undefined?rules(a):env.authenticatedContext(uid(a),{auth_time:authTime})).firestore(),p));}
async function oldAudio(){const p=`spaces/room/assignments/task/submissions/${uid("pupil")}/audio/synthetic.wav`;await getStorage(app).bucket(bucketName).file(p).save(Buffer.from([1,2,3]),{resumable:false,contentType:"audio/wav"});return p;}
async function pupilApis(){
 const save=await import("../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
 const geometry=await import("../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submit/route");
 const podcast=await import("../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/podcast-ai-support/route");
 const writingAi=await import("../../../app/api/spaces/[spaceId]/writing-activities/[activityId]/ai-support/route");
 const files=await import("../../../app/api/space-files/route");
 const overview=await import("../../../app/api/student/submissions/route");
 return [await save.POST(await req("pupil",{submissionId:submission("pupil"),payload:payload()}),lessonCtx()),
 await geometry.POST(await req("pupil",{worksheet:{title:"Synthetic"},answersByTaskId:{q:1}}),lessonCtx()),
 await podcast.POST(await req("pupil",{sectionId:"ideas"}),lessonCtx()),
 await writingAi.POST(await req("pupil",{sectionId:"one",action:"continue_guidance"}),{params:Promise.resolve({spaceId:"room",activityId:"writing"})}),
 await files.POST(await req("pupil",{...scope(),contentType:"audio/wav",size:3})),
 await overview.GET(new Request("http://127.0.0.1/api/student/submissions?source=spaceSubmissions",{headers:{Authorization:`Bearer ${await identities.pupil.user.getIdToken()}`}}))];
}
async function teacherApis(token?:string){
 const request=async(body:unknown,method="POST")=>token?new Request("http://127.0.0.1/api/synthetic",{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)}):req("owner",body,method);
 const members=await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");
 const code=await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/student-code/route");
 const roster=await import("../../../app/api/teacher/spaces/[spaceId]/members/create-student/route");
 const rooms=await import("../../../app/api/teacher/spaces/create/route");
 const ai=await import("../../../app/api/teacher/ai-feedback/route");
 const writingAi=await import("../../../app/api/teacher/spaces/[spaceId]/writing-activities/[activityId]/submissions/[subId]/section-feedback-suggestions/route");
 const audio=await import("../../../app/api/teacher/audio-url/route");
 return [await members.PATCH(await request({displayName:"Synthetic blocked rename"},"PATCH"),memberCtx()),
 await code.POST(await request({mode:"regenerate"}),memberCtx()),
 await roster.POST(await request({displayName:"Synthetic blocked pupil"}),{params:Promise.resolve({spaceId:"room"})}),
 await rooms.POST(await request({title:"Synthetic blocked room"})),
 await ai.POST(await request({spaceId:"room",assignmentId:"task",subId:submission("pupil")})),
 await writingAi.POST(await request({phase:"planning"}),{params:Promise.resolve({spaceId:"room",activityId:"writing",subId:`room_writing_${uid("pupil")}`})}),
 await audio.POST(await request({storagePath:`spaces/room/assignments/task/submissions/${uid("pupil")}/audio/synthetic.wav`,mode:"download"}))];
}
test("F201 profile: disabled pupil loses protected Firestore/Storage and cannot enable itself",async()=>{
 const audio=await oldAudio();await db.doc(writing()).set({uid:uid("pupil"),studentUid:uid("pupil"),participantId:uid("pupil"),spaceId:"room",activityId:"writing"});
 await db.doc(`users/${uid("pupil")}/notifications/synthetic`).set({text:"Synthetic"});
 await db.doc(`users/${uid("pupil")}`).update({disabled:true});
 for(const p of [nested(),writing(),`spaceSubmissions/${submission("pupil")}`,"spaces/room","spaces/room/lessons/task",member("pupil"),`users/${uid("pupil")}`,`users/${uid("pupil")}/notifications/synthetic`])await rejectRules(ruleRead("pupil",p));
 await rejectRules(getBytes(ref(rules("pupil").storage(`gs://${bucketName}`),audio)));
 await rejectRules(updateDoc(doc(rules("pupil").firestore(),`users/${uid("pupil")}`),{disabled:false}));
 await rejectRules(updateDoc(doc(rules("pupil").firestore(),nested()),{answers:{q:"Synthetic blocked"}}));
 result("profile-pupil-rules","pass","Disabled profile blocks all tested individual and Space rule paths",{});
});
test("F201 profile: disabled teacher, co-teacher and platform admin lose privileged rule grants",async()=>{
 const audio=await oldAudio();await db.doc(`users/${uid("foreign")}`).update({role:"admin",roles:{admin:true}});
 for(const actor of ["owner","co","foreign"] as const){await db.doc(`users/${uid(actor)}`).update({disabled:true});await rejectRules(ruleRead(actor,nested()));await rejectRules(ruleRead(actor,member("pupil")));await rejectRules(updateDoc(doc(rules(actor).firestore(),"spaces/room"),{title:"Synthetic disabled write"}));await rejectRules(getBytes(ref(rules(actor).storage(`gs://${bucketName}`),audio)));}
 result("profile-staff-rules","pass","Owner, co-teacher and admin status cannot override deactivation",{});
});
test("F201 profile: disabled pupil APIs reject before work/file writes or KI calls",async()=>{
 const before=(await db.doc(nested()).get()).data();await db.doc(`users/${uid("pupil")}`).update({disabled:true});
 const responses=await pupilApis();responses.forEach(globalDenied);assert.equal(providerCalls,0);assert.deepEqual((await db.doc(nested()).get()).data(),before);assert.equal((await db.collection("privateSpaceFiles").get()).size,0);
 result("profile-pupil-api","pass","Submission, geometry, KI support, private upload and overview deny",{statuses:responses.map(r=>r.status)});
});
test("F201 profile: disabled owner cannot manage members, codes, pupils, rooms, files or KI",async()=>{
 await oldAudio();const before=(await db.doc(member("pupil")).get()).data();await db.doc(`users/${uid("owner")}`).update({disabled:true});
 const responses=await teacherApis();responses.forEach(globalDenied);assert.equal(providerCalls,0);assert.deepEqual((await db.doc(member("pupil")).get()).data(),before);
 result("profile-owner-api","pass","All tested administrative and teacher endpoints deny",{statuses:responses.map(r=>r.status)});
});
test("F201 profile: private streaming stops for pupil and teacher after global disable",async()=>{
 const file=await readyFile();const route=await import("../../../app/api/space-files/[id]/route"),ctx={params:Promise.resolve({id:file.id})};
 for(const actor of ["pupil","owner"] as const){assert.equal((await route.GET(await req(actor,null,"GET"),ctx)).status,200);await db.doc(`users/${uid(actor)}`).update({disabled:true});globalDenied(await route.GET(await req(actor,null,"GET"),ctx));await assert.rejects(readSpaceFile(uid(actor),file.id,null),denied(403));}
 result("private-stream-deactivation","pass","New private streams deny immediately after profile disable",{});
});
test("F201 positive: ordinary teacher/pupil writes and profile-only reactivation preserve work",async()=>{
 const save=await import("../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route"),members=await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");
 assert.equal((await save.POST(await req("pupil",{submissionId:submission("pupil"),payload:payload()}),lessonCtx())).status,200);
 assert.equal((await members.PATCH(await req("owner",{displayName:"Synthetic allowed rename"},"PATCH"),memberCtx())).status,200);
 const before=(await db.doc(nested()).get()).data();await db.doc(`users/${uid("pupil")}`).update({disabled:true});await rejectRules(ruleRead("pupil",nested()));await db.doc(`users/${uid("pupil")}`).update({disabled:false});assert.ok((await ruleRead("pupil",nested())).exists());assert.deepEqual((await db.doc(nested()).get()).data(),before);
 result("positive-and-profile-reactivation","pass","Valid flows survive and trusted profile reactivation restores access",{});
});
test("F201 Auth: disabled account is consistently 401 on teacher endpoints, no administrative write",async()=>{
 const token=await identities.owner.user.getIdToken();await getAuth(app).updateUser(uid("owner"),{disabled:true});const responses=await teacherApis(token);for(const response of responses)assert.equal(response.status,401,await response.text());assert.equal(providerCalls,0);
 result("auth-disable-apis","pass","Explicit Auth account checks deny before side effects",{statuses:responses.map(r=>r.status)});
});
test("F201 Auth: revoked token is consistently 401; token refresh alone is not fresh authentication",async()=>{
 const token=await identities.owner.user.getIdToken(true);await new Promise(resolve=>setTimeout(resolve,1100));await getAuth(app).revokeRefreshTokens(uid("owner"));const responses=await teacherApis(token);for(const response of responses)assert.equal(response.status,401,await response.text());assert.equal(providerCalls,0);
 result("auth-revoke-apis","pass","Previously issued token is denied across teacher routes",{});
});
test("F201 SDK offline: real non-emulator SDK branch receives checkRevoked=true through facade",async()=>{
 const source=await readFile("node_modules/firebase-admin/lib/auth/base-auth.js","utf8"),ast=ts.createSourceFile("sdk.js",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let method="";function visit(n:ts.Node){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==="verifyIdToken")method=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(method);
 let checks=0,revoked=false;const box={auth_api_request_1:{useEmulator:()=>false},error_1:{AuthClientErrorCode:{ID_TOKEN_REVOKED:"synthetic"}},Promise};const verify=vm.runInNewContext(`({${method}}).verifyIdToken`,box);
 const raw={verifyIdToken:verify,idTokenVerifier:{verifyJWT:async()=>({uid:uid("pupil"),auth_time:1})},verifyDecodedJWTNotRevokedOrDisabled:async(decoded:unknown)=>{checks++;if(revoked)throw new AccountAccessError("Synthetic revoked",401,"auth/id-token-revoked");return decoded;}};
 const guarded=accountCheckedAuth(raw as any,db);assert.equal((await guarded.verifyIdToken("synthetic",false)).uid,uid("pupil"));assert.equal(checks,1);revoked=true;await assert.rejects(guarded.verifyIdToken("synthetic",false));assert.equal(checks,2);
 result("non-emulator-sdk","pass","Actual SDK method executes status/revocation lookup even if caller passes false",{externalCalls:0});
});
test("F201 token cutoff: Firestore/Storage reject old and equal auth_time, permit fresh authentication",async()=>{
 const audio=await oldAudio(),cutoff=100;await db.doc(`users/${uid("pupil")}`).update({authRevokedBefore:cutoff});
 for(const time of [99,100]){await rejectRules(ruleRead("pupil",nested(),time));await rejectRules(getBytes(ref(env.authenticatedContext(uid("pupil"),{auth_time:time}).storage(`gs://${bucketName}`),audio)));}
 assert.ok((await ruleRead("pupil",nested(),101)).exists());assert.equal(new Uint8Array(await getBytes(ref(env.authenticatedContext(uid("pupil"),{auth_time:101}).storage(`gs://${bucketName}`),audio))).length,3);
 await rejectRules(updateDoc(doc(rules("pupil").firestore(),`users/${uid("pupil")}`),{authRevokedBefore:0,authDisabled:false}));
 result("rule-revocation-cutoff","pass","Protected cutoff uses auth_time, including same-second and missing claims",{});
});
test("F201 mirror: Auth-only console disable requires profile synchronization for direct rules",async()=>{
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});await getAuth(app).updateUser(uid("pupil"),{disabled:true});
 // Rules cannot call Authentication. This deliberately shows the boundary before explicit sync.
 assert.ok((await ruleRead("pupil",nested())).exists());await manageAccountAccess(getAdmin().auth,db,uid("owner"),uid("pupil"),"synchronize");await rejectRules(ruleRead("pupil",nested()));
 result("auth-console-boundary","known-limitation","Auth console changes alone do not notify rules; explicit mirror closes the rule path",{});
});
test("F201 admin: application disable/reactivate updates Auth/profile; old session remains revoked",async()=>{
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});const route=await import("../../../app/api/admin/users/[uid]/access/route"),ctx={params:Promise.resolve({uid:uid("pupil")})};
 const oldToken=await identities.pupil.user.getIdToken();const before=(await db.doc(nested()).get()).data();
 assert.equal((await route.POST(await req("owner",{action:"disable"}),ctx)).status,200);assert.equal((await getAuth(app).getUser(uid("pupil"))).disabled,true);await rejectRules(ruleRead("pupil",nested()));
 assert.equal((await route.POST(await req("owner",{action:"reactivate"}),ctx)).status,200);assert.equal((await getAuth(app).getUser(uid("pupil"))).disabled,false);await assert.rejects(getAdmin().auth.verifyIdToken(oldToken,true));
 await new Promise(resolve=>setTimeout(resolve,1100));identities.pupil.user=(await signInWithCredential(clientAuth(identities.pupil.app),oidc("pupil"))).user;assert.equal((await getAdmin().auth.verifyIdToken(await identities.pupil.user.getIdToken(),true)).uid,uid("pupil"));
 const fresh=await getAuth(app).verifyIdToken(await identities.pupil.user.getIdToken(),true);assert.ok((await ruleRead("pupil",nested(),fresh.auth_time)).exists());assert.deepEqual((await db.doc(nested()).get()).data(),before);
 result("coordinated-global-action","pass","Explicit superadmin action mirrors state and requires fresh login on reactivation",{});
});
test("F201 admin: pupil, schooladmin and ordinary teacher cannot globally alter access",async()=>{
 const route=await import("../../../app/api/admin/users/[uid]/access/route"),ctx={params:Promise.resolve({uid:uid("peer")})};for(const actor of ["pupil","schooladmin","owner"] as const)assert.equal((await route.POST(await req(actor,{action:"disable"}),ctx)).status,403);assert.equal((await getAuth(app).getUser(uid("peer"))).disabled,false);
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});assert.equal((await route.POST(await req("owner",{action:"disable"}),{params:Promise.resolve({uid:uid("owner")})})).status,409);
 result("admin-authority","pass","Global access management is restricted to another account's superadmin",{});
});
test("F201 admin failure: failed Auth mutation leaves profile blocked and pending; no repair",async()=>{
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});mock.method(getAuth(app),"updateUser",async()=>{throw new Error("Synthetic Auth failure");});
 await assert.rejects(manageAccountAccess(getAdmin().auth,db,uid("owner"),uid("pupil"),"disable"),/Synthetic Auth failure/);assert.equal((await db.doc(`users/${uid("pupil")}`).get()).get("disabled"),true);assert.equal((await db.doc(`users/${uid("pupil")}`).get()).get("accountAccessStatus"),"pending");await rejectRules(ruleRead("pupil",nested()));
 result("fail-closed-administration","pass","Failure keeps restrictions and requires explicit manual action",{});
});
test("F201 membership: removal affects only this Space; owner-approved reactivation restores access",async()=>{
 const members=await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");const removed=await members.PATCH(await req("owner",{action:"remove"},"PATCH"),memberCtx());assert.equal(removed.status,200,await removed.text());await rejectRules(ruleRead("pupil",nested()));assert.equal((await getAdmin().auth.verifyIdToken(await identities.pupil.user.getIdToken(),true)).uid,uid("pupil"));
 await updateDoc(doc(rules("owner").firestore(),member("pupil")),{status:"active",active:true,archived:false});assert.ok((await ruleRead("pupil",nested())).exists());assert.notEqual((await db.doc(`users/${uid("pupil")}`).get()).get("disabled"),true);
 result("space-revocation-reactivation","pass","Space removal does not globally disable the account; authorized owner can restore membership",{});
});
test("F201 school licence: removal preserves teacher private content and private rooms",async()=>{
 await db.doc(`users/${uid("owner")}`).update({schoolId:"schoolA",schoolStatus:"active"});await db.doc("schools/schoolA").set({teacherLimit:5,teacherCount:1});await db.doc(`schools/schoolA/members/${uid("schooladmin")}`).set({uid:uid("schooladmin"),role:"school_admin",status:"active"});await db.doc(`schools/schoolA/members/${uid("owner")}`).set({uid:uid("owner"),role:"school_teacher",status:"active"});
 await db.doc("spaces/private").set({ownerId:uid("owner"),title:"Synthetic private",schoolId:null});await db.doc("lessons/private-lesson").set({ownerId:uid("owner"),ownerUid:uid("owner"),title:"Synthetic private",status:"draft",visibility:"private"});
 const {POST}=await import("../../../app/api/schools/disable-teacher/route");const response=await POST(await req("schooladmin",{schoolId:"schoolA",targetUid:uid("owner")}));assert.equal(response.status,200,await response.text());
 assert.ok((await ruleRead("owner","spaces/private")).exists());assert.ok((await ruleRead("owner","lessons/private-lesson")).exists());assert.equal((await getAdmin().auth.verifyIdToken(await identities.owner.user.getIdToken(),true)).uid,uid("owner"));
 const rooms=await import("../../../app/api/teacher/spaces/create/route");assert.equal((await rooms.POST(await req("owner",{title:"Synthetic private after licence removal"}))).status,200);assert.equal((await rooms.POST(await req("owner",{title:"Synthetic school blocked",schoolId:"schoolA"}))).status,403);
 const profile=(await db.doc(`users/${uid("owner")}`).get()).data()!;assert.equal(profile.schoolStatus,"disabled");assert.notEqual(profile.disabled,true);assert.equal(profile.authRevokedBefore,undefined);
 result("school-licence-separation","pass","School removal leaves Auth, private content and personal room creation intact",{});
});
test("F201 diagnostic: Storage cutoff expression transport",async()=>{
 const audio=await oldAudio();await db.doc(`users/${uid("pupil")}`).update({authRevokedBefore:100});
 const conditions={claim:'request.auth.token.auth_time > 100',claimType:'request.auth.token.auth_time is number',profile:'firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.authRevokedBefore == 100',profileType:'firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.authRevokedBefore is number',comparison:'request.auth.token.auth_time > firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.authRevokedBefore',claimGet:'request.auth.token.get("auth_time", 0) > 100'};
 const evidence:Record<string,unknown>={};let temporary:RulesTestEnvironment|undefined;
 try{for(const [name,condition] of Object.entries(conditions)){
  temporary=await initializeTestEnvironment({projectId:project,storage:{host:"127.0.0.1",port:9297,rules:`rules_version = '2'; service firebase.storage { match /b/{bucket}/o { match /{allPaths=**} { allow read: if ${condition}; } } }`}});
  try{await getBytes(ref(temporary.authenticatedContext(uid("pupil"),{auth_time:101}).storage(`gs://${bucketName}`),audio));evidence[name]=true;}catch(error){evidence[name]={allowed:false,code:(error as any).code};}await temporary.cleanup();temporary=undefined;
 }}finally{if(temporary)await temporary.cleanup();const restored=await initializeTestEnvironment({projectId:project,storage:{host:"127.0.0.1",port:9297,rules:await readFile("storage.rules","utf8")}});await restored.cleanup();}
 await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,"storage-cutoff-diagnostic.json"),JSON.stringify(evidence,null,2),{flag:"wx"});
});
test("F201 lookup failures: verifier/profile outage is denied without unverified-token fallback",async()=>{
 const fake={verifyIdToken:async()=>{throw Object.assign(new Error("Synthetic googleapis.com lookup failure"),{code:"auth/internal-error"});}};
 await assert.rejects(accountCheckedAuth(fake as any,db).verifyIdToken("synthetic"),(error:any)=>error.status===503&&!error.message.includes("googleapis"));
 const profileFail={doc:()=>({get:async()=>{throw new Error("Synthetic profile lookup failure");}})};
 await assert.rejects(accountCheckedAuth({verifyIdToken:async()=>({uid:"synthetic"})} as any,profileFail as any).verifyIdToken("synthetic"),(error:any)=>error.status===503);
 result("verification-outage","pass","Both lookups fail closed without development fallback",{});
});
test("F201 legacy admin submissions: shared secret no longer bypasses account status",async()=>{
 const route=await import("../../../app/api/admin/submissions/route"),{NextRequest}=await import("next/server");
 assert.equal((await route.GET(new NextRequest("http://127.0.0.1/api/admin/submissions?token=synthetic-old-secret",{headers:{"x-admin-token":"synthetic-old-secret"}}))).status,401);
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});
 assert.equal((await route.GET(new NextRequest(await req("owner",null,"GET")))).status,200);
 await db.doc(`users/${uid("owner")}`).update({disabled:true});assert.equal((await route.GET(new NextRequest(await req("owner",null,"GET")))).status,403);
 result("legacy-admin-auth","pass","Legacy individual-data endpoint requires active Firebase administrator",{});
});
test("F201 admin revoke: cutoff preserves Auth's final valid-since time after a delayed operation",async()=>{
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});
 const account=await getAuth(app).getUser(uid("pupil")),future=Math.floor(Date.now()/1000)+10;let reads=0;
 mock.method(getAuth(app),"getUser",async()=>({...account,tokensValidAfterTime:new Date((reads++===0?future-20:future)*1000).toUTCString()}));
 await manageAccountAccess(getAdmin().auth,db,uid("owner"),uid("pupil"),"revoke");assert.equal((await db.doc(`users/${uid("pupil")}`).get()).get("authRevokedBefore"),future);await rejectRules(ruleRead("pupil",nested(),future));assert.ok((await ruleRead("pupil",nested(),future+1)).exists());
 result("final-auth-cutoff","pass","Mirror includes the final Auth cutoff, not just the initial request clock",{});
});
test("F201 simultaneous management: newer operation prevents stale reactivation from clearing a block",async()=>{
 await db.doc(`users/${uid("owner")}`).update({role:"admin",roles:{admin:true},adminLevel:"superadmin"});const original=getAuth(app).updateUser.bind(getAuth(app));
 mock.method(getAuth(app),"updateUser",async(target:string,properties:any)=>{const user=await original(target,properties);if(properties.disabled===false)await db.doc(`users/${target}`).update({disabled:true,authDisabled:true,accountAccessOperation:"synthetic-newer-operation"});return user;});
 await assert.rejects(manageAccountAccess(getAdmin().auth,db,uid("owner"),uid("pupil"),"reactivate"),(error:any)=>error.status===409);assert.equal((await db.doc(`users/${uid("pupil")}`).get()).get("disabled"),true);await rejectRules(ruleRead("pupil",nested()));
 result("management-race","pass","Stale reactivation cannot relax a newer account restriction",{});
});
test("F201 revoked profile claims: refresh with old auth_time fails; malformed cutoff fails closed",async()=>{
 const raw={verifyIdToken:async()=>({uid:uid("pupil"),auth_time:100,iat:999})} as any,guard=accountCheckedAuth(raw,db);
 await db.doc(`users/${uid("pupil")}`).update({authRevokedBefore:100});await assert.rejects(guard.verifyIdToken("synthetic-refresh"),(error:any)=>error.status===401);
 await db.doc(`users/${uid("pupil")}`).update({authRevokedBefore:"synthetic-invalid"});await assert.rejects(guard.verifyIdToken("synthetic-refresh"),(error:any)=>error.status===401);await rejectRules(ruleRead("pupil",nested(),101));
 result("auth-time-not-refresh-time","pass","Refresh timestamp never substitutes for fresh authentication; malformed metadata denies",{});
});
test("F201 independent bearer links: profile disable cannot revoke an already-issued Firebase download token",async()=>{
 const audio=await oldAudio(),token=randomUUID();await getStorage(app).bucket(bucketName).file(audio).setMetadata({metadata:{firebaseStorageDownloadTokens:token}});
 const url=`http://127.0.0.1:9297/v0/b/${bucketName}/o/${encodeURIComponent(audio)}?alt=media&token=${token}`;
 assert.equal((await fetch(url)).status,200);await db.doc(`users/${uid("pupil")}`).update({disabled:true});await rejectRules(ruleRead("pupil",nested()));assert.equal((await fetch(url)).status,200);
 result("existing-download-token","known-limitation","Existing bearer capability is independent of account/rule checks; separate file-token work remains",{before:200,after:200,tokenLogged:false});
});
test("F201 delegated KI: profile disable and mirrored cutoff also restrict OAuth identity",async()=>{
 const {firebaseOAuthServices}=await import("../../integrations/openai/services");const services=firebaseOAuthServices({allowedUids:new Set([uid("owner")])});
 assert.ok(await services.getIdentity(uid("owner")));const cutoff=Math.floor(Date.now()/1000)+20;
 await db.doc(`users/${uid("owner")}`).update({authRevokedBefore:cutoff});assert.ok((await services.getIdentity(uid("owner")))!.tokensValidAfter>cutoff);
 await assert.rejects(services.verifyFirebaseToken(await identities.owner.user.getIdToken()));await db.doc(`users/${uid("owner")}`).update({disabled:true});assert.equal(await services.getIdentity(uid("owner")),undefined);
 result("delegated-ki-identity","pass","Delegated KI access uses the same profile and authentication-time boundary",{});
});

