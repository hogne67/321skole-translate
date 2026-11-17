import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdmin, getAdminApp } from "@/lib/firebaseAdmin";
import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { needsEmailVerification } from "@/lib/emailVerificationGuard";
import { getEffectiveStudentModeForAccount } from "@/lib/studentAccessMode.server";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";
import { fileRange } from "@/lib/spaceFiles";
import { LISTENING_SAVE_LIFETIME_MS, listeningAudioPath, parseListeningAudioInput, parseListeningMetadata, parseSavedListeningAudio, validListeningId, type ListeningAudioInput, type SavedListeningAudio } from "./persistence";
import type { ListeningTest } from "./types";

export class ListeningSaveError extends Error { constructor(public status:number,message:string){super(message);} }
function fail(status:number,message:string):never { throw new ListeningSaveError(status,message); }
export async function listeningAccount(req:Request) {
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)fail(401,"Unauthorized");
  const decoded=await getAdmin().auth.verifyIdToken(token,true);
  if(decoded.firebase?.sign_in_provider==="anonymous")fail(401,"Sign in to save tests");
  if(needsEmailVerification(decoded))fail(403,"Email verification required");
  const profile=(await getAdmin().db.doc(`users/${decoded.uid}`).get()).data()??{};
  const mode=await getEffectiveStudentModeForAccount(profile,decoded);
  if(isSpaceOnlyStudent({...profile,studentAccessMode:mode}))fail(403,"Individual tools unavailable for this account");
  return decoded;
}
export function listeningSaveFailure(error:unknown) {
  const status=error instanceof ListeningSaveError?error.status:accountErrorStatus(error)??(error instanceof SyntaxError?400:503);
  return Response.json({error:error instanceof ListeningSaveError?error.message:"Listening test unavailable"},{status,headers:{"Cache-Control":"private,no-store"}});
}
function bucket() {
  const project=getAdminApp().options.projectId,name=process.env.FIREBASE_STORAGE_BUCKET||process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET||"";
  if(!project||![`${project}.appspot.com`,`${project}.firebasestorage.app`].includes(name))fail(503,"File storage unavailable");
  return getAdmin().storage.bucket(name);
}
type SaveRecord={ownerId:string;lessonId:string;revision:string|null;test:ListeningTest;audio:ListeningAudioInput|null;clipAudios?:Record<string,ListeningAudioInput>;createdAt:number;status:"pending"|"complete"|"cancelled"};
function assertOwner(data:Record<string,unknown>|undefined,uid:string) {
  if(!data||data.ownerId!==uid||data.lessonType!=="listening_test"||data.deletedAt)fail(404,"Test not found");
  return data;
}
export async function ownedListeningTest(uid:string,id:string) {
  if(!validListeningId(id))fail(400,"Invalid test id");
  const ref=getAdmin().db.doc(`lessons/${id}`);
  const data=assertOwner((await ref.get()).data(),uid);
  return {ref,data};
}
export async function beginListeningSave(decoded:DecodedIdToken,body:unknown,origin?:string) {
  if(!body||typeof body!=="object")fail(400,"Invalid request");
  const value=body as Record<string,unknown>,test=parseListeningMetadata(value.test);
  if(!test)fail(400,"Invalid test");
  const audio=value.audio==null?null:parseListeningAudioInput(value.audio);
  if(value.audio!=null&&!audio)fail(400,"Invalid audio");
  const clipAudios:Record<string,ListeningAudioInput>={};
  if(value.clipAudios!==undefined){
    if(!value.clipAudios||typeof value.clipAudios!=="object"||Array.isArray(value.clipAudios)||test.level!=="A1Start")fail(400,"Invalid clip audio");
    for(const [key,raw]of Object.entries(value.clipAudios)){
      const descriptor=parseListeningAudioInput(raw);
      if(!validListeningId(key)||!test.clips?.some(clip=>clip.taskId===key)||!descriptor||descriptor.size>2*1024*1024)fail(400,"Invalid clip audio");
      clipAudios[key]=descriptor;
    }
  }
  if(test.level==="A1Start"&&audio)fail(400,"Use separate audio for each task");
  const {db}=getAdmin();let id:string;
  let revision:string|null=null;
  if(value.id!=null){
    if(!validListeningId(value.id))fail(400,"Invalid test id");
    const {data}=await ownedListeningTest(decoded.uid,value.id);
    if(typeof value.revision!=="string"||value.revision!==data.listeningRevision)fail(409,"The test has changed. Open it again before saving.");
    id=value.id;revision=value.revision;
  }else{id=db.collection("lessons").doc().id;}
  const saveId=randomUUID();
  const record:SaveRecord={ownerId:decoded.uid,lessonId:id,revision,test,audio,clipAudios,createdAt:Date.now(),status:"pending"};
  let uploadUrl:string|undefined;
  if(audio){
    [uploadUrl]=await bucket().file(listeningAudioPath(decoded.uid,id,saveId)).createResumableUpload({origin,preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:audio.contentType,contentLength:audio.size,cacheControl:"private,no-store",metadata:{ownerId:decoded.uid,lessonId:id,saveId}}});
  }
  const clipUploadUrls:Record<string,string>={};
  await Promise.all(Object.entries(clipAudios).map(async([clipId,audio])=>{
    const [url]=await bucket().file(listeningAudioPath(decoded.uid,id,saveId,clipId)).createResumableUpload({origin,preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:audio.contentType,contentLength:audio.size,cacheControl:"private,no-store",metadata:{ownerId:decoded.uid,lessonId:id,saveId,clipId}}});
    clipUploadUrls[clipId]=url;
  }));
  await db.doc(`listeningTestSaves/${saveId}`).create(record);
  return {id,saveId,...(uploadUrl?{uploadUrl}:{}),...(Object.keys(clipUploadUrls).length?{clipUploadUrls}:{}),expiresAt:record.createdAt+LISTENING_SAVE_LIFETIME_MS};
}
async function saveRecord(uid:string,id:string,saveId:string) {
  if(!validListeningId(id)||!validListeningId(saveId))fail(400,"Invalid save id");
  const ref=getAdmin().db.doc(`listeningTestSaves/${saveId}`),record=(await ref.get()).data() as SaveRecord|undefined;
  if(!record||record.ownerId!==uid||record.lessonId!==id)fail(404,"Save not found");
  return {ref,record};
}
async function checkedAudio(uid:string,id:string,saveId:string,audio:ListeningAudioInput,generation?:string,clipId?:string) {
  const storagePath=listeningAudioPath(uid,id,saveId,clipId),storage=bucket(),file=storage.file(storagePath,generation?{generation}:undefined);
  const [meta]=await file.getMetadata();
  if(meta.name!==storagePath||meta.bucket!==storage.name||typeof meta.generation!=="string"||!/^[1-9][0-9]*$/.test(meta.generation)
    ||generation&&meta.generation!==generation||Number(meta.size)!==audio.size||meta.contentType!==audio.contentType||meta.cacheControl!=="private,no-store"
    ||meta.metadata?.ownerId!==uid||meta.metadata?.lessonId!==id||meta.metadata?.saveId!==saveId||meta.metadata?.clipId!==clipId||meta.metadata?.firebaseStorageDownloadTokens
    ||meta.acl?.some(entry=>["allUsers","allAuthenticatedUsers"].includes(entry.entity??"")))fail(503,"Audio identity or privacy check failed");
  return {file:storage.file(storagePath,{generation:meta.generation}),audio:{...audio,storagePath,saveId,generation:meta.generation,...(clipId?{clipId}:{})} as SavedListeningAudio};
}
export async function finishListeningSave(decoded:DecodedIdToken,id:string,saveId:string) {
  const {db}=getAdmin(),{ref,record}=await saveRecord(decoded.uid,id,saveId);
  if(record.status==="complete"){
    const {data}=await ownedListeningTest(decoded.uid,id);
    if(data.listeningRevision!==saveId)fail(409,"The test has changed");
    return {id,revision:saveId};
  }
  if(record.status!=="pending"||Date.now()-record.createdAt>=LISTENING_SAVE_LIFETIME_MS)fail(410,"Save expired");
  const test=parseListeningMetadata(record.test);if(!test)fail(503,"Invalid saved test");
  let audio:SavedListeningAudio|null=null;
  if(record.audio){
    const verified=await checkedAudio(decoded.uid,id,saveId,record.audio),[bytes]=await verified.file.download();
    if(bytes.length!==record.audio.size||createHash("sha256").update(bytes).digest("hex")!==record.audio.sha256)fail(400,"Audio checksum mismatch");
    audio=verified.audio;
  }
  const clipAudio:Record<string,SavedListeningAudio>={};
  for(const [clipId,descriptor]of Object.entries(record.clipAudios??{})){
    if(!test.clips?.some(clip=>clip.taskId===clipId))fail(503,"Invalid clip binding");
    const verified=await checkedAudio(decoded.uid,id,saveId,descriptor,undefined,clipId),[bytes]=await verified.file.download();
    if(bytes.length!==descriptor.size||createHash("sha256").update(bytes).digest("hex")!==descriptor.sha256)fail(400,"Audio checksum mismatch");
    clipAudio[clipId]=verified.audio;
  }
  await db.runTransaction(async tx=>{
    const lessonRef=db.doc(`lessons/${id}`);
    const [pending,lesson,profile]=await tx.getAll(ref,lessonRef,db.doc(`users/${decoded.uid}`));
    assertActiveProfile(profile.data(),decoded);
    const current=pending.data() as SaveRecord|undefined;
    if(!current||current.ownerId!==decoded.uid||current.lessonId!==id)fail(404,"Save not found");
    const previous=lesson.data();
    if(current.status==="complete"&&previous?.listeningRevision===saveId)return;
    if(current.status!=="pending"||Date.now()-current.createdAt>=LISTENING_SAVE_LIFETIME_MS)fail(410,"Save expired");
    if(record.revision===null){if(lesson.exists)fail(409,"Test already exists");}
    else {assertOwner(previous,decoded.uid);if(previous?.listeningRevision!==record.revision)fail(409,"The test has changed. Open it again before saving.");}
    tx.set(lessonRef,{ownerId:decoded.uid,title:test.title,language:test.language,level:test.level,lessonType:"listening_test",textType:"listening_test",
      source:"listening-test-generator",beta:true,status:"draft",visibility:"private",publishVisibility:"private",showInLibrary:false,published:false,
      listeningTest:test,listeningAudio:audio,listeningClipAudio:clipAudio,listeningRevision:saveId,deletedAt:null,activePublishedId:null,
      createdAt:previous?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    tx.update(ref,{status:"complete"});
  });
  return {id,revision:saveId};
}
export async function loadListeningTest(uid:string,id:string) {
  const {data}=await ownedListeningTest(uid,id),test=parseListeningMetadata(data.listeningTest);
  if(!test||!validListeningId(data.listeningRevision))fail(503,"Invalid saved test");
  const audio=data.listeningAudio==null?null:parseSavedListeningAudio(data.listeningAudio,uid,id);
  if(data.listeningAudio!=null&&!audio)fail(503,"Invalid saved audio");
  const clipAudios:Record<string,unknown>={};
  if(data.listeningClipAudio&&typeof data.listeningClipAudio==="object")for(const [key,value]of Object.entries(data.listeningClipAudio)){
    const clipAudio=parseSavedListeningAudio(value,uid,id,key);
    if(!test.clips?.some(clip=>clip.taskId===key)||!clipAudio)fail(503,"Invalid clip binding");
    clipAudios[key]={url:`/api/listening-tests/saved/${id}/audio?clip=${encodeURIComponent(key)}`,contentType:clipAudio.contentType,size:clipAudio.size,generation:clipAudio.generation,sha256:clipAudio.sha256};
  }
  return {id,revision:data.listeningRevision,test,...(audio?{audio:{url:`/api/listening-tests/saved/${id}/audio`,contentType:audio.contentType,size:audio.size,generation:audio.generation,sha256:audio.sha256}}:{}),...(Object.keys(clipAudios).length?{clipAudios}:{})};
}
export async function cancelListeningSave(uid:string,id:string,saveId:string) {
  const {ref,record}=await saveRecord(uid,id,saveId);
  const cancelled=await getAdmin().db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data() as SaveRecord|undefined;
    if(!current||current.ownerId!==uid||current.lessonId!==id)fail(404,"Save not found");
    if(current.status==="complete")return false;
    tx.update(ref,{status:"cancelled"});return true;
  });
  if(cancelled)for(const clipId of [...(record.audio?[undefined]:[]),...Object.keys(record.clipAudios??{})]){
    const file=bucket().file(listeningAudioPath(uid,id,saveId,clipId));
    try{const [meta]=await file.getMetadata();if(meta.generation)await bucket().file(file.name,{generation:meta.generation,preconditionOpts:{ifGenerationMatch:meta.generation}}).delete({ignoreNotFound:true});}
    catch(error){if(Number((error as {code?:unknown}).code)!==404)throw error;}
  }
}
export async function readListeningAudio(uid:string,id:string,req:Request) {
  const {data}=await ownedListeningTest(uid,id),clipId=new URL(req.url).searchParams.get("clip")??undefined;
  if(clipId!==undefined&&!validListeningId(clipId))fail(400,"Invalid clip id");
  const clips=data.listeningClipAudio as Record<string,unknown>|undefined;
  const audio=parseSavedListeningAudio(clipId?clips?.[clipId]:data.listeningAudio,uid,id,clipId);
  if(!audio)fail(404,"Audio not found");
  const etag=`"${audio.generation}"`;
  if(req.headers.has("if-match")&&req.headers.get("if-match")!==etag)fail(412,"Audio changed");
  let range:ReturnType<typeof fileRange>;try{range=fileRange(req.headers.get("range"),audio.size);}catch{fail(416,"Invalid range");}
  const {file}=await checkedAudio(uid,id,audio.saveId,audio,audio.generation,clipId);
  const [bytes]=await file.download({start:range.start,end:range.end});
  if(bytes.length!==range.end-range.start+1)fail(503,"Incomplete audio");
  return new Response(new Uint8Array(bytes),{status:range.partial?206:200,headers:{"Content-Type":audio.contentType,"Content-Length":String(bytes.length),
    "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes",ETag:etag,
    ...(range.partial?{"Content-Range":`bytes ${range.start}-${range.end}/${audio.size}`}:{})}});
}
