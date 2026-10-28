import {CLOUD_CLOSURE_PLAN} from "./quarantineCloudClosurePlan";
import {CLOUD_CLOSURE_RULES} from "./quarantineCloudClosureRules";
import { randomUUID } from "node:crypto";
import { assertCloudTestBoundary, CLOUD_TEST_BUCKET as bucket, CLOUD_TEST_PROJECT as project } from "./cloudTestBoundary";
import * as p from "./quarantineCloudTestPlan";
export type TestCall = {op:string; path?:string; destination?:string; generation?:string; metageneration?:string; ruleset?:string; content?:string; updateTime?:string; token?:string; planDigest?:string; sourceDigest?:string; probe?:boolean};
// REST response envelope; every field used for a decision is checked by the execution protocol.
export type TestData = {
  name:string;bucket:string;projectId:string;projectNumber:string;location:string;locationId:string;type:string;
  updateTime:string;rulesetName:string;generation:string;metageneration:string;size:string;contentType:string;md5Hash:string;crc32c:string;cacheControl:string;
  metadata:Record<string,string|null>;source:{files:{name:string;content:string}[]};permissions:string[];bindings:{members:string[]}[];
  iamConfiguration:{uniformBucketLevelAccess:{enabled:boolean}};softDeletePolicy:{retentionDurationSeconds:string};versioning?:{enabled:boolean};retentionPolicy?:object;
  defaultEventBasedHold?:boolean;hierarchicalNamespace?:{enabled:boolean};autoclass?:{enabled:boolean};lifecycle?:{rule:unknown[]};
  fields:Record<string,{stringValue:string;booleanValue:boolean;mapValue:{fields:Record<string,{stringValue:string}>}}>;
  error?:{status:string};
};
export type TestWire = (call:TestCall)=>Promise<{status:number;data:TestData}>;
export const testRelease = `projects/${project}/releases/firebase.storage/${bucket}`;
export const testDoc = `projects/${project}/databases/(default)/documents/${p.CLOUD_QUARANTINE_BOARD}`;
export const baselineRuleset = `projects/${project}/rulesets/c1a0387d-9151-4cb1-9f57-edd19b09d84e`;
const objects=[...p.CLOUD_QUARANTINE_SOURCES,...p.CLOUD_QUARANTINE_TARGETS,p.CLOUD_QUARANTINE_PRIVATE_CONTROL,p.CLOUD_QUARANTINE_PUBLIC_CONTROL];
const requireTest:(v:unknown,code:string)=>asserts v=(v,code)=>{if(!v)throw Error(code);};
export function buildCloudTestRequest(c:TestCall, ownedRulesets:Set<string>) {
  requireTest(!["upload","seedBoard","copy"].includes(c.op),"closure_recreation_or_copy_refused");
  requireTest(c.probe===undefined||typeof c.probe==="boolean","invalid_test_probe_flag");
  requireTest(Object.keys(c).every(k=>["op","path","destination","generation","metageneration","ruleset","content","updateTime","token","planDigest","sourceDigest","probe"].includes(k)),"unknown_test_call_field");
  const has=(...keys:string[])=>requireTest(Object.keys(c).every(k=>["op",...keys].includes(k)),"unexpected_test_call_argument");
  const version=(v:unknown)=>requireTest(typeof v==="string"&&/^[1-9][0-9]*$/.test(v),"test_version_required");
  const obj=()=>{requireTest(c.path&&objects.includes(c.path),"test_object_not_allowlisted");return `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(c.path)}`;};
  const request=(method:string,url:string,data?:unknown,contentType?:string)=>({method,url,data,contentType});
  const query=(url:string,q:Record<string,string>)=>`${url}?${new URLSearchParams(q)}`;
  if(c.op==="project"){has();return request("GET",`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);}
  if(c.op==="bucket"||c.op==="iam"){has();return request("GET",`https://storage.googleapis.com/storage/v1/b/${bucket}${c.op==="iam"?"/iam":""}`);}
  if(c.op==="database"){has();return request("GET",`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);}
  if(c.op==="permissions"){has();return request("POST",`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,{permissions:["firebaserules.rulesets.create","firebaserules.releases.update","datastore.entities.create","datastore.entities.update"]});}
  if(c.op==="release"){has();return request("GET",`https://firebaserules.googleapis.com/v1/${testRelease}`);}
  if(c.op==="firestoreRelease"){has();return request("GET",`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);}
  if(c.op==="firestoreRules"){has();return request("GET",`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets/df233b5e-6a45-4b23-a55d-fedc8afeb53b`);}
  if(c.op==="rules"){has("ruleset");requireTest(c.ruleset===baselineRuleset||ownedRulesets.has(c.ruleset??""),"unowned_test_ruleset");return request("GET",`https://firebaserules.googleapis.com/v1/${c.ruleset}`);}
  if(c.op==="createRules"){has("content");requireTest(c.content===CLOUD_CLOSURE_RULES,"test_rules_source_refused");return request("POST",`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,{source:{files:[{name:"storage.rules",content:c.content}]}});}
  if(c.op==="publishRules"){has("ruleset");requireTest(c.ruleset===baselineRuleset||ownedRulesets.has(c.ruleset??""),"unowned_test_ruleset");return request("PATCH",`https://firebaserules.googleapis.com/v1/${testRelease}`,{release:{name:testRelease,rulesetName:c.ruleset}});}
  if(c.op==="head"){has("path");return request("GET",obj());}
  if(c.op==="upload"){
    has("path","token");obj();const i=p.CLOUD_QUARANTINE_SOURCES.indexOf(c.path!);
    requireTest(i>=0||[p.CLOUD_QUARANTINE_PRIVATE_CONTROL,p.CLOUD_QUARANTINE_PUBLIC_CONTROL].includes(c.path!),"test_upload_target_refused");
    requireTest(i>=0?typeof c.token==="string"&&/^[a-f0-9-]{36}$/.test(c.token):c.token===undefined,"test_seed_token_refused");
    const f=p.CLOUD_QUARANTINE_FIXTURES[i>=0?i:3],boundary=`q4-${randomUUID()}`;
    const metadata={name:c.path,contentType:f.contentType,cacheControl:"private,no-store",metadata:{testRunId:p.CLOUD_QUARANTINE_RUN,...(c.token?{firebaseStorageDownloadTokens:c.token}:{})}};
    const data=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${f.contentType}\r\n\r\n`),f.bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    return request("POST",`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&ifGenerationMatch=0`,data,`multipart/related; boundary=${boundary}`);
  }
  if(c.op==="copy"){
    has("path","destination","generation","metageneration","planDigest","sourceDigest","probe");const i=p.CLOUD_QUARANTINE_SOURCES.indexOf(c.path!);
    requireTest(i>=0&&c.destination===p.CLOUD_QUARANTINE_TARGETS[i]&&/^[a-f0-9]{64}$/.test(c.planDigest??"")&&/^[a-f0-9]{64}$/.test(c.sourceDigest??""),"test_copy_pair_or_digest_refused");version(c.generation);version(c.metageneration);
    return request("POST",query(`${obj()}/copyTo/b/${bucket}/o/${encodeURIComponent(c.destination!)}`,{ifSourceGenerationMatch:c.generation!,ifSourceMetagenerationMatch:c.metageneration!,ifGenerationMatch:"0"}),{contentType:p.CLOUD_QUARANTINE_FIXTURES[i].contentType,cacheControl:"private,no-store",metadata:{firebaseStorageDownloadTokens:null,quarantinePlanDigest:c.planDigest,quarantineSourceDigest:c.sourceDigest}});
  }
  if(c.op==="revoke"||c.op==="retire"){
    has("path","generation","metageneration","probe");requireTest(p.CLOUD_QUARANTINE_SOURCES.includes(c.path!),"test_source_required");version(c.generation);version(c.metageneration);
    return request(c.op==="revoke"?"PATCH":"DELETE",query(obj(),{ifGenerationMatch:c.generation!,ifMetagenerationMatch:c.metageneration!}),c.op==="revoke"?{metadata:{firebaseStorageDownloadTokens:null}}:undefined);
  }
  if(c.op==="board"){has();return request("GET",`https://firestore.googleapis.com/v1/${testDoc}`);}
  if(c.op==="seedBoard"){has();return request("PATCH",`https://firestore.googleapis.com/v1/${testDoc}?currentDocument.exists=false`,{fields:{testRunId:{stringValue:p.CLOUD_QUARANTINE_RUN},active:{booleanValue:false},mode:{stringValue:"text"},data:{mapValue:{fields:{imageUrl:{stringValue:`gs://${bucket}/${p.CLOUD_QUARANTINE_SOURCES[3]}`},syntheticSentinel:{stringValue:"keep"}}}}}});}
  if(c.op==="clearBoard"){
    has("updateTime","probe");requireTest(typeof c.updateTime==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(c.updateTime),"test_board_version_required");
    return request("PATCH",`https://firestore.googleapis.com/v1/${testDoc}?${new URLSearchParams({"updateMask.fieldPaths":"data.imageUrl","currentDocument.updateTime":c.updateTime})}`,{fields:{data:{mapValue:{fields:{imageUrl:{stringValue:""}}}}}});
  }
  throw Error("test_operation_not_allowlisted");
}

/** Exact request constructors, explicit test client, no redirects/retries or implicit ADC. */
export function createCloudTestWire(client:{getRequestHeaders(url:string):Promise<Headers>}, journal:(event:Record<string,unknown>)=>Promise<void>):TestWire {
  const owned=new Set<string>([CLOUD_CLOSURE_PLAN.rules.storage.rulesetName]);let mutations=0,probes=0,stopped=false;
  return async c=>{
    assertCloudTestBoundary(project,bucket,process.env);requireTest(!stopped,"test_wire_stopped");
    try{
      const r=buildCloudTestRequest(c,owned),write=r.method!=="GET"&&c.op!=="permissions";
      if(c.probe)requireTest(["copy","revoke","retire","clearBoard"].includes(c.op),"test_probe_operation_refused");
      if(write){if(c.probe)requireTest(++probes<=CLOUD_CLOSURE_PLAN.maxRejectedWriteProbes,"test_probe_budget_exceeded");else requireTest(++mutations<=CLOUD_CLOSURE_PLAN.maxMutations,"test_mutation_budget_exceeded");
        await journal({stage:"wire_intent",operation:c.op,resource:c.path??(c.op.includes("Board")?p.CLOUD_QUARANTINE_BOARD:testRelease),probe:c.probe===true,mutation:mutations});}
      const h=await client.getRequestHeaders(r.url);const headers=new Headers(h);headers.set("x-goog-user-project",project);
      if(r.data!==undefined)headers.set("Content-Type",r.contentType??"application/json");
      const body=r.data===undefined?undefined:Buffer.isBuffer(r.data)?new Uint8Array(r.data).buffer:JSON.stringify(r.data);
      const response=await fetch(r.url,{method:r.method,headers,body,redirect:"manual",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(15000)});
      const chunks:Uint8Array[]=[];let size=0;
      if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;requireTest(size<=1048576,"test_response_too_large");chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}}
      let data=null as unknown as TestData;if(size){try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));requireTest(value&&typeof value==="object"&&!Array.isArray(value),"test_response_not_object");data=value as TestData;}catch{throw Error("test_response_not_json");}}
      if(write)await journal({stage:"wire_result",operation:c.op,status:response.status,probe:c.probe===true});
      if(c.op==="createRules"&&response.status===200){requireTest(typeof data?.name==="string"&&new RegExp(`^projects/${project}/rulesets/[a-zA-Z0-9-]+$`).test(data.name),"unexpected_created_ruleset");owned.add(data.name);}
      return {status:response.status,data};
    }catch{stopped=true;throw Error("test_wire_failed_preserve_state");}
  };
}

/** Reads only one synthetic byte; token URLs stay in memory. Network errors and missing objects are not denials. */
export async function cloudTestPublicStatus(path:string,token?:string) {
  assertCloudTestBoundary(project,bucket,process.env);
  requireTest(objects.includes(path),"test_probe_path_refused");
  requireTest(token===undefined||/^[a-f0-9-]{36}$/.test(token),"test_probe_token_refused");
  const q=new URLSearchParams({alt:"media",...(token?{token}:{})});
  const r=await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?${q}`,{headers:{Range:"bytes=0-0"},redirect:"manual",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(15000)});
  await r.body?.cancel();return r.status;
}
