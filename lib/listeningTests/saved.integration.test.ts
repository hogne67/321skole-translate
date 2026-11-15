/* eslint-disable @typescript-eslint/no-explicit-any -- controlled Storage transport, never a cloud bucket */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { beginListeningSave, cancelListeningSave, finishListeningSave, ListeningSaveError, loadListeningTest, readListeningAudio } from "./saved.server";
import { listeningMetadata } from "./persistence";
import { exampleListeningTest } from "./fixtures";
import { GET as getRoute } from "../../app/api/listening-tests/saved/[id]/route";
import { loadMyContent } from "../contentFeed";

const project="demo-listening-beta-local";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8286","This test must only use the local emulator");
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,project);
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=`${project}.appspot.com`;
const app=initializeApp({projectId:project}),db=getFirestore(app),owner={uid:"owner",email_verified:true,auth_time:1000,firebase:{sign_in_provider:"password"}} as any;
let env:Awaited<ReturnType<typeof initializeTestEnvironment>>;
let files:Map<string,{metadata:any;bytes:Buffer}>;
const denied=(status:number)=>(error:unknown)=>error instanceof ListeningSaveError&&error.status===status;
const testData=listeningMetadata(exampleListeningTest);
const metadata=(bytes:Buffer)=>({contentType:"audio/mpeg",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
function fakeBucket(){
  const name=`${project}.appspot.com`;
  return {name,file:(path:string,options?:any)=>({name:path,
    createResumableUpload:async(config:any)=>{assert.equal(config.preconditionOpts.ifGenerationMatch,0);files.set(path,{metadata:{name:path,bucket:name,generation:"101",metageneration:"1",size:String(config.metadata.contentLength),...config.metadata},bytes:Buffer.alloc(0)});return [`https://storage.googleapis.com/upload/synthetic/${encodeURIComponent(path)}`];},
    getMetadata:async()=>{const file=files.get(path);if(!file)throw Object.assign(Error("missing"),{code:404});if(options?.generation)assert.equal(options.generation,file.metadata.generation);return [file.metadata];},
    download:async(range?:any)=>{const file=files.get(path)!;assert.equal(options?.generation,file.metadata.generation);return [range?file.bytes.subarray(range.start,range.end+1):file.bytes];},
    delete:async()=>{files.delete(path);},
  })};
}
async function pending(bytes=Buffer.from([1,2,3]),version?:{id:string;revision:string},options:Record<string,unknown>={}){
  const result=await beginListeningSave(owner,{test:testData,...version,audio:metadata(bytes),...options},"https://synthetic.invalid");
  const file=[...files.values()].at(-1)!;file.bytes=bytes;return result;
}
before(async()=>{env=await initializeTestEnvironment({projectId:project,firestore:{host:"127.0.0.1",port:8286,rules:readFileSync("firestore.rules","utf8")}});});
beforeEach(async()=>{
  await env.clearFirestore();await db.doc("users/owner").set({role:"teacher"});await db.doc("users/peer").set({role:"teacher"});
  files=new Map();mock.method(getStorage(app),"bucket",()=>fakeBucket() as never);
  mock.method(getAuth(app),"verifyIdToken",async (token:string)=>{if(token==="owner"||token==="peer")return {...owner,uid:token};throw Object.assign(Error("invalid"),{code:"auth/invalid-id-token"});});
});
afterEach(()=>mock.restoreAll());
after(async()=>{await env?.cleanup();await deleteApp(app);});

test("save and reopen preserve private teacher content, all tasks and version-bound audio",async()=>{
  const request=await pending(),saved=await finishListeningSave(owner,request.id,request.saveId);
  const data=(await db.doc(`lessons/${saved.id}`).get()).data()!;
  assert.equal(data.beta,true);assert.equal(data.visibility,"private");assert.equal(data.lessonType,"listening_test");assert.equal(data.ownerId,"owner");
  assert.equal(data.listeningTest.script,exampleListeningTest.script);assert.equal(data.listeningTest.tasks.length,6);assert.equal(data.listeningTest.audioDataUrl,undefined);assert.ok(JSON.stringify(data).length<64000);
  assert.equal(data.answers,undefined);assert.equal(data.result,undefined);
  const opened=await loadListeningTest("owner",saved.id);assert.equal(opened.audio?.size,3);assert.equal(opened.revision,request.saveId);
  const audio=await readListeningAudio("owner",saved.id,new Request("https://synthetic.invalid",{headers:{range:"bytes=0-2","if-match":"\"101\""}}));
  assert.equal(audio.status,206);assert.equal(audio.headers.get("content-range"),"bytes 0-2/3");assert.equal(audio.headers.get("cache-control"),"private,no-store");assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[1,2,3]);
  assert.equal((await getDoc(doc(env.authenticatedContext("owner").firestore(),"lessons",saved.id))).exists(),true);
  await assert.rejects(getDoc(doc(env.authenticatedContext("peer").firestore(),"lessons",saved.id)));
  await assert.rejects(getDoc(doc(env.authenticatedContext("owner").firestore(),"listeningTestSaves",request.saveId)));
  const feed=await loadMyContent({db:env.authenticatedContext("owner").firestore() as unknown as Parameters<typeof loadMyContent>[0]["db"],uid:"owner",mode:"teacher",locale:"nb"});
  const item=feed.items.find(item=>item.type==="lesson"&&item.id===saved.id);
  assert.equal(item?.href,`/nb/tools/listening-tests?edit=${saved.id}`);assert.ok(item?.meta?.includes("listening_test"));
});
test("private load, edits, audio and upload completion reject other owners",async()=>{
  const request=await pending();await finishListeningSave(owner,request.id,request.saveId);
  await assert.rejects(loadListeningTest("peer",request.id),denied(404));
  await assert.rejects(beginListeningSave({...owner,uid:"peer"},{id:request.id,revision:request.saveId,test:testData}),denied(404));
  await assert.rejects(finishListeningSave({...owner,uid:"peer"},request.id,request.saveId),denied(404));
  await assert.rejects(readListeningAudio("peer",request.id,new Request("https://synthetic.invalid")),denied(404));
  const requestFor=(token?:string)=>new Request("https://synthetic.invalid",{headers:token?{authorization:`Bearer ${token}`}:{}});
  assert.equal((await getRoute(requestFor(),{params:Promise.resolve({id:request.id})})).status,401);
  assert.equal((await getRoute(requestFor("invalid"),{params:Promise.resolve({id:request.id})})).status,401);
  assert.equal((await getRoute(requestFor("peer"),{params:Promise.resolve({id:request.id})})).status,404);
  assert.equal((await getRoute(requestFor("owner"),{params:Promise.resolve({id:request.id})})).status,200);
});
test("invalid teacher packets and audio descriptors are rejected before allocating uploads",async()=>{
  for(const body of [null,{test:{...testData,audioDataUrl:"data:audio/mpeg;base64,AAAA"}},{test:{...testData,tasks:[]}},{test:testData,audio:{...metadata(Buffer.from([1])),contentType:"text/html"}},{test:testData,audio:{...metadata(Buffer.from([1])),size:9*1024*1024}}]){
    await assert.rejects(beginListeningSave(owner,body),denied(400));
  }
  assert.equal(files.size,0);
});
test("uploaded size, type, privacy, identity and SHA-256 must all match before a save commits",async()=>{
  const changes=[{size:"99"},{contentType:"audio/wav"},{cacheControl:"public"},{name:"other"},{metadata:{firebaseStorageDownloadTokens:"forbidden"}},{acl:[{entity:"allUsers"}]}];
  for(const change of changes){const request=await pending(),file=[...files.values()].at(-1)!;Object.assign(file.metadata,change);await assert.rejects(finishListeningSave(owner,request.id,request.saveId),denied(503));assert.equal((await db.doc(`lessons/${request.id}`).get()).exists,false);}
  const request=await pending(),file=[...files.values()].at(-1)!;file.bytes=Buffer.from([3,2,1]);await assert.rejects(finishListeningSave(owner,request.id,request.saveId),denied(400));
});
test("updates keep the same content id and reject concurrent stale revisions",async()=>{
  const original=await pending();await finishListeningSave(owner,original.id,original.saveId);
  const version={id:original.id,revision:original.saveId},first=await pending(Buffer.from([4]),version),second=await pending(Buffer.from([5]),version);
  await finishListeningSave(owner,first.id,first.saveId);await assert.rejects(finishListeningSave(owner,second.id,second.saveId),denied(409));
  assert.equal((await loadListeningTest("owner",original.id)).revision,first.saveId);assert.equal((await db.collection("lessons").get()).size,1);
  assert.deepEqual(await finishListeningSave(owner,first.id,first.saveId),{id:first.id,revision:first.saveId});
});
test("cancelled, expired and revoked-account saves cannot commit; completed saves survive cancellation",async()=>{
  const cancel=await pending();await cancelListeningSave("owner",cancel.id,cancel.saveId);await assert.rejects(finishListeningSave(owner,cancel.id,cancel.saveId),denied(410));
  const expired=await pending();await db.doc(`listeningTestSaves/${expired.saveId}`).update({createdAt:0});await assert.rejects(finishListeningSave(owner,expired.id,expired.saveId),denied(410));
  const complete=await pending();await finishListeningSave(owner,complete.id,complete.saveId);await cancelListeningSave("owner",complete.id,complete.saveId);assert.ok(await loadListeningTest("owner",complete.id));
  const disabled=await pending();await db.doc("users/owner").update({disabled:true});await assert.rejects(finishListeningSave(owner,disabled.id,disabled.saveId),/Account disabled/);
});
test("an 8 MB recording is loaded in bounded chunks; changed file versions and foreign bindings fail",async()=>{
  const request=await pending(Buffer.alloc(8*1024*1024,7));await finishListeningSave(owner,request.id,request.saveId);
  const part=await readListeningAudio("owner",request.id,new Request("https://synthetic.invalid",{headers:{range:"bytes=0-8388607"}}));assert.equal((await part.arrayBuffer()).byteLength,1024*1024);assert.equal(part.headers.get("content-range"),"bytes 0-1048575/8388608");
  await assert.rejects(readListeningAudio("owner",request.id,new Request("https://synthetic.invalid",{headers:{"if-match":"\"102\""}})),denied(412));
  await db.doc(`lessons/${request.id}`).update({"listeningAudio.storagePath":"private-listening-tests/peer/other/foreign"});await assert.rejects(loadListeningTest("owner",request.id),denied(503));
});
