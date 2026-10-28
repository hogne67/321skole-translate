import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { approvedCleanupPlan, assertCleanupExecutionSignal, buildPhase1CleanupPlan, cleanupApproval, executePhase1Cleanup,
  type CleanupEvent } from "./cloudFileTestCleanup";
import { assertCleanupRequest, cleanupPublicUrl, CloudFileTestCleanupProvider, createCleanupCloudProvider,
  type CleanupRequest, type CleanupPublicRequest, type CleanupWire, type CleanupCloudBindings } from "./cloudFileTestCleanupProvider";
import { appendCleanupJournal, loadCleanupLocalInputs, openExclusiveCleanupJournal, runCleanupCommand, type CleanupRunDependencies } from "./cloudFileTestCleanupRunner";
import { buildCloudFileTestPlan, syntheticFileFixtures } from "./cloudFileTestPlan";
import { PHASE1_APPROVAL, type Fixture } from "./cloudFileTestExecution";
import { CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";

const plan = buildPhase1CleanupPlan(), approval = cleanupApproval(plan);
const original = buildCloudFileTestPlan(plan.projectId, plan.bucket, plan.sourceRunId), synthetic = syntheticFileFixtures();
const fixtures: Fixture[] = original.fixtures.map(file => ({ ...file, bytes: synthetic.find(candidate => candidate.id === file.id)!.bytes }));
const token = "00000000-0000-4000-8000-000000000001";
type ObjectJson = { name: string; bucket: string; generation: string; metageneration: string; size: string; contentType: string;
  md5Hash: string; crc32c: string; cacheControl: string; metadata: { testRunId: string; fixtureId: string; firebaseStorageDownloadTokens?: unknown } };
function simulator() {
  const live = new Map<string, ObjectJson>(), soft: ObjectJson[] = [], requests: CleanupRequest[] = [], probes: CleanupPublicRequest[] = [];
  let mutations = 0;
  for (const [index, object] of plan.objects.entries()) live.set(object.path, { name: object.path, bucket: plan.bucket, generation: object.generation,
    metageneration: object.metageneration, size: String(object.size), contentType: object.contentType, md5Hash: object.md5Hash, crc32c: object.crc32c, cacheControl: "private,no-store",
    metadata: { testRunId: plan.sourceRunId, fixtureId: object.id, ...(index === 0 ? { firebaseStorageDownloadTokens: token } : index === 3 ? { firebaseStorageDownloadTokens: "" } : {}) } });
  const wire: CleanupWire = {
    request: async request => {
      requests.push(request); const url = new URL(request.url), bucketPath = `/storage/v1/b/${plan.bucket}`;
      if (url.origin === "https://cloudresourcemanager.googleapis.com") return { status: 200, data: { projectId: plan.projectId, projectNumber: plan.projectNumber } };
      if (url.pathname === bucketPath) return { status: 200, data: { name: plan.bucket, projectNumber: plan.projectNumber, location: "EUROPE-WEST1",
        iamConfiguration: { uniformBucketLevelAccess: { enabled: true } }, softDeletePolicy: { retentionDurationSeconds: "604800" } } };
      if (url.pathname === `${bucketPath}/iam`) return { status: 200, data: { bindings: [] } };
      const target = decodeURIComponent(url.pathname.slice(`${bucketPath}/o/`.length)), object = live.get(target);
      if (!object) return { status: 404, data: {} };
      if (request.method === "GET") {
        if (request.media) return { status: 200, data: Buffer.from(fixtures.find(file => file.id === object.metadata.fixtureId)!.bytes) };
        return { status: 200, data: structuredClone(object) };
      }
      if (url.searchParams.get("ifGenerationMatch") !== object.generation || url.searchParams.get("ifMetagenerationMatch") !== object.metageneration) return { status: 412, data: {} };
      if (request.method === "PATCH") {
        object.metadata.firebaseStorageDownloadTokens = ""; object.metageneration = "3"; mutations++;
        return { status: 200, data: structuredClone(object) };
      }
      soft.push(structuredClone(object)); live.delete(target); mutations++; return { status: 204, data: null };
    },
    publicStatus: async request => {
      probes.push(request); const object = live.get(request.path);
      return !object ? 404 : request.api === "firebase" && request.token && request.token === object.metadata.firebaseStorageDownloadTokens ? 200 : 403;
    },
  };
  return { live, soft, wire, requests, probes, get mutations() { return mutations; } };
}
async function localFlow(wire: CleanupWire) {
  const events: CleanupEvent[] = [];
  const result = await executePhase1Cleanup(plan, fixtures, new CloudFileTestCleanupProvider(plan, wire, true, approval), async event => { events.push(event); }, true, approval);
  return { result, events };
}
async function temporaryJournal<T>(fn: (root: string) => Promise<T>) {
  const base = path.resolve(tmpdir()), root = await mkdtemp(path.join(base, "321school-cleanup-local-"));
  try { return await fn(root); }
  finally { assert.equal(path.dirname(path.resolve(root)), base); assert.ok(path.basename(root).startsWith("321school-cleanup-local-")); await rm(root, { recursive: true, force: true }); }
}
function bindingsFor(sim: ReturnType<typeof simulator>) {
  let loads = 0;
  const calls: { url: string; options: RequestInit }[] = [];
  const bindings: CleanupCloudBindings = {
    loadClient: async adc => { loads++; assert.equal(adc, CLOUD_TEST_ADC_PATH); return { getRequestHeaders: async () => ({ Authorization: "Bearer synthetic-only" }) }; },
    fetch: async (input, options = {}) => {
      const raw = String(input); calls.push({ url: raw, options });
      assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "manual"); assert.equal(options.cache, "no-store"); assert.ok(options.signal);
      const headers = new Headers(options.headers);
      if (headers.has("Authorization")) {
        assert.equal(headers.get("x-goog-user-project"), plan.projectId);
        const request = { method: options.method as CleanupRequest["method"], url: raw,
          ...(options.body ? { data: JSON.parse(String(options.body)) } : {}), ...(new URL(raw).searchParams.get("alt") === "media" ? { media: true } : {}) };
        const response = await sim.wire.request(request);
        return new Response(response.status === 204 ? null : Buffer.isBuffer(response.data) ? new Uint8Array(response.data) : JSON.stringify(response.data), { status: response.status });
      }
      assert.equal(headers.has("x-goog-user-project"), false);
      const url = new URL(raw), request = { path: decodeURIComponent(url.pathname.split("/o/")[1]), api: url.hostname.startsWith("firebasestorage") ? "firebase" as const : "gcs" as const,
        ...(url.searchParams.has("token") ? { token: url.searchParams.get("token")! } : {}) };
      return new Response(null, { status: await sim.wire.publicStatus(request) });
    },
  };
  return { bindings, calls, get loads() { return loads; } };
}

test("restricted REST adapter completes all six changes against the observed empty-string GCS representation", async () => {
  const sim = simulator(), { result, events } = await localFlow(sim.wire);
  assert.equal(result.liveObjectsRemaining, 0); assert.equal(sim.mutations, 6); assert.equal(sim.soft.length, 5); assert.equal(sim.live.size, 0);
  assert.deepEqual(sim.requests.filter(request => request.method !== "GET").map(request => request.method), ["PATCH", "DELETE", "DELETE", "DELETE", "DELETE", "DELETE"]);
  assert.equal(events.at(-1)?.stage, "completed"); assert.ok(!JSON.stringify(events).includes(token));
  for (const object of sim.soft) assert.ok(!object.metadata.firebaseStorageDownloadTokens);
  for (const api of ["gcs", "firebase"] as const) assert.ok(sim.probes.some(request => request.path === plan.objects[3].path && request.api === api && request.token === undefined));
  assert.ok(sim.probes.some(request => request.path === plan.objects[3].path && request.token === token));
});

test("real fetch adapter, header-only auth, runner and exclusive journal complete entirely with injected local bindings", async () => {
  await temporaryJournal(async root => {
    const sim = simulator(), http = bindingsFor(sim);
    const result = await runCleanupCommand({ execute: true, approval, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveCleanupJournal,
      provider: (input, adc, execute, signal) => createCleanupCloudProvider(input, adc, execute, signal, http.bindings),
    });
    assert.equal(result.status, "completed"); assert.equal(sim.mutations, 6); assert.equal(http.loads, 1);
    const lines = (await readFile(path.join(root, "execution.journal.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(lines.filter(event => event.stage === "revoked").length, 1); assert.equal(lines.filter(event => event.stage === "deleted").length, 5);
    assert.equal(lines.at(-1).stage, "completed"); assert.ok(lines.every(event => typeof event.at === "string"));
    assert.ok(!JSON.stringify(lines).includes(token)); assert.ok(!JSON.stringify(lines).includes("Bearer"));
    assert.equal(http.calls.filter(call => call.options.method !== "GET").length, 6);
  });
});

test("wrong execution signal or manifest blocks client construction and all HTTP calls", async () => {
  const sim = simulator(), http = bindingsFor(sim);
  for (const [execute, signal] of [[false, approval], [true, PHASE1_APPROVAL], [true, ""]] as const) {
    assert.throws(() => assertCleanupExecutionSignal(execute, signal));
    await assert.rejects(createCleanupCloudProvider(plan, CLOUD_TEST_ADC_PATH, execute, signal, http.bindings));
  }
  await assert.rejects(createCleanupCloudProvider({ ...plan, projectId: "skole-c09b8" }, CLOUD_TEST_ADC_PATH, true, approval, http.bindings));
  await assert.rejects(createCleanupCloudProvider(plan, "C:/unknown/credentials.json", true, approval, http.bindings));
  assert.equal(http.loads, 0); assert.equal(http.calls.length, 0);
});

test("transport refuses production, IAM writes, listing, restore, copy, other versions and extra query fields", () => {
  const base = `https://storage.googleapis.com/storage/v1/b/${plan.bucket}`, target = `${base}/o/${encodeURIComponent(plan.objects[0].path)}`;
  for (const request of [
    { method: "GET", url: "https://storage.googleapis.com/storage/v1/b/skole-c09b8.firebasestorage.app" },
    { method: "DELETE", url: `${base}/iam` }, { method: "GET", url: `${base}/o` }, { method: "POST", url: `${base}/o` },
    { method: "GET", url: `${target}?softDeleted=true&generation=${plan.objects[0].generation}` },
    { method: "GET", url: `${target}?alt=media&generation=999`, media: true },
    { method: "DELETE", url: `${target}?generation=${plan.objects[0].generation}&ifGenerationMatch=${plan.objects[0].generation}&ifMetagenerationMatch=3` },
    { method: "DELETE", url: `${target}?ifGenerationMatch=${plan.objects[0].generation}&ifMetagenerationMatch=2` },
    { method: "DELETE", url: `${target}?ifGenerationMatch=${plan.objects[0].generation}&ifMetagenerationMatch=3&userProject=other` },
    { method: "GET", url: `${base}/o/${encodeURIComponent("other/file")}` },
    { method: "POST", url: `${target}/restore` }, { method: "POST", url: `${target}/copyTo/b/${plan.bucket}/o/test` },
    { method: "GET", url: `https://evil.invalid/storage/v1/b/${plan.bucket}/o/anything` },
  ] as CleanupRequest[]) assert.throws(() => assertCleanupRequest(plan, request));
  assert.throws(() => cleanupPublicUrl(plan, { path: plan.mustRemainAbsent[0], api: "firebase", token }));
  assert.throws(() => cleanupPublicUrl(plan, { path: plan.objects[0].path, api: "gcs", token }));
});

test("missing field and null revoke responses work, while non-empty or invalid token metadata stops before deletion", async () => {
  for (const value of [undefined, null, token, " ", "null", false, []]) {
    const sim = simulator(), request = sim.wire.request;
    sim.wire.request = async input => {
      const response = await request(input);
      if (input.method === "PATCH") {
        const object = sim.live.get(plan.objects[0].path)!;
        object.metadata.firebaseStorageDownloadTokens = value; response.data = structuredClone(object);
      }
      return response;
    };
    if (value == null) { await localFlow(sim.wire); assert.equal(sim.mutations, 6); }
    else { await assert.rejects(localFlow(sim.wire)); assert.equal(sim.mutations, 1); assert.equal(sim.live.size, 5); }
  }
});

test("preflight detects actual response changes before the first mutation", async () => {
  for (const defect of ["region", "project", "soft-delete", "public", "lifecycle", "hold", "invalid-iam", "invalid-policy-flag"]) {
    const sim = simulator(), request = sim.wire.request;
    sim.wire.request = async input => {
      const response = await request(input), data = response.data as Record<string, unknown>;
      if (input.url.endsWith(`/b/${plan.bucket}`)) {
        if (defect === "region") data.location = "US";
        if (defect === "project") data.projectNumber = "1";
        if (defect === "soft-delete") data.softDeletePolicy = { retentionDurationSeconds: "0" };
        if (defect === "lifecycle") data.lifecycle = { rule: [{}] };
        if (defect === "hold") data.defaultEventBasedHold = true;
        if (defect === "invalid-policy-flag") data.versioning = { enabled: "true" };
      }
      if (input.url.endsWith("/iam")) {
        if (defect === "public") data.bindings = [{ members: ["allUsers"] }];
        if (defect === "invalid-iam") data.bindings = "invalid";
      }
      return response;
    };
    await assert.rejects(localFlow(sim.wire)); assert.equal(sim.mutations, 0);
  }
});

test("unexpected mutation status or transport failure stops exactly once without retry, repair or later deletes", async () => {
  for (const fault of ["patch-412", "delete-412", "delete-timeout", "patch-ambiguous-success"] as const) {
    const sim = simulator(), request = sim.wire.request; let writes = 0;
    sim.wire.request = async input => {
      if (input.method !== "GET") writes++;
      if (fault === "patch-412" && input.method === "PATCH") return { status: 412, data: {} };
      if (fault === "delete-412" && input.method === "DELETE") return { status: 412, data: {} };
      if (fault === "delete-timeout" && input.method === "DELETE") throw new Error("synthetic secret request");
      const response = await request(input);
      if (fault === "patch-ambiguous-success" && input.method === "PATCH") throw new Error("synthetic lost response after apply");
      return response;
    };
    await assert.rejects(localFlow(sim.wire)); assert.equal(writes, fault.startsWith("delete") ? 2 : 1);
    assert.equal(sim.live.size, 5); assert.ok(sim.mutations <= 1);
  }
});

test("anonymous or old-token success, redirects and server failures prevent all deletes after revocation", async () => {
  for (const status of [200, 302, 429, 500]) {
    const sim = simulator(), probe = sim.wire.publicStatus;
    sim.wire.publicStatus = async request => sim.mutations > 0 && request.path === plan.objects[3].path ? status : probe(request);
    await assert.rejects(localFlow(sim.wire)); assert.equal(sim.mutations, 1); assert.equal(sim.live.size, 5);
  }
});

test("same versions with wrong file identity, checksum, token type or object hold stop before any patch", async () => {
  for (const defect of ["bucket", "name", "checksum", "token-type", "hold"]) {
    const sim = simulator(), request = sim.wire.request;
    sim.wire.request = async input => {
      const response = await request(input);
      if (input.method === "GET" && input.url.endsWith(encodeURIComponent(plan.objects[3].path))) {
        const data = response.data as Record<string, unknown>;
        if (defect === "bucket") data.bucket = "other";
        if (defect === "name") data.name = "other";
        if (defect === "checksum") data.crc32c = "other";
        if (defect === "token-type") (data.metadata as Record<string, unknown>).firebaseStorageDownloadTokens = 0;
        if (defect === "hold") data.temporaryHold = true;
      }
      return response;
    };
    await assert.rejects(localFlow(sim.wire)); assert.equal(sim.mutations, 0);
  }
});

test("a stopped HTTP provider refuses further resource operations", async () => {
  const sim = simulator(); sim.wire.request = async () => ({ status: 500, data: {} });
  const provider = new CloudFileTestCleanupProvider(plan, sim.wire, true, approval);
  await assert.rejects(provider.head(plan.objects[0].path));
  await assert.rejects(provider.head(plan.objects[1].path), /already_stopped/);
});

test("resource fetch is single-shot even on 403 or 500; public fetch sends no credentials or quota headers", async () => {
  for (const status of [403, 500]) {
    const sim = simulator(), http = bindingsFor(sim); let fetched = 0;
    http.bindings.fetch = async () => { fetched++; return new Response("{}", { status }); };
    const provider = await createCleanupCloudProvider(plan, CLOUD_TEST_ADC_PATH, true, approval, http.bindings);
    await assert.rejects(provider.head(plan.objects[0].path)); assert.equal(fetched, 1);
  }
  const sim = simulator(), http = bindingsFor(sim), provider = await createCleanupCloudProvider(plan, CLOUD_TEST_ADC_PATH, true, approval, http.bindings);
  assert.equal(await provider.publicRead(plan.objects[0].path, "firebase", token), 200);
  assert.equal(new Headers(http.calls[0].options.headers).has("Authorization"), false);
});

test("oversized response fails closed before parsing or additional resource calls", async () => {
  const sim = simulator(), http = bindingsFor(sim); let fetched = 0;
  http.bindings.fetch = async () => { fetched++; return new Response(new Uint8Array(2 * 1024 * 1024 + 1), { status: 200 }); };
  const provider = await createCleanupCloudProvider(plan, CLOUD_TEST_ADC_PATH, true, approval, http.bindings);
  await assert.rejects(provider.head(plan.objects[0].path)); assert.equal(fetched, 1);
});

test("local-only command never opens a journal, credentials or cloud provider", async () => {
  let journal = 0, providers = 0;
  const result = await runCleanupCommand({ execute: false, approval: "", adc: CLOUD_TEST_ADC_PATH }, {
    localInputs: async () => ({ root: "unused", plan, fixtures }),
    journal: async () => { journal++; throw new Error("must not run"); }, provider: async () => { providers++; throw new Error("must not run"); },
  });
  assert.equal(result.status, "local_cleanup_validation_passed"); assert.equal(journal, 0); assert.equal(providers, 0);
  const real = await loadCleanupLocalInputs(); assert.equal(approvedCleanupPlan(real.plan).planDigest, plan.planDigest); assert.equal(real.fixtures.length, 5);
});

test("runner refuses wrong cloud signal before local I/O and journal creation", async () => {
  let reads = 0;
  const dependencies: CleanupRunDependencies = { localInputs: async () => { reads++; throw new Error("must not read"); },
    journal: openExclusiveCleanupJournal, provider: async () => { throw new Error("must not authenticate"); } };
  await assert.rejects(runCleanupCommand({ execute: true, approval: PHASE1_APPROVAL, adc: CLOUD_TEST_ADC_PATH }, dependencies)); assert.equal(reads, 0);
});

test("exclusive journal blocks a second run before provider creation and preserves existing bytes", async () => {
  await temporaryJournal(async root => {
    const first = await openExclusiveCleanupJournal(root, plan); await first.append({ stage: "started" }); await first.close();
    const filename = path.join(root, "execution.journal.jsonl"), before = await readFile(filename); let providers = 0;
    await assert.rejects(runCleanupCommand({ execute: true, approval, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveCleanupJournal,
      provider: async () => { providers++; throw new Error("must not authenticate"); },
    }));
    assert.equal(providers, 0); assert.ok(before.equals(await readFile(filename)));
  });
});

test("concurrent journal creation has only one winner", async () => {
  await temporaryJournal(async root => {
    const results = await Promise.allSettled([openExclusiveCleanupJournal(root, plan), openExclusiveCleanupJournal(root, plan)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    for (const result of results) if (result.status === "fulfilled") await result.value.close();
  });
});

test("client setup failure leaves a stopped journal and never starts coordinator or repairs", async () => {
  await temporaryJournal(async root => {
    await assert.rejects(runCleanupCommand({ execute: true, approval, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveCleanupJournal,
      provider: async () => { throw new Error("Bearer synthetic secret"); },
    }), /cleanup_command_stopped/);
    const text = await readFile(path.join(root, "execution.journal.jsonl"), "utf8"); assert.equal(JSON.parse(text).stage, "stopped_no_automatic_cleanup");
    assert.ok(!text.includes("Bearer"));
  });
});

test("partial write or sync failure rejects the journal; intent failure blocks the following mutation", async () => {
  let synced = 0;
  await assert.rejects(appendCleanupJournal({ write: async () => ({ bytesWritten: 1, buffer: "" }), sync: async () => { synced++; } }, plan, { stage: "revoke_intent" }), /partial_journal/);
  assert.equal(synced, 0);
  await assert.rejects(appendCleanupJournal({ write: async (line: string) => ({ bytesWritten: Buffer.byteLength(line), buffer: line }), sync: async () => { throw new Error("synthetic disk failure"); } }, plan, { stage: "revoke_intent" }));
  const sim = simulator();
  await assert.rejects(runCleanupCommand({ execute: true, approval, adc: CLOUD_TEST_ADC_PATH }, {
    localInputs: async () => ({ root: "fake", plan, fixtures }),
    journal: async () => ({ close: async () => {}, append: async event => { if (event.stage === "revoke_intent") throw new Error("synthetic disk failure"); } }),
    provider: async () => new CloudFileTestCleanupProvider(plan, sim.wire, true, approval),
  })); assert.equal(sim.mutations, 0);
});

test("failed revocation is journaled as stopped without automatic retry or cleanup", async () => {
  await temporaryJournal(async root => {
    const sim = simulator(), request = sim.wire.request;
    sim.wire.request = async input => input.method === "PATCH" ? { status: 412, data: {} } : request(input);
    await assert.rejects(runCleanupCommand({ execute: true, approval, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveCleanupJournal,
      provider: async () => new CloudFileTestCleanupProvider(plan, sim.wire, true, approval),
    }));
    const events = (await readFile(path.join(root, "execution.journal.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(events.at(-1).stage, "stopped_no_automatic_cleanup"); assert.equal(sim.mutations, 0); assert.equal(sim.live.size, 5);
    assert.ok(!events.some(event => event.stage === "delete_intent"));
  });
});

test("provider itself refuses mutation without preflight, readback and all three source-denial probes", async () => {
  const sim = simulator(), provider = new CloudFileTestCleanupProvider(plan, sim.wire, true, approval);
  const source = (await provider.head(plan.objects[0].path))!;
  await assert.rejects(provider.revokeToken(source)); assert.equal(sim.mutations, 0);
  await provider.preflight(); const revoked = await provider.revokeToken(source);
  await assert.rejects(provider.revokeToken(source));
  await assert.rejects(provider.remove(revoked)); assert.equal(sim.mutations, 1);
  await provider.head(source.path); await provider.publicRead(source.path, "gcs"); await provider.publicRead(source.path, "firebase");
  await assert.rejects(provider.remove(revoked)); assert.equal(sim.mutations, 1);
  await provider.publicRead(source.path, "firebase", token); await provider.remove(revoked); assert.equal(sim.mutations, 2);
  await assert.rejects(provider.remove(revoked)); assert.equal(sim.mutations, 2);
});
