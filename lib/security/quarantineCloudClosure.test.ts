import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture} from "./quarantineCloudClosureFixture";
import {runCloudQuarantineClosure} from "./quarantineCloudClosure";
import {CLOUD_CLOSURE_PLAN as plan,CLOUD_CLOSURE_DIGEST as approval} from "./quarantineCloudClosurePlan";
import {CLOUD_CLOSURE_RULES,buildFourFileQuarantineRules} from "./quarantineCloudClosureRules";
import {buildCloudTestRequest,type TestData} from "./quarantineCloudClosureTransport";
import * as p from "./quarantineCloudTestPlan";
async function retained(){
 const f=fixture();
 for(const expected of plan.objects)f.objects.set(expected.path,{name:expected.path,bucket:plan.bucket,generation:expected.generation,metageneration:expected.metageneration,size:String(expected.size),contentType:expected.contentType,md5Hash:expected.md5Hash,crc32c:expected.crc32c,cacheControl:expected.cacheControl,
  metadata:expected.fixtureRunMatches?{testRunId:p.CLOUD_QUARANTINE_RUN,...(expected.tokenCount?{firebaseStorageDownloadTokens:"11111111-1111-1111-1111-111111111111"}:{})}:{quarantinePlanDigest:expected.quarantinePlanDigest,quarantineSourceDigest:expected.quarantineSourceDigest}} as unknown as TestData);
 // The closure transport deliberately prohibits fixture creation; initialise the fake document through its existing unit-only setup.
 f.initialiseBoard();f.setBoardVersion(plan.board.updateTime);f.setupLocked(plan.rules.storage.rulesetName,p.CLOUD_QUARANTINE_LOCKED_RULES,plan.rules.storage.updateTime);f.calls.length=0;f.events.length=0;
 const now=Date.parse("2026-10-19T17:00:00Z"),signal={execute:true,approval,exclusiveRulesWindow:true,iamBindingGrantedAt:new Date(now-420000).toISOString()};
 const deps={...f.deps,now:()=>now};return {...f,deps,signal,run:()=>runCloudQuarantineClosure(deps,signal)};
}
test("closure verifies and adopts four existing private copies, executes 12 writes and three rejected probes, and restores closed rules",async()=>{
 const f=await retained(),r=await f.run();assert.equal(r.liveOriginals,0);assert.equal(r.privateCopies,4);assert.equal(r.storageBaselineRestored,true);assert.equal(f.objects.size,6);
 const writes=f.calls.filter(c=>["createRules","publishRules","clearBoard","revoke","retire"].includes(c.op));assert.equal(writes.filter(c=>!c.probe).length,12);assert.equal(writes.filter(c=>c.probe).length,3);assert.ok(!f.calls.some(c=>["upload","seedBoard","copy"].includes(c.op)));
});
test("the corrected exact test policy reads only the approved control and never evaluates incoming metadata",()=>{
 assert.ok(!CLOUD_CLOSURE_RULES.includes("request.resource"));assert.ok(!CLOUD_CLOSURE_RULES.includes("isFourFile"));assert.equal(buildFourFileQuarantineRules(p.CLOUD_QUARANTINE_OPEN_RULES,p.CLOUD_QUARANTINE_SOURCES),CLOUD_CLOSURE_RULES);
 assert.throws(()=>buildFourFileQuarantineRules("allow read: if true;",p.CLOUD_QUARANTINE_SOURCES));assert.throws(()=>buildFourFileQuarantineRules(p.CLOUD_QUARANTINE_OPEN_RULES,["other"]));
});
test("fresh IAM permissions cannot bypass the seven-minute guard",async()=>{const f=await retained();f.signal.iamBindingGrantedAt=new Date(f.deps.now()).toISOString();await assert.rejects(f.run(),/settling/);assert.equal(f.calls.length,0);});
test("source and private-copy drift both prevent the first rule repair",async()=>{
 for(const object of [p.CLOUD_QUARANTINE_SOURCES[0],p.CLOUD_QUARANTINE_TARGETS[0]]){const f=await retained();f.objects.get(object)!.metageneration="2";await assert.rejects(f.run(),/existing_object_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));}
});
test("an unowned or token-bearing copy cannot be adopted",async()=>{
 for(const token of [false,true]){const f=await retained(),object=f.objects.get(p.CLOUD_QUARANTINE_TARGETS[0])!;if(token)object.metadata.firebaseStorageDownloadTokens="unexpected";else object.metadata.quarantinePlanDigest="foreign";await assert.rejects(f.run(),/existing_object_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));}
});
test("an unstable positive control stops before board or token changes",async()=>{
 const f=await retained(),probe=f.deps.publicStatus;f.deps.publicStatus=async(path,token)=>path===p.CLOUD_QUARANTINE_PUBLIC_CONTROL?403:probe(path,token);await assert.rejects(f.run(),/propagation/);assert.ok(!f.calls.some(c=>c.op==="clearBoard"||c.op==="revoke"||c.op==="retire"));
});
test("the transport rejects duplicate copies/uploads and any unreviewed rule source",()=>{
 for(const c of [{op:"copy"},{op:"upload"},{op:"seedBoard"},{op:"createRules",content:p.CLOUD_QUARANTINE_OPEN_RULES},{op:"createRules",content:p.CLOUD_QUARANTINE_LOCKED_RULES}])assert.throws(()=>buildCloudTestRequest(c,new Set()));
});
