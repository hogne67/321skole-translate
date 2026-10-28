import assert from "node:assert/strict";
import { test } from "node:test";
import { digest } from "./reconciliation";
import { executeApprovedQuarantine, type QuarantinePlan, type QuarantineGate, type QuarantineOperations, type QuarantineCopy } from "./quarantineExecution";

const plan: QuarantinePlan = { projectId: "synthetic-production", bucket: "synthetic-production.appspot.com", files: Array.from({ length: 4 }, (_, index) => ({
  sourcePath: `synthetic/${index}`, proposedArchivePath: `private-file-quarantine/${index}`, generation: "11", metageneration: "1", size: 3,
  contentType: "audio/webm", md5Hash: "synthetic-checksum", crc32c: null })), boardChange: { document: "spaces/synthetic/board/state",
  expectedValueDigest: "synthetic-url-hash", updateTime: { seconds: 1, nanoseconds: 1 }, referenceStillMatches: true, versionStableDuringInspection: true, active: false, imageMode: false } };
const approval = { planDigest: digest(plan), sourceRetirementApproved: true };
// This is a synthetic unit fixture, never a usable provider receipt or production credential.
const gate: QuarantineGate = { testProjectId: "synthetic-cloud-test", productionProjectId: plan.projectId, passed: true, checkedAt: "2026-10-16T00:00:00Z",
  copyPreconditions: true, deletePreconditions: true, tokenRevocation: true, softDelete: true };
function fixture() {
  const calls: string[] = [];
  const copies = new Map<string, QuarantineCopy>();
  const operations: QuarantineOperations = {
    inspect: async () => { calls.push("inspect"); return { filesUnchanged: true, boardUnchanged: true, rulesUnchanged: true, archivePrivate: true }; },
    copy: async file => { calls.push(`copy:${file.sourcePath}`); const copy = { ...file, path: file.proposedArchivePath, generation: "22", tokenCount: 0, publicAcl: false, cacheControl: "private,no-store" };
      copies.set(file.sourcePath, copy); return copy; },
    verifyCopy: async file => { calls.push(`verify:${file.sourcePath}`); return copies.get(file.sourcePath)!; },
    lockFourPaths: async () => { calls.push("lock"); }, clearBoardReference: async () => { calls.push("clear-board"); },
    revokeToken: async file => { calls.push(`revoke:${file.sourcePath}`); return { generation: file.generation, metageneration: "2", tokenCount: 0 }; },
    retireSource: async (file, metageneration) => { assert.equal(metageneration, "2"); calls.push(`retire:${file.sourcePath}`); },
    verifyResult: async () => ({ liveOriginals: 0, privateCopies: 4, boardCleared: true, otherFilesUnaffected: true }),
  };
  const events: string[] = [];
  return { calls, operations, events, journal: async (event: { stage: string }) => { events.push(event.stage); } };
}
test("missing real cloud gate stops before provider reads or writes", async () => {
  for (const invalid of [{ ...gate, passed: false }, { ...gate, testProjectId: plan.projectId }, { ...gate, testProjectId: "demo-test" }, { ...gate, deletePreconditions: false }]) {
    const state = fixture();
    await assert.rejects(executeApprovedQuarantine(plan, approval, invalid, state.operations, state.journal), /real_isolated_cloud_gate_required/);
    assert.deepEqual(state.calls, []);
  }
});
test("approval must cover the exact plan and source retirement", async () => {
  for (const invalid of [{ ...approval, sourceRetirementApproved: false }, { ...approval, planDigest: "wrong" }]) {
    const state = fixture(); await assert.rejects(executeApprovedQuarantine(plan, invalid, gate, state.operations, state.journal), /specific_owner_approval_required/);
    assert.deepEqual(state.calls, []);
  }
});
test("all four copies must be verified and tokens revoked before the first original is retired", async () => {
  const state = fixture(); await executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal);
  const firstRetire = state.calls.findIndex(call => call.startsWith("retire:"));
  assert.equal(state.calls.slice(0, firstRetire).filter(call => call.startsWith("copy:")).length, 4);
  assert.equal(state.calls.slice(0, firstRetire).filter(call => call.startsWith("revoke:")).length, 4);
  assert.ok(state.calls.indexOf("lock") < state.calls.indexOf("clear-board"));
  assert.equal(state.events.at(-1), "completed_four_files_preserved_privately");
});
test("a changed board or ruleset stops before the first copy", async () => {
  for (const changed of [{ filesUnchanged: false }, { boardUnchanged: false }, { rulesUnchanged: false }]) {
    const state = fixture(); state.operations.inspect = async () => ({ filesUnchanged: true, boardUnchanged: true, rulesUnchanged: true, archivePrivate: true, ...changed });
    await assert.rejects(executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal), /approved_state_changed/);
    assert.equal(state.calls.length, 0);
  }
});
test("bad checksum or public/token-bearing copy prevents all source retirement", async () => {
  for (const defect of [{ md5Hash: "wrong" }, { tokenCount: 1 }, { publicAcl: true }]) {
    const state = fixture(), original = state.operations.copy;
    state.operations.copy = async file => ({ ...await original(file), ...defect });
    await assert.rejects(executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal), /copy_verification_failed/);
    assert.ok(!state.calls.some(call => call.startsWith("retire:") || call === "clear-board"));
  }
});
test("failed token revocation does not delete any original", async () => {
  const state = fixture(); state.operations.revokeToken = async file => ({ generation: file.generation, metageneration: "2", tokenCount: 1 });
  await assert.rejects(executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal), /source_token_revocation_failed/);
  assert.ok(!state.calls.some(call => call.startsWith("retire:")));
});
test("an archive changed just before source retirement stops without deleting that source", async () => {
  const state = fixture(), original = state.operations.verifyCopy;
  state.operations.verifyCopy = async (file, copy) => ({ ...await original(file, copy), ...(state.calls.some(call => call.startsWith("revoke:")) ? { generation: "changed" } : {}) });
  await assert.rejects(executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal), /private_copy_changed_before_retirement/);
  assert.ok(!state.calls.some(call => call.startsWith("retire:")));
});
test("a retirement failure stops later deletion and never attempts an unsafe rollback", async () => {
  const state = fixture(); let attempts = 0;
  state.operations.retireSource = async () => { attempts++; throw new Error("synthetic_delete_precondition_failed"); };
  await assert.rejects(executeApprovedQuarantine(plan, approval, gate, state.operations, state.journal), /synthetic_delete_precondition_failed/);
  assert.equal(attempts, 1); assert.equal(state.events.at(-1), "stopped_preserve_copies_no_automatic_rollback");
});
