import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, getBytes, getMetadata, uploadBytes, deleteObject } from "firebase/storage";
const project="demo-phase2-local", bucket=`${project}.appspot.com`;
const app=initializeApp({projectId:project}), db=getFirestore(app);
const object="private-space-files/rules-room/synthetic-asset", staging="private-space-uploads/rules-room/synthetic-upload";
const legacy=["spaces/rules-room/assignments/task/submissions/rules-student/audio/test.wav","writing-print-images/rules-student/rules-room/writing/test.png","board-images/rules-teacher/rules-room/test.png"];
let env:RulesTestEnvironment;
before(async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8287");
 env=await initializeTestEnvironment({projectId:project,firestore:{host:"127.0.0.1",port:8287,rules:readFileSync("firestore.rules","utf8")},storage:{host:"127.0.0.1",port:9297,rules:readFileSync("storage.rules","utf8")}});
 await db.doc("privateSpaceFiles/synthetic-asset").set({status:"ready",storagePath:object,marker:"unchanged"});
 for(const role of ["teacher","student","school_admin","admin"])await db.doc(`users/rules-${role}`).set({role});
 for(const path of [object,staging,...legacy,"covers/rules-teacher/control.png"])await getStorage(app).bucket(bucket).file(path).save(Buffer.from([1,2,3]),{contentType:"image/png"});
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
for(const role of ["anonymous","teacher","student","school_admin","admin"])test(`${role}: direct private Firestore and Storage operations denied`,async()=>{
 const context=role==="anonymous"?env.unauthenticatedContext():env.authenticatedContext(`rules-${role}`);
 const fs=context.firestore(), storage=context.storage(`gs://${bucket}`);
 const file=doc(fs,"privateSpaceFiles/synthetic-asset");
 for(const operation of [()=>getDoc(file),()=>getDocs(collection(fs,"privateSpaceFiles")),()=>setDoc(doc(fs,"privateSpaceFiles/new-asset"),{marker:"synthetic"}),()=>updateDoc(file,{marker:"changed"}),()=>deleteDoc(file)])await assertFails(operation());
 for(const path of [object,staging,...legacy])for(const operation of [()=>getBytes(ref(storage,path)),()=>getMetadata(ref(storage,path)),()=>uploadBytes(ref(storage,path),new Uint8Array([4])),()=>deleteObject(ref(storage,path))])await assertFails(operation());
 await assertFails(setDoc(doc(fs,`analyticsEvents/blocked-${role}`),{event:"synthetic"}));
});
test("public control exists and remains readable; denied writes preserve private data",async()=>{
 const storage=env.unauthenticatedContext().storage(`gs://${bucket}`);
 assert.equal((await assertSucceeds(getBytes(ref(storage,"covers/rules-teacher/control.png")))).byteLength,3);
 assert.equal((await db.doc("privateSpaceFiles/synthetic-asset").get()).get("marker"),"unchanged");
 for(const path of [object,staging,...legacy])assert.deepEqual((await getStorage(app).bucket(bucket).file(path).download())[0],Buffer.from([1,2,3]));
});
