import * as p from "./quarantineCloudTestPlan";
import {digest} from "./reconciliation";
/** Exact test policy: only the already approved public control can be read. No incoming-resource access on reads. */
export const CLOUD_CLOSURE_RULES=p.CLOUD_QUARANTINE_OPEN_RULES.replace(JSON.stringify([...p.CLOUD_QUARANTINE_SOURCES,p.CLOUD_QUARANTINE_PUBLIC_CONTROL]),JSON.stringify([p.CLOUD_QUARANTINE_PUBLIC_CONTROL]));
export function buildFourFileQuarantineRules(source:string,paths:string[]){
 if(source!==p.CLOUD_QUARANTINE_OPEN_RULES||digest(paths)!==digest(p.CLOUD_QUARANTINE_SOURCES))throw Error("closure_rules_outside_exact_test_scope");
 return CLOUD_CLOSURE_RULES;
}
