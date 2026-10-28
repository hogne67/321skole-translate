import { buildFreshPhase1Plan } from "./cloudFileTestFreshPlan";
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { UserRefreshClient } from "google-auth-library";
import { createCloudTestClient } from "./cloudTestAuth";
import { syntheticFileFixtures } from "./cloudFileTestPlan";
import { appendPhase1Journal, assertFreshExecutionSignal, executeFreshPhase1, FRESH_PHASE1_APPROVAL, FRESH_PHASE1_DIGEST, FRESH_PHASE1_RUN,
  safePhase1Journal, type Fixture, type Phase1Provider, type TestObject } from "./cloudFileTestFreshExecution";
import { assertPhase1Request, CloudFileTestFreshProvider, type Phase1Wire, type WireRequest } from "./cloudFileTestFreshProvider";
import { CLOUD_TEST_BUCKET as bucket, CLOUD_TEST_PRINCIPAL as principal } from "./cloudTestBoundary";
import { CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";
import { createFreshPhase1CloudProvider, type FreshCloudBindings } from "./cloudFileTestFreshProvider";
import { loadFreshLocalInputs, openExclusiveFreshJournal, runFreshPhase1Command } from "./cloudFileTestFreshRunner";
import { PHASE1_APPROVAL as OLD_APPROVAL, PHASE1_RUN as OLD_RUN } from "./cloudFileTestExecution";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const plan = buildFreshPhase1Plan();
const fixtures: Fixture[] = plan.fixtures.map(file => ({ ...file, bytes: syntheticFileFixtures().find(value => value.id === file.id)!.bytes }));
function status(code: number): never { throw Object.assign(new Error("synthetic-provider-error-containing-a-token"), { status: code }); }
class MemoryProvider implements Phase1Provider {
  live = new Map<string, TestObject>(); soft = new Map<string, TestObject>(); calls: string[] = []; mutations = 0;
  counter = BigInt("1000000000000000000"); allowLimitedUpload = false;
  async preflight() { this.calls.push("preflight"); }
  async head(path: string, generation?: string) { const object = generation ? this.soft.get(`${path}#${generation}`) : this.live.get(path); return object ? { ...object } : null; }
  async read(object: TestObject, range?: [number, number]) {
    const current = this.live.get(object.path); if (!current || current.generation !== object.generation) return status(404);
    const fixture = fixtures.find(file => file.id === current.fixtureId)!;
    return { status: range ? 206 : 200, bytes: Buffer.from(range ? fixture.bytes.subarray(range[0], range[1] + 1) : fixture.bytes),
      ...(range ? { contentRange: `bytes ${range[0]}-${range[1]}/${fixture.size}` } : {}) };
  }
  make(path: string, file: Fixture, token: string | null = null) {
    return { path, generation: String(++this.counter), metageneration: "1", fixtureId: file.id, testRunId: FRESH_PHASE1_RUN, size: file.size,
      contentType: file.contentType, md5Hash: file.md5Hash, crc32c: file.crc32c, cacheControl: "private,no-store", token, softDeleted: false };
  }
  async upload(path: string, file: Fixture, previous?: TestObject, limited = false) {
    this.calls.push(`upload:${path}`); if (limited && !this.allowLimitedUpload) return status(403);
    const current = this.live.get(path);
    if ((!previous && current) || (previous && (!current || current.generation !== previous.generation))) return status(412);
    if (current) this.soft.set(`${path}#${current.generation}`, { ...current, softDeleted: true });
    const object = this.make(path, file); this.live.set(path, object); this.mutations++; return { ...object };
  }
  async token(object: TestObject, token: string | null) {
    this.calls.push(`token:${object.path}`); const current = this.live.get(object.path);
    if (!current || current.generation !== object.generation || current.metageneration !== object.metageneration) return status(412);
    const changed = { ...current, token, metageneration: String(BigInt(current.metageneration) + BigInt(1)) }; this.live.set(object.path, changed); this.mutations++; return { ...changed };
  }
  async copy(object: TestObject, destination: string) {
    this.calls.push(`copy:${destination}`); const current = this.live.get(object.path);
    if (!current || current.generation !== object.generation || current.metageneration !== object.metageneration || this.live.has(destination)) return status(412);
    const copy = this.make(destination, fixtures.find(file => file.id === object.fixtureId)!, ""); this.live.set(destination, copy); this.mutations++; return { ...copy };
  }
  async remove(object: TestObject) {
    this.calls.push(`remove:${object.path}`); const current = this.live.get(object.path);
    if (!current || current.generation !== object.generation || current.metageneration !== object.metageneration) return status(412);
    this.soft.set(`${object.path}#${object.generation}`, { ...current, softDeleted: true }); this.live.delete(object.path); this.mutations++;
  }
  async restore(object: TestObject) {
    this.calls.push(`restore:${object.path}`); if (this.live.has(object.path) || !this.soft.has(`${object.path}#${object.generation}`)) return status(412);
    const restored = this.make(object.path, fixtures.find(file => file.id === object.fixtureId)!, ""); this.live.set(object.path, restored); this.mutations++; return { ...restored };
  }
  async publicRead(path: string, api: "gcs" | "firebase", token?: string) { return api === "firebase" && token && this.live.get(path)?.token === token ? 200 : 403; }
  async sign(path: string) { return path; }
  async signedRead(path: string) { return this.live.has(path) ? 200 : 404; }
}
function localRun(provider: Phase1Provider, input: unknown = plan, execute = true, approval = FRESH_PHASE1_APPROVAL) {
  const events: Record<string, unknown>[] = [];
  const run = () => executeFreshPhase1(input, fixtures, provider, async event => { events.push(safePhase1Journal(plan, event)); }, execute, approval);
  return { run, events };
}

test("scope approval alone, wrong execution signal, changed manifest and production targets stop before all provider calls", async () => {
  for (const [execute, approval] of [[false, ""], [true, ""], [true, `EXECUTE:${FRESH_PHASE1_RUN}:wrong`]] as const) {
    const provider = new MemoryProvider(); await assert.rejects(localRun(provider, plan, execute, approval).run); assert.deepEqual(provider.calls, []);
  }
  for (const changed of [{ ...plan, projectId: "skole-c09b8" }, { ...plan, runId: "different" }, { ...plan, approved: true },
    { ...plan, objectAllowlist: [...plan.objectAllowlist, "covers/other/image.png"] }]) {
    const provider = new MemoryProvider(); await assert.rejects(localRun(provider, changed).run); assert.deepEqual(provider.calls, []);
  }
  assert.throws(() => assertFreshExecutionSignal(true, FRESH_PHASE1_DIGEST));
});
test("successful offline recipe makes exactly 17 mutations, leaves zero live objects and retains eight soft-deleted generations", async () => {
  const provider = new MemoryProvider(), state = localRun(provider); const result = await state.run();
  assert.equal(result.liveObjectsRemaining, 0); assert.equal(provider.mutations, 17); assert.equal(provider.live.size, 0); assert.equal(provider.soft.size, 8);
  assert.equal(state.events.filter(event => event.stage === "denied_as_expected").length, 4);
  assert.equal(state.events.at(-1)?.stage, "completed");
  assert.deepEqual(provider.calls.filter(call => call.startsWith("restore:")), [`restore:${plan.objectAllowlist[4]}`]);
});
test("unexpected negative upload success stops immediately and never attempts repair or cleanup", async () => {
  const provider = new MemoryProvider(); provider.allowLimitedUpload = true; const state = localRun(provider);
  await assert.rejects(state.run, /phase_one_stopped_review_journal/);
  assert.equal(provider.live.size, 5); assert.ok(!provider.calls.some(call => /^(remove|restore|copy):/.test(call)));
  assert.equal(state.events.at(-1)?.stage, "stopped_no_automatic_cleanup");
});
test("foreign ownership, bad checksums and inherited download tokens stop before source retirement", async () => {
  for (const defect of [{ testRunId: "foreign" }, { md5Hash: "wrong" }, { token: "synthetic-secret" }]) {
    const provider = new MemoryProvider(), original = provider.copy.bind(provider);
    provider.copy = async (object, destination) => ({ ...await original(object, destination), ...defect });
    const state = localRun(provider); await assert.rejects(state.run);
    assert.ok(!provider.calls.some(call => call.startsWith("remove:")));
    assert.ok(!JSON.stringify(state.events).includes("synthetic-secret"));
  }
});
test("a changed copy before source retirement stops rather than deleting the source", async () => {
  const provider = new MemoryProvider(), original = provider.head.bind(provider);
  provider.head = async (path, generation) => {
    const object = await original(path, generation);
    if (path === plan.objectAllowlist[3] && provider.calls.includes(`upload:${plan.objectAllowlist[5]}`) && provider.mutations >= 9 && object) return { ...object, generation: "9999999999999999999" };
    return object;
  };
  await assert.rejects(localRun(provider).run); assert.ok(!provider.calls.includes(`remove:${plan.objectAllowlist[0]}`));
});
test("a cleanup generation race stops the remaining cleanup and preserves the changed object", async () => {
  const provider = new MemoryProvider(), original = provider.head.bind(provider);
  provider.head = async (path, generation) => {
    const object = await original(path, generation);
    return object && path === plan.objectAllowlist[1] && provider.calls.some(call => call.startsWith("restore:")) ? { ...object, generation: "9999999999999999999" } : object;
  };
  await assert.rejects(localRun(provider).run); assert.ok(provider.live.has(plan.objectAllowlist[1]));
  assert.ok(!provider.calls.includes(`remove:${plan.objectAllowlist[2]}`));
});
test("journal redacts unknown fields and refuses tokens disguised as versions or paths", () => {
  const event = { stage: "intent", object: plan.objectAllowlist[0], token: "synthetic-secret", url: "https://synthetic.invalid?token=synthetic-secret", headers: { Authorization: "synthetic-secret" }, error: new Error("synthetic-secret") };
  assert.ok(!JSON.stringify(safePhase1Journal(plan, event)).includes("synthetic-secret"));
  assert.throws(() => safePhase1Journal(plan, { stage: "applied", generation: "synthetic-secret" }));
  assert.throws(() => safePhase1Journal(plan, { stage: "intent", object: "outside/secret" }));
});
test("a failed journal write prevents the next cloud mutation", async () => {
  const provider = new MemoryProvider();
  await assert.rejects(executeFreshPhase1(plan, fixtures, provider, async event => { if (event.stage === "intent") throw new Error("synthetic_journal_unavailable"); }, true, FRESH_PHASE1_APPROVAL));
  assert.equal(provider.mutations, 0);
});
test("partial journal writes fail closed and complete lines are synced before returning", async () => {
  let synced = 0;
  await assert.rejects(appendPhase1Journal({ write: async () => ({ bytesWritten: 1 }), sync: async () => { synced++; } }, plan, { stage: "intent" }), /journal_partial_write/);
  assert.equal(synced, 0);
  await appendPhase1Journal({ write: async text => { assert.equal(JSON.parse(text).planDigest, FRESH_PHASE1_DIGEST); return { bytesWritten: Buffer.byteLength(text) }; }, sync: async () => { synced++; } }, plan, { stage: "intent" });
  assert.equal(synced, 1);
});
test("read-only impersonation sends only the Storage read scope to the fixed IAM target without network", async () => {
  const client = createCloudTestClient({ clientId: "synthetic", clientSecret: "synthetic", refreshToken: "synthetic" }, "read-only");
  const source = (client as unknown as { sourceClient: UserRefreshClient }).sourceClient;
  source.setCredentials({ access_token: "synthetic-source-access", expiry_date: Date.now() + 3600_000 });
  let requests = 0;
  const mocked = mock.method(source, "request", async (options: { url: string; data: { scope: string[]; lifetime: string } }) => {
    requests++;
    assert.equal(options.url, `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${principal}:generateAccessToken`);
    assert.deepEqual(options.data.scope, ["https://www.googleapis.com/auth/devstorage.read_only"]); assert.equal(options.data.lifetime, "900s");
    return { data: { accessToken: "synthetic-target-access", expireTime: new Date(Date.now() + 900_000).toISOString() } };
  });
  try { assert.equal((await client.getAccessToken()).token, "synthetic-target-access"); assert.equal(requests, 1); }
  finally { mocked.mock.restore(); }
});
test("an anonymously readable fixture stops the test before token creation or cleanup", async () => {
  const provider = new MemoryProvider(); provider.publicRead = async () => 200;
  await assert.rejects(localRun(provider).run); assert.equal(provider.mutations, 1);
  assert.ok(!provider.calls.some(call => /^(token|copy|remove|restore):/.test(call)));
});
test("failed token revocation stops before source retirement and never leaks the remaining token", async () => {
  const provider = new MemoryProvider(), original = provider.token.bind(provider);
  provider.token = async (object, token) => token === null && object.metageneration !== "1" ? status(403) : original(object, token);
  const state = localRun(provider); await assert.rejects(state.run);
  assert.ok(!provider.calls.some(call => call.startsWith("remove:")));
  const token = provider.live.get(plan.objectAllowlist[0])!.token!; assert.ok(token); assert.ok(!JSON.stringify(state.events).includes(token));
});
test("a restored object with unexpected token stops before normal cleanup", async () => {
  const provider = new MemoryProvider(), original = provider.restore.bind(provider);
  provider.restore = async object => ({ ...await original(object), token: "synthetic-restored-secret" });
  const state = localRun(provider); await assert.rejects(state.run);
  assert.ok(!provider.calls.includes(`remove:${plan.objectAllowlist[1]}`));
  assert.ok(!JSON.stringify(state.events).includes("synthetic-restored-secret"));
});
test("a collision or corrupt local fixture stops before the first upload", async () => {
  const provider = new MemoryProvider(); provider.live.set(plan.objectAllowlist[6], provider.make(plan.objectAllowlist[6], fixtures[3]));
  await assert.rejects(localRun(provider).run); assert.equal(provider.mutations, 0);
  const fresh = new MemoryProvider(), changed = fixtures.map(file => ({ ...file, bytes: Buffer.from(file.bytes) })); changed[0].bytes[50] ^= 1;
  await assert.rejects(executeFreshPhase1(plan, changed, fresh, async () => undefined, true, FRESH_PHASE1_APPROVAL)); assert.deepEqual(fresh.calls, []);
});

function metadata(object: TestObject) {
  return { name: object.path, bucket, generation: object.generation, metageneration: object.metageneration, size: String(object.size),
    contentType: object.contentType, md5Hash: object.md5Hash, crc32c: object.crc32c, cacheControl: object.cacheControl,
    metadata: { fixtureId: object.fixtureId, testRunId: object.testRunId, ...(object.token !== null ? { firebaseStorageDownloadTokens: object.token } : {}) },
    ...(object.softDeleted ? { softDeleteTime: "synthetic-time" } : {}) };
}
function fakeWire(memory: MemoryProvider) {
  const requests: WireRequest[] = [];
  const wire: Phase1Wire = {
    request: async request => {
      requests.push(request); const url = new URL(request.url), prefix = `/storage/v1/b/${bucket}`, query = url.searchParams;
      try {
        if (url.origin.includes("cloudresourcemanager")) return { status: 200, data: { projectId: plan.projectId, projectNumber: plan.projectNumber } };
        if (url.pathname === prefix) return { status: 200, data: { name: bucket, projectNumber: plan.projectNumber, location: "EUROPE-WEST1", iamConfiguration: { uniformBucketLevelAccess: { enabled: true } }, softDeletePolicy: { retentionDurationSeconds: "604800" } } };
        if (url.pathname === `${prefix}/iam`) return { status: 200, data: { bindings: [] } };
        if (url.pathname.startsWith("/upload/")) {
          const body = request.data as Buffer, start = body.indexOf("\r\n\r\n") + 4, end = body.indexOf("\r\n--", start);
          const data = JSON.parse(body.subarray(start, end).toString("utf8")), file = fixtures.find(file => file.id === data.metadata.fixtureId)!;
          const bytesStart = body.indexOf("\r\n\r\n", end) + 4;
          assert.ok(body.subarray(bytesStart, bytesStart + file.size).equals(file.bytes));
          const current = memory.live.get(data.name);
          const previous = query.get("ifGenerationMatch") === "0" ? undefined : { ...current!, generation: query.get("ifGenerationMatch")! };
          return { status: 200, data: metadata(await memory.upload(data.name, file, previous, request.limited)) };
        }
        const rest = url.pathname.slice(`${prefix}/o/`.length), anchor = `/copyTo/b/${bucket}/o/`;
        if (rest.includes(anchor)) {
          const [source, destination] = rest.split(anchor).map(decodeURIComponent), current = memory.live.get(source)!;
          const object = { ...current, generation: query.get("ifSourceGenerationMatch")!, metageneration: query.get("ifSourceMetagenerationMatch")! };
          return { status: 200, data: metadata(await memory.copy(object, destination)) };
        }
        const restoring = rest.endsWith("/restore"), path = decodeURIComponent(restoring ? rest.slice(0, -8) : rest);
        if (restoring) return { status: 200, data: metadata(await memory.restore((await memory.head(path, query.get("generation")!))!)) };
        if (request.method === "GET") {
          const object = await memory.head(path, query.has("softDeleted") ? query.get("generation")! : undefined);
          if (!object) return { status: 404, data: {} };
          if (request.media) {
            const range = request.headers?.Range?.match(/^bytes=(\d+)-(\d+)$/);
            const response = await memory.read({ ...object, generation: query.get("generation")! }, range ? [Number(range[1]), Number(range[2])] : undefined);
            return { status: response.status, data: response.bytes, ...(response.contentRange ? { headers: { "content-range": response.contentRange } } : {}) };
          }
          return { status: 200, data: metadata(object) };
        }
        const current = memory.live.get(path)!;
        const expected = { ...current, path, generation: query.get("ifGenerationMatch")!, metageneration: query.get("ifMetagenerationMatch")! };
        if (request.method === "PATCH") return { status: 200, data: metadata(await memory.token(expected, (request.data as { metadata: { firebaseStorageDownloadTokens: string | null } }).metadata.firebaseStorageDownloadTokens)) };
        await memory.remove(expected); return { status: 204, data: null };
      } catch (error) { return { status: (error as { status?: number }).status || 500, data: { error: { message: "synthetic-secret" } } }; }
    },
    publicStatus: async raw => {
      const url = new URL(raw);
      if (url.searchParams.has("X-Goog-Signature")) return memory.signedRead(decodeURIComponent(url.pathname).slice(bucket.length + 2));
      const path = decodeURIComponent(url.pathname.split("/o/")[1]);
      return memory.publicRead(path, url.hostname.startsWith("firebasestorage") ? "firebase" : "gcs", url.searchParams.get("token") || undefined);
    },
    sign: async path => {
      const date = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
      return `https://storage.googleapis.com/${bucket}/${path}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=${encodeURIComponent(principal + "/" + date.slice(0, 8) + "/auto/storage/goog4_request")}&X-Goog-Date=${date}&X-Goog-Expires=300&X-Goog-SignedHeaders=host&X-Goog-Signature=synthetic`;
    },
  };
  return { wire, requests };
}
test("actual REST adapter and coordinator complete the approved recipe against an offline GCS simulator", async () => {
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory);
  const provider = new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL);
  await localRun(provider).run(); assert.equal(memory.mutations, 17); assert.equal(memory.live.size, 0); assert.equal(memory.soft.size, 8);
  const copies = requests.filter(request => request.url.includes("copyTo")); assert.equal(copies.length, 3);
  for (const request of copies) {
    const url = new URL(request.url); assert.equal(url.searchParams.get("ifGenerationMatch"), "0");
    assert.match(url.searchParams.get("ifSourceGenerationMatch")!, /^[0-9]{19}$/);
    assert.equal((request.data as { metadata: { firebaseStorageDownloadTokens: unknown } }).metadata.firebaseStorageDownloadTokens, null);
    assert.ok(!request.url.includes("predefinedAcl"));
  }
  for (const request of requests.filter(request => request.method === "DELETE")) {
    const url = new URL(request.url); assert.ok(!url.searchParams.has("generation")); assert.ok(url.searchParams.has("ifMetagenerationMatch"));
  }
});
test("transport refuses production, other object names, unsafe methods and restore overwrite before network", async () => {
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory), provider = new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL);
  await assert.rejects(provider.head("outside/other-file")); assert.equal(requests.length, 0);
  for (const request of [
    { method: "GET", url: "https://storage.googleapis.com/storage/v1/b/skole-c09b8.firebasestorage.app" },
    { method: "DELETE", url: `https://storage.googleapis.com/storage/v1/b/${bucket}/iam` },
    { method: "GET", url: `https://storage.googleapis.com/storage/v1/b/${bucket}/o` },
    { method: "POST", url: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(plan.objectAllowlist[0])}/restore?generation=11&ifGenerationMatch=0` },
    { method: "DELETE", url: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(plan.objectAllowlist[0])}?generation=11&ifGenerationMatch=11&ifMetagenerationMatch=1` },
  ] as WireRequest[]) assert.throws(() => assertPhase1Request(plan, request));
  await assert.rejects(provider.sign(plan.objectAllowlist[4])); await assert.rejects(provider.signedRead("https://synthetic.invalid"));
  const foreign = { ...new MemoryProvider().make(plan.objectAllowlist[0], fixtures[0]), testRunId: "other-run" };
  await assert.rejects(provider.remove(foreign)); assert.equal(requests.length, 0);
  await assert.rejects(provider.upload(plan.objectAllowlist[0], fixtures[1])); assert.equal(requests.length, 0);
});
test("changed bucket policy or direct public binding blocks all writes", async () => {
  for (const defect of ["public", "region", "versioning", "soft-delete"]) {
    const memory = new MemoryProvider(), { wire } = fakeWire(memory), original = wire.request;
    wire.request = async request => {
      const response = await original(request), data = response.data as Record<string, unknown>;
      if (request.url.endsWith("/iam") && defect === "public") data.bindings = [{ members: ["allUsers"] }];
      if (request.url.endsWith(`/b/${bucket}`)) {
        if (defect === "region") data.location = "US";
        if (defect === "versioning") data.versioning = { enabled: true };
        if (defect === "soft-delete") data.softDeletePolicy = { retentionDurationSeconds: "0" };
      }
      return response;
    };
    await assert.rejects(localRun(new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL)).run); assert.equal(memory.mutations, 0);
  }
});
test("foreign signed URL and missing execution approval cannot reach transport", async () => {
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory);
  assert.throws(() => new CloudFileTestFreshProvider(plan, wire, true, ""));
  wire.sign = async () => "https://synthetic.invalid/secret";
  await assert.rejects(new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL).sign(plan.objectAllowlist[0]));
  assert.equal(requests.length, 0);
});

test("fresh plan, paths and gate cannot reuse the original run, journal identity or approval", async () => {
  assert.notEqual(FRESH_PHASE1_RUN, OLD_RUN); assert.equal(plan.objectAllowlist.length, 7);
  assert.ok(plan.objectAllowlist.every(path => path.startsWith(`cloud-tests/phase1/${FRESH_PHASE1_RUN}/`) && !path.includes(OLD_RUN)));
  const memory = new MemoryProvider(); await assert.rejects(localRun(memory, plan, true, OLD_APPROVAL).run); assert.deepEqual(memory.calls, []);
  const event = safePhase1Journal(plan, { stage: "verified", check: "range_read", object: plan.objectAllowlist[2], status: 206 });
  assert.equal(event.runId, FRESH_PHASE1_RUN); assert.equal(event.planDigest, FRESH_PHASE1_DIGEST);
  assert.throws(() => safePhase1Journal(plan, { stage: "verified", check: "token=synthetic-secret" }));
  assert.throws(() => safePhase1Journal(plan, { stage: "intent", sourceObject: `cloud-tests/phase1/${OLD_RUN}/input/reading.wav` }));
});

test("missing, null and empty token metadata pass the full REST flow; every non-empty or invalid value blocks it", async () => {
  for (const token of [undefined, null, "", " ", "\n", "null", "synthetic-non-empty", false, 0, []]) {
    const memory = new MemoryProvider(), { wire } = fakeWire(memory), request = wire.request;
    wire.request = async input => {
      const response = await request(input);
      if (input.url.includes("/copyTo/") && response.status === 200) {
        const metadata = (response.data as { metadata: Record<string, unknown> }).metadata;
        if (token === undefined) delete metadata.firebaseStorageDownloadTokens; else metadata.firebaseStorageDownloadTokens = token;
      }
      return response;
    };
    const state = localRun(new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL));
    if (token === undefined || token === null || token === "") { await state.run(); assert.equal(memory.mutations, 17); }
    else { await assert.rejects(state.run); assert.equal(memory.mutations, 6); assert.ok(!memory.calls.some(call => call.startsWith("remove:"))); }
  }
});

test("empty copy metadata never bypasses anonymous GCS, anonymous Firebase or old-token denial on either copy", async () => {
  for (const target of [plan.objectAllowlist[3], plan.objectAllowlist[4]]) for (const probe of ["gcs-anonymous", "firebase-anonymous", "firebase-old"]) {
    const memory = new MemoryProvider(), publicRead = memory.publicRead.bind(memory);
    memory.publicRead = async (path, api, token) => path === target && `${api}-${token ? "old" : "anonymous"}` === probe ? 200 : publicRead(path, api, token);
    await assert.rejects(localRun(memory).run); assert.ok(!memory.calls.some(call => call.startsWith("remove:")));
    assert.equal(memory.mutations, target === plan.objectAllowlist[3] ? 6 : 7);
  }
});

test("404 cannot prove a copy is private when it disappeared during the access probes", async () => {
  const memory = new MemoryProvider(), publicRead = memory.publicRead.bind(memory);
  memory.publicRead = async (path, api, token) => {
    if (path === plan.objectAllowlist[3]) memory.live.delete(path);
    return publicRead(path, api, token);
  };
  await assert.rejects(localRun(memory).run); assert.equal(memory.mutations, 6);
  assert.ok(!memory.calls.some(call => call.startsWith("remove:")));
});

test("the original token must still work immediately before revoke; later source checks prove denial while live", async () => {
  const memory = new MemoryProvider(), publicRead = memory.publicRead.bind(memory); let positiveChecks = 0;
  memory.publicRead = async (path, api, token) => {
    if (path === plan.objectAllowlist[0] && api === "firebase" && token && token === memory.live.get(path)?.token) {
      if (++positiveChecks === 2) return 403;
    }
    return publicRead(path, api, token);
  };
  await assert.rejects(localRun(memory).run); assert.equal(positiveChecks, 2); assert.equal(memory.mutations, 7);
  assert.ok(!memory.calls.some(call => call.startsWith("remove:")));
  const successful = localRun(new MemoryProvider()); await successful.run();
  assert.equal(successful.events.filter(event => event.check === "token_positive").length, 2);
  const revoked = successful.events.findIndex(event => event.check === "revoked_while_source_live");
  const firstDelete = successful.events.findIndex(event => event.stage === "intent" && event.object === plan.objectAllowlist[0] && event.metageneration === "3");
  assert.ok(revoked > 0 && firstDelete > revoked);
});

test("invalid restore generation, metadata or checksum stops before normal cleanup", async () => {
  for (const defect of ["same-generation", "metageneration", "checksum"]) {
    const memory = new MemoryProvider(), restore = memory.restore.bind(memory);
    memory.restore = async object => {
      const result = await restore(object);
      return { ...result, ...(defect === "same-generation" ? { generation: object.generation } : defect === "metageneration" ? { metageneration: "2" } : { crc32c: "bad" }) };
    };
    await assert.rejects(localRun(memory).run); assert.equal(memory.mutations, 12);
    assert.ok(!memory.calls.includes(`remove:${plan.objectAllowlist[1]}`));
  }
});

function nativeBindings(memory: MemoryProvider) {
  const { wire, requests } = fakeWire(memory), fetches: { url: string; options: RequestInit }[] = []; let loads = 0, signs = 0;
  const bindings: FreshCloudBindings = {
    loadClient: async (filename, mode) => {
      loads++; assert.equal(filename, CLOUD_TEST_ADC_PATH);
      const client = createCloudTestClient({ clientId: "synthetic", clientSecret: "synthetic", refreshToken: "synthetic" }, mode);
      mock.method(client, "getRequestHeaders", async () => ({ Authorization: `Bearer synthetic-${mode}` }));
      mock.method(client, "sign", async () => { signs++; return { keyId: "synthetic-only", signedBlob: Buffer.from("synthetic-signature").toString("base64") }; });
      return client;
    },
    fetch: async (input, options = {}) => {
      const url = String(input), headers = new Headers(options.headers); fetches.push({ url, options });
      assert.equal(options.redirect, "manual"); assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store"); assert.ok(options.signal);
      if (!headers.has("Authorization")) { assert.equal(headers.has("x-goog-user-project"), false); return new Response(null, { status: await wire.publicStatus(url) }); }
      assert.equal(headers.get("x-goog-user-project"), plan.projectId);
      const upload = url.includes("/upload/"), range = headers.get("Range");
      const request: WireRequest = { method: options.method as WireRequest["method"], url,
        ...(options.body === undefined ? {} : { data: upload ? Buffer.from(options.body as Uint8Array) : JSON.parse(String(options.body)) }),
        ...(upload ? { headers: { "Content-Type": headers.get("Content-Type")! } } : range ? { headers: { Range: range } } : {}),
        ...(new URL(url).searchParams.get("alt") === "media" ? { media: true } : {}),
        ...(headers.get("Authorization")!.endsWith("read-only") ? { limited: true } : {}),
      };
      const response = await wire.request(request);
      return new Response(response.status === 204 ? null : Buffer.isBuffer(response.data) ? new Uint8Array(response.data) : JSON.stringify(response.data),
        { status: response.status, headers: response.headers });
    },
  };
  return { bindings, requests, fetches, get loads() { return loads; }, get signs() { return signs; } };
}
async function inTemporaryJournal<T>(fn: (root: string) => Promise<T>) {
  const base = path.resolve(tmpdir()), root = await mkdtemp(path.join(base, "321school-fresh-phase1-local-"));
  try { return await fn(root); }
  finally { assert.equal(path.dirname(path.resolve(root)), base); assert.ok(path.basename(root).startsWith("321school-fresh-phase1-local-")); await rm(root, { recursive: true, force: true }); }
}

test("complete runner, real fetch adapter, Google SDK keyless signing and exclusive journal succeed with zero external access", async () => {
  await inTemporaryJournal(async root => {
    const memory = new MemoryProvider(), http = nativeBindings(memory);
    const result = await runFreshPhase1Command({ execute: true, approval: FRESH_PHASE1_APPROVAL, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveFreshJournal,
      provider: (input, adc, execute, approval) => createFreshPhase1CloudProvider(input, adc, execute, approval, http.bindings),
    });
    assert.equal(result.status, "completed"); assert.equal(memory.mutations, 17); assert.equal(memory.live.size, 0); assert.equal(memory.soft.size, 8);
    assert.equal(http.loads, 2); assert.equal(http.signs, 1);
    const text = await readFile(path.join(root, "execution.journal.jsonl"), "utf8"), events = text.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(events.filter(event => event.stage === "applied").length, 17); assert.equal(events.filter(event => event.stage === "denied_as_expected").length, 4);
    assert.equal(events.at(-1).stage, "completed"); assert.ok(!text.includes("Bearer")); assert.ok(!text.includes("X-Goog-Signature")); assert.ok(!text.includes(OLD_RUN));
    const signed = http.fetches.find(call => new URL(call.url).searchParams.has("X-Goog-Signature"))!;
    assert.equal(new URL(signed.url).searchParams.get("X-Goog-Expires"), "300"); assert.equal(new Headers(signed.options.headers).has("Authorization"), false);
  });
});

test("fresh factory refuses old approval, wrong ADC and altered plan before constructing any auth client", async () => {
  const http = nativeBindings(new MemoryProvider());
  for (const [execute, approval] of [[false, FRESH_PHASE1_APPROVAL], [true, OLD_APPROVAL], [true, ""]] as const)
    await assert.rejects(createFreshPhase1CloudProvider(plan, CLOUD_TEST_ADC_PATH, execute, approval, http.bindings));
  await assert.rejects(createFreshPhase1CloudProvider({ ...plan, runId: OLD_RUN }, CLOUD_TEST_ADC_PATH, true, FRESH_PHASE1_APPROVAL, http.bindings));
  await assert.rejects(createFreshPhase1CloudProvider(plan, "C:/other/adc.json", true, FRESH_PHASE1_APPROVAL, http.bindings));
  assert.equal(http.loads, 0); assert.equal(http.fetches.length, 0);
});

test("default command only validates new local artifacts; exclusive journal prevents re-execution before auth", async () => {
  await inTemporaryJournal(async root => {
    // Own synthetic inputs: do not depend on an earlier private .vercel run.
    const artifacts = path.join(root, ".vercel/security-cloud-test/phase1", FRESH_PHASE1_RUN);
    await mkdir(artifacts, { recursive: true });
    await writeFile(path.join(artifacts, "plan.json"), JSON.stringify(plan), { flag: "wx" });
    for (const file of fixtures) await writeFile(path.join(artifacts, file.filename), file.bytes, { flag: "wx" });
    const previousDirectory = process.cwd();
    try {
      process.chdir(root);
      const inputs = await loadFreshLocalInputs(); assert.equal(inputs.plan.runId, FRESH_PHASE1_RUN);
      assert.equal(inputs.fixtures.length, fixtures.length);
      for (const file of inputs.fixtures) assert.ok(file.bytes.equals(fixtures.find(value => value.id === file.id)!.bytes));
    } finally { process.chdir(previousDirectory); }
    let clients = 0, journals = 0;
    const dependencies = { localInputs: async () => ({ root, plan, fixtures }),
      journal: async () => { journals++; return openExclusiveFreshJournal(root, plan); },
      provider: async () => { clients++; throw new Error("must not authenticate"); } };
    const result = await runFreshPhase1Command({ execute: false, approval: "", adc: CLOUD_TEST_ADC_PATH }, dependencies);
    assert.equal(result.status, "fresh_local_validation_passed"); assert.equal(clients, 0); assert.equal(journals, 0);
    const journal = await openExclusiveFreshJournal(root, plan); await journal.append({ stage: "execution_started" }); await journal.close();
    const before = await readFile(path.join(root, "execution.journal.jsonl"));
    await assert.rejects(runFreshPhase1Command({ execute: true, approval: FRESH_PHASE1_APPROVAL, adc: CLOUD_TEST_ADC_PATH }, dependencies));
    assert.equal(clients, 0); assert.ok(before.equals(await readFile(path.join(root, "execution.journal.jsonl"))));
  });
});

test("ambiguous copy result stops without source deletion or automatic cleanup and leaves a stopped fresh journal", async () => {
  await inTemporaryJournal(async root => {
    const memory = new MemoryProvider(), { wire } = fakeWire(memory), request = wire.request;
    wire.request = async input => { const response = await request(input); if (input.url.includes("/copyTo/")) throw new Error("synthetic lost response"); return response; };
    await assert.rejects(runFreshPhase1Command({ execute: true, approval: FRESH_PHASE1_APPROVAL, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveFreshJournal,
      provider: async () => new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL),
    }));
    assert.equal(memory.mutations, 6); assert.ok(!memory.calls.some(call => call.startsWith("remove:")));
    const text = await readFile(path.join(root, "execution.journal.jsonl"), "utf8"); assert.equal(JSON.parse(text.trim().split("\n").at(-1)!).stage, "stopped_no_automatic_cleanup");
  });
});

test("resource HTTP errors and oversized responses fail closed without a resource retry", async () => {
  for (const failure of [403, 500, "oversized"]) {
    const http = nativeBindings(new MemoryProvider()); let calls = 0;
    http.bindings.fetch = async () => { calls++; return failure === "oversized" ? new Response(new Uint8Array(2 * 1024 * 1024 + 1)) : new Response("{}", { status: failure as number }); };
    const provider = await createFreshPhase1CloudProvider(plan, CLOUD_TEST_ADC_PATH, true, FRESH_PHASE1_APPROVAL, http.bindings);
    await assert.rejects(provider.head(plan.objectAllowlist[0])); assert.equal(calls, 1);
  }
});

test("signed URL scope rejects extended validity, old dates, extra parameters and another target before it can be read", async () => {
  for (const defect of ["expires", "date", "parameter", "path", "credential"]) {
    const memory = new MemoryProvider(), { wire } = fakeWire(memory), sign = wire.sign;
    wire.sign = async target => {
      const url = new URL(await sign(target));
      if (defect === "expires") url.searchParams.set("X-Goog-Expires", "301");
      if (defect === "date") url.searchParams.set("X-Goog-Date", "20200101T000000Z");
      if (defect === "parameter") url.searchParams.set("generation", "123");
      if (defect === "path") url.pathname = `/${bucket}/${plan.objectAllowlist[4]}`;
      if (defect === "credential") url.searchParams.set("X-Goog-Credential", "other-account/auto/storage/goog4_request");
      return url.toString();
    };
    await assert.rejects(new CloudFileTestFreshProvider(plan, wire, true, FRESH_PHASE1_APPROVAL).sign(plan.objectAllowlist[0]));
  }
});

test("client setup failure leaves an exclusive stopped journal without credentials or provider calls", async () => {
  await inTemporaryJournal(async root => {
    await assert.rejects(runFreshPhase1Command({ execute: true, approval: FRESH_PHASE1_APPROVAL, adc: CLOUD_TEST_ADC_PATH }, {
      localInputs: async () => ({ root, plan, fixtures }), journal: openExclusiveFreshJournal,
      provider: async () => { throw new Error("Bearer synthetic-secret not for logging"); },
    }));
    const text = await readFile(path.join(root, "execution.journal.jsonl"), "utf8");
    assert.equal(JSON.parse(text).stage, "stopped_no_automatic_cleanup"); assert.ok(!text.includes("synthetic-secret"));
    await assert.rejects(openExclusiveFreshJournal(root, plan));
  });
});
