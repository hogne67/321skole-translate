import { createHash } from "node:crypto";
import { buildCloudFileTestPlan } from "./cloudFileTestPlan";
import { CLOUD_TEST_BUCKET, CLOUD_TEST_PROJECT } from "./cloudTestBoundary";
import { requirePhase1 } from "./cloudFileTestExecution";

export const FRESH_PHASE1_RUN = "p1-20261016-2556f97597ef";
export const FRESH_PHASE1_DIGEST = "c72b61fa9001a251c1801461bc70096b564dc739002ec88f2b43228fe22c76ba";
function makePlan() {
  const { planDigest: _oldDigest, ...base } = buildCloudFileTestPlan(CLOUD_TEST_PROJECT, CLOUD_TEST_BUCKET, FRESH_PHASE1_RUN); void _oldDigest;
  const plan = { ...base, schema: 2, cloudExecutionImplemented: true, approved: false,
    tokenPolicy: { absentValues: ["missing", "null", "exact_empty_string"], rejectEveryNonEmptyValue: true, coerceOrTrim: false },
    accessVerification: { anonymousGcs: true, anonymousFirebase: true, originalTokenOnBothCopies: true,
      verifyCopiesLiveBeforeAndAfterDenial: true, positiveSourceTokenControlBeforeRevocation: true, verifySourceLiveAfterRevocation: true },
    journalPolicy: { exclusive: true, syncBeforeMutation: true, separateRunDirectory: true, redactCredentialsAndUrls: true },
    signedLink: { sourceOnly: "input/reading.wav", maximumSeconds: 300, restoreSignedSource: false },
    failureHandling: "Stop on any unexpected result; no retries of resource operations, repair, rollback, resume or failure cleanup. Retain the exclusive journal.",
  };
  return { ...plan, planDigest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}
export type FreshPhase1Plan = ReturnType<typeof buildFreshPhase1Plan>;
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); } return value; }
const canonical = freeze(makePlan());
export function buildFreshPhase1Plan() { return structuredClone(canonical); }
export function approvedFreshPhase1Plan(input: unknown) {
  requirePhase1(canonical.planDigest === FRESH_PHASE1_DIGEST && JSON.stringify(input) === JSON.stringify(canonical), "exact_fresh_phase_one_manifest_required"); return buildFreshPhase1Plan();
}
export function assertFreshExecutionSignal(execute: boolean, approval: string) {
  requirePhase1(execute === true && approval === `EXECUTE:${FRESH_PHASE1_RUN}:${FRESH_PHASE1_DIGEST}`, "separate_fresh_phase_one_execution_signal_required");
}
