// Local preparation only. No auth import, ADC read, network client or cloud execution option.
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { approvedCleanupPlan, buildPhase1CleanupPlan, CLEANUP_ID, cleanupApproval, ORIGINAL_JOURNAL_SHA256 } from "../lib/security/cloudFileTestCleanup";
import { approvedPhase1Plan, PHASE1_RUN, verifyFixture } from "../lib/security/cloudFileTestExecution";
import { assertCloudTestBoundary } from "../lib/security/cloudTestBoundary";

async function main() {
  if (process.argv.length !== 2) throw new Error("cleanup_preparation_accepts_no_cloud_arguments");
  const plan = buildPhase1CleanupPlan();
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const originalRoot = path.resolve(".vercel/security-cloud-test/phase1", PHASE1_RUN);
  const read = async (filename: string) => {
    const file = path.join(originalRoot, filename);
    if (path.relative(file, await realpath(file)) !== "") throw new Error("evidence_indirection_refused");
    return readFile(file);
  };
  for (const [filename, hash] of [["plan.json", plan.evidence.manifestSha256], ["execution.journal.jsonl", ORIGINAL_JOURNAL_SHA256],
    ["read-only-inspection.json", plan.evidence.inspectionSha256], ["copy-token-shape.json", plan.evidence.copyTokenShapeSha256]]) {
    if (createHash("sha256").update(await read(filename)).digest("hex") !== hash) throw new Error("original_evidence_changed");
  }
  const original = approvedPhase1Plan(JSON.parse((await read("plan.json")).toString("utf8")));
  for (const fixture of original.fixtures) verifyFixture({ ...fixture, bytes: await read(fixture.filename) });
  const output = path.resolve(".vercel/security-cloud-test/cleanup", CLEANUP_ID);
  await mkdir(output, { recursive: true });
  if (path.relative(output, await realpath(output)) !== "") throw new Error("cleanup_output_indirection_refused");
  const file = path.join(output, "plan.json");
  try { await writeFile(file, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === "EEXIST")) throw error;
    if (path.relative(file, await realpath(file)) !== "") throw new Error("cleanup_manifest_indirection_refused");
    approvedCleanupPlan(JSON.parse(await readFile(file, "utf8")));
  }
  console.log(JSON.stringify({ status: "cleanup_plan_locally_prepared", cleanupId: plan.cleanupId, planDigest: plan.planDigest,
    objectCount: plan.objects.length, plannedCloudMutations: 6, cloudRequests: 0, adcOpened: false, cloudExecutionImplemented: false,
    originalEvidenceUnchanged: true, futureSeparateApproval: cleanupApproval(plan) }));
}
main().catch(() => { console.log(JSON.stringify({ status: "local_cleanup_preparation_stopped", cloudRequests: 0, adcOpened: false })); process.exitCode = 1; });
