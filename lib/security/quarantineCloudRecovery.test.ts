import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture} from "./quarantineCloudRecoveryFixture";
import {runCloudQuarantineRecovery} from "./quarantineCloudRecovery";
import {CLOUD_QUARANTINE_RECOVERY_PLAN as plan,CLOUD_QUARANTINE_RECOVERY_DIGEST as approval} from "./quarantineCloudRecoveryPlan";
import * as p from "./quarantineCloudTestPlan";
import type {TestData} from "./quarantineCloudTestTransport";
async function retained(){
 const f=fixture();
 for(const expected of plan.objects)await f.deps.wire({op:"upload",path:expected.path,...(p.CLOUD_QUARANTINE_SOURCES.includes(expected.path)?{token:"11111111-1111-1111-1111-111111111111"}:{})});
 await f.deps.wire({op:"seedBoard"});
 for(const expected of plan.objects)Object.assign(f.objects.get(expected.path)!,{generation:expected.generation,metageneration:expected.metageneration});
 f.setBoardVersion(plan.board.updateTime);f.setReleaseVersion(plan.rules.storage.updateTime);f.calls.length=0;f.events.length=0;
 const now=Date.parse("2026-10-19T16:10:00Z"),signal={execute:true,approval,exclusiveRulesWindow:true,iamBindingGrantedAt:new Date(now-plan.minIamAgeMs).toISOString()};
 const deps={...f.deps,now:()=>now};
 return {...f,deps,signal,run:()=>runCloudQuarantineRecovery(deps,signal)};
}
test("recovery adopts the retained versions and completes 18 writes plus four rejected probes without recreating fixtures",async()=>{
 const f=await retained(),r=await f.run();assert.equal(r.liveOriginals,0);assert.equal(r.privateCopies,4);assert.equal(r.storageBaselineRestored,true);assert.equal(f.objects.size,6);
 assert.ok(!f.calls.some(c=>["upload","seedBoard"].includes(c.op)));
 const writes=f.calls.filter(c=>["createRules","publishRules","copy","clearBoard","revoke","retire"].includes(c.op));assert.equal(writes.filter(c=>!c.probe).length,18);assert.equal(writes.filter(c=>c.probe).length,4);
});
test("a fresh IAM grant, future timestamp or overly old lease stops before any read",async()=>{
 for(const age of [0,plan.minIamAgeMs-1,-1000,plan.maxIamAgeMs+1]){const f=await retained();f.signal.iamBindingGrantedAt=new Date(f.deps.now()-age).toISOString();await assert.rejects(f.run(),/settling_window/);assert.equal(f.calls.length,0);}
});
test("wrong recovery approval and absent exclusive rule window stop before any read",async()=>{
 for(const change of [{approval:"wrong"},{exclusiveRulesWindow:false},{execute:false}]){const f=await retained();Object.assign(f.signal,change);await assert.rejects(f.run(),/approval/);assert.equal(f.calls.length,0);}
});
test("a changed source version prevents every recovery write",async()=>{
 for(const field of ["generation","metageneration"] as const){const f=await retained();f.objects.get(p.CLOUD_QUARANTINE_SOURCES[0])![field]="999";await assert.rejects(f.run(),/fixture_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));}
});
test("control object drift is also rejected before rules are created",async()=>{
 const f=await retained();f.objects.get(p.CLOUD_QUARANTINE_PUBLIC_CONTROL)!.metageneration="2";await assert.rejects(f.run(),/fixture_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));
});
test("an existing partial archive blocks recovery without overwriting it",async()=>{
 const f=await retained();f.objects.set(p.CLOUD_QUARANTINE_TARGETS[0],{} as TestData);await assert.rejects(f.run(),/request_failed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));
});
test("a changed board version is not silently adopted",async()=>{
 const f=await retained();f.setBoardVersion("2026-10-19T16:00:00Z");await assert.rejects(f.run(),/existing_board_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));
});
test("another rule publication, including the same ruleset with a new timestamp, stops recovery",async()=>{
 const f=await retained();f.setReleaseVersion("2026-10-19T16:00:00Z");await assert.rejects(f.run(),/baseline_release_changed/);assert.equal(f.calls.length,1);
});
test("a fresh Rules 403 stops after one creation attempt and preserves all six retained objects",async()=>{
 const f=await retained(),wire=f.deps.wire;let attempts=0;
 f.deps.wire=async c=>c.op==="createRules"?(attempts++,{status:403,data:{} as TestData}):wire(c);
 await assert.rejects(f.run(),/request_failed/);assert.equal(attempts,1);assert.equal(f.objects.size,6);assert.ok(!f.calls.some(c=>["publishRules","copy","revoke","retire"].includes(c.op)));
});
test("changed checksum, fixture owner or token state prevents every recovery write",async()=>{
 for(const change of ["checksum","owner","token"]){const f=await retained(),object=f.objects.get(p.CLOUD_QUARANTINE_SOURCES[0])!;
  if(change==="checksum")object.md5Hash="wrong";if(change==="owner")object.metadata.testRunId="foreign";if(change==="token")object.metadata.firebaseStorageDownloadTokens="";
  await assert.rejects(f.run(),/fixture_changed/);assert.ok(!f.calls.some(c=>c.op==="createRules"));}
});
