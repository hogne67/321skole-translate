import { open, mkdir } from "node:fs/promises";
import { digest } from "./reconciliation";
import { CLOUD_QUARANTINE_RUN } from "./quarantineCloudTestPlan";
function safe(value:unknown):void {
  if(value&&typeof value==="object")for(const [key,v] of Object.entries(value)){
    if(/token|secret|password|authorization|bytes|url/i.test(key))throw Error("test_journal_sensitive_field_refused");safe(v);
  }
}
export async function createQuarantineCloudTestJournal(directory:string,artifactDigest:string){
  if(!/^[a-f0-9]{64}$/.test(artifactDigest))throw Error("test_artifact_digest_required");
  // Exclusive directory reservation: a completed, stopped, or uncertain run can never resume.
  await mkdir(directory,{recursive:false});
  const file=await open(`${directory}/execution.journal.jsonl`,"wx",0o600);
  let previous="0".repeat(64),seq=0,stopped=false;
  return {write:async(event:Record<string,unknown>)=>{
    if(stopped)throw Error("test_journal_stopped");
    try{
      safe(event);const entry={seq:++seq,runId:CLOUD_QUARANTINE_RUN,artifactDigest,at:new Date().toISOString(),previous,event};
      const hash=digest(entry),line=JSON.stringify({...entry,hash})+"\n";
      if(Buffer.byteLength(line)>100000)throw Error("test_journal_event_too_large");
      await file.writeFile(line,"utf8");await file.sync();previous=hash;
    }catch{stopped=true;throw Error("test_durable_journal_failed");}
  },close:()=>file.close()};
}
