import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { Readable } from "node:stream";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { POST as audio } from "../../../app/api/teacher/audio-url/route";
import { GET as image } from "../../../app/api/space-files/legacy-image/route";
import { safePdfImage } from "../../pdf/safeImage.server";
import { readLegacyFile } from "../legacySpaceFile.server";

const project="demo-phase2-local", bucketName=`${project}.appspot.com`;
const app=initializeApp({projectId:project}), db=getFirestore(app), bucket=getStorage(app).bucket(bucketName);
const audioPath="spaces/room/assignments/task/submissions/pupil/audio/synthetic.wav";
const imagePath="writing-print-images/pupil/room/writing/synthetic.png", boardPath="board-images/owner/room/synthetic.png";
const sub="spaces/room/lessons/task/submissions/room_task_pupil", writing="spaces/room/writingActivities/writing/submissions/room_writing_pupil";
const bytes=Buffer.alloc(1024*1024+17,29);
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=","base64");
const url=(path:string)=>`https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-only`;
before(()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8287");
 assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,"127.0.0.1:9297");
});
beforeEach(async()=>{
 for(const [uid,role] of Object.entries({pupil:"student",peer:"student",owner:"teacher",co:"teacher",substitute:"teacher",foreign:"teacher",schooladmin:"school_admin",admin:"admin"}))await db.doc(`users/${uid}`).set({role});
 await db.doc("spaces/room").set({ownerId:"owner"});
 for(const uid of ["pupil","peer","co","substitute"])await db.doc(`spaceMembers/room_${uid}`).set({uid,participantId:uid,spaceId:"room",status:"active",role:["co","substitute"].includes(uid)?"teacher":"student"});
 await db.doc("spaces/room/lessons/task").set({title:"Synthetic"});
 await db.doc("spaces/room/writingActivities/writing").set({title:"Synthetic"});
 await db.doc(sub).set({uid:"pupil",participantId:"pupil",spaceId:"room",assignmentId:"task",audioReading:{storagePath:audioPath}});
 await db.doc(writing).set({uid:"pupil",studentUid:"pupil",participantId:"pupil",activityId:"writing",printProfile:{imageUrl:url(imagePath)}});
 await db.doc("spaces/room/board/state").set({data:{imageUrl:url(boardPath)}});
 await bucket.file(audioPath).save(bytes,{contentType:"audio/wav"});
 for(const path of [imagePath,boardPath])await bucket.file(path).save(png,{contentType:"image/png"});
 mock.method(getAuth(app),"verifyIdToken",async(token:string)=>({uid:token,auth_time:2000}) as never);
});
afterEach(()=>mock.restoreAll());
after(async()=>{await deleteApp(app);});
async function request(uid:string|null,kind:"audio"|"image",path=kind==="audio"?audioPath:imagePath,headers:Record<string,string>={}){
 const h={...(uid?{Authorization:`Bearer ${uid}`}:{ }),...headers};
 return kind==="audio"?audio(new Request("http://127.0.0.1/api/teacher/audio-url",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({storagePath:path,mode:"bytes"})})):image(new Request(`http://127.0.0.1/api/space-files/legacy-image?path=${encodeURIComponent(path)}`,{headers:h}));
}
for(const actor of ["pupil","owner","co","substitute","admin"])test(`${actor}: canonical audio and image allowed`,async()=>{
 const a=await request(actor,"audio");assert.equal(a.status,206);assert.deepEqual(Buffer.from(await a.arrayBuffer()),bytes.subarray(0,1024*1024));
 const i=await request(actor,"image");assert.equal(i.status,200);assert.deepEqual(Buffer.from(await i.arrayBuffer()),png);
});
for(const actor of [null,"peer","foreign","schooladmin"])test(`${actor??"anonymous"}: individual audio and image denied`,async()=>{
 for(const kind of ["audio","image"] as const)assert.equal((await request(actor,kind)).status,actor?403:401);
});
test("linked participant can read exact historical participant-bound file",async()=>{
 await db.doc("users/linked").set({role:"student"});await db.doc("spaceMembers/room_linked").set({uid:"linked",participantId:"pupil",status:"active",role:"student"});
 assert.equal((await request("linked","audio")).status,206);
});
test("removed, archived or globally disabled participants denied",async()=>{
 for(const flags of [{status:"removed"},{status:" archived "},{status:"active",active:false}]){await db.doc("spaceMembers/room_pupil").update(flags);assert.equal((await request("pupil","audio")).status,403);}
 await db.doc("spaceMembers/room_pupil").set({uid:"pupil",participantId:"pupil",status:"active",role:"student"});
 await db.doc("users/pupil").update({disabled:true});assert.equal((await request("pupil","audio")).status,403);
});
test("orphan and stale mirror do not authorize a stored audio file",async()=>{
 await db.doc(sub).delete();await db.doc("spaceSubmissions/room_task_pupil").set({uid:"pupil",audioReading:{storagePath:audioPath}});
 assert.equal((await request("owner","audio")).status,403);assert.equal((await bucket.file(audioPath).exists())[0],true);
});
test("missing activity and mismatched canonical identity denied",async()=>{
 await db.doc(sub).update({participantId:"peer"});assert.equal((await request("owner","audio")).status,403);
 await db.doc("spaces/room/lessons/task").delete();assert.equal((await request("owner","audio")).status,404);
});
test("canonical podcast dotted segment ID and old audioStoragePath are supported",async()=>{
 await db.doc(sub).set({uid:"pupil",participantId:"pupil",podcastWorkshop:{productionSegments:{"part.one":{voice:{audioStoragePath:audioPath}}}}});
 assert.equal((await request("pupil","audio")).status,206);
});
test("detached images are denied by image API and PDF path",async()=>{
 await db.doc(writing).update({"printProfile.imageUrl":""});assert.equal((await request("owner","image")).status,403);
 await assert.rejects(safePdfImage(url(imagePath),"owner"),(e:unknown)=>(e as {status:number}).status===403);
});
test("attached shared board retains member access; old board copy denied",async()=>{
 assert.equal((await request("peer","image",boardPath)).status,200);
 await db.doc("spaces/room/board/state").update({"data.imageUrl":""});assert.equal((await request("peer","image",boardPath)).status,403);
});
test("explicit bucket mismatch fails closed without default bucket fallback",async()=>{
 const original=process.env.FIREBASE_STORAGE_BUCKET;process.env.FIREBASE_STORAGE_BUCKET="unrelated.invalid";
 try{assert.equal((await request("owner","image")).status,503);}finally{process.env.FIREBASE_STORAGE_BUCKET=original;}
});
test("strict paths and invalid ranges rejected",async()=>{
 for(const path of [audioPath.replace("/room/","//room/"),audioPath.replace("task",".."),audioPath.replace("task","ta\\sk")])assert.equal((await request("owner","audio",path)).status,400);
 assert.equal((await request("owner","audio",audioPath,{Range:"bytes=90000000-"})).status,416);
});
test("range version is returned, pinned and rejects stale If-Match",async()=>{
 const first=await request("pupil","audio",audioPath,{Range:"bytes=0-1048575"});const tag=first.headers.get("etag")!;assert.ok(tag);
 const second=await request("pupil","audio",audioPath,{Range:"bytes=1048576-", "If-Match":tag});assert.equal(second.status,206);assert.deepEqual(Buffer.from(await second.arrayBuffer()),bytes.subarray(1048576));
 await bucket.file(audioPath).save(bytes,{contentType:"audio/wav"});assert.equal((await request("pupil","audio",audioPath,{"If-Match":tag})).status,412);
});
test("membership removal during read prevents bytes from being returned",async()=>{
 const file=bucket.file(audioPath);mock.method(Object.getPrototypeOf(file),"createReadStream",()=>Readable.from((async function*(){await db.doc("spaceMembers/room_pupil").update({status:"removed"});yield bytes.subarray(0,1024*1024);})()));
 assert.equal((await request("pupil","audio")).status,403);
});
test("canonical delete/recreate during read prevents release",async()=>{
 const file=bucket.file(audioPath);mock.method(Object.getPrototypeOf(file),"createReadStream",()=>Readable.from((async function*(){const saved=(await db.doc(sub).get()).data()!;await db.doc(sub).delete();await db.doc(sub).set(saved);yield bytes.subarray(0,1024*1024);})()));
 assert.equal((await request("pupil","audio")).status,403);
});
test("truncated file stream rejected without partial success",async()=>{
 mock.method(Object.getPrototypeOf(bucket.file(audioPath)),"createReadStream",()=>Readable.from([Buffer.from([1])]));assert.equal((await request("pupil","audio")).status,409);
});
test("synthetic canonical documents and objects unchanged by successful reads",async()=>{
 const before=(await db.doc(sub).get()).data(), [meta]=await bucket.file(audioPath).getMetadata();
 await request("owner","audio");await request("pupil","image");await readLegacyFile("owner",audioPath,"audio",null);
 assert.deepEqual((await db.doc(sub).get()).data(),before);const [after]=await bucket.file(audioPath).getMetadata();assert.equal(after.generation,meta.generation);assert.equal(after.metageneration,meta.metageneration);
});
test("ambiguous canonical and bare-ID references fail closed",async()=>{
 await db.doc("spaces/room/lessons/task/submissions/pupil").set((await db.doc(sub).get()).data()!);
 try{assert.equal((await request("owner","audio")).status,403);}finally{await db.doc("spaces/room/lessons/task/submissions/pupil").delete();}
});
test("metadata deadline prevents an unbounded legacy read",async()=>{
 mock.method(Object.getPrototypeOf(bucket.file(audioPath)),"getMetadata",()=>new Promise(()=>{}));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30);
 try{await assert.rejects(readLegacyFile("owner",audioPath,"audio",null,null,false,controller.signal),(e:unknown)=>(e as {status:number}).status===504);}finally{clearTimeout(timer);}
});
test("stream deadline destroys the legacy stream",async()=>{
 const stream=new Readable({read(){}});
 mock.method(Object.getPrototypeOf(bucket.file(audioPath)),"createReadStream",()=>stream);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),200);
 try{await assert.rejects(readLegacyFile("owner",audioPath,"audio",null,null,false,controller.signal),(e:unknown)=>(e as {status:number}).status===504);assert.equal(stream.destroyed,true);}finally{clearTimeout(timer);}
});
test("existing user-triggered delete requires an attached and authorized file",async()=>{
 const remove=(uid:string)=>audio(new Request("http://127.0.0.1/api/teacher/audio-url",{method:"POST",headers:{Authorization:`Bearer ${uid}`,"Content-Type":"application/json"},body:JSON.stringify({storagePath:audioPath,mode:"delete"})}));
 assert.equal((await remove("peer")).status,403);assert.equal((await bucket.file(audioPath).exists())[0],true);
 await db.doc(sub).update({audioReading:{}});assert.equal((await remove("pupil")).status,403);assert.equal((await bucket.file(audioPath).exists())[0],true);
 await db.doc(sub).update({audioReading:{storagePath:audioPath}});assert.equal((await remove("pupil")).status,200);assert.equal((await bucket.file(audioPath).exists())[0],false);
});
