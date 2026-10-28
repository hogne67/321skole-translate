import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPhase1CleanupPlan, approvedCleanupPlan, cleanupApproval, cleanupMutationRequest, executePhase1Cleanup, safeCleanupEvent,
  type CleanupIdentity, type CleanupProvider, type CleanupEvent } from "./cloudFileTestCleanup";
import { buildCloudFileTestPlan, syntheticFileFixtures } from "./cloudFileTestPlan";
import { PHASE1_APPROVAL, PHASE1_RUN, type Fixture, type TestObject } from "./cloudFileTestExecution";
import { normalizeDownloadToken, verifyAnonymousAndOldTokenDenied, verifyPrivateTestObject } from "./cloudFileTestTokens";

const plan = buildPhase1CleanupPlan(), original = buildCloudFileTestPlan(plan.projectId, plan.bucket, PHASE1_RUN);
const fixtures: Fixture[] = original.fixtures.map(file => ({ ...file, bytes: syntheticFileFixtures().find(candidate => candidate.id === file.id)!.bytes }));
const syntheticToken = "00000000-0000-4000-8000-000000000001";
class CleanupMemory implements CleanupProvider {
  live = new Map<string, TestObject>(); soft: TestObject[] = []; calls: string[] = []; mutations = 0;
  revoked = false; preflights = 0;
  identity: CleanupIdentity = { projectId: plan.projectId, projectNumber: plan.projectNumber, bucket: plan.bucket, bucketProjectNumber: plan.projectNumber,
    principal: plan.principal, region: plan.region, uniformBucketLevelAccess: true, publicBinding: false, softDeleteRetentionSeconds: 604800, unexpectedStoragePolicy: false };
  constructor() {
    for (const [index, entry] of plan.objects.entries()) this.live.set(entry.path, { path: entry.path, generation: entry.generation,
      metageneration: entry.metageneration, fixtureId: entry.id, testRunId: PHASE1_RUN, size: entry.size, contentType: entry.contentType,
      md5Hash: entry.md5Hash, crc32c: entry.crc32c, cacheControl: "private,no-store", softDeleted: false,
      token: index === 0 ? syntheticToken : index === 3 ? "" : null });
  }
  async preflight() { this.calls.push("preflight"); this.preflights++; return { ...this.identity }; }
  async head(path: string) { this.calls.push(`head:${path}`); const object = this.live.get(path); return object ? { ...object } : null; }
  async read(object: TestObject) {
    this.calls.push(`read:${object.path}`); const live = this.live.get(object.path);
    assert.equal(live?.generation, object.generation);
    return { status: 200, bytes: Buffer.from(fixtures.find(file => file.id === object.fixtureId)!.bytes) };
  }
  async publicRead(path: string, api: "gcs" | "firebase", token?: string): Promise<number> {
    this.calls.push(`public:${path}:${api}:${token ? "old" : "anonymous"}`);
    const live = this.live.get(path); return !live ? 404 : api === "firebase" && token && live.token === token ? 200 : 403;
  }
  async revokeToken(object: TestObject) {
    this.calls.push(`revoke:${object.path}`); cleanupMutationRequest(plan, object, "revoke");
    const live = this.live.get(object.path)!; assert.equal(live.generation, object.generation); assert.equal(live.metageneration, object.metageneration);
    const revoked = { ...live, token: "", metageneration: "3" };
    this.live.set(object.path, revoked); this.mutations++; this.revoked = true; return { ...revoked };
  }
  async remove(object: TestObject) {
    this.calls.push(`delete:${object.path}`); cleanupMutationRequest(plan, object, "delete");
    const live = this.live.get(object.path)!;
    if (live.generation !== object.generation || live.metageneration !== object.metageneration) throw new Error("synthetic_412");
    this.soft.push({ ...live, softDeleted: true }); this.live.delete(object.path); this.mutations++;
  }
}
function run(memory: CleanupMemory, input: unknown = plan, execute = true, approval = cleanupApproval(plan), files = fixtures) {
  const events: CleanupEvent[] = [];
  return { events, execute: () => executePhase1Cleanup(input, files, memory, async event => { safeCleanupEvent(plan, event); events.push(event); }, execute, approval) };
}

test("separate cleanup gate and immutable five-object plan reject phase 1 approval, altered targets and versions before provider calls", async () => {
  for (const [execute, approval] of [[false, ""], [true, PHASE1_APPROVAL], [true, "CLEANUP:wrong"]] as const) {
    const memory = new CleanupMemory(); await assert.rejects(run(memory, plan, execute, approval).execute); assert.deepEqual(memory.calls, []);
  }
  for (const changed of [{ ...plan, projectId: "skole-c09b8" }, { ...plan, bucket: "production" },
    { ...plan, objects: [...plan.objects, { ...plan.objects[0], path: "outside/file" }] },
    { ...plan, originalJournalSha256: "changed" }, { ...plan, mutations: { total: 7 } },
    { ...plan, objects: plan.objects.map((entry, index) => index ? entry : { ...entry, generation: "123" }) }]) {
    const memory = new CleanupMemory(); await assert.rejects(run(memory, changed).execute); assert.deepEqual(memory.calls, []);
  }
  assert.equal(approvedCleanupPlan(plan).objects.length, 5);
});

test("offline cleanup revokes first, proves denial before any deletion, deletes exactly five and preserves soft generations", async () => {
  const memory = new CleanupMemory(), state = run(memory), result = await state.execute();
  assert.equal(result.mutations, 6); assert.equal(memory.mutations, 6); assert.equal(memory.live.size, 0); assert.equal(memory.soft.length, 5);
  assert.deepEqual(memory.calls.filter(call => /^(revoke|delete):/.test(call)), [`revoke:${plan.objects[0].path}`, ...plan.deletionOrder.map(path => `delete:${path}`)]);
  const revoke = memory.calls.indexOf(`revoke:${plan.objects[0].path}`), firstDelete = memory.calls.indexOf(`delete:${plan.objects[0].path}`);
  assert.ok(memory.calls.slice(0, revoke).includes(`public:${plan.objects[0].path}:firebase:old`));
  for (const probe of ["gcs:anonymous", "firebase:anonymous", "firebase:old"]) {
    assert.ok(memory.calls.slice(revoke, firstDelete).includes(`public:${plan.objects[0].path}:${probe}`));
    assert.ok(memory.calls.slice(revoke, firstDelete).includes(`public:${plan.objects[3].path}:${probe}`));
  }
  for (const object of memory.soft) assert.equal(normalizeDownloadToken(object.token), null);
  assert.equal(state.events.at(-1)?.stage, "completed"); assert.ok(!JSON.stringify(state.events).includes(syntheticToken));
  assert.deepEqual(memory.calls.slice(-7), plan.finalAbsenceChecks.map(path => `head:${path}`));
});

test("all identity and policy deviations block revocation and deletion", async () => {
  for (const defect of [{ projectId: "other" }, { projectNumber: "1" }, { bucketProjectNumber: "1" }, { bucket: "other" },
    { principal: "other" }, { region: "us" }, { uniformBucketLevelAccess: false }, { publicBinding: true },
    { softDeleteRetentionSeconds: 0 }, { unexpectedStoragePolicy: true }]) {
    const memory = new CleanupMemory(); Object.assign(memory.identity, defect);
    await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 0);
  }
});

test("missing, foreign, modified or token-bearing non-source objects stop before the first change", async () => {
  const defects = [{ testRunId: "foreign" }, { fixtureId: "foreign" }, { path: "foreign" }, { size: 1 }, { contentType: "wrong" },
    { md5Hash: "bad" }, { crc32c: "bad" }, { cacheControl: "public" }, { generation: "123" }, { metageneration: "2" },
    { softDeleted: true }, { token: syntheticToken }, { token: " " }, { token: "null" }];
  for (const defect of defects) {
    const memory = new CleanupMemory(); Object.assign(memory.live.get(plan.objects[3].path)!, defect);
    await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 0);
  }
  const missing = new CleanupMemory(); missing.live.delete(plan.objects[1].path);
  await assert.rejects(run(missing).execute); assert.equal(missing.mutations, 0);
  const extra = new CleanupMemory(); extra.live.set(plan.mustRemainAbsent[0], { ...extra.live.get(plan.objects[0].path)!, path: plan.mustRemainAbsent[0] });
  await assert.rejects(run(extra).execute); assert.equal(extra.mutations, 0);
});

test("SHA256 content corruption and changed local fixtures stop before revocation", async () => {
  const memory = new CleanupMemory(); memory.read = async () => ({ status: 200, bytes: Buffer.from("synthetic wrong bytes") });
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 0);
  const files = fixtures.map(file => ({ ...file, bytes: Buffer.from(file.bytes) })); files[0].bytes[20] ^= 1;
  const fresh = new CleanupMemory(); await assert.rejects(run(fresh, plan, true, cleanupApproval(plan), files).execute); assert.deepEqual(fresh.calls, []);
});

test("token positive control must work before revocation", async () => {
  for (const status of [403, 404, 500]) {
    const memory = new CleanupMemory(); memory.publicRead = async () => status;
    await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 0);
  }
});

test("failed revoke or invalid revoke response stops without deletion or a second patch", async () => {
  for (const defect of ["throw", "retained-token", "generation", "metageneration", "checksum"] as const) {
    const memory = new CleanupMemory(), originalRevoke = memory.revokeToken.bind(memory);
    memory.revokeToken = async object => {
      if (defect === "throw") throw new Error("synthetic-secret");
      const changed = await originalRevoke(object);
      if (defect === "retained-token") changed.token = syntheticToken;
      if (defect === "generation") changed.generation = "123";
      if (defect === "metageneration") changed.metageneration = "4";
      if (defect === "checksum") changed.md5Hash = "wrong";
      return changed;
    };
    const state = run(memory); await assert.rejects(state.execute);
    assert.ok(!memory.calls.some(call => call.startsWith("delete:"))); assert.ok(memory.mutations <= 1);
    assert.equal(state.events.at(-1)?.stage, "stopped_no_automatic_cleanup"); assert.ok(!JSON.stringify(state.events).includes(syntheticToken));
  }
});

test("old-token or anonymous success, redirect, outage and timeout after revoke prevent all deletions", async () => {
  for (const target of [plan.objects[0].path, plan.objects[3].path]) for (const response of [200, 302, 429, 500, "timeout"] as const) {
    const memory = new CleanupMemory(), originalPublic = memory.publicRead.bind(memory);
    memory.publicRead = async (path, api, token) => {
      if (memory.revoked && path === target) { if (response === "timeout") throw new Error("synthetic-timeout"); return response; }
      return originalPublic(path, api, token);
    };
    await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 1); assert.equal(memory.live.size, 5);
  }
});

test("changed metadata after revoke blocks deletion even when private access fails", async () => {
  const memory = new CleanupMemory(), originalHead = memory.head.bind(memory);
  memory.head = async path => { const object = await originalHead(path); return object && memory.revoked && path === plan.objects[1].path ? { ...object, metageneration: "2" } : object; };
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 1); assert.equal(memory.live.size, 5);
});

test("concurrent generation change immediately at deletion fails conditional removal and stops later deletions", async () => {
  const memory = new CleanupMemory(), originalRemove = memory.remove.bind(memory);
  memory.remove = async object => {
    if (object.path === plan.objects[1].path) memory.live.get(object.path)!.generation = "9999999999999999999";
    await originalRemove(object);
  };
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 2); assert.equal(memory.live.size, 4);
  assert.ok(!memory.calls.includes(`delete:${plan.objects[2].path}`));
});

test("changed global policy before deletion stops after the single revoke", async () => {
  const memory = new CleanupMemory(), originalPreflight = memory.preflight.bind(memory);
  memory.preflight = async () => ({ ...await originalPreflight(), ...(memory.revoked ? { publicBinding: true } : {}) });
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 1);
});

test("journal failure before revoke or a delete prevents that write", async () => {
  for (const failureStage of ["revoke_intent", "delete_intent"]) {
    const memory = new CleanupMemory();
    await assert.rejects(executePhase1Cleanup(plan, fixtures, memory, async event => { if (event.stage === failureStage) throw new Error("synthetic-journal-failure"); }, true, cleanupApproval(plan)));
    assert.equal(memory.mutations, failureStage === "revoke_intent" ? 0 : 1);
  }
});

test("journal filters secret extras and rejects unapproved paths, stages and token-shaped versions", () => {
  const safe = safeCleanupEvent(plan, { stage: "revoked", object: plan.objects[0].path, token: syntheticToken, url: "secret" } as CleanupEvent);
  assert.ok(!JSON.stringify(safe).includes(syntheticToken)); assert.ok(!JSON.stringify(safe).includes("secret"));
  assert.throws(() => safeCleanupEvent(plan, { stage: "deleted", object: plan.mustRemainAbsent[0] }));
  assert.throws(() => safeCleanupEvent(plan, { stage: "revoked", generation: syntheticToken }));
  assert.throws(() => safeCleanupEvent(plan, { stage: "repair" } as unknown as CleanupEvent));
});

test("exact mutation requests pin both versions, never select historical generations, and cannot write outside five objects", () => {
  const memory = new CleanupMemory(), source = memory.live.get(plan.objects[0].path)!;
  const revoke = cleanupMutationRequest(plan, source, "revoke"), url = new URL(revoke.url);
  assert.equal(revoke.method, "PATCH"); assert.equal(url.origin, "https://storage.googleapis.com");
  assert.equal(url.searchParams.get("ifGenerationMatch"), source.generation); assert.equal(url.searchParams.get("ifMetagenerationMatch"), "2");
  assert.equal(revoke.data?.metadata.firebaseStorageDownloadTokens, null);
  assert.throws(() => cleanupMutationRequest(plan, source, "delete"));
  for (const object of memory.live.values()) {
    const privateObject = object.path === source.path ? { ...object, token: "", metageneration: "3" } : object;
    const request = cleanupMutationRequest(plan, privateObject, "delete"), query = new URL(request.url).searchParams;
    assert.equal(request.method, "DELETE"); assert.equal(query.get("ifGenerationMatch"), object.generation);
    assert.equal(query.get("ifMetagenerationMatch"), privateObject.metageneration); assert.equal(query.has("generation"), false);
  }
  for (const path of [...plan.mustRemainAbsent, "outside/file"]) assert.throws(() => cleanupMutationRequest(plan, { ...source, path }, "delete"));
  assert.throws(() => cleanupMutationRequest(plan, { ...source, generation: "123" }, "revoke"));
  assert.throws(() => cleanupMutationRequest(plan, memory.live.get(plan.objects[1].path)!, "revoke"));
});

test("only null, undefined and exact empty string normalize to absent; all non-empty tokens remain non-empty and fail private checks", () => {
  for (const value of [undefined, null, ""]) assert.equal(normalizeDownloadToken(value), null);
  const object = new CleanupMemory().live.get(plan.objects[3].path)!;
  verifyPrivateTestObject(original, object, fixtures[0]); assert.equal(object.token, "");
  for (const token of [syntheticToken, " ", "\n", "null", "undefined", ",", "0", "false", `${syntheticToken},${syntheticToken}`]) {
    assert.equal(normalizeDownloadToken(token), token);
    assert.throws(() => verifyPrivateTestObject(original, { ...object, token }, fixtures[0]));
  }
  for (const value of [0, false, {}, [], Buffer.from(""), { toString: () => "" }]) assert.throws(() => normalizeDownloadToken(value));
});

test("empty metadata never bypasses mandatory anonymous and old-token probes for a live copy", async () => {
  for (const failingProbe of [0, 1, 2]) {
    const calls: { api: string; token?: string }[] = [];
    await assert.rejects(verifyAnonymousAndOldTokenDenied({ publicRead: async (_path, api, token) => {
      calls.push({ api, token }); return calls.length - 1 === failingProbe ? 200 : 403;
    } }, plan.objects[3].path, syntheticToken));
    assert.equal(calls.length, failingProbe + 1);
  }
});

test("a disappearing object cannot turn a 404 access response into proof of revoked access", async () => {
  const memory = new CleanupMemory(), originalPublic = memory.publicRead.bind(memory);
  memory.publicRead = async (path, api, token) => {
    if (memory.revoked && path === plan.objects[0].path) memory.live.delete(path);
    return originalPublic(path, api, token);
  };
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 1);
  assert.ok(!memory.calls.some(call => call.startsWith("delete:")));
});

test("a failed post-delete absence check stops later deletions without a retry", async () => {
  const memory = new CleanupMemory(), originalRemove = memory.remove.bind(memory);
  memory.remove = async object => { await originalRemove(object); memory.live.set(object.path, { ...object }); };
  await assert.rejects(run(memory).execute); assert.equal(memory.mutations, 2);
  assert.equal(memory.calls.filter(call => call.startsWith("delete:")).length, 1);
});

test("new objects at the final seven-name check stop completion and are never deleted automatically", async () => {
  const memory = new CleanupMemory(), originalHead = memory.head.bind(memory), source = { ...memory.live.get(plan.objects[0].path)! };
  memory.head = async path => {
    if (memory.soft.length === 5 && path === plan.mustRemainAbsent[0]) memory.live.set(path, { ...source, path });
    return originalHead(path);
  };
  const state = run(memory); await assert.rejects(state.execute); assert.equal(memory.mutations, 6);
  assert.ok(memory.live.has(plan.mustRemainAbsent[0])); assert.equal(state.events.at(-1)?.stage, "stopped_no_automatic_cleanup");
});

test("unrelated live files and pre-existing soft-deleted generations are untouched", async () => {
  const memory = new CleanupMemory(), unrelated = { ...memory.live.get(plan.objects[1].path)!, path: "unrelated/keep.png", testRunId: "other-run" };
  const retained = { ...unrelated, generation: "1000000000000000001", softDeleted: true };
  memory.live.set(unrelated.path, unrelated); memory.soft.push(retained);
  const result = await run(memory).execute();
  assert.equal(result.liveObjectsRemaining, 0); assert.deepEqual(memory.live.get(unrelated.path), unrelated);
  assert.equal(memory.live.size, 1); assert.equal(memory.soft.length, 6); assert.deepEqual(memory.soft[0], retained);
  assert.ok(!memory.calls.some(call => call.includes(unrelated.path)));
});
