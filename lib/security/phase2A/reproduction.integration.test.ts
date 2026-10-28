/* eslint-disable @typescript-eslint/no-explicit-any -- controlled test transport and VM/browser doubles */
import assert from 'node:assert/strict';
import { before, beforeEach, after, afterEach, test, mock } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithCredential, OAuthProvider, type User } from 'firebase/auth';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, getBytes } from 'firebase/storage';
import OpenAI from 'openai';
import { getSpaceAccess, getActiveSpaceMembership } from '../spaceAccess.server';
import { beginSpaceFileUpload, finishSpaceFileUpload, readSpaceFile, deleteSpaceFile, saveGeneratedSpaceImage, SpaceFileError } from '../../spaceFiles.server';
import { privateSpaceFileId } from '../../spaceFiles';

const project='demo-phase2-local', bucketName=`${project}.appspot.com`;
const aliases=['owner','pupil','peer','co','schooladmin','foreign','dual'] as const;
type Alias=typeof aliases[number];
const identities={} as Record<Alias,{uid:string; user:User; app:FirebaseApp}>;
let app:ReturnType<typeof initializeApp>, db:ReturnType<typeof getFirestore>, env:RulesTestEnvironment;
const observations:{id:string;classification:string;finding:string;evidence:unknown}[]=[];
let providerCalls=0;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=','base64');
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
async function ruleGet(a:Alias,resource:string){return getDoc(doc(rules(a).firestore(),resource));}
async function rejectRules(operation:Promise<unknown>){await assert.rejects(operation,(e:any)=>['permission-denied','storage/unauthorized'].includes(e.code));}
async function legacyImage(kind='writing-print-images',room='room'){
 const file=`${kind}/${uid('pupil')}/${room}/${kind==='writing-print-images'?'writing/':''}synthetic.png`;
 await getStorage(app).bucket(bucketName).file(file).save(png,{resumable:false,contentType:'image/png'});return file;
}
async function legacyAudio(room='room'){
 const file=`spaces/${room}/assignments/task/submissions/${uid('pupil')}/audio/synthetic.wav`;
 await getStorage(app).bucket(bucketName).file(file).save(Buffer.from([1,2,3]),{resumable:false,contentType:'audio/wav'});return file;
}
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
 assert.ok(process.env.PHASE2_RESULT_DIR?.includes('security-phase2-local'));
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
 providerCalls=0;mock.method(OpenAI.Responses.prototype,'create',async()=>{providerCalls++;return {output_text:'Synthetic feedback'};});
});
afterEach(()=>mock.restoreAll());
after(async()=>{await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'observations.json'),JSON.stringify({project,scope:'emulators-and-local-doubles-only',observations},null,2),{flag:'wx'});await env?.cleanup();for(const value of Object.values(identities))await deleteClientApp(value.app);if(app)await deleteApp(app);});

test('F2-01a disabled profile still reads protected Firestore and legacy Storage while private API denies',async()=>{
 const file=await legacyAudio();const privateFile=await readyFile();await db.doc(`users/${uid('pupil')}`).update({disabled:true});
 assert.ok((await ruleGet('pupil',`spaces/room/lessons/task/submissions/${submission('pupil')}`)).exists());
 assert.deepEqual([...new Uint8Array(await getBytes(ref(rules('pupil').storage(`gs://${bucketName}`),file)))],[1,2,3]);
 await assert.rejects(readSpaceFile(uid('pupil'),privateFile.id,null),denied(403));
 result('F2-01a','security-hole','Disabled profile retains rule-based individual-data access',{firestore:'allowed',legacyStorage:'allowed',privateReader:403});
});
test('F2-01b Auth emulator blocks disabled owner even without explicit checkRevoked, with incorrect HTTP 500',async()=>{
 const {PATCH}=await import('../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route');
 const token=await identities.owner.user.getIdToken();await getAuth(app).updateUser(uid('owner'),{disabled:true});
 await assert.rejects(getAuth(app).verifyIdToken(token,true),{code:'auth/user-disabled'});
 const response=await PATCH(new Request('http://127.0.0.1/api/synthetic',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({displayName:'Synthetic changed by disabled owner'})}),{params:Promise.resolve({spaceId:'room',memberId:`room_${uid('pupil')}`})});
 assert.equal(response.status,500);assert.match((await response.json()).error,/disabled/);assert.notEqual((await db.doc(member('pupil')).get()).get('displayName'),'Synthetic changed by disabled owner');
 const {POST}=await import('../../../app/api/teacher/ai-feedback/route');const feedback=await POST(new Request('http://127.0.0.1/api/synthetic',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({spaceId:'room',assignmentId:'task',subId:submission('pupil')})}));
 assert.equal(feedback.status,401);assert.equal(providerCalls,0);
 result('F2-01b','needs-clarification','Auth bypass not reproduced: emulator forces status checks; route returns HTTP 500',{memberEndpoint:500,memberChanged:false,feedbackEndpoint:401,providerCalls,emulatorForcesRevocationChecks:true});
});
test('F2-01c Auth emulator blocks revoked owner with incorrect HTTP 500; no administrative write',async()=>{
 const {PATCH}=await import('../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route');const token=await identities.owner.user.getIdToken(true);
 await new Promise(resolve=>setTimeout(resolve,2100));await getAuth(app).revokeRefreshTokens(uid('owner'));
 await assert.rejects(getAuth(app).verifyIdToken(token,true),{code:'auth/id-token-revoked'});
 const response=await PATCH(new Request('http://127.0.0.1/api/synthetic',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({displayName:'Synthetic revoked-token rename'})}),{params:Promise.resolve({spaceId:'room',memberId:`room_${uid('pupil')}`})});assert.equal(response.status,500);assert.match((await response.json()).error,/revoked/);
 assert.notEqual((await db.doc(member('pupil')).get()).get('displayName'),'Synthetic revoked-token rename');
 result('F2-01c','needs-clarification','Token-revocation bypass not reproduced in emulator; error status is 500',{memberEndpoint:500,memberChanged:false,checkRevoked:'auth/id-token-revoked'});
});
test('F2-01 SDK offline branch proves non-emulator default omits account status lookup',async()=>{
 const source=await readFile('node_modules/firebase-admin/lib/auth/base-auth.js','utf8');const ast=ts.createSourceFile('sdk.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let method='';
 const visit=(node:ts.Node)=>{if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='verifyIdToken')method=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(method);
 let emulator=false,checks=0;const vm=createContext({auth_api_request_1:{useEmulator:()=>emulator},error_1:{AuthClientErrorCode:{ID_TOKEN_REVOKED:'synthetic'}},Promise});
 const verify=runInContext(`({${method}}).verifyIdToken`,vm);const offline={idTokenVerifier:{verifyJWT:async()=>({uid:'synthetic-offline-account'})},verifyDecodedJWTNotRevokedOrDisabled:async()=>{checks++;throw new Error('synthetic-disabled');}};
 assert.equal((await verify.call(offline,'synthetic-local-token')).uid,'synthetic-offline-account');assert.equal(checks,0);
 await assert.rejects(verify.call(offline,'synthetic-local-token',true),/synthetic-disabled/);emulator=true;await assert.rejects(verify.call(offline,'synthetic-local-token'),/synthetic-disabled/);assert.equal(checks,2);
 result('F2-01-sdk','offline-sdk-confirmation','Actual SDK method skips account status in non-emulator default branch',{actualSdkSource:true,networkOperations:0,defaultNonEmulatorStatusLookups:0,checkRevokedTrueChecksStatus:true,emulatorDefaultChecksStatus:true,realCloudTokenTested:false});
});
test('F2-01d disabled pupil can still save through student server endpoint',async()=>{
 await db.doc(`users/${uid('pupil')}`).update({disabled:true});const {POST}=await import('../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route');
 const response=await POST(await req('pupil',{submissionId:submission('pupil'),payload:{uid:uid('pupil'),participantId:uid('pupil'),spaceId:'room',assignmentId:'task',answers:{q:'Synthetic disabled-profile write'}}}),{params:Promise.resolve({spaceId:'room',assignmentId:'task'})});assert.equal(response.status,200,await response.text());
 result('F2-01d','security-hole','Profile deactivation is not enforced by student save endpoint',{status:200});
});
test('F2-01e globally disabled profile owner retains member-administration permission',async()=>{
 await db.doc(`users/${uid('owner')}`).update({disabled:true});assert.equal((await getSpaceAccess(db,'room',uid('owner'))).canTeach,false);
 const {PATCH}=await import('../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route');const response=await PATCH(await req('owner',{displayName:'Synthetic disabled-profile owner rename'},'PATCH'),{params:Promise.resolve({spaceId:'room',memberId:`room_${uid('pupil')}`})});assert.equal(response.status,200,await response.text());
 result('F2-01e','security-hole','Disabled owner profile retains administrative writes',{centralCanTeach:false,memberEndpoint:200,authAccountStillEnabled:true});
});
test('F2-02 legacy individual writing image is exposed to peer but shared board image correctly remains shared',async()=>{
 const writing=await legacyImage(),board=await legacyImage('board-images');
 for(const file of [writing,board])assert.deepEqual(Buffer.from(await getBytes(ref(rules('peer').storage(`gs://${bucketName}`),file))),png);
 await rejectRules(getBytes(ref(rules('foreign').storage(`gs://${bucketName}`),writing)));
 result('F2-02','security-hole','Peer reads individual legacy writing image',{peerWriting:'allowed',peerBoard:'allowed-as-designed',foreign:'denied'});
});
test('F2-02-control new private writing images separate individuals and private board images are shared',async()=>{
 const image=await saveGeneratedSpaceImage(uid('pupil'),{spaceId:'room',activityId:'writing',submissionId:`room_writing_${uid('pupil')}`,purpose:'writing_image'},png);
 await db.doc(`spaces/room/writingActivities/writing/submissions/room_writing_${uid('pupil')}`).set({studentUid:uid('pupil'),participantId:uid('pupil'),printProfile:{imageUrl:image.imageUrl}});
 const id=privateSpaceFileId(image.storagePath)!;assert.equal((await readSpaceFile(uid('pupil'),id,null)).status,200);assert.equal((await readSpaceFile(uid('owner'),id,null)).status,200);await assert.rejects(readSpaceFile(uid('peer'),id,null),denied(403));
 const board=await saveGeneratedSpaceImage(uid('owner'),{spaceId:'room',activityId:'state',purpose:'board_image'},png);await db.doc('spaces/room/board/state').set({data:{imageUrl:board.imageUrl}});assert.equal((await readSpaceFile(uid('peer'),privateSpaceFileId(board.storagePath)!,null)).status,200);
 result('F2-02-control','not-reproduced','New private image flow respects individual/shared distinction',{own:200,teacher:200,peerWriting:403,peerBoard:200});
});
test('F2-03 status matrix demonstrates trimmed-status discrepancy and flag-based revocation',async()=>{
 const rows:unknown[]=[];const file=await legacyAudio();
 for(const status of [undefined,'active','removed','REMOVED',' removed ','disabled','inactive','revoked','linked',null,17]){
 await db.doc(member('pupil')).set({spaceId:'room',uid:uid('pupil'),participantId:uid('pupil'),role:'student',active:true,archived:false,...(status===undefined?{}:{status})});
 const server=(await getSpaceAccess(db,'room',uid('pupil'))).canRead;let ruleAllowed=false;try{ruleAllowed=(await ruleGet('pupil','spaces/room')).exists();}catch(e:any){assert.equal(e.code,'permission-denied');}
 let storageAllowed=false;try{await getBytes(ref(rules('pupil').storage(`gs://${bucketName}`),file));storageAllowed=true;}catch(error:any){assert.equal(error.code,'storage/unauthorized');}
 rows.push({status:status===undefined?'missing':status,server,ruleAllowed,storageAllowed});if(status===' removed '){assert.equal(server,false);assert.equal(ruleAllowed,true);assert.equal(storageAllowed,true);}if(status===undefined){assert.equal(server,true);assert.equal(ruleAllowed,true);assert.equal(storageAllowed,true);}if(['removed','REMOVED','disabled','inactive','revoked','linked'].includes(String(status))){assert.equal(server,false);assert.equal(ruleAllowed,false);assert.equal(storageAllowed,false);}
 }
 await db.doc(member('pupil')).update({status:' removed ',active:false,archived:true});await rejectRules(ruleGet('pupil','spaces/room'));
 result('F2-03','security-hole','Whitespace status can bypass rules when only status marks revocation',{rows,standardRemovalFlags:'denied'});
});
test('F2-04 owner can change schoolId on existing Space but cannot assign foreign school when creating',async()=>{
 await updateDoc(doc(rules('owner').firestore(),'spaces/room'),{schoolId:'schoolB'});assert.equal((await db.doc('spaces/room').get()).get('schoolId'),'schoolB');
 await rejectRules(setDoc(doc(rules('owner').firestore(),'spaces/new-room'),{ownerId:uid('owner'),title:'Synthetic',isOpen:false,schoolId:'schoolB'}));
 result('F2-04','security-hole','Existing Space school tag can be reassigned across schools',{update:'allowed',foreignCreate:'denied'});
});
test('F2-05 missing ownerId loses rule-based teaching access despite server fallback',async()=>{
 await db.doc('spaces/room').set({ownerUid:uid('owner'),title:'Synthetic legacy'});assert.equal((await getSpaceAccess(db,'room',uid('owner'))).canTeach,true);
 await rejectRules(ruleGet('owner',`spaces/room/lessons/task/submissions/${submission('pupil')}`));
 result('F2-05a','functional-error','Legacy ownerUid-only room has inconsistent teaching access',{serverCanTeach:true,firestoreSubmission:'denied'});
});
test('F2-05 conflicting ownerUid permits member administration for rejected legacy owner',async()=>{
 await db.doc('spaces/room').update({ownerUid:uid('foreign')});assert.equal((await getSpaceAccess(db,'room',uid('foreign'))).canTeach,false);
 const {PATCH}=await import('../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route');const response=await PATCH(await req('foreign',{displayName:'Synthetic conflicting-owner rename'},'PATCH'),{params:Promise.resolve({spaceId:'room',memberId:`room_${uid('pupil')}`})});assert.equal(response.status,200,await response.text());
 result('F2-05b','security-hole','Conflicting secondary owner grants administration without central teaching access',{centralCanTeach:false,memberEndpoint:200,condition:'conflicting stored owner fields'});
});
test('F2-06 pupil rewrites ownership and teacher/AI feedback in lesson and index through rules',async()=>{
 const evidence=[];
 for(const collectionPath of ['spaces/room/lessons/task/submissions','spaceSubmissions']){
 const target=`${collectionPath}/${submission('pupil')}`;await updateDoc(doc(rules('pupil').firestore(),target),{teacherFeedback:{text:'Synthetic forged teacher feedback'},aiFeedback:{text:'Synthetic forged AI feedback'}});
 assert.equal((await db.doc(target).get()).get('teacherFeedback.text'),'Synthetic forged teacher feedback');
 await updateDoc(doc(rules('pupil').firestore(),target),{uid:uid('peer'),participantId:uid('peer')});assert.equal((await db.doc(target).get()).get('uid'),uid('peer'));evidence.push({target,feedback:'rewritten',ownership:'rewritten'});
 }
 result('F2-06a','security-hole','Pupil controls protected lesson/index identity and feedback fields',{evidence});
});
test('F2-06 student endpoint validates identity but forwards forged teacher and AI feedback',async()=>{
 const {POST}=await import('../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route');
 const payload={uid:uid('pupil'),participantId:uid('pupil'),spaceId:'room',assignmentId:'task',teacherFeedback:{text:'Synthetic API forgery'},aiFeedback:{text:'Synthetic API AI forgery'}};
 const response=await POST(await req('pupil',{submissionId:submission('pupil'),payload}),{params:Promise.resolve({spaceId:'room',assignmentId:'task'})});assert.equal(response.status,200,await response.text());assert.equal((await db.doc(`spaces/room/lessons/task/submissions/${submission('pupil')}`).get()).get('teacherFeedback.text'),'Synthetic API forgery');
 const wrong=await POST(await req('pupil',{submissionId:submission('peer'),payload}),{params:Promise.resolve({spaceId:'room',assignmentId:'task'})});assert.equal(wrong.status,403);
 result('F2-06b','security-hole','Server student save also accepts teacher/AI feedback fields',{ownForgery:200,foreignExistingSubmission:403});
});
test('F2-06 pupil can precreate another pupils predictable submission ID using own UID',async()=>{
 const target=`spaces/room/lessons/task/submissions/room_task_future-other-pupil`;
 await setDoc(doc(rules('pupil').firestore(),target),{uid:uid('pupil'),participantId:uid('pupil'),spaceId:'room',assignmentId:'task',teacherFeedback:{text:'Synthetic forged at create'},aiFeedback:{text:'Synthetic forged at create'}});
 assert.ok((await db.doc(target).get()).exists);
 result('F2-06c','security-hole','Creation does not bind document ID or protect feedback fields',{create:'allowed',condition:'target ID not already present'});
});
test('F2-06 writing rules protect existing teacher feedback but not sectionFeedback on creation',async()=>{
 const target=`spaces/room/writingActivities/writing/submissions/room_writing_${uid('pupil')}`;
 await setDoc(doc(rules('pupil').firestore(),target),{studentUid:uid('pupil'),participantId:uid('pupil'),status:'draft',sectionFeedback:{synthetic:{text:'Synthetic forged section feedback'}}});
 await db.doc(target).update({teacherFeedback:{text:'Synthetic actual teacher'}});
 let legitimateUpdate=true,legitimateError='';try{await updateDoc(doc(rules('pupil').firestore(),target),{text:'Synthetic legitimate draft'});}catch(error:any){assert.equal(error.code,'permission-denied');legitimateUpdate=false;legitimateError=error.message;}
 await rejectRules(updateDoc(doc(rules('pupil').firestore(),target),{teacherFeedback:{text:'Synthetic attempted replacement'}}));
 result('F2-06d','security-hole','Writing section feedback accepted during create; evaluate update-denial reason separately',{sectionFeedbackCreate:'allowed',teacherFeedbackUpdate:'denied',legitimateUpdate,legitimateError});
});

async function transportFixture(options:{wrongHash?:boolean;conflict?:boolean;revokeDuringCopy?:boolean;wrongSize?:boolean;concurrent?:boolean}={}){
 const id='synthetic-copy-asset',uploadPath=`private-space-uploads/room/${id}`,storagePath=`private-space-files/room/${id}`;
 await db.doc(`privateSpaceFiles/${id}`).set({...scope(),ownerUid:uid('pupil'),participantId:uid('pupil'),uploadPath,storagePath,contentType:'audio/wav',size:3,createdAt:Date.now(),status:'pending'});
 const calls:any[]=[];let copies=0;let exists=!!options.conflict;
 const source={generation:'21',metageneration:'1',size:'3',contentType:'audio/wav',md5Hash:'source-hash',crc32c:'source-crc'};
 const dest={generation:'22',metageneration:'1',size:options.wrongSize?'4':'3',contentType:'audio/wav',md5Hash:options.wrongHash?'different-hash':'source-hash',crc32c:options.wrongHash?'different-crc':'source-crc',metadata:{assetId:id,spaceId:'room',firebaseStorageDownloadTokens:null}};
 let unlock:()=>void=()=>undefined;const gate=new Promise<void>(resolve=>{unlock=resolve;});
 const fake={file:(filePath:string,version?:unknown)=>{calls.push({op:'file',path:filePath,version});return {getMetadata:async()=>[filePath===uploadPath?source:dest],copy:async(_target:unknown,settings:unknown)=>{calls.push({op:'copy',settings});copies++;if(options.concurrent){if(copies===2)unlock();await gate;}if(options.revokeDuringCopy)await db.doc(member('pupil')).update({active:false,status:'removed'});if(exists)throw Object.assign(new Error('synthetic conflict'),{code:412});exists=true;return [{}];},delete:async(settings:unknown)=>{calls.push({op:'delete',path:filePath,version,settings});}};}};
 mock.method(getStorage(app),'bucket',()=>fake as never);return {id,uploadPath,storagePath,calls,source,dest};
}
test('F2-07 mismatching checksum is accepted for existing 412 target in controlled transport',async()=>{
 const f=await transportFixture({wrongHash:true,conflict:true});await finishSpaceFileUpload(uid('pupil'),f.id);assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('status'),'ready');assert.notEqual(f.source.md5Hash,f.dest.md5Hash);
 result('F2-07a','integrity-gap','Existing target with same ID/size/type but different checksum is accepted',{controlledTransport:true,targetConflict:412,ready:true,hashMismatch:true,unprivilegedExploit:'not demonstrated'});
});
test('F2-07 source generation and create-only copy are pinned; bad size fails closed',async()=>{
 const f=await transportFixture({wrongSize:true});await assert.rejects(finishSpaceFileUpload(uid('pupil'),f.id),denied(503));
 assert.ok(f.calls.some(c=>c.op==='file'&&c.path===f.uploadPath&&c.version?.generation==='21'));assert.equal(f.calls.find(c=>c.op==='copy').settings.preconditionOpts.ifGenerationMatch,0);
 result('F2-07b','not-reproduced','Source-version/create-only guards and metadata-size rejection work',{controlledTransport:true,sourceGeneration:'21',ifGenerationMatch:0,sizeMismatch:503});
});
test('F2-07 two concurrent finishes converge on same valid destination',async()=>{
 const f=await transportFixture({concurrent:true});const both=await Promise.all([finishSpaceFileUpload(uid('pupil'),f.id),finishSpaceFileUpload(uid('pupil'),f.id)]);assert.deepEqual(both[0],both[1]);assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('generation'),'22');
 result('F2-07c','not-reproduced','Two finishes accept one correct create-only target',{controlledTransport:true,successfulRequests:2,destinationGeneration:'22'});
});
test('F2-07 revocation during copy blocks publish; pending asset remains private',async()=>{
 const f=await transportFixture({revokeDuringCopy:true});await assert.rejects(finishSpaceFileUpload(uid('pupil'),f.id),denied(403));assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('status'),'pending');
 result('F2-07d','not-reproduced','Reauthorization after copy prevents publication after revocation',{controlledTransport:true,finish:403,status:'pending',possiblePrivateOrphan:true});
});
test('F2-07 delete denies reader first but staging delete has no generation condition',async()=>{
 const f=await transportFixture();await deleteSpaceFile(uid('pupil'),f.id);const deletion=f.calls.find(c=>c.op==='delete'&&c.path===f.uploadPath);assert.equal(deletion.version,undefined);assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('status'),'deleted');
 result('F2-07e','integrity-gap','Staging cleanup is not version-pinned',{controlledTransport:true,stagingGenerationCondition:false,statusBeforeStorageDelete:'deleted',unprivilegedExploit:'not demonstrated'});
});
test('F2-07 finalization after last membership check can mark ready but cannot grant read access',async()=>{
 const f=await transportFixture();const original=db.runTransaction.bind(db);
 mock.method(db,'runTransaction',async(...args:any[])=>{await db.doc(member('pupil')).update({active:false,archived:true,status:'removed'});return (original as any)(...args);});
 await finishSpaceFileUpload(uid('pupil'),f.id);assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('status'),'ready');await assert.rejects(readSpaceFile(uid('pupil'),f.id,null),denied(403));
 result('F2-07f','race-state-gap','Last-check/transaction race permits ready state, but reader still denies revoked user',{controlledTransport:true,controlledTransactionInterleaving:true,readyAfterRevocation:true,read:403,individualDataDisclosure:false});
});
test('F2-07 deletion racing final transaction prevents ready-state resurrection',async()=>{
 const f=await transportFixture();const original=db.runTransaction.bind(db);
 mock.method(db,'runTransaction',async(...args:any[])=>{await deleteSpaceFile(uid('pupil'),f.id);return (original as any)(...args);});
 await assert.rejects(finishSpaceFileUpload(uid('pupil'),f.id),denied(410));assert.equal((await db.doc(`privateSpaceFiles/${f.id}`).get()).get('status'),'deleted');
 result('F2-07g','not-reproduced','Concurrent deletion prevents finalizer from resurrecting asset',{controlledTransport:true,controlledTransactionInterleaving:true,finish:410,status:'deleted'});
});
test('F2-08 revoked uploader retains staging write capability but cannot publish or read',async()=>{
 const session=await beginSpaceFileUpload(uid('pupil'),scope(),'audio/wav',3);await db.doc(member('pupil')).update({active:false,archived:true,status:'removed'});
 const upload=await fetch(session.uploadUrl,{method:'PUT',headers:{'Content-Type':'audio/wav'},body:new Uint8Array([1,2,3])});assert.equal(upload.status,200);
 await assert.rejects(finishSpaceFileUpload(uid('pupil'),session.id),denied(403));await assert.rejects(readSpaceFile(uid('pupil'),session.id,null),denied(404));
 result('F2-08a','capability-limitation','Revocation does not cancel issued write-only staging session',{emulator:true,stagingWrite:200,publish:403,read:404,individualDataDisclosure:false});
});
test('F2-08 expired application record rejects completion without proving provider lifetime',async()=>{
 const session=await beginSpaceFileUpload(uid('pupil'),scope(),'audio/wav',3);await db.doc(`privateSpaceFiles/${session.id}`).update({createdAt:Date.now()-16*60_000});
 await assert.rejects(finishSpaceFileUpload(uid('pupil'),session.id),denied(410));
 result('F2-08b','needs-clarification','Application deadline works; real provider expiry not measured',{finish:410,recordAgeMinutes:16,providerElapsedTimeTest:false});
});
test('F2-09 PDF performs unauthenticated GET and follows redirect to local synthetic server',async()=>{
 const hits:{path:string;authorization:boolean}[]=[];const server=createServer((request,response)=>{hits.push({path:request.url!,authorization:!!request.headers.authorization});if(request.url==='/redirect'){response.writeHead(302,{Location:'/synthetic-private.png'});response.end();}else{response.writeHead(200,{'Content-Type':'image/png'});response.end(png);}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address();assert.ok(address&&typeof address!=='string');const {POST}=await import('../../../app/api/pdf/board-image/route');
 const response=await POST(await req(null,{data:{title:'Synthetic',subtitle:'Synthetic',prompt:'Synthetic',generatedAt:'2026-10-17',responseCount:0,labels:{},sentences:[],imageUrl:`http://127.0.0.1:${address.port}/redirect`}}));
 assert.deepEqual(hits.map(h=>h.path),['/redirect','/synthetic-private.png']);assert.ok(hits.every(h=>!h.authorization));
 assert.ok([200,500].includes(response.status));if(response.status===200){const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');}else{assert.match((await response.json()).details,/reading 'S'/);}
 result('F2-09','security-hole','Unauthenticated caller controls server-side URL fetch including redirects',{targets:'local synthetic only',hits,pdfStatus:response.status,rendererVerified:response.status===200,rendererLimitation:'react-server test condition is incompatible with PDF renderer',internalCloudTargetsTested:false});
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('F2-09-control private PDF references reject absent and schooladmin credentials',async()=>{
 const image=await saveGeneratedSpaceImage(uid('owner'),{spaceId:'room',activityId:'state',purpose:'board_image'},png);await db.doc('spaces/room/board/state').set({data:{imageUrl:image.imageUrl}});
 const {POST}=await import('../../../app/api/pdf/board-image/route');for(const [a,status] of [[null,401],['schooladmin',403]] as const){const response=await POST(await req(a,{data:{title:'Synthetic',prompt:'Synthetic',labels:{},sentences:[],imageUrl:image.imageUrl}}));assert.equal(response.status,status);}
 result('F2-09-control','not-reproduced','Private API image references keep their authorization checks',{anonymous:401,schooladmin:403});
});

test('Control ordinary removal blocks individual reads, legacy/private audio and AI; reactivation restores them',async()=>{
 const privateFile=await readyFile(),legacy=await legacyAudio();await db.doc(member('pupil')).update({active:false,archived:true,status:'removed'});
 await rejectRules(ruleGet('pupil',`spaces/room/lessons/task/submissions/${submission('pupil')}`));await rejectRules(getBytes(ref(rules('pupil').storage(`gs://${bucketName}`),legacy)));await assert.rejects(readSpaceFile(uid('pupil'),privateFile.id,null),denied(403));
 await db.doc(member('co')).update({active:false,archived:true,status:'removed'});const {POST}=await import('../../../app/api/teacher/ai-feedback/route');const deniedFeedback=await POST(await req('co',{spaceId:'room',assignmentId:'task',subId:submission('pupil')}));assert.equal(deniedFeedback.status,403);assert.equal(providerCalls,0);
 await updateDoc(doc(rules('owner').firestore(),member('pupil')),{active:true,archived:false,status:'active'});assert.equal((await readSpaceFile(uid('pupil'),privateFile.id,null)).status,200);
 result('membership-control','not-reproduced','Standard revocation and owner reactivation preserve intended access',{rules:'denied-after-removal',private:403,ai:403,providerCalls,reactivatedRead:200});
});
test('Control canonical tombstone defeats active legacy duplicate',async()=>{
 await db.doc(member('co')).update({status:'removed'});await db.doc('spaceMembers/legacy-co').set({uid:uid('co'),spaceId:'room',role:'co_teacher',status:'active'});
 assert.equal((await getActiveSpaceMembership(db,'room',uid('co'))).ok,false);assert.equal((await getSpaceAccess(db,'room',uid('co'))).canTeach,false);
 result('tombstone-control','not-reproduced','Legacy duplicate does not override canonical revoked membership',{activeLegacy:true,serverAllowed:false});
});
test('Isolation control rejects external socket before DNS or any network traffic',()=>{
 assert.throws(()=>createConnection(443,'external-target.synthetic.invalid'),/PHASE2_EXTERNAL_NETWORK_BLOCKED/);
 result('network-boundary-control','not-reproduced','External connection is blocked before transport',{syntheticNegativeGuardAttempt:1,permittedExternalConnections:0});
});
test('Control schooladmin cannot access individuals and dual teacher only reaches own room',async()=>{
 const file=await readyFile();const {POST}=await import('../../../app/api/teacher/ai-feedback/route');
 for(const a of ['schooladmin','foreign','dual'] as const){await rejectRules(ruleGet(a,`spaces/room/lessons/task/submissions/${submission('pupil')}`));await rejectRules(ruleGet(a,`spaceSubmissions/${submission('pupil')}`));await assert.rejects(readSpaceFile(uid(a),file.id,null),denied(403));assert.equal((await POST(await req(a,{spaceId:'room',assignmentId:'task',subId:submission('pupil')}))).status,403);}
 assert.equal((await getSpaceAccess(db,'dual',uid('dual'))).canTeach,true);assert.equal(providerCalls,0);
 result('schooladmin-control','not-reproduced','School administration alone never grants individual/AI access',{individuals:'denied',providerCalls,dualOwnRoom:true});
});
test('Product decision school licence removal preserves private teaching but loses school administration',async()=>{
 await db.doc('spaces/private-room').set({ownerId:uid('owner'),title:'Synthetic private content'});
 await db.doc('schools/schoolA').set({status:'active',teacherSeatLimit:2});await db.doc(`schools/schoolA/members/${uid('owner')}`).set({uid:uid('owner'),role:'school_teacher',status:'active'});await db.doc(`users/${uid('owner')}`).update({schoolId:'schoolA',schoolRole:'school_teacher',schoolStatus:'active'});
 const {disableSchoolTeacher}=await import('../../schools/server/disableSchoolTeacher');assert.equal((await disableSchoolTeacher({schoolId:'schoolA',targetUid:uid('owner'),performedByUid:uid('schooladmin')})).ok,true);
 assert.equal((await getSpaceAccess(db,'room',uid('owner'))).canTeach,true);assert.equal((await db.doc(`users/${uid('owner')}`).get()).get('schoolStatus'),'disabled');
 assert.equal((await getSpaceAccess(db,'private-room',uid('owner'))).canTeach,true);
 const {POST:createRoom}=await import('../../../app/api/teacher/spaces/create/route');const schoolRoom=await createRoom(await req('owner',{title:'Synthetic school-linked room',schoolId:'schoolA',isOpen:false}));assert.equal(schoolRoom.status,403);
 const privateRoom=await createRoom(await req('owner',{title:'Synthetic new private room',isOpen:false}));assert.equal(privateRoom.status,200);
 const {canAccessSchoolAdmin}=await import('../../schools/access');assert.equal(canAccessSchoolAdmin((await db.doc(`users/${uid('owner')}`).get()).data() as any),false);
 result('F2-11-product','product-decision','School licence removal is distinct from global disabling',{schoolStatus:'disabled',privateTeachingPreserved:true,schoolAdminAccess:false,newSchoolLinkedRoom:403,newPrivateRoom:200,existingSchoolLinkedOwnerAccess:true});
});
test('Control authorized owner and co-teacher receive synthetic AI feedback while schooladmin is rejected',async()=>{
 const {POST}=await import('../../../app/api/teacher/ai-feedback/route');for(const a of ['owner','co'] as const){const response=await POST(await req(a,{spaceId:'room',assignmentId:'task',subId:submission('pupil')}));assert.equal(response.status,200,await response.text());}
 assert.equal(providerCalls,2);const before=(await db.doc(`spaces/room/lessons/task/submissions/${submission('pupil')}`).get()).data();assert.equal((await POST(await req('schooladmin',{spaceId:'room',assignmentId:'task',subId:submission('pupil')}))).status,403);assert.equal(providerCalls,2);assert.deepEqual((await db.doc(`spaces/room/lessons/task/submissions/${submission('pupil')}`).get()).data(),before);
 result('ai-positive-control','not-reproduced','Ordinary authorized AI feedback works and schooladmin cannot change it',{owner:200,coTeacher:200,schooladmin:403,syntheticProviderCalls:2,externalProviderCalls:0});
});

// Compile exact current source functions into a test VM; no copied implementation or app edits.
async function sourceFunctions(names:string[],context:Record<string,unknown>){
 const source=await readFile('components/teacher/submissions/PodcastWorkshopSubmissionView.tsx','utf8');const ast=ts.createSourceFile('source.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const functions=new Map<string,string>();
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))functions.set(node.name.text,node.getText(ast));ts.forEachChild(node,visit);}visit(ast);assert.equal(functions.size,names.length);
 const javascript=ts.transpileModule([...functions.values()].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const vm=createContext({...context,Blob,ArrayBuffer,DataView,Float32Array,Uint8Array,Math,Promise,Buffer});runInContext(javascript,vm,{timeout:5000});
 return {vm,sourceHash:createHash('sha256').update(source).digest('hex')};
}
test('F2-10 individual segment download rejects new private path while authenticated private reader works',async()=>{
 const file=await readyFile();const {POST}=await import('../../../app/api/teacher/audio-url/route');
 let responseStatus=0;const {vm,sourceHash}=await sourceFunctions(['requestTeacherAudioUrl'],{auth:{currentUser:identities.owner.user},fetch:async(_url:string,init:RequestInit)=>{const response=await POST(new Request('http://127.0.0.1/api/teacher/audio-url',init));responseStatus=response.status;return response;}});
 const downloaded=await vm.requestTeacherAudioUrl({storagePath:file.storagePath},'download');assert.equal(downloaded,null);assert.equal(responseStatus,400);assert.equal((await readSpaceFile(uid('owner'),file.id,null)).status,200);
 result('F2-10a','functional-error','Segment download calls legacy route for new private path',{actualSourceFunction:true,sourceHash,legacyDownload:400,privateReader:200});
});
class SyntheticAudioContext{
 sampleRate=8000;async decodeAudioData(bytes:ArrayBuffer){const b=Buffer.from(bytes);const frames=b.readUInt32LE(40)/2;const pcm=Float32Array.from({length:frames},(_,i)=>b.readInt16LE(44+2*i)/32768);return {numberOfChannels:1,sampleRate:8000,length:frames,duration:frames/8000,getChannelData:()=>pcm};}async close(){}
}
class SyntheticOfflineContext{
 destination={};sources:{buffer:any;start:number}[]=[];constructor(public channels:number,public length:number,public sampleRate:number){}
 createBufferSource(){const source={buffer:null as any,connect:()=>undefined,start:(time:number)=>{this.sources.push({buffer:source.buffer,start:Math.round(time*this.sampleRate)});}};return source;}
 async startRendering(){const pcm=new Float32Array(this.length);for(const source of this.sources)pcm.set(source.buffer.getChannelData(0),source.start);return {numberOfChannels:this.channels,sampleRate:this.sampleRate,length:this.length,getChannelData:()=>pcm};}
}
function wav(value:number,frames:number){const b=Buffer.alloc(44+2*frames);b.write('RIFF');b.writeUInt32LE(36+2*frames,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2*frames,40);for(let i=0;i<frames;i++)b.writeInt16LE(value,44+2*i);return b;}
test('F2-10 whole-podcast WAV includes both resolved segments but silently drops a failed segment',async()=>{
 const segments=[{id:'one',title:'one'},{id:'two',title:'two'}];const first=wav(8192,80),second=wav(-8192,120);
 const submission={productionMix:{introSoundId:'',outroSoundId:'',transitionSoundId:''},productionSegments:{one:{voice:{storagePath:'private-space-files/room/one'}},two:{voice:{storagePath:'private-space-files/room/two'}}}};
 let failSecond=false;const {vm,sourceHash}=await sourceFunctions(['buildExportClips','getTransitionSoundId','browserAudioContext','renderPodcastWav','decodePodcastExportClip','decodeAudioClip','fetchTeacherAudioBytes','audioBufferToWav'],{
 segments,submission,getPodcastSound:()=>null,getSoundTailSeconds:()=>0,window:{AudioContext:SyntheticAudioContext},OfflineAudioContext:SyntheticOfflineContext,
 resolveTeacherAudioForPlayback:async(asset:any)=>{if(failSecond&&asset.storagePath.endsWith('/two'))throw new Error('Synthetic segment denied');return {...asset,audioDataUrl:`data:audio/wav;base64,${(asset.storagePath.endsWith('/one')?first:second).toString('base64')}`};},
 fetch:async(url:string)=>{assert.match(url,/^data:audio\/wav;base64,/);return new Response(Buffer.from(url.split(',')[1],'base64'));}
 });
 const complete=await vm.buildExportClips();assert.equal(complete.length,2);const full=Buffer.from(await (await vm.renderPodcastWav(complete)).arrayBuffer());assert.equal(full.readUInt32LE(40),400);assert.ok(full.readInt16LE(44)>0);assert.ok(full.readInt16LE(44+80*2)<0);
 failSecond=true;const partial=await vm.buildExportClips();assert.equal(partial.length,1);const truncated=Buffer.from(await (await vm.renderPodcastWav(partial)).arrayBuffer());assert.equal(truncated.readUInt32LE(40),160);
 await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'synthetic-full-podcast.wav'),full,{flag:'wx'});await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'synthetic-truncated-podcast.wav'),truncated,{flag:'wx'});
 result('F2-10b','functional-error','Export succeeds with incomplete audio after a segment resolver fails',{actualSourceFunctions:true,sourceHash,completeSegments:2,completeFrames:200,failedExportSegments:1,failedExportFrames:80,audioEngine:'controlled double, not real browser WebAudio',browserE2EVerified:false});
});
