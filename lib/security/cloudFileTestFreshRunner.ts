import { open, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { FRESH_PHASE1_RUN, FRESH_PHASE1_DIGEST, assertFreshExecutionSignal, approvedFreshPhase1Plan, type FreshPhase1Plan } from "./cloudFileTestFreshPlan";
import { appendPhase1Journal, executeFreshPhase1, verifyFixture, requirePhase1, type Fixture, type JournalEvent, type Phase1Provider } from "./cloudFileTestFreshExecution";
import { assertCloudTestBoundary, assertCloudTestAdcPath, CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";

export async function loadFreshLocalInputs() {
  const root = path.resolve(".vercel/security-cloud-test/phase1", FRESH_PHASE1_RUN);
  requirePhase1(path.relative(root, await realpath(root)) === "", "fresh_artifact_directory_indirection_refused");
  const read = async (name: string) => { const file = path.join(root, name);
    requirePhase1(path.relative(file, await realpath(file)) === "", "fresh_artifact_file_indirection_refused"); return readFile(file); };
  const plan = approvedFreshPhase1Plan(JSON.parse((await read("plan.json")).toString("utf8"))), fixtures: Fixture[] = [];
  for (const file of plan.fixtures) { const fixture = { ...file, bytes: await read(file.filename) }; verifyFixture(fixture); fixtures.push(fixture); }
  return { root, plan, fixtures };
}
export type FreshJournal = { append(event: JournalEvent): Promise<void>; close(): Promise<void> };
export async function openExclusiveFreshJournal(root: string, input: unknown): Promise<FreshJournal> {
  const plan = approvedFreshPhase1Plan(input);
  requirePhase1(path.relative(root, await realpath(root)) === "", "fresh_journal_directory_indirection_refused");
  const handle = await open(path.join(root, "execution.journal.jsonl"), "wx", 0o600);
  return { append: event => appendPhase1Journal(handle, plan, event), close: () => handle.close() };
}
export type FreshRunDependencies = {
  localInputs: typeof loadFreshLocalInputs; journal: typeof openExclusiveFreshJournal;
  provider(input: FreshPhase1Plan, adc: string, execute: boolean, approval: string): Promise<Phase1Provider>;
};
export async function runFreshPhase1Command(options: { execute: boolean; approval: string; adc: string }, dependencies?: FreshRunDependencies) {
  if (options.execute || options.approval) assertFreshExecutionSignal(options.execute, options.approval);
  const bindings = dependencies || { localInputs: loadFreshLocalInputs, journal: openExclusiveFreshJournal,
    provider: async (input: FreshPhase1Plan, adc: string, execute: boolean, approval: string) =>
      (await import("./cloudFileTestFreshProvider")).createFreshPhase1CloudProvider(input, adc, execute, approval) };
  const { root, plan, fixtures } = await bindings.localInputs(); approvedFreshPhase1Plan(plan);
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const adc = assertCloudTestAdcPath(options.adc, process.cwd()); requirePhase1(path.relative(CLOUD_TEST_ADC_PATH, adc) === "", "exact_fresh_test_adc_path_required");
  if (!options.execute) {
    let journalExists = false;
    try { await stat(path.join(root, "execution.journal.jsonl")); journalExists = true; }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    return { status: "fresh_local_validation_passed", runId: FRESH_PHASE1_RUN, planDigest: FRESH_PHASE1_DIGEST,
      cloudRequests: 0, adcOpened: false, journalExists, separateExecutionSignalRequired: true, objectCount: plan.objectAllowlist.length };
  }
  const journal = await bindings.journal(root, plan); let coordinatorStarted = false;
  try {
    const provider = await bindings.provider(plan, adc, options.execute, options.approval); coordinatorStarted = true;
    return await executeFreshPhase1(plan, fixtures, provider, event => journal.append(event), options.execute, options.approval);
  } catch {
    if (!coordinatorStarted) await journal.append({ stage: "stopped_no_automatic_cleanup" });
    throw new Error("fresh_phase_one_stopped_review_separate_journal");
  } finally { await journal.close(); }
}
