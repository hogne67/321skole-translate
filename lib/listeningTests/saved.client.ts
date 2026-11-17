import { getAuth } from "firebase/auth";
import { LISTENING_READ_CHUNK_BYTES, listeningMetadata, validListeningId } from "./persistence";
import { MAX_LISTENING_AUDIO_BYTES, parseListeningTest, validListeningAudio, type ListeningTest } from "./types";

export class ListeningClientError extends Error { constructor(public status:number){super("Listening request failed");} }
export type ListeningSavedVersion={id:string;revision:string};
function audioBlob(data:string) {
  if(!validListeningAudio(data))throw new ListeningClientError(400);
  const [header,encoded]=data.split(","),bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
  if(!bytes.length||bytes.length>MAX_LISTENING_AUDIO_BYTES)throw new ListeningClientError(400);
  return new Blob([bytes],{type:header.slice(5,header.indexOf(";"))});
}
async function sha256(blob:Blob){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,"0")).join("");}
function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new ListeningClientError(503));reader.readAsDataURL(blob);});}
function session(){
  const user=getAuth().currentUser;if(!user||user.isAnonymous)throw new ListeningClientError(401);
  function check(){if(getAuth().currentUser!==user)throw new ListeningClientError(401);}
  return {user,check,headers:async()=>{check();const token=await user.getIdToken();check();return {Authorization:`Bearer ${token}`};}};
}
export async function saveListeningTest(test:ListeningTest,version:ListeningSavedVersion|null,signal:AbortSignal):Promise<ListeningSavedVersion>{
  const current=session(),blob=test.audioDataUrl?audioBlob(test.audioDataUrl):null;
  const audio=blob?{contentType:blob.type,size:blob.size,sha256:await sha256(blob)}:null;
  const clipBlobs=new Map((test.clips??[]).filter(clip=>clip.audioDataUrl).map(clip=>[clip.taskId,audioBlob(clip.audioDataUrl!)]));
  const clipAudios=Object.fromEntries(await Promise.all([...clipBlobs].map(async([key,blob])=>[key,{contentType:blob.type,size:blob.size,sha256:await sha256(blob)}])));
  signal.throwIfAborted();
  const response=await fetch("/api/listening-tests/saved",{method:"POST",signal,headers:{...await current.headers(),"Content-Type":"application/json"},
    body:JSON.stringify({...version,test:listeningMetadata(test),audio,...(test.clips?{clipAudios}:{})})});current.check();
  if(!response.ok)throw new ListeningClientError(response.status);
  const pending=await response.json();
  if(!validListeningId(pending.id)||!validListeningId(pending.saveId))throw new ListeningClientError(503);
  try{
    const targets=[...(blob?[{url:pending.uploadUrl,blob}]:[]),...[...clipBlobs].map(([key,blob])=>({url:pending.clipUploadUrls?.[key],blob}))];
    for(const target of targets){
      const upload=new URL(target.url);
      if(upload.protocol!=="https:"||upload.hostname!=="storage.googleapis.com"||upload.username||upload.password)throw new ListeningClientError(503);
      const uploaded=await fetch(upload.href,{method:"PUT",body:target.blob,signal,credentials:"omit",referrerPolicy:"no-referrer",headers:{"Content-Type":target.blob.type}});
      current.check();if(!uploaded.ok)throw new ListeningClientError(503);
    }
    const finished=await fetch(`/api/listening-tests/saved/${pending.id}`,{method:"POST",signal,headers:{...await current.headers(),"Content-Type":"application/json"},body:JSON.stringify({saveId:pending.saveId})});current.check();
    if(!finished.ok)throw new ListeningClientError(finished.status);
    const saved=await finished.json();current.check();
    if(saved.id!==pending.id||saved.revision!==pending.saveId)throw new ListeningClientError(503);
    return saved;
  }catch(error){
    // An incomplete upload has no saved-content link. A completed save is kept
    // if its response was lost; cancellation never deletes an existing test.
    try{await fetch(`/api/listening-tests/saved/${pending.id}?saveId=${encodeURIComponent(pending.saveId)}`,{method:"DELETE",headers:await current.headers()});}catch{/* The private pending save can expire. */}
    throw error;
  }
}
export async function loadSavedListeningTest(id:string,signal:AbortSignal):Promise<{test:ListeningTest;version:ListeningSavedVersion}>{
  if(!validListeningId(id))throw new ListeningClientError(400);
  const current=session(),response=await fetch(`/api/listening-tests/saved/${id}`,{signal,cache:"no-store",headers:await current.headers()});current.check();
  if(!response.ok)throw new ListeningClientError(response.status);
  const saved=await response.json(),test=parseListeningTest(saved.test);
  if(!test||!validListeningId(saved.revision)||saved.id!==id)throw new ListeningClientError(503);
  async function readAudio(audio:{url:string;size:number;generation:string;sha256:string;contentType:string},expectedUrl:string){
    if(audio.url!==expectedUrl||!Number.isSafeInteger(audio.size)||audio.size<=0||audio.size>MAX_LISTENING_AUDIO_BYTES
      ||typeof audio.generation!=="string"||typeof audio.sha256!=="string")throw new ListeningClientError(503);
    const chunks:Blob[]=[];
    for(let start=0;start<audio.size;start+=LISTENING_READ_CHUNK_BYTES){
      const end=Math.min(start+LISTENING_READ_CHUNK_BYTES,audio.size)-1;
      const part=await fetch(audio.url,{signal,cache:"no-store",headers:{...await current.headers(),Range:`bytes=${start}-${end}`,"If-Match":`"${audio.generation}"`}});current.check();
      if(part.status!==206||part.headers.get("etag")!==`"${audio.generation}"`||part.headers.get("content-range")!==`bytes ${start}-${end}/${audio.size}`||part.headers.get("content-type")!==audio.contentType)throw new ListeningClientError(part.ok?503:part.status);
      const chunk=await part.blob();if(chunk.size!==end-start+1)throw new ListeningClientError(503);chunks.push(chunk);
    }
    const blob=new Blob(chunks,{type:audio.contentType});
    if(await sha256(blob)!==audio.sha256)throw new ListeningClientError(503);
    return await dataUrl(blob);
  }
  if(saved.audio)test.audioDataUrl=await readAudio(saved.audio,`/api/listening-tests/saved/${id}/audio`);
  if(saved.clipAudios){
    if(!test.clips||typeof saved.clipAudios!=="object"||Object.keys(saved.clipAudios).some(key=>!test.clips?.some(clip=>clip.taskId===key)))throw new ListeningClientError(503);
    for(const clip of test.clips){
      const audio=saved.clipAudios[clip.taskId];
      if(audio){if(audio.size>MAX_LISTENING_AUDIO_BYTES/4)throw new ListeningClientError(503);clip.audioDataUrl=await readAudio(audio,`/api/listening-tests/saved/${id}/audio?clip=${encodeURIComponent(clip.taskId)}`);}
    }
  }
  signal.throwIfAborted();current.check();
  return {test,version:{id,revision:saved.revision}};
}
