import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";

const project="demo-phase2-local", app=initializeApp({projectId:project}), db=getFirestore(app), auth=getAuth(app);
const uid=(role:string)=>`planner-final-${role}`;
const roles=["anonymous","teacher","student","school_admin","admin","disabled"];
const tokens=new Map<string,string>();
const firestoreOrigin="http://127.0.0.1:8287", authOrigin="http://127.0.0.1:9097";
const restRoot=`${firestoreOrigin}/v1/projects/${project}/databases/(default)/documents`;
const original="planners/final-plan", nested="planners/final-plan/sections/one";
const lessonRoot="spaces/final-room/lessons", pupil=uid("student");
const submission=`${lessonRoot}/ordinary/submissions/final-room_ordinary_final-student`;
let env:RulesTestEnvironment, baselineRead=false, baselineList=false, baselineWrite=false, baselineRestRead=false;
let plannerBefore:unknown, nestedBefore:unknown;
before(async()=>{
 assert.equal(process.env.GOOGLE_CLOUD_PROJECT,project);
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8287");assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,"127.0.0.1:9097");
 assert.ok(process.env.PLANNER_BASE_RULES?.includes("integration-review-20261025"));
 for(const role of roles.filter(role=>role!=="anonymous")){
   const actor=uid(role);
   await db.doc(`users/${actor}`).set({role:role==="disabled"?"teacher":role,disabled:role==="disabled"});
   await auth.createUser({uid:actor});
   const custom=await auth.createCustomToken(actor);
   const response=await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic-only`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:custom,returnSecureToken:true})});
   assert.equal(response.status,200);const body=await response.json();tokens.set(role,body.idToken);
 }
 const plan={ownerUid:uid("teacher"),status:"draft",frame:{schoolYear:"synthetic"},curriculum:{},document:{text:"Synthetic plan"},createdAt:AdminTimestamp.now(),updatedAt:AdminTimestamp.now()};
 await db.doc(original).set(plan);await db.doc(nested).set({text:"Synthetic nested source"});
 plannerBefore=(await db.doc(original).get()).data();nestedBefore=(await db.doc(nested).get()).data();
 await db.doc("spaces/final-room").set({ownerId:uid("teacher"),title:"Synthetic room",isOpen:true});
 await db.doc(`spaceMembers/final-room_${pupil}`).set({uid:pupil,spaceId:"final-room",participantId:"final-student",role:"student",status:"active"});
 await db.doc(`${lessonRoot}/ordinary`).set({title:"Ordinary task",sourceType:"lesson",sourceId:"synthetic-lesson"});
 await db.doc(`${lessonRoot}/historical-copy`).set({title:"Historical synthetic copy",sourceType:"planner",lessonType:"planner",taskType:"planner",contentType:"planner",sourceId:"final-plan",planner:{plannerId:"final-plan"},content:{text:"Independent synthetic teaching text"}});
 await db.doc(`${lessonRoot}/untyped`).set({title:"Ordinary untyped task",text:"Synthetic only"});
 await db.doc(submission).set({uid:pupil,participantId:"final-student",spaceId:"final-room",assignmentId:"ordinary",answers:{one:"Synthetic answer"},status:"draft"});
 // Positive control proves that owner/list access exists on the exact selected base before the bounded change.
 const baseline=await initializeTestEnvironment({projectId:project,firestore:{host:"127.0.0.1",port:8287,rules:readFileSync(process.env.PLANNER_BASE_RULES!,"utf8")}});
 try {
   const teacher=baseline.authenticatedContext(uid("teacher")).firestore();
   assert.equal((await assertSucceeds(getDoc(doc(teacher,original)))).exists(),true);baselineRead=true;
   assert.equal((await assertSucceeds(getDocs(query(collection(teacher,"planners"),where("ownerUid","==",uid("teacher")))))).size,1);baselineList=true;
   const control=doc(teacher,"planners/control-before"),time=Timestamp.now();
   await assertSucceeds(setDoc(control,{ownerUid:uid("teacher"),status:"draft",frame:{},curriculum:{},document:{},createdAt:time,updatedAt:time}));
   await assertSucceeds(updateDoc(control,{document:{text:"Synthetic control"}}));await assertSucceeds(deleteDoc(control));baselineWrite=true;
   const response=await fetch(`${restRoot}/${original}`,{headers:{Authorization:`Bearer ${tokens.get("teacher")}`}});
   assert.equal(response.status,200);assert.equal((await response.json()).fields.ownerUid.stringValue,uid("teacher"));baselineRestRead=true;
 }finally{await baseline.cleanup();}
 env=await initializeTestEnvironment({projectId:project,firestore:{host:"127.0.0.1",port:8287,rules:readFileSync("firestore.rules","utf8")}});
});
after(async()=>{await env?.cleanup();await deleteApp(app);});

test("positive base control: SDK read/query/write and actual-token REST worked before pause",()=>{assert.ok(baselineRead&&baselineList&&baselineWrite&&baselineRestRead);});
for(const role of roles)test(`${role}: SDK denies original, nested, list, create, update and delete`,async()=>{
 const context=role==="anonymous"?env.unauthenticatedContext():env.authenticatedContext(uid(role)), fs=context.firestore();
 for(const path of [original,nested]){
   await assertFails(getDoc(doc(fs,path)));await assertFails(updateDoc(doc(fs,path),{text:"Not stored"}));await assertFails(deleteDoc(doc(fs,path)));
 }
 await assertFails(getDocs(collection(fs,"planners")));
 await assertFails(getDocs(query(collection(fs,"planners"),where("ownerUid","==",uid(role)))));
 await assertFails(getDocs(collection(fs,"planners/final-plan/sections")));
 const valid={ownerUid:uid(role),status:"draft",frame:{},curriculum:{},document:{},createdAt:Timestamp.now(),updatedAt:Timestamp.now()};
 await assertFails(setDoc(doc(fs,`planners/new-${role}`),valid));
 await assertFails(setDoc(doc(fs,`planners/final-plan/sections/new-${role}`),{text:"Not stored"}));
});
for(const role of roles)test(`${role}: actual-token REST denies reads, query and mutations`,async()=>{
 const authorization:Record<string,string>=tokens.has(role)?{Authorization:`Bearer ${tokens.get(role)}`}:{ };
 const headers={"Content-Type":"application/json",...authorization};
 const time=new Date().toISOString(),empty={mapValue:{fields:{}}};
 const valid={fields:{
   ownerUid:{stringValue:uid(role)},status:{stringValue:"draft"},
   frame:empty,curriculum:empty,document:empty,
   createdAt:{timestampValue:time},updatedAt:{timestampValue:time},
 }};
 const actions:[string,string,unknown?][]=[
   ["GET",original],["GET",nested],["GET","planners?pageSize=10"],["PATCH",original+"?updateMask.fieldPaths=document",{fields:{document:{mapValue:{fields:{text:{stringValue:"Not stored"}}}}}}],
   ["POST",`planners?documentId=rest-new-${role}`,valid],["DELETE",original],
 ];
 for(const [method,path,body] of actions){const response=await fetch(`${restRoot}/${path}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,403,`${role}/${method}/${path}`);assert.equal((await response.json()).error.status,"PERMISSION_DENIED");}
});
test("ordinary and historical Space tasks remain readable and listable for teacher and pupil",async()=>{
 for(const role of ["teacher","student"]){
   const fs=env.authenticatedContext(uid(role)).firestore();
   for(const id of ["ordinary","historical-copy","untyped"])assert.equal((await assertSucceeds(getDoc(doc(fs,`${lessonRoot}/${id}`)))).exists(),true);
   assert.equal((await assertSucceeds(getDocs(collection(fs,lessonRoot)))).size,3);
 }
});
test("existing teacher edit/copy and pupil submission flow remain permitted",async()=>{
 const teacher=env.authenticatedContext(uid("teacher")).firestore(), student=env.authenticatedContext(pupil).firestore();
 await assertSucceeds(updateDoc(doc(teacher,`${lessonRoot}/ordinary`),{title:"Edited synthetic task"}));
 await assertSucceeds(setDoc(doc(teacher,`${lessonRoot}/ordinary-copy`),{title:"Copied synthetic teaching",sourceType:"lesson"}));
 await assertSucceeds(getDoc(doc(student,submission)));
 await assertSucceeds(updateDoc(doc(student,submission),{answers:{one:"Updated synthetic answer"}}));
 await assertSucceeds(getDoc(doc(teacher,submission)));
});
test("changing historical type markers never opens the original Planner",async()=>{
 const teacher=env.authenticatedContext(uid("teacher")).firestore(), student=env.authenticatedContext(pupil).firestore();
 for(const sourceType of ["lesson","planner"]){
   await assertSucceeds(updateDoc(doc(teacher,`${lessonRoot}/historical-copy`),{sourceType}));
   assert.equal((await assertSucceeds(getDoc(doc(student,`${lessonRoot}/historical-copy`)))).get("content.text"),"Independent synthetic teaching text");
   await assertFails(getDoc(doc(teacher,original)));await assertFails(getDoc(doc(student,original)));
 }
});
test("private-file metadata and product analytics remain denied",async()=>{
 await db.doc("privateSpaceFiles/final-synthetic-asset").set({status:"ready",marker:"Unchanged"});
 for(const role of ["teacher","student","school_admin","admin"]){
   const fs=env.authenticatedContext(uid(role)).firestore();
   await assertFails(getDoc(doc(fs,"privateSpaceFiles/final-synthetic-asset")));
   await assertFails(setDoc(doc(fs,`analyticsEvents/planner-final-${role}`),{event:"Not stored"}));
 }
});
test("Planner originals, nested data and membership remain unchanged after all denied requests",async()=>{
 assert.deepEqual((await db.doc(original).get()).data(),plannerBefore);assert.deepEqual((await db.doc(nested).get()).data(),nestedBefore);
 assert.equal((await db.collection("planners").get()).size,1);
 assert.equal((await db.collection("planners/final-plan/sections").get()).size,1);
 assert.deepEqual((await db.doc(`spaceMembers/final-room_${pupil}`).get()).data(),{uid:pupil,spaceId:"final-room",participantId:"final-student",role:"student",status:"active"});
});
