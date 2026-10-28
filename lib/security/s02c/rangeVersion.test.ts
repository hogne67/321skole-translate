import assert from "node:assert/strict";
import { before, after, afterEach, test, mock } from "node:test";
import { deleteApp } from "firebase/app";
import { auth, appMaybe } from "../../firebase";
import { fetchAuthenticatedFileBlob } from "../../spaceFiles.client";
before(async()=>{await auth.authStateReady();Object.defineProperty(auth,"currentUser",{configurable:true,writable:true,value:{uid:"synthetic",getIdToken:async()=>"synthetic"}});});
afterEach(()=>mock.restoreAll());after(async()=>{await deleteApp(appMaybe!);});
for(const changed of [false,true])test(`range version ${changed?"change aborts":"stays bound through If-Match"}`,async()=>{
 let calls=0;
 mock.method(globalThis,"fetch",async(_url:unknown,options:RequestInit)=>{
   const start=calls++?1048576:0;
   if(start)assert.equal(new Headers(options.headers).get("if-match"),'"version-one"');
   const end=start?1048576:1048575;
   return new Response(new Uint8Array(end-start+1),{status:206,headers:{"Content-Type":"audio/wav","Content-Range":`bytes ${start}-${end}/1048577`,ETag:start&&changed?'"version-two"':'"version-one"'}});
 });
 const pending=fetchAuthenticatedFileBlob("/api/teacher/audio-url",{method:"POST"});
 if(changed)await assert.rejects(pending,/File version changed/);else assert.equal((await pending).size,1048577);
 assert.equal(calls,2);
});
