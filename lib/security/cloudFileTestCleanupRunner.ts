import { createHash } from "node:crypto";
import { open, readFile, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { approvedCleanupPlan, assertCleanupExecutionSignal, CLEANUP_ID, CLEANUP_DIGEST, ORIGINAL_JOURNAL_SHA256,
  executePhase1Cleanup, safeCleanupEvent, type CleanupPlan, type CleanupEvent, type CleanupProvider } from "./cloudFileTestCleanup";
import { approvedPhase1Plan, PHASE1_RUN, requirePhase1, verifyFixture, type Fixture } from "./cloudFileTestExecution";
import { assertCloudTestBoundary, assertCloudTestAdcPath, CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";

export async function loadCleanupLocalInputs() {
  const root = path.resolve(".vercel/security-cloud-test/cleanup", CLEANUP_ID);
  const originalRoot = path.resolve(".vercel/security-cloud-test/phase1", PHASE1_RUN);
  for (const directory of [root, originalRoot]) requirePhase1(path.relative(directory, await realpath(directory)) === "", "cleanup_artifact_directory_indirection_refused");
  const read = async (directory: string, filename: string) => {
    const file = path.join(directory, filename);
    requirePhase1(path.relative(file, await realpath(file)) === "", "cleanup_artifact_file_indirection_refused"); return readFile(file);
  };
  const plan = approvedCleanupPlan(JSON.parse((await read(root, "plan.json")).toString("utf8")));
  for (const [filename, hash] of [["plan.json", plan.evidence.manifestSha256], ["execution.journal.jsonl", ORIGINAL_JOURNAL_SHA256],
    ["read-only-inspection.json", plan.evidence.inspectionSha256], ["copy-token-shape.json", plan.evidence.copyTokenShapeSha256]]) {
    requirePhase1(createHash("sha256").update(await read(originalRoot, filename)).digest("hex") === hash, "cleanup_original_evidence_changed");
  }
  const original = approvedPhase1Plan(JSON.parse((await read(originalRoot, "plan.json")).toString("utf8")));
  const fixtures: Fixture[] = [];
  for (const file of original.fixtures) { const fixture = { ...file, bytes: await read(originalRoot, file.filename) }; verifyFixture(fixture); fixtures.push(fixture); }
  return { root, plan, fixtures };
}

export async function appendCleanupJournal(handle: Pick<FileHandle, "write" | "sync">, input: unknown, event: CleanupEvent) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...safeCleanupEvent(input, event) }) + "\n";
  const result = await handle.write(line);
  requirePhase1(result.bytesWritten === Buffer.byteLength(line), "cleanup_partial_journal_write"); await handle.sync();
}
export type CleanupJournal = { append(event: CleanupEvent): Promise<void>; close(): Promise<void> };
export async function openExclusiveCleanupJournal(root: string, input: unknown): Promise<CleanupJournal> {
  const plan = approvedCleanupPlan(input);
  requirePhase1(path.relative(root, await realpath(root)) === "", "cleanup_journal_directory_indirection_refused");
  const handle = await open(path.join(root, "execution.journal.jsonl"), "wx", 0o600);
  return { append: event => appendCleanupJournal(handle, plan, event), close: () => handle.close() };
}
export type CleanupRunOptions = { execute: boolean; approval: string; adc: string };
export type CleanupRunDependencies = {
  localInputs: typeof loadCleanupLocalInputs;
  journal: typeof openExclusiveCleanupJournal;
  provider(input: CleanupPlan, adc: string, execute: boolean, approval: string): Promise<CleanupProvider>;
};
/** Default mode validates local inputs only. An existing exclusive journal blocks credentials/network. */
export async function runCleanupCommand(options: CleanupRunOptions, dependencies?: CleanupRunDependencies) {
  if (options.execute || options.approval) assertCleanupExecutionSignal(options.execute, options.approval);
  const bindings = dependencies || { localInputs: loadCleanupLocalInputs, journal: openExclusiveCleanupJournal,
    provider: async (input: CleanupPlan, adc: string, execute: boolean, approval: string) =>
      (await import("./cloudFileTestCleanupProvider")).createCleanupCloudProvider(input, adc, execute, approval) };
  const { root, plan, fixtures } = await bindings.localInputs(); approvedCleanupPlan(plan);
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const adc = assertCloudTestAdcPath(options.adc, process.cwd());
  requirePhase1(path.relative(CLOUD_TEST_ADC_PATH, adc) === "", "exact_cleanup_adc_path_required");
  if (!options.execute) return { status: "local_cleanup_validation_passed", cleanupId: CLEANUP_ID, planDigest: CLEANUP_DIGEST,
    objectCount: plan.objects.length, cloudRequests: 0, adcOpened: false, separateExecutionSignalRequired: true };
  const journal = await bindings.journal(root, plan); let coordinatorStarted = false;
  try {
    const provider = await bindings.provider(plan, adc, options.execute, options.approval);
    coordinatorStarted = true;
    return await executePhase1Cleanup(plan, fixtures, provider, event => journal.append(event), options.execute, options.approval);
  } catch {
    if (!coordinatorStarted) await journal.append({ stage: "stopped_no_automatic_cleanup" });
    throw new Error("cleanup_command_stopped_review_separate_journal");
  } finally { await journal.close(); }
}
