import { open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { assertCloudTestAdcPath, assertCloudTestBoundary, CLOUD_TEST_ADC_PATH } from "../lib/security/cloudTestBoundary";
import { appendPhase1Journal, approvedPhase1Plan, assertExecutionSignal, executePhase1, PHASE1_DIGEST, PHASE1_RUN, safePhase1Journal, verifyFixture, type Fixture } from "../lib/security/cloudFileTestExecution";

async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>(); let execute = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--execute-cloud" && !execute) { execute = true; continue; }
    if (!["--execution-approval", "--adc"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("invalid_execution_arguments");
    options.set(args[index], args[++index]);
  }
  if (execute || options.has("--execution-approval")) assertExecutionSignal(execute, options.get("--execution-approval") || "");
  const root = path.resolve(".vercel/security-cloud-test/phase1", PHASE1_RUN);
  if (path.relative(root, await realpath(root)) !== "") throw new Error("artifact_path_indirection_refused");
  const manifestPath = path.join(root, "plan.json");
  if (path.relative(manifestPath, await realpath(manifestPath)) !== "") throw new Error("manifest_path_indirection_refused");
  const plan = approvedPhase1Plan(JSON.parse(await readFile(manifestPath, "utf8")));
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const adc = assertCloudTestAdcPath(options.get("--adc") || CLOUD_TEST_ADC_PATH, process.cwd());
  const fixtures: Fixture[] = [];
  for (const file of plan.fixtures) {
    const filename = path.join(root, file.filename);
    if (path.relative(filename, await realpath(filename)) !== "") throw new Error("fixture_path_indirection_refused");
    const fixture = { ...file, bytes: await readFile(filename) }; verifyFixture(fixture); fixtures.push(fixture);
  }
  if (!execute) {
    console.log(JSON.stringify({ status: "local_validation_passed", cloudRequests: 0, adcOpened: false, runId: PHASE1_RUN,
      planDigest: PHASE1_DIGEST, fixtureCount: fixtures.length, objectCount: plan.objectAllowlist.length, separateExecutionSignalRequired: true }));
    return;
  }
  // Exclusive journal blocks reruns. No resume, automatic cleanup or overwritten journal.
  const journal = await open(path.join(root, "execution.journal.jsonl"), "wx", 0o600);
  try {
    const append = async (event: Parameters<typeof safePhase1Journal>[1]) => appendPhase1Journal(journal, plan, event);
    const { createPhase1CloudProvider } = await import("../lib/security/cloudFileTestProvider");
    const provider = await createPhase1CloudProvider(plan, adc, execute, options.get("--execution-approval")!).catch(async () => {
      await append({ stage: "stopped_no_automatic_cleanup" }); throw new Error("test_client_setup_failed");
    });
    console.log(JSON.stringify(await executePhase1(plan, fixtures, provider, append, execute, options.get("--execution-approval")!)));
  } finally { await journal.close(); }
}
main().catch(() => {
  // No raw exception, auth-library error, request headers, URL or provider body.
  console.log(JSON.stringify({ status: "stopped", runId: PHASE1_RUN, message: "Review local validation or execution journal; no automatic repair or cleanup attempted." }));
  process.exitCode = 1;
});
