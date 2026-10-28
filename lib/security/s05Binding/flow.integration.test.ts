// Local candidate acceptance tests. All accounts and data exist only in emulators.
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, signInAnonymously, OAuthProvider, type User } from 'firebase/auth';
import { NextRequest } from 'next/server';
import { POST as join } from '../../../app/api/spaces/join/route';
import { POST as decide } from '../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/access-request/route';
import { POST as rotate } from '../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/student-code/route';
import { PATCH as changeMember } from '../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route';
import { GET as individual } from '../../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submission/[studentUid]/route';
import { GET as overview } from '../../../app/api/student/submissions/route';
import { getSpaceAccess } from '../../../lib/security/spaceAccess.server';

const project = 'demo-phase2-local';
const room = 'pilot-room', participant = 'pilot-participant';
const code = 'ROOM42', personal = 'ABCDE';
const memberPath = (uid: string) => `spaceMembers/${room}_${uid}`;
const answerPath = `spaces/${room}/lessons/task/submissions/answer`;
const identities: Record<string, {user: User; app: ReturnType<typeof clientApp>}> = {};
const observations: {test: string; result: unknown}[] = [];
let app: ReturnType<typeof initializeApp>, db: ReturnType<typeof getFirestore>;
const uid = (alias: string) => identities[alias].user.uid;
const note = (name: string, result: unknown) => observations.push({test: name, result});
function oidc(subject: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return new OAuthProvider('oidc.feide').credential({idToken: `${encode({alg:'none',typ:'JWT'})}.${encode({iss:'https://synthetic-idp.invalid',aud:'synthetic',sub:subject})}.`});
}
async function request(alias: string | null, body?: unknown, method = 'POST', suffix = '') {
  return new NextRequest(`http://127.0.0.1/api/synthetic${suffix}`, {method, headers: {
    ...(alias ? {authorization: `Bearer ${await identities[alias].user.getIdToken()}`} : {}),
    'content-type': 'application/json',
  }, ...(method === 'GET' ? {} : {body: JSON.stringify(body ?? {})})});
}
async function joinAs(alias: string | null, confirm = true, studentCode: string | undefined = personal) {
  return join(await request(alias, {code, ...(studentCode ? {studentCode} : {}), confirm}));
}
async function readAnswer(alias: string) {
  return individual(await request(alias, undefined, 'GET'), {params: Promise.resolve({spaceId: room, assignmentId:'task', studentUid:'answer'})});
}
async function rest(alias: string, docPath: string) {
  return fetch(`http://127.0.0.1:8287/v1/projects/${project}/databases/(default)/documents/${docPath}`, {headers: {authorization: `Bearer ${await identities[alias].user.getIdToken()}`}});
}
async function seedAnswer() {
  const value = {uid: uid('anonA'), participantId: participant, spaceId: room, assignmentId:'task', text:'Synthetic adult answer'};
  await db.doc(`spaces/${room}/lessons/task`).set({spaceId:room,title:'Synthetic task'});
  await db.doc(answerPath).set(value);
  await db.doc('spaceSubmissions/answer').set(value);
}
before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8287');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes('s05-binding-local'));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  app = initializeApp({projectId: project}); db = getFirestore(app);
  for (const alias of ['teacher','anonA','anonB','feide','schooladmin','fresh','foreign','platform']) {
    const client = clientApp({apiKey:'synthetic-api-key',projectId:project,authDomain:`${project}.invalid`},`pilot-${alias}`);
    const auth = getAuth(client); connectAuthEmulator(auth,'http://127.0.0.1:9097',{disableWarnings:true});
    const user = (await (alias.startsWith('anon') || alias === 'fresh' ? signInAnonymously(auth) : signInWithCredential(auth,oidc(alias)))).user;
    identities[alias] = {user,app:client};
  }
});
beforeEach(async () => {
  const cleared = await fetch(`http://127.0.0.1:8287/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});
  assert.equal(cleared.status,200);
  for (const alias of ['teacher','feide','schooladmin','foreign','platform']) await db.doc(`users/${uid(alias)}`).set({role:alias === 'teacher' || alias === 'foreign' ? 'teacher' : alias === 'schooladmin' ? 'school_admin' : alias === 'platform' ? 'admin' : 'student'});
  await db.doc(`spaces/${room}`).set({ownerId:uid('teacher'),ownerUid:uid('teacher'),title:'Synthetic adult room',code,isOpen:false});
  await db.doc(memberPath(participant)).set({spaceId:room,participantId:participant,displayName:'Synthetic adult',role:'student',studentCode:personal,studentCodeKey:`${room}:${personal}`,teacherManaged:true,active:true,status:'active'});
});
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'binding-results.json'),JSON.stringify({project,syntheticOnly:true,applicationCodeChanged:true,emulatorAcceptanceOnly:true,observations},null,2),{flag:'wx'});
  for (const identity of Object.values(identities)) await deleteClientApp(identity.app);
  if (app) await deleteApp(app);
});


async function pending(alias: string) {
  const result = await joinAs(alias); assert.equal(result.status,200);
  const value = await result.json(); assert.equal(value.approvalRequired,true); assert.match(value.approvalCode,/^[0-9]{6}$/);
  assert.equal(value.displayName,undefined); return value;
}
async function decision(actor: string | null, target: string, confirmationCode: string, action = 'approve') {
  return decide(await request(actor,{action,confirmationCode}),{params:Promise.resolve({spaceId:room,memberId:`${room}_${uid(target)}`})});
}
async function grant(alias: string) {
  const value = await pending(alias);
  assert.equal((await decision('teacher',alias,value.approvalCode)).status,200);
  const result = await joinAs(alias); assert.equal(result.status,200); assert.equal((await result.json()).preview,false);
}
async function remove(alias='anonA') {
  return changeMember(await request('teacher',{action:'remove'},'PATCH'),{params:Promise.resolve({spaceId:room,memberId:`${room}_${uid(alias)}`})});
}
test('B01 bearer and personal code still required',async () => {
  assert.equal((await joinAs(null)).status,401);
  assert.equal((await join(await request('anonA',{code,confirm:true}))).status,400);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).exists,false);
  note('B01',{noBearer:401,roomCodeOnly:400});
});
test('B02 preview neither writes a member nor exposes pupil name',async () => {
  const result=await joinAs('anonA',false);assert.equal(result.status,200);
  const value=await result.json();assert.equal(value.approvalRequired,true);assert.equal(value.displayName,undefined);assert.equal(value.participantId,undefined);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).exists,false);
  note('B02',{readOnly:true,pupilIdentityNotDisclosed:true});
});
test('B03 new anonymous account stays inactive even with injected approval fields',async () => {
  const result=await join(await request('anonA',{code,studentCode:personal,confirm:true,active:true,status:'active',approvedByUid:uid('teacher')}));
  assert.equal(result.status,200);assert.equal((await result.json()).approvalRequired,true);await seedAnswer();
  assert.equal((await readAnswer('anonA')).status,403);assert.equal((await rest('anonA',answerPath)).status,403);
  const own=await rest('anonA',memberPath(uid('anonA')));assert.equal(own.status,200);
  const fields=(await own.json()).fields;assert.equal(fields.displayName,undefined);assert.equal(fields.active.booleanValue,false);
  const write=await fetch(`http://127.0.0.1:8287/v1/projects/${project}/databases/(default)/documents/${memberPath(uid('anonA'))}`,{method:'PATCH',headers:{authorization:`Bearer ${await identities.anonA.user.getIdToken()}`,'content-type':'application/json'},body:JSON.stringify({fields:{...fields,status:{stringValue:'active'},active:{booleanValue:true},participantId:{stringValue:'another'}}})});
  assert.equal(write.status,403);note('B03',{pendingApi:403,pendingRules:403,clientMarkerTampering:403});
});
for(const actor of [null,'anonA','schooladmin','foreign'] as const) test(`B04 approval denied for ${actor??'no bearer'}`,async () => {
  const value=await pending('anonA');assert.equal((await decision(actor,'anonA',value.approvalCode)).status,actor===null?401:403);
});
test('B05 teacher approval requires code from participant and grants bounded access',async () => {
  const value=await pending('anonA');await seedAnswer();
  const wrong=value.approvalCode==='000000'?'000001':'000000';assert.equal((await decision('teacher','anonA',wrong)).status,400);
  assert.equal((await readAnswer('anonA')).status,403);
  assert.equal((await decision('teacher','anonA',value.approvalCode)).status,200);
  assert.equal((await readAnswer('anonA')).status,200);assert.equal((await rest('anonA',answerPath)).status,200);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).get('approvalCode'),undefined);
  note('B05',{wrongConfirmation:400,approvedApi:200,approvedRules:200,challengeCleared:true});
});
test('B06 existing active account continues without another approval',async () => {
  await db.doc(memberPath(uid('anonA'))).set({uid:uid('anonA'),spaceId:room,participantId:participant,displayName:'Synthetic adult',role:'student',status:'active',active:true,studentCode:personal,studentCodeKey:`${room}:${personal}`});
  const result=await joinAs('anonA');assert.equal(result.status,200);const value=await result.json();assert.equal(value.preview,false);assert.equal(value.approvalRequired,undefined);assert.equal(value.participantId,participant);
  note('B06',{legacyActiveMembershipPreserved:true});
});
for(const alias of ['anonB','feide','schooladmin'] as const) test(`B07 ${alias} cannot adopt already-linked identity before approval`,async () => {
  await grant('anonA');await seedAnswer();await pending(alias);
  assert.equal((await readAnswer(alias)).status,403);assert.equal((await rest(alias,answerPath)).status,403);
  assert.equal((await readAnswer('anonA')).status,200);
  if(alias==='feide') assert.equal((await identities.feide.user.getIdTokenResult()).signInProvider,'oidc.feide');
  note(`B07-${alias}`,{unapprovedApi:403,unapprovedRules:403,originalAccess:200,realFeide:false});
});
test('B08 teacher can approve emulated Feide identity without provider-specific branching',async () => {
  await grant('anonA');await grant('feide');await seedAnswer();
  assert.equal((await readAnswer('feide')).status,200);assert.equal((await db.doc(memberPath(uid('feide'))).get()).get('participantId'),participant);
  assert.equal((await db.doc(`users/${uid('feide')}`).get()).get('role'),'student');
  note('B08',{emulatedFeideApproved:true,realFeide:false});
});
test('B09 approval cannot be replayed',async () => {
  const value=await pending('anonA');assert.equal((await decision('teacher','anonA',value.approvalCode)).status,200);
  assert.equal((await decision('teacher','anonA',value.approvalCode)).status,409);
});
test('B10 expired request cannot be approved; explicit renewal replaces challenge',async () => {
  const first=await pending('anonA');await db.doc(memberPath(uid('anonA'))).update({approvalExpiresAt:Timestamp.fromMillis(0)});
  assert.equal((await decision('teacher','anonA',first.approvalCode)).status,409);
  const check=await joinAs('anonA',false);const expired=await check.json();assert.equal(expired.expired,true);assert.equal(expired.approvalCode,undefined);
  const renew=await join(await request('anonA',{code,studentCode:personal,confirm:true,renew:true}));assert.equal(renew.status,200);
  const value=await renew.json();assert.equal(value.expired,false);assert.equal((await decision('teacher','anonA',value.approvalCode)).status,200);
  note('B10',{expiredApproval:409,explicitRenewal:true});
});
test('B11 changed pupil code invalidates a pending request',async () => {
  await grant('anonA');const value=await pending('anonB');
  // Deterministic replacement through the emulator setup avoids probabilistic code equality.
  const current=await db.collection('spaceMembers').where('spaceId','==',room).get();
  for(const row of current.docs)if(row.get('status')==='active')await row.ref.update({studentCode:'NEW777',studentCodeKey:`${room}:NEW777`});
  assert.equal((await decision('teacher','anonB',value.approvalCode)).status,409);
  assert.equal((await db.doc(memberPath(uid('anonB'))).get()).get('active'),false);
});
test('B12 rejection denies rejoin and keeps answer unchanged',async () => {
  const value=await pending('anonA');await seedAnswer();const before=(await db.doc(answerPath).get()).data();
  assert.equal((await decision('teacher','anonA',value.approvalCode,'reject')).status,200);
  assert.equal((await joinAs('anonA')).status,403);assert.deepEqual((await db.doc(answerPath).get()).data(),before);
});
test('B13 archived room and inactive account membership cannot be approved back into use',async () => {
  const value=await pending('anonA');await db.doc(`spaces/${room}`).update({archived:true});
  assert.equal((await decision('teacher','anonA',value.approvalCode)).status,409);
  await db.doc(`spaces/${room}`).update({archived:false});await db.doc(memberPath(uid('anonA'))).update({status:'removed',active:false});
  assert.equal((await decision('teacher','anonA',value.approvalCode)).status,409);assert.equal((await joinAs('anonA')).status,403);
});
test('B14 removal includes pending requests, active accounts and original identity, preserving work',async () => {
  await grant('anonA');await grant('feide');const value=await pending('anonB');await seedAnswer();const before=(await db.doc(answerPath).get()).data();
  assert.equal((await remove()).status,200);
  for(const alias of ['anonA','anonB','feide']){
    assert.equal((await readAnswer(alias)).status,403);assert.equal((await rest(alias,answerPath)).status,403);assert.equal((await joinAs(alias)).status,403);
  }
  assert.equal((await decision('teacher','anonB',value.approvalCode)).status,409);assert.equal((await joinAs('fresh')).status,403);
  assert.deepEqual((await db.doc(answerPath).get()).data(),before);
  const members=await db.collection('spaceMembers').where('spaceId','==',room).get();assert.ok(members.docs.every(row=>row.get('status')==='removed'));
  note('B14',{pendingAndActiveRevoked:true,apiDenied:true,rulesDenied:true,answerPreserved:true});
});
for(let round=0;round<4;round++) test(`B15 concurrent new request/removal ${round+1}`,async () => {
  await grant('anonA');await seedAnswer();
  const results=await Promise.all([joinAs('anonB'),remove()]);assert.equal(results[1].status,200);assert.ok([200,403].includes(results[0].status));
  const rows=await db.collection('spaceMembers').where('spaceId','==',room).get();assert.ok(rows.docs.every(row=>row.get('status')==='removed'));
  assert.equal((await readAnswer('anonB')).status,403);note(`B15-${round+1}`,{request:results[0].status,removal:200,finalActiveOrPending:0});
});
for(let round=0;round<4;round++) test(`B16 concurrent approval/removal ${round+1}`,async () => {
  await grant('anonA');const value=await pending('anonB');await seedAnswer();
  const results=await Promise.all([decision('teacher','anonB',value.approvalCode),remove()]);assert.equal(results[1].status,200);assert.ok([200,409].includes(results[0].status));
  assert.equal((await readAnswer('anonB')).status,403);assert.equal((await rest('anonB',answerPath)).status,403);
  const rows=await db.collection('spaceMembers').where('spaceId','==',room).get();assert.ok(rows.docs.every(row=>row.get('status')==='removed'));
  note(`B16-${round+1}`,{approval:results[0].status,removal:200,finalActiveOrPending:0});
});
test('B17 UID overview continuity remains a separate documented issue',async () => {
  await grant('anonA');await grant('anonB');await seedAnswer();assert.equal((await readAnswer('anonB')).status,200);
  const result=await overview(await request('anonB',undefined,'GET','?source=spaceSubmissions'));assert.equal(result.status,200);assert.equal((await result.json()).documents.length,0);
  note('B17',{remainingIssue:true,overviewNotRefactored:true});
});
test('B18 code rotation still retains approved access; removal is the revocation operation',async () => {
  await grant('anonA');await seedAnswer();
  const result=await rotate(await request('teacher',{mode:'regenerate'}),{params:Promise.resolve({spaceId:room,memberId:`${room}_${uid('anonA')}`})});assert.equal(result.status,200);
  assert.equal((await readAnswer('anonA')).status,200);assert.equal((await remove()).status,200);assert.equal((await readAnswer('anonA')).status,403);
  note('B18',{rotationKeepsAccess:true,removalRevokes:true});
});
test('B19 platform administrator follows existing management authority; no self-approval by pupil',async () => {
  const value=await pending('anonA');assert.equal((await decision('anonA','anonA',value.approvalCode)).status,403);assert.equal((await decision('platform','anonA',value.approvalCode)).status,200);
});
test('B20 room owner cannot lock out management by requesting pupil access on the same account',async () => {
  assert.equal((await getSpaceAccess(db,room,uid('teacher'))).owner,true);
  const result=await joinAs('teacher');assert.equal(result.status,403);assert.equal((await result.json()).error,'manager_account');
  assert.equal((await db.doc(memberPath(uid('teacher'))).get()).exists,false);
  assert.equal((await getSpaceAccess(db,room,uid('teacher'))).owner,true);
  await grant('anonA');
  note('B20',{ownerRequestDenied:403,ownerAuthorityPreserved:true,canStillApprove:true});
});
test('B21 cancellation withdraws only the pending request and requires explicit renewal',async () => {
  const first=await pending('anonA');await seedAnswer();const before=(await db.doc(answerPath).get()).data();
  const result=await join(await request('anonA',{code,studentCode:personal,cancel:true}));assert.equal(result.status,200);assert.equal((await result.json()).cancelled,true);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).get('status'),'cancelled');
  assert.equal((await decision('teacher','anonA',first.approvalCode)).status,409);assert.equal((await readAnswer('anonA')).status,403);
  const read=await joinAs('anonA',false);assert.equal(read.status,200);assert.equal((await read.json()).requestState,'cancelled');
  assert.equal((await joinAs('anonA')).status,403);
  const renewed=await join(await request('anonA',{code,studentCode:personal,confirm:true,renew:true}));assert.equal(renewed.status,200);
  const value=await renewed.json();assert.equal((await readAnswer('anonA')).status,403);
  assert.equal((await decision('teacher','anonA',value.approvalCode)).status,200);
  assert.deepEqual((await db.doc(answerPath).get()).data(),before);
  note('B21',{cancelled:true,staleApproval:409,renewalNeedsApproval:true,answerPreserved:true});
});
test('B22 a rejected request stops waiting and may be explicitly submitted for new approval',async () => {
  const first=await pending('anonA');assert.equal((await decision('teacher','anonA',first.approvalCode,'reject')).status,200);
  const result=await joinAs('anonA',false);const value=await result.json();assert.equal(result.status,200);assert.equal(value.requestState,'rejected');assert.equal(value.approvalCode,undefined);
  assert.equal((await joinAs('anonA')).status,403);
  const renewed=await join(await request('anonA',{code,studentCode:personal,confirm:true,renew:true}));const next=await renewed.json();assert.equal(renewed.status,200);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).get('active'),false);assert.equal((await decision('teacher','anonA','000000')).status,400);
  assert.equal((await decision('teacher','anonA',next.approvalCode)).status,200);
  note('B22',{noOldCodeDisclosed:true,noImplicitReactivation:true,newTeacherApprovalRequired:true});
});
test('B23 replacing an unapproved request does not disclose name or approve the new target',async () => {
  await pending('anonA');await db.doc(memberPath(uid('anonA'))).update({approvalCode:'000000'});
  await db.doc(memberPath('other-participant')).set({spaceId:room,participantId:'other-participant',displayName:'Synthetic other',role:'student',studentCode:'ZZZZZ',studentCodeKey:`${room}:ZZZZZ`,active:true,status:'active'});
  const preview=await joinAs('anonA',false,'ZZZZZ');const value=await preview.json();assert.equal(preview.status,200);assert.equal(value.requestState,'replace');assert.equal(value.displayName,undefined);
  assert.equal((await db.doc(memberPath(uid('anonA'))).get()).get('participantId'),participant);
  const renewed=await join(await request('anonA',{code,studentCode:'ZZZZZ',confirm:true,renew:true}));const next=await renewed.json();assert.equal(renewed.status,200);
  const stored=(await db.doc(memberPath(uid('anonA'))).get()).data()!;assert.equal(stored.participantId,'other-participant');assert.equal(stored.active,false);assert.equal(stored.displayName,undefined);
  assert.equal((await decision('teacher','anonA','000000')).status,400);assert.equal((await decision('teacher','anonA',next.approvalCode)).status,200);
});
for(const status of ['removed','revoked','disabled','unknown'])test(`B24 explicit renewal never repairs ${status} membership`,async()=>{
  await pending('anonA');await db.doc(memberPath(uid('anonA'))).update({status,active:false});
  const before=(await db.doc(memberPath(uid('anonA'))).get()).data();
  const result=await join(await request('anonA',{code,studentCode:personal,confirm:true,renew:true}));assert.equal(result.status,403);
  assert.deepEqual((await db.doc(memberPath(uid('anonA'))).get()).data(),before);
});
test('B25 cancellation cannot revoke an already approved membership',async()=>{
  await grant('anonA');await seedAnswer();
  const result=await join(await request('anonA',{code,studentCode:personal,cancel:true}));assert.equal(result.status,409);
  assert.equal((await readAnswer('anonA')).status,200);assert.equal((await db.doc(memberPath(uid('anonA'))).get()).get('status'),'active');
});
for(let round=0;round<3;round++)test(`B26 concurrent cancellation/approval ${round+1}`,async()=>{
  const first=await pending('anonA');await seedAnswer();
  const [approval,cancel]=await Promise.all([decision('teacher','anonA',first.approvalCode),join(await request('anonA',{code,studentCode:personal,cancel:true}))]);
  assert.ok(approval.status===200&&cancel.status===409||approval.status===409&&cancel.status===200);
  const active=(await db.doc(memberPath(uid('anonA'))).get()).get('active');assert.equal((await readAnswer('anonA')).status,active?200:403);
  note(`B26-${round+1}`,{approval:approval.status,cancel:cancel.status,active});
});
