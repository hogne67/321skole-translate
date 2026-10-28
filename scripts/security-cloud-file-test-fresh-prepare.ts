// Local artifacts only. This script has no authentication or network client.
import { mkdir, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { buildFreshPhase1Plan, approvedFreshPhase1Plan } from "../lib/security/cloudFileTestFreshPlan";
import { syntheticFileFixtures } from "../lib/security/cloudFileTestPlan";
import { verifyFixture } from "../lib/security/cloudFileTestFreshExecution";
import { assertCloudTestBoundary } from "../lib/security/cloudTestBoundary";

async function main() {
  if (process.argv.length !== 2) throw new Error("preparation_accepts_no_cloud_arguments");
  const plan = approvedFreshPhase1Plan(buildFreshPhase1Plan()); assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const parent = path.resolve(".vercel/security-cloud-test/phase1");
  if (path.relative(parent, await realpath(parent)) !== "") throw new Error("artifact_parent_indirection_refused");
  const root = path.join(parent, plan.runId);
  await mkdir(root); // Never reuse or overwrite a run directory.
  for (const fixture of syntheticFileFixtures()) {
    const expected = plan.fixtures.find(file => file.id === fixture.id)!; verifyFixture({ ...expected, bytes: fixture.bytes });
    await writeFile(path.join(root, fixture.filename), fixture.bytes, { flag: "wx", mode: 0o600 });
  }
  await writeFile(path.join(root, "plan.json"), JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: "fresh_phase_one_locally_prepared", cloudRequests: 0, adcOpened: false, runId: plan.runId, planDigest: plan.planDigest,
    prefix: plan.prefix, fixtureCount: plan.fixtures.length, objectCount: plan.objectAllowlist.length,
    expectedSuccessfulMutations: plan.expectedSuccessfulMutations, expectedDeniedMutationAttempts: plan.expectedDeniedMutationAttempts }));
}
main().catch(() => { console.log(JSON.stringify({ status: "local_preparation_stopped_no_overwrite", cloudRequests: 0, adcOpened: false })); process.exitCode = 1; });
