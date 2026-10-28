import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { digest } from "./reconciliation";
import { runCloudQuarantineTest } from "./quarantineCloudTestExecution";
import { buildCloudTestRequest, createCloudTestWire, baselineRuleset, testRelease, testDoc, type TestCall, type TestData } from "./quarantineCloudTestTransport";
import { createQuarantineCloudTestJournal } from "./quarantineCloudTestJournal";
import * as p from "./quarantineCloudTestPlan";
function fixture(){
  const objects=new Map<string,TestData>(),rules=new Map([[baselineRuleset,p.CLOUD_QUARANTINE_BASELINE_RULES]]),calls:TestCall[]=[],events:Record<string,unknown>[]=[];
  let release={name:testRelease,rulesetName:baselineRuleset,updateTime:"2026-10-19T00:00:00Z"},board:TestData|null=null,seq=1;
  const owned=new Set<string>();
  const wire=async(c:TestCall)=>{
    buildCloudTestRequest(c,owned);calls.push({...c});const r=(status:number,data:object|null=null)=>({status,data:data as TestData});
    if(c.op==="release")return r(200,{...release});
    if(c.op==="firestoreRelease")return r(200,{rulesetName:"projects/testbilde-5683f/rulesets/df233b5e-6a45-4b23-a55d-fedc8afeb53b"});
    if(c.op==="firestoreRules")return r(200,{source:{files:[{content:p.CLOUD_QUARANTINE_FIRESTORE_RULES}]}});
    if(c.op==="rules")return r(200,{name:c.ruleset,source:{files:[{name:"storage.rules",content:rules.get(c.ruleset!)}]}});
    if(c.op==="project")return r(200,{projectId:p.CLOUD_QUARANTINE_BLUEPRINT.projectId,projectNumber:"220379724471"});
    if(c.op==="bucket")return r(200,{name:p.CLOUD_QUARANTINE_BLUEPRINT.bucket,projectNumber:"220379724471",location:"EUROPE-WEST1",iamConfiguration:{uniformBucketLevelAccess:{enabled:true}},softDeletePolicy:{retentionDurationSeconds:"604800"}});
    if(c.op==="iam")return r(200,{bindings:[]});
    if(c.op==="database")return r(200,{name:"projects/testbilde-5683f/databases/(default)",locationId:"europe-west1",type:"FIRESTORE_NATIVE"});
    if(c.op==="permissions")return r(200,{permissions:["firebaserules.rulesets.create","firebaserules.releases.update","datastore.entities.create","datastore.entities.update"]});
    if(c.op==="head")return r(objects.has(c.path!)?200:404,structuredClone(objects.get(c.path!)??null));
    if(c.op==="board")return r(board?200:404,structuredClone(board));
    if(c.op==="upload"){
      const i=p.CLOUD_QUARANTINE_SOURCES.indexOf(c.path!),f=p.CLOUD_QUARANTINE_FIXTURES[i<0?3:i];
      const obj={name:c.path,bucket:p.CLOUD_QUARANTINE_BLUEPRINT.bucket,generation:String(++seq),metageneration:"1",size:String(f.size),contentType:f.contentType,md5Hash:f.md5Hash,crc32c:"test-crc",cacheControl:"private,no-store",metadata:{testRunId:p.CLOUD_QUARANTINE_RUN,...(c.token?{firebaseStorageDownloadTokens:c.token}:{})}};
      objects.set(c.path!,obj as unknown as TestData);return r(200,structuredClone(obj));
    }
    if(c.op==="seedBoard"){board={name:testDoc,updateTime:"2026-10-19T01:00:00Z",fields:{testRunId:{stringValue:p.CLOUD_QUARANTINE_RUN},active:{booleanValue:false},mode:{stringValue:"text"},data:{mapValue:{fields:{imageUrl:{stringValue:`gs://${p.CLOUD_QUARANTINE_BLUEPRINT.bucket}/${p.CLOUD_QUARANTINE_SOURCES[3]}`},syntheticSentinel:{stringValue:"keep"}}}}}} as unknown as TestData;return r(200,structuredClone(board));}
    if(c.op==="createRules"){const name=`projects/testbilde-5683f/rulesets/test-${++seq}`;owned.add(name);rules.set(name,c.content!);return r(200,{name});}
    if(c.op==="publishRules"){release={...release,rulesetName:c.ruleset!,updateTime:`2026-10-19T02:00:${String(++seq).padStart(2,"0")}Z`};return r(200,{...release});}
    if(c.op==="copy"){
      if(objects.has(c.destination!))return r(412);const obj=objects.get(c.path!);assert.ok(obj);assert.equal(c.generation,obj.generation);assert.equal(c.metageneration,obj.metageneration);
      const dst={...obj,name:c.destination!,generation:String(++seq),metageneration:"1",metadata:{firebaseStorageDownloadTokens:null,quarantinePlanDigest:c.planDigest!,quarantineSourceDigest:c.sourceDigest!}};objects.set(c.destination!,dst);return r(200,structuredClone(dst));
    }
    if(c.op==="clearBoard"){assert.ok(board);if(c.updateTime!==board.updateTime)return r(400,{error:{status:"FAILED_PRECONDITION"}});board.fields.data.mapValue.fields.imageUrl.stringValue="";board.updateTime="2026-10-19T03:00:00Z";return r(200,structuredClone(board));}
    if(c.op==="revoke"||c.op==="retire"){
      const obj=objects.get(c.path!);assert.ok(obj);if(c.generation!==obj.generation||c.metageneration!==obj.metageneration)return r(412);
      if(c.op==="retire"){objects.delete(c.path!);return r(204);}obj.metadata.firebaseStorageDownloadTokens=null;obj.metageneration=String(Number(obj.metageneration)+1);return r(200,structuredClone(obj));
    }
    throw Error("unhandled_mock_call");
  };
  const publicStatus=async(path:string,token?:string):Promise<number>=>{
    const obj=objects.get(path);if(!obj)return 404;
    if(token)return obj.metadata.firebaseStorageDownloadTokens===token?206:403;
    const source=rules.get(release.rulesetName);
    return source!==p.CLOUD_QUARANTINE_BASELINE_RULES&&(path===p.CLOUD_QUARANTINE_PUBLIC_CONTROL||(source===p.CLOUD_QUARANTINE_OPEN_RULES&&p.CLOUD_QUARANTINE_SOURCES.includes(path)))?206:403;
  };
  const deps={wire,publicStatus,journal:async(event:Record<string,unknown>)=>{events.push(event);},delay:async()=>{}};
  const signal={execute:true,approval:p.CLOUD_QUARANTINE_BLUEPRINT_DIGEST,exclusiveRulesWindow:true};
  return {objects,calls,events,deps,signal,run:()=>runCloudQuarantineTest(deps,signal),changeRelease:()=>{release.updateTime="2026-10-19T09:00:00Z";}};
}
test("synthetic audio is valid PCM WAV and the one-pixel PNG has valid chunks and compressed pixel data",()=>{
  for(const f of p.CLOUD_QUARANTINE_FIXTURES.slice(0,3)){
    assert.equal(f.bytes.toString("ascii",0,4),"RIFF");assert.equal(f.bytes.toString("ascii",8,12),"WAVE");assert.equal(f.bytes.readUInt32LE(4)+8,f.bytes.length);assert.equal(f.bytes.readUInt32LE(40)+44,f.bytes.length);
  }
  const b=p.CLOUD_QUARANTINE_FIXTURES[3].bytes;let offset=8;
  assert.equal(b.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  while(offset<b.length){const n=b.readUInt32BE(offset),kind=b.toString("ascii",offset+4,offset+8),chunk=b.subarray(offset+4,offset+8+n);let crc=0xffffffff;
    for(const byte of chunk){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    assert.equal((crc^0xffffffff)>>>0,b.readUInt32BE(offset+8+n));if(kind==="IDAT")assert.equal(inflateSync(b.subarray(offset+8,offset+8+n)).length,3);offset+=12+n;
  }
  assert.equal(offset,b.length);
});
test("new cloud boundary retains the exact tested local protocol body",()=>{
  const local=readFileSync(new URL("./quarantineLocalProvider.ts",import.meta.url),"utf8"),cloud=readFileSync(new URL("./quarantineCloudTestProvider.ts",import.meta.url),"utf8");
  const anchor="  const paths = new Set(";assert.equal(cloud.slice(cloud.indexOf(anchor)),local.slice(local.indexOf(anchor)));
});
test("complete synthetic protocol: 25 writes, four rejected probes, four token denials before any retirement, closed rules restored",async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.liveOriginals,0);assert.equal(r.privateCopies,4);assert.equal(r.storageBaselineRestored,true);assert.equal(f.objects.size,6);
  const mutations=f.calls.filter(c=>!["head","board","release","rules","firestoreRelease","firestoreRules","project","bucket","iam","database","permissions"].includes(c.op));
  assert.equal(mutations.filter(c=>!c.probe).length,25);assert.equal(mutations.filter(c=>c.probe).length,4);
  assert.equal(f.calls.slice(0,f.calls.findIndex(c=>c.op==="retire")).filter(c=>c.op==="revoke"&&!c.probe).length,4);
});
test("no approval or exclusive test window: no requests",async()=>{
  for(const change of [{execute:false},{approval:"wrong"},{exclusiveRulesWindow:false}]){const f=fixture();Object.assign(f.signal,change);await assert.rejects(f.run(),/approval/);assert.equal(f.calls.length,0);}
});
test("missing Rules rights stops before any resource write",async()=>{
  const f=fixture(),wire=f.deps.wire;f.deps.wire=async c=>c.op==="permissions"?{status:200,data:{permissions:[]} as unknown as TestData}:wire(c);
  await assert.rejects(f.run(),/permissions_missing/);assert.equal(f.objects.size,0);assert.ok(!f.calls.some(c=>c.op==="createRules"||c.op==="seedBoard"));
});
test("occupied target stops before seeding",async()=>{
  const f=fixture();f.objects.set(p.CLOUD_QUARANTINE_TARGETS[0],{} as TestData);await assert.rejects(f.run(),/request_failed/);assert.equal(f.objects.size,1);
});
test("failed revocation preserves all originals and copies",async()=>{
  const f=fixture(),wire=f.deps.wire;let count=0;f.deps.wire=async c=>c.op==="revoke"&&!c.probe&&++count===3?{status:412,data:{} as TestData}:wire(c);
  await assert.rejects(f.run());assert.ok(!f.calls.some(c=>c.op==="retire"));assert.equal(f.objects.size,10);
});
test("network error and 404 are not accepted as private copies",async()=>{
  for(const status of [404,500]){const f=fixture(),probe=f.deps.publicStatus;f.deps.publicStatus=async(path,token)=>p.CLOUD_QUARANTINE_TARGETS.includes(path)?status:probe(path,token);
    await assert.rejects(f.run());assert.ok(!f.calls.some(c=>c.op==="retire"));}
});
test("concurrent rule update stops before any successful source retirement",async()=>{
  const f=fixture(),journal=f.deps.journal;f.deps.journal=async event=>{await journal(event);if(event.stage==="all_four_tokens_revoked_and_old_links_denied")f.changeRelease();};
  await assert.rejects(f.run(),/rules_concurrent_change|rules_changed|quarantine_rules/);assert.ok(!f.calls.some(c=>c.op==="retire"&&!c.probe));
});
test("transport rejects production, arbitrary copies, archive deletion, historical selectors, broad rules and foreign rulesets",()=>{
  const invalid:object[]=[{op:"head",path:"covers/real-student.png"},{op:"copy",path:p.CLOUD_QUARANTINE_SOURCES[0],destination:p.CLOUD_QUARANTINE_TARGETS[1]},
    {op:"retire",path:p.CLOUD_QUARANTINE_TARGETS[0],generation:"1",metageneration:"1"},{op:"retire",path:p.CLOUD_QUARANTINE_SOURCES[0],generation:"1",metageneration:"1",query:{generation:"1"}},
    {op:"createRules",content:"allow read,write: if true;"},{op:"publishRules",ruleset:"projects/skole-c09b8/rulesets/foreign"},{op:"clearBoard",updateTime:""},{op:"upload",path:p.CLOUD_QUARANTINE_TARGETS[0]},{op:"deleteBucket"}];
  for(const call of invalid)assert.throws(()=>buildCloudTestRequest(call as TestCall,new Set()));
});
test("durable journal reserves a run, chains hashes and rejects secrets",async()=>{
  const parent=await mkdtemp(path.join(os.tmpdir(),"q4-journal-")),dir=path.join(parent,"run");
  try{const j=await createQuarantineCloudTestJournal(dir,"a".repeat(64));await j.write({stage:"first"});await j.write({stage:"second"});await j.close();
    const entries=(await readFile(path.join(dir,"execution.journal.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
    assert.equal(entries[1].previous,entries[0].hash);for(const {hash,...entry} of entries)assert.equal(hash,digest(entry));await assert.rejects(createQuarantineCloudTestJournal(dir,"a".repeat(64)));
    const second=await createQuarantineCloudTestJournal(path.join(parent,"secret"),"b".repeat(64));await assert.rejects(second.write({token:"never-write"}));await assert.rejects(second.write({stage:"after-failure"}));await second.close();
  }finally{await rm(parent,{recursive:true,force:true});}
});
test("wire journal failure prevents any authenticated request",async()=>{
  let calls=0;const client={getRequestHeaders:async()=>{calls++;return new Headers();}},wire=createCloudTestWire(client,async()=>{throw Error("journal_failed");});
  await assert.rejects(wire({op:"upload",path:p.CLOUD_QUARANTINE_SOURCES[0],token:"11111111-1111-1111-1111-111111111111"}));assert.equal(calls,0);
});
test("real wire encodes exact synthetic URLs, journals intent and result, omits credentials and refuses redirects",async()=>{
  const previous=globalThis.fetch,events:Record<string,unknown>[]=[];let requests=0;
  try{globalThis.fetch=async(input,init)=>{requests++;assert.equal(new URL(String(input)).origin,"https://storage.googleapis.com");assert.equal(init?.redirect,"manual");assert.equal(init?.credentials,"omit");assert.equal(init?.cache,"no-store");
      const h=new Headers(init?.headers);assert.equal(h.get("x-goog-user-project"),"testbilde-5683f");assert.equal(events.at(-1)?.stage,"wire_intent");
      return new Response(JSON.stringify({name:p.CLOUD_QUARANTINE_SOURCES[0]}),{status:200});};
    const wire=createCloudTestWire({getRequestHeaders:async()=>new Headers()},async event=>{events.push(event);});
    assert.equal((await wire({op:"upload",path:p.CLOUD_QUARANTINE_SOURCES[0],token:"11111111-1111-1111-1111-111111111111"})).status,200);
    assert.equal(events.at(-1)?.stage,"wire_result");assert.equal(requests,1);assert.ok(!JSON.stringify(events).includes("11111111"));
  }finally{globalThis.fetch=previous;}
});
test("malformed authenticated response permanently stops the wire without retry",async()=>{
  const previous=globalThis.fetch;let requests=0;
  try{globalThis.fetch=async()=>{requests++;return new Response("not json",{status:502});};
    const wire=createCloudTestWire({getRequestHeaders:async()=>new Headers()},async()=>{});
    await assert.rejects(wire({op:"bucket"}),/wire_failed/);await assert.rejects(wire({op:"bucket"}),/wire_stopped/);assert.equal(requests,1);
  }finally{globalThis.fetch=previous;}
});
