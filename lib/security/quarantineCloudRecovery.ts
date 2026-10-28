import { CLOUD_QUARANTINE_RECOVERY_PLAN, CLOUD_QUARANTINE_RECOVERY_DIGEST } from "./quarantineCloudRecoveryPlan";
import { createHash } from "node:crypto";
import { digest } from "./reconciliation";
import { CLOUD_TEST_PROJECT as project, CLOUD_TEST_BUCKET as bucket, assertCloudTestBoundary } from "./cloudTestBoundary";
import { createQuarantineCloudTestProvider } from "./quarantineCloudTestProvider";
import type { QuarantinePlan } from "./quarantineExecution";
import type { LocalQuarantinePorts, QuarantineBoardState } from "./quarantineLocalProvider";
import type { TestWire, TestCall, TestData } from "./quarantineCloudTestTransport";
import { baselineRuleset, testRelease, testDoc } from "./quarantineCloudTestTransport";
import * as p from "./quarantineCloudTestPlan";
const requireTest:(v:unknown,c:string)=>asserts v=(v,c)=>{if(!v)throw Error(c);};
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const denied=(status:number)=>status===401||status===403;
function timestamp(s:string){requireTest(typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(s),"invalid_test_document_time");return {seconds:Math.floor(Date.parse(s)/1000),nanoseconds:Number((s.split(".")[1]?.slice(0,-1)??"").padEnd(9,"0"))};}
export async function runCloudQuarantineRecovery(deps:{wire:TestWire;publicStatus:(path:string,token?:string)=>Promise<number>;journal:(event:Record<string,unknown>)=>Promise<void>;delay:(ms:number)=>Promise<void>;now:()=>number}, signal:{execute:boolean;approval:string;exclusiveRulesWindow:boolean;iamBindingGrantedAt:string}) {
  assertCloudTestBoundary(project,bucket,process.env);
  requireTest(signal.execute===true&&signal.approval===CLOUD_QUARANTINE_RECOVERY_DIGEST&&signal.exclusiveRulesWindow===true,"cloud_test_approval_and_exclusive_window_required");
  const bindingAge=deps.now()-Date.parse(signal.iamBindingGrantedAt);
  requireTest(Number.isFinite(bindingAge)&&bindingAge>=CLOUD_QUARANTINE_RECOVERY_PLAN.minIamAgeMs&&bindingAge<=CLOUD_QUARANTINE_RECOVERY_PLAN.maxIamAgeMs,"recovery_iam_settling_window_required");
  const {publicStatus,journal}=deps;let writes=0,probes=0;
  const wire:TestWire=async c=>{
    requireTest(!["upload","seedBoard"].includes(c.op),"recovery_cannot_recreate_fixtures");
    if(["createRules","publishRules","copy","clearBoard","revoke","retire"].includes(c.op)) {
      if(c.probe)requireTest(++probes<=4,"recovery_probe_budget_exceeded");else requireTest(++writes<=18,"recovery_write_budget_exceeded");
    }
    return deps.wire(c);
  };
  async function call(c:TestCall,expected=200){const r=await wire(c);requireTest(r.status===expected,"test_request_failed");return r.data;}
  async function rulesSource(name:string){const r=await call({op:"rules",ruleset:name});requireTest(r.name===name&&r.source?.files?.length===1&&typeof r.source.files[0].content==="string","test_rules_source_malformed");return r.source.files[0].content as string;}
  async function release(){const r=await call({op:"release"});requireTest(r.name===testRelease&&typeof r.updateTime==="string","test_release_malformed");return r;}
  const initialRelease=await release();requireTest(initialRelease.rulesetName===baselineRuleset&&initialRelease.updateTime===CLOUD_QUARANTINE_RECOVERY_PLAN.rules.storage.updateTime,"test_baseline_release_changed");
  requireTest(sha(await rulesSource(baselineRuleset))===p.CLOUD_QUARANTINE_BLUEPRINT.storageBaselineSha256,"test_storage_baseline_changed");
  const fr=await call({op:"firestoreRelease"});requireTest(fr.rulesetName===`projects/${project}/rulesets/df233b5e-6a45-4b23-a55d-fedc8afeb53b`,"test_firestore_release_changed");
  const fs=await call({op:"firestoreRules"});requireTest(fs.source?.files?.length===1&&sha(fs.source.files[0].content)===p.CLOUD_QUARANTINE_BLUEPRINT.firestoreBaselineSha256,"test_firestore_baseline_changed");
  const proj=await call({op:"project"}),b=await call({op:"bucket"}),iam=await call({op:"iam"}),db=await call({op:"database"});
  requireTest(proj.projectId===project&&String(proj.projectNumber)===p.CLOUD_QUARANTINE_BLUEPRINT.projectNumber&&b.name===bucket&&String(b.projectNumber)===p.CLOUD_QUARANTINE_BLUEPRINT.projectNumber
    &&b.location?.toLowerCase()==="europe-west1"&&b.iamConfiguration?.uniformBucketLevelAccess?.enabled===true&&String(b.softDeletePolicy?.retentionDurationSeconds)==="604800"
    &&!b.versioning?.enabled&&!b.retentionPolicy&&!b.defaultEventBasedHold&&!b.hierarchicalNamespace?.enabled&&!b.autoclass?.enabled&&!(b.lifecycle?.rule?.length)
    &&db.name===`projects/${project}/databases/(default)`&&db.locationId==="europe-west1"&&db.type==="FIRESTORE_NATIVE","test_project_or_policy_changed");
  requireTest(Array.isArray(iam.bindings)&&!iam.bindings.some(v=>!Array.isArray(v.members)||v.members.some(m=>["allUsers","allAuthenticatedUsers"].includes(m))),"test_public_iam_or_malformed_policy");
  const perms=await call({op:"permissions"});requireTest(["firebaserules.rulesets.create","firebaserules.releases.update","datastore.entities.create","datastore.entities.update"].every(v=>perms.permissions?.includes(v)),"test_permissions_missing_before_any_write");
  for(const path of p.CLOUD_QUARANTINE_TARGETS)await call({op:"head",path},404);
  const seeds=new Map<string,TestData>(),tokens:string[]=[];
  for(const expected of CLOUD_QUARANTINE_RECOVERY_PLAN.objects){
    const data=await call({op:"head",path:expected.path}),i=p.CLOUD_QUARANTINE_SOURCES.indexOf(expected.path),fixture=p.CLOUD_QUARANTINE_FIXTURES[i>=0?i:3];
    const token=String(data.metadata?.firebaseStorageDownloadTokens??"");
    requireTest(data.name===expected.path&&data.bucket===bucket&&data.generation===expected.generation&&data.metageneration===expected.metageneration
      &&Number(data.size)===expected.size&&data.md5Hash===expected.md5Hash&&data.md5Hash===fixture.md5Hash&&data.contentType===fixture.contentType
      &&data.cacheControl==="private,no-store"&&data.metadata?.testRunId===p.CLOUD_QUARANTINE_RUN
      &&(i>=0?/^[a-f0-9-]{36}$/.test(token):token===""),"recovery_existing_fixture_changed");
    seeds.set(expected.path,data);if(i>=0)tokens[i]=token;
  }
  const board=await call({op:"board"});requireTest(board.name===testDoc&&board.updateTime===CLOUD_QUARANTINE_RECOVERY_PLAN.board.updateTime
    &&board.fields?.testRunId?.stringValue===p.CLOUD_QUARANTINE_RUN&&board.fields.active?.booleanValue===false&&board.fields.mode?.stringValue==="text"
    &&board.fields.data?.mapValue?.fields?.imageUrl?.stringValue===`gs://${bucket}/${p.CLOUD_QUARANTINE_SOURCES[3]}`
    &&board.fields.data?.mapValue?.fields?.syntheticSentinel?.stringValue==="keep","recovery_existing_board_changed");
  await journal({stage:"recovery_preflight_passed_existing_fixtures_adopted",planDigest:CLOUD_QUARANTINE_RECOVERY_DIGEST,fixtureObjects:6,fixtureDocuments:1,bindingAgeMs:bindingAge,mutations:0});
  // Prove non-empty, working legacy tokens while the original closed rules still apply.
  for(const [i,path] of p.CLOUD_QUARANTINE_SOURCES.entries())requireTest([200,206].includes(await publicStatus(path,tokens[i]))&&denied(await publicStatus(path)),"test_legacy_token_baseline_failed");
  let currentRelease=initialRelease;
  async function assertRelease(){const r=await release();requireTest(r.rulesetName===currentRelease.rulesetName&&r.updateTime===currentRelease.updateTime,"test_rules_concurrent_change_preserve_state");}
  async function publish(name:string){await assertRelease();await journal({stage:"release_intent",from:currentRelease.rulesetName,to:name});
    const r=await call({op:"publishRules",ruleset:name});requireTest(r.name===testRelease&&r.rulesetName===name,"test_publish_not_confirmed");currentRelease=r;await assertRelease();}
  async function activate(content:string){await assertRelease();const r=await call({op:"createRules",content});requireTest(typeof r.name==="string"&&r.name.startsWith(`projects/${project}/rulesets/`),"test_created_ruleset_mismatch");requireTest(await rulesSource(r.name)===content,"test_created_rules_source_mismatch");await publish(r.name);}
  async function waitFor(check:()=>Promise<boolean>){for(let i=0;i<30;i++){if(await check())return;await deps.delay(2000);}throw Error("test_rules_propagation_not_verified");}
  await activate(p.CLOUD_QUARANTINE_OPEN_RULES);
  await waitFor(async()=>[200,206].includes(await publicStatus(p.CLOUD_QUARANTINE_PUBLIC_CONTROL))&&await all(p.CLOUD_QUARANTINE_SOURCES,async path=>[200,206].includes(await publicStatus(path))));
  const image=`gs://${bucket}/${p.CLOUD_QUARANTINE_SOURCES[3]}`;
  const plan:QuarantinePlan={projectId:project,bucket,files:p.CLOUD_QUARANTINE_SOURCES.map((sourcePath,i)=>{const s=seeds.get(sourcePath)!;return {sourcePath,proposedArchivePath:p.CLOUD_QUARANTINE_TARGETS[i],generation:s.generation,metageneration:s.metageneration,size:Number(s.size),contentType:s.contentType,md5Hash:s.md5Hash,crc32c:s.crc32c??null};}),
    boardChange:{document:p.CLOUD_QUARANTINE_BOARD,expectedValueDigest:digest(image),updateTime:timestamp(board.updateTime),referenceStillMatches:true,versionStableDuringInspection:true,active:false,imageMode:false}};
  let latestBoard=board;
  async function readBoard():Promise<QuarantineBoardState>{const v=await call({op:"board"});requireTest(v.name===testDoc&&v.fields?.testRunId?.stringValue===p.CLOUD_QUARANTINE_RUN,"test_board_identity_mismatch");latestBoard=v;
    requireTest(v.fields.active?.booleanValue===false&&v.fields.mode?.stringValue==="text"&&v.fields.data?.mapValue?.fields?.syntheticSentinel?.stringValue==="keep","test_unrelated_board_fields_changed");
    const value=v.fields.data?.mapValue?.fields?.imageUrl?.stringValue;requireTest(value===image||value==="","test_board_value_changed");return {valueDigest:digest(value),version:timestamp(v.updateTime),stable:true,active:false,imageMode:false};}
  const ports:LocalQuarantinePorts={
    storage:async r=>{
      if(r.method==="GET")return wire({op:"head",path:r.path});
      if(r.method==="POST")return wire({op:"copy",path:r.path,destination:r.destination,generation:r.query.ifSourceGenerationMatch,metageneration:r.query.ifSourceMetagenerationMatch,planDigest:digest(plan),sourceDigest:digest(r.path)});
      return wire({op:r.method==="PATCH"?"revoke":"retire",path:r.path,generation:r.query.ifGenerationMatch,metageneration:r.query.ifMetagenerationMatch});
    },
    board:{read:async document=>{requireTest(document===p.CLOUD_QUARANTINE_BOARD,"test_board_not_allowlisted");return readBoard();},clear:async(document,expected,version)=>{
      requireTest(document===p.CLOUD_QUARANTINE_BOARD,"test_board_not_allowlisted");const state=await readBoard();requireTest(state.valueDigest===expected&&digest(state.version)===digest(version),"test_board_version_changed");await call({op:"clearBoard",updateTime:latestBoard.updateTime});}},
    rules:{currentDigest:async()=>{await assertRelease();return digest(await rulesSource(currentRelease.rulesetName));},replace:async(expected,content)=>{
      requireTest(expected===digest(p.CLOUD_QUARANTINE_OPEN_RULES)&&content===p.CLOUD_QUARANTINE_LOCKED_RULES,"test_rule_transition_refused");await activate(content);
      await waitFor(async()=>all([...p.CLOUD_QUARANTINE_SOURCES,...p.CLOUD_QUARANTINE_TARGETS,p.CLOUD_QUARANTINE_PRIVATE_CONTROL],async path=>denied(await publicStatus(path))));},
      denied:paths=>all(paths,async path=>denied(await publicStatus(path))),readable:async path=>[200,206].includes(await publicStatus(path))},
  };
  await journal({stage:"protocol_plan",planDigest:digest(plan),files:plan.files,boardVersion:plan.boardChange.updateTime});
  const ops=createQuarantineCloudTestProvider(plan,{baseRules:p.CLOUD_QUARANTINE_OPEN_RULES,archiveControl:p.CLOUD_QUARANTINE_PRIVATE_CONTROL,unaffectedControl:p.CLOUD_QUARANTINE_PUBLIC_CONTROL},ports,journal,{execute:signal.execute,approval:p.CLOUD_QUARANTINE_BLUEPRINT_DIGEST});
  await ops.inspect();const copies=[];for(const file of plan.files){const copy=await ops.copy(file);await ops.verifyCopy(file,copy);copies.push(copy);}
  const f=plan.files[0];const copyProbe=await wire({op:"copy",path:f.sourcePath,destination:f.proposedArchivePath,generation:f.generation,metageneration:f.metageneration,planDigest:digest(plan),sourceDigest:digest(f.sourcePath),probe:true});requireTest(copyProbe.status===412,"test_copy_overwrite_probe_failed");
  await ops.lockFourPaths();await ops.clearBoardReference();
  const boardProbe=await wire({op:"clearBoard",updateTime:board.updateTime,probe:true});requireTest([400,409,412].includes(boardProbe.status)&&boardProbe.data?.error?.status==="FAILED_PRECONDITION","test_board_version_probe_failed");
  const revoked=[];for(const [i,file] of plan.files.entries()){
    revoked.push(await ops.revokeToken(file));requireTest(denied(await publicStatus(file.sourcePath,tokens[i]))&&denied(await publicStatus(file.proposedArchivePath,tokens[i])),"test_old_token_still_usable");
  }
  const tokenProbe=await wire({op:"revoke",path:f.sourcePath,generation:f.generation,metageneration:f.metageneration,probe:true});requireTest(tokenProbe.status===412,"test_stale_metageneration_probe_failed");
  const deleteProbe=await wire({op:"retire",path:f.sourcePath,generation:f.generation,metageneration:f.metageneration,probe:true});requireTest(deleteProbe.status===412,"test_stale_delete_precondition_probe_failed");
  await journal({stage:"all_four_tokens_revoked_and_old_links_denied",sourcesStillLive:4});
  for(const [i,file] of plan.files.entries())await ops.retireSource(file,revoked[i].metageneration);
  const result=await ops.verifyResult();
  await publish(baselineRuleset);
  await waitFor(async()=>denied(await publicStatus(p.CLOUD_QUARANTINE_PUBLIC_CONTROL)));
  // Admin metadata confirms the control still exists while clients are denied after restore.
  for(const path of [...p.CLOUD_QUARANTINE_TARGETS,p.CLOUD_QUARANTINE_PRIVATE_CONTROL,p.CLOUD_QUARANTINE_PUBLIC_CONTROL])await call({op:"head",path});
  requireTest((await call({op:"firestoreRelease"})).rulesetName===fr.rulesetName,"test_firestore_rules_changed_during_run");
  await journal({stage:"completed",result,storageBaselineRestored:true,liveTestObjects:6,retainedTestDocuments:1,retainedCreatedRulesets:2,rejectedWriteProbes:4,productionMutations:0});
  return {...result,storageBaselineRestored:true,liveTestObjects:6,retainedTestDocuments:1,retainedCreatedRulesets:2,rejectedWriteProbes:4,productionMutations:0};
}
async function all<T>(values:T[],check:(v:T)=>Promise<boolean>){for(const value of values)if(!await check(value))return false;return true;}
