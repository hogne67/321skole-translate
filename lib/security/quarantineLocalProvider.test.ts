import assert from "node:assert/strict";
import { test } from "node:test";
import { executeApprovedQuarantine, type QuarantineGate, type QuarantinePlan, type QuarantineEvent } from "./quarantineExecution";
import { createLocalQuarantineProvider, type LocalQuarantinePorts, type QuarantineStorageRequest, type QuarantineBoardState } from "./quarantineLocalProvider";
import { digest } from "./reconciliation";

function fixture() {
  const project = "demo-security-round1", boardPath = "spaces/quarantine-rehearsal-unit/board/state";
  const files = Array.from({ length: 4 }, (_, index) => {
    const path = index === 3 ? "covers/quarantine-rehearsal-unit/board.png" : `spaces/quarantine-rehearsal-unit/assignments/task/submissions/pupil/audio/${index}.webm`;
    return { sourcePath: path, proposedArchivePath: `private-file-quarantine/${digest([project, path, "11"])}`, generation: "11", metageneration: "1", size: 3,
      contentType: index === 3 ? "image/png" : "audio/webm", md5Hash: "synthetic-md5", crc32c: "synthetic-crc" };
  });
  const plan: QuarantinePlan = { projectId: project, bucket: `${project}.appspot.com`, files, boardChange: { document: boardPath,
    expectedValueDigest: digest("https://synthetic.invalid/image"), updateTime: { seconds: 1, nanoseconds: 0 }, referenceStillMatches: true,
    versionStableDuringInspection: true, active: false, imageMode: false } };
  const options = { baseRules: 'rules_version = "2";\nservice firebase.storage {\nmatch /b/{bucket}/o {\n allow read: if true;\n}\n}',
    archiveControl: `private-file-quarantine/${digest("unit-control")}`, unaffectedControl: "covers/quarantine-rehearsal-unit/unaffected.png" };
  const objects = new Map<string, Record<string, unknown>>();
  for (const file of files) objects.set(file.sourcePath, { name: file.sourcePath, bucket: plan.bucket, generation: "11", metageneration: "1", size: "3",
    contentType: file.contentType, md5Hash: file.md5Hash, crc32c: file.crc32c, metadata: { firebaseStorageDownloadTokens: "synthetic-token", keep: "source-marker" } });
  objects.set(options.archiveControl, { name: options.archiveControl, bucket: plan.bucket, generation: "11", metageneration: "1", metadata: {}, cacheControl: "private,no-store" });
  objects.set(options.unaffectedControl, { name: options.unaffectedControl, bucket: plan.bucket, generation: "11", metageneration: "1", metadata: {} });
  let rules = options.baseRules;
  let board: QuarantineBoardState = { valueDigest: plan.boardChange.expectedValueDigest, version: plan.boardChange.updateTime, stable: true, active: false, imageMode: false };
  const writes: string[] = [], requests: QuarantineStorageRequest[] = [], events: QuarantineEvent[] = [];
  const ports: LocalQuarantinePorts = {
    storage: async request => {
      requests.push(structuredClone(request)); const data = objects.get(request.path);
      if (request.method === "GET") return data ? { status: 200, data: structuredClone(data) } : { status: 404 };
      if (!data) return { status: 404 };
      if (request.method === "POST") {
        assert.equal(request.query.ifSourceGenerationMatch, data.generation); assert.equal(request.query.ifSourceMetagenerationMatch, data.metageneration);
        assert.equal(request.query.ifGenerationMatch, "0"); assert.ok(request.destination); assert.ok(!objects.has(request.destination));
        writes.push("copy"); const result = { ...data, ...request.body, name: request.destination, generation: "22", metageneration: "1" };
        objects.set(request.destination, result); return { status: 200, data: structuredClone(result) };
      }
      assert.deepEqual(request.query, { ifGenerationMatch: String(data.generation), ifMetagenerationMatch: String(data.metageneration) });
      assert.ok(!("generation" in request.query), "never select an old historical generation for deletion");
      if (request.method === "PATCH") {
        assert.deepEqual(request.body, { metadata: { firebaseStorageDownloadTokens: null } }); writes.push("revoke");
        const result = { ...data, metadata: { ...(data.metadata as object), firebaseStorageDownloadTokens: null }, metageneration: "2" };
        objects.set(request.path, result); return { status: 200, data: structuredClone(result) };
      }
      writes.push("retire"); objects.delete(request.path); return { status: 204 };
    },
    board: {
      read: async document => { assert.equal(document, boardPath); return structuredClone(board); },
      clear: async (document, expected, version) => { assert.equal(document, boardPath); assert.equal(board.valueDigest, expected); assert.deepEqual(board.version, version);
        writes.push("board"); board = { ...board, valueDigest: digest(""), version: { seconds: 2, nanoseconds: 0 } }; },
    },
    rules: {
      currentDigest: async () => digest(rules),
      replace: async (expected, value) => { assert.equal(expected, digest(rules)); writes.push("rules"); rules = value; },
      denied: async paths => paths.every(path => path.startsWith("private-file-quarantine/") || (rules.includes("isFourFileQuarantinePath") && files.some(file => file.sourcePath === path))),
      readable: async path => path === options.unaffectedControl && objects.has(path),
    },
  };
  // Synthetic phase-coordinator gate only; never interpreted as actual cloud evidence.
  const gate: QuarantineGate = { testProjectId: "synthetic-unit-gate", productionProjectId: project, passed: true, checkedAt: "2026-10-19T00:00:00Z",
    copyPreconditions: true, deletePreconditions: true, tokenRevocation: true, softDelete: true };
  const journal = async (event: QuarantineEvent) => { events.push(structuredClone(event)); };
  const provider = () => createLocalQuarantineProvider(plan, options, ports, journal);
  const run = () => executeApprovedQuarantine(plan, { planDigest: digest(plan), sourceRetirementApproved: true }, gate, provider(), journal);
  return { plan, options, objects, writes, requests, events, ports, gate, provider, run, journal, changeBoard: () => { board.version = { seconds: 7, nanoseconds: 0 }; } };
}

test("complete local protocol preserves four copies, uses conditional writes and journals intent before mutation", async () => {
  const f = fixture(); assert.deepEqual(await f.run(), { liveOriginals: 0, privateCopies: 4, boardCleared: true, otherFilesUnaffected: true });
  assert.deepEqual(f.writes, ["copy", "copy", "copy", "copy", "rules", "board", "revoke", "revoke", "revoke", "revoke", "retire", "retire", "retire", "retire"]);
  for (const file of f.plan.files) { assert.ok(!f.objects.has(file.sourcePath)); assert.ok(f.objects.has(file.proposedArchivePath)); }
  assert.equal(f.events.filter(event => event.stage.startsWith("provider_intent_")).length, 14);
  assert.equal(f.events.at(-1)?.stage, "completed_four_files_preserved_privately");
  assert.ok(!JSON.stringify(f.events).includes("synthetic-token") && !JSON.stringify(f.events).includes("https://"));
});

test("real projects and missing/mismatched emulator boundaries fail before any port call", () => {
  const f = fixture(); f.plan.projectId = "skole-c09b8";
  assert.throws(f.provider, /local_quarantine_emulators_required/); assert.equal(f.requests.length, 0);
});
test("invalid file metadata and target mapping fail before reads", () => {
  for (const change of [{ size: -1 }, { metageneration: "" }, { proposedArchivePath: "private-file-quarantine/foreign" }, { sourcePath: "covers/real-user/file.png" }]) {
    const f = fixture(); Object.assign(f.plan.files[0], change); assert.throws(f.provider, /invalid_local_quarantine_file/); assert.equal(f.requests.length, 0);
  }
});
test("changed source or existing archive prevents every write", async () => {
  for (const target of [false, true]) {
    const f = fixture(), file = f.plan.files[0];
    if (target) f.objects.set(file.proposedArchivePath, { ...f.objects.get(file.sourcePath), name: file.proposedArchivePath });
    else f.objects.get(file.sourcePath)!.metageneration = "9";
    await assert.rejects(f.run(), target ? /target_already_exists/ : /source_version_changed/); assert.deepEqual(f.writes, []);
  }
});
test("foreign or modified file argument is rejected even after an approved preflight", async () => {
  const f = fixture(), operations = f.provider(); await operations.inspect();
  await assert.rejects(operations.copy({ ...f.plan.files[0], generation: "999" }), /file_outside/); assert.deepEqual(f.writes, []);
  await assert.rejects(operations.copy(f.plan.files[0]), /session_stopped/);
});
test("metadata race at the copy request stops without pretending a partial copy succeeded", async () => {
  const f = fixture(), storage = f.ports.storage;
  f.ports.storage = async request => request.method === "POST" ? { status: 412 } : storage(request);
  await assert.rejects(f.run(), /storage_request_failed/); assert.deepEqual(f.writes, []);
  assert.equal(f.events.at(-1)?.stage, "stopped_preserve_copies_no_automatic_rollback");
});
test("wrong checksum or token-bearing copy stops before rules, board, token revocation or retirement", async () => {
  for (const token of [false, true]) {
    const f = fixture(), storage = f.ports.storage;
    f.ports.storage = async request => { const response = await storage(request); if (request.method === "POST") {
      const copy = f.objects.get(request.destination!)!;
      if (token) (copy.metadata as Record<string, unknown>).firebaseStorageDownloadTokens = "copied-token"; else copy.md5Hash = "wrong";
    } return response; };
    await assert.rejects(f.run(), token ? /not_private_or_owned/ : /integrity_mismatch/); assert.deepEqual(f.writes, ["copy"]);
    assert.ok(f.plan.files.every(file => f.objects.has(file.sourcePath)));
  }
});
test("archive disappearance during access verification is not accepted as private", async () => {
  const f = fixture(), denied = f.ports.rules.denied;
  f.ports.rules.denied = async paths => { const result = await denied(paths);
    if (paths[0] === f.plan.files[0].proposedArchivePath) f.objects.delete(paths[0]); return result; };
  await assert.rejects(f.run(), /metadata_unavailable/); assert.equal(f.writes.filter(value => value === "retire").length, 0);
});
test("rules change after copying preserves all copies and original files", async () => {
  const f = fixture(), current = f.ports.rules.currentDigest;
  f.ports.rules.currentDigest = async () => f.writes.length === 4 ? "changed" : current();
  await assert.rejects(f.run(), /rules_changed/); assert.deepEqual(f.writes, ["copy", "copy", "copy", "copy"]);
  assert.ok(f.plan.files.every(file => f.objects.has(file.sourcePath) && f.objects.has(file.proposedArchivePath)));
});
test("concurrent board edit stops before revocation and retirement", async () => {
  const f = fixture(), replace = f.ports.rules.replace;
  f.ports.rules.replace = async (...args) => { await replace(...args); f.changeBoard(); };
  await assert.rejects(f.run()); assert.deepEqual(f.writes, ["copy", "copy", "copy", "copy", "rules"]);
  assert.ok(f.plan.files.every(file => f.objects.has(file.sourcePath) && f.objects.has(file.proposedArchivePath)));
});
test("one failed token revocation prevents all retirement", async () => {
  const f = fixture(), storage = f.ports.storage; let count = 0;
  f.ports.storage = async request => request.method === "PATCH" && ++count === 3 ? { status: 412 } : storage(request);
  await assert.rejects(f.run(), /storage_request_failed/); assert.ok(!f.writes.includes("retire"));
  assert.ok(f.plan.files.every(file => f.objects.has(file.sourcePath) && f.objects.has(file.proposedArchivePath)));
});
test("a changed private copy at the retirement boundary prevents deletion", async () => {
  const f = fixture(), storage = f.ports.storage;
  f.ports.storage = async request => { const response = await storage(request);
    if (request.method === "PATCH" && f.writes.filter(value => value === "revoke").length === 4) f.objects.get(f.plan.files[0].proposedArchivePath)!.generation = "999";
    return response; };
  await assert.rejects(f.run(), /copy_version_changed/); assert.ok(!f.writes.includes("retire"));
});
test("source overwritten during conditional retirement stops remaining deletion and preserves the replacement", async () => {
  const f = fixture(), storage = f.ports.storage;
  f.ports.storage = async request => { if (request.method === "DELETE") { f.objects.get(request.path)!.generation = "999"; return { status: 412 }; } return storage(request); };
  await assert.rejects(f.run(), /storage_request_failed/); assert.ok(!f.writes.includes("retire"));
  assert.equal(f.objects.get(f.plan.files[0].sourcePath)!.generation, "999");
});
test("failed intent journal prevents the corresponding write", async () => {
  const f = fixture(); const operations = createLocalQuarantineProvider(f.plan, f.options, f.ports, async () => { throw new Error("journal_unavailable"); });
  await operations.inspect(); await assert.rejects(operations.copy(f.plan.files[0]), /journal_unavailable/); assert.deepEqual(f.writes, []);
});
test("provider refuses out-of-order operations and a fresh session refuses old partial copies", async () => {
  const f = fixture(); await assert.rejects(f.provider().retireSource(f.plan.files[0], "2"), /all_tokens_required/);
  const operations = f.provider(); await operations.inspect(); await operations.copy(f.plan.files[0]);
  await assert.rejects(f.provider().inspect(), /target_already_exists/);
});
