import assert from "node:assert/strict";
import { runCloudQuarantineTest } from "./quarantineCloudTestExecution";
import { buildCloudTestRequest, baselineRuleset, testRelease, testDoc, type TestCall, type TestData } from "./quarantineCloudTestTransport";
import * as p from "./quarantineCloudTestPlan";
export function fixture(){
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
  return {objects,calls,events,deps,signal,setBoardVersion:(v:string)=>{board!.updateTime=v;},setReleaseVersion:(v:string)=>{release.updateTime=v;},run:()=>runCloudQuarantineTest(deps,signal),changeRelease:()=>{release.updateTime="2026-10-19T09:00:00Z";}};
}