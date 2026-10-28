import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { UserRefreshClient } from "google-auth-library";
import { createCloudTestClient } from "./cloudTestAuth";
import { buildCloudFileTestPlan, syntheticFileFixtures } from "./cloudFileTestPlan";
import { appendPhase1Journal, assertExecutionSignal, executePhase1, PHASE1_APPROVAL, PHASE1_DIGEST, PHASE1_RUN,
  safePhase1Journal, type Fixture, type Phase1Provider, type TestObject } from "./cloudFileTestExecution";
import { assertPhase1Request, CloudFileTestProvider, type Phase1Wire, type WireRequest } from "./cloudFileTestProvider";
import { CLOUD_TEST_BUCKET as bucket, CLOUD_TEST_PRINCIPAL as principal } from "./cloudTestBoundary";

const plan = buildCloudFileTestPlan("testbilde-5683f", bucket, PHASE1_RUN);
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
    return { path, generation: String(++this.counter), metageneration: "1", fixtureId: file.id, testRunId: PHASE1_RUN, size: file.size,
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
    const copy = this.make(destination, fixtures.find(file => file.id === object.fixtureId)!); this.live.set(destination, copy); this.mutations++; return { ...copy };
  }
  async remove(object: TestObject) {
    this.calls.push(`remove:${object.path}`); const current = this.live.get(object.path);
    if (!current || current.generation !== object.generation || current.metageneration !== object.metageneration) return status(412);
    this.soft.set(`${object.path}#${object.generation}`, { ...current, softDeleted: true }); this.live.delete(object.path); this.mutations++;
  }
  async restore(object: TestObject) {
    this.calls.push(`restore:${object.path}`); if (this.live.has(object.path) || !this.soft.has(`${object.path}#${object.generation}`)) return status(412);
    const restored = this.make(object.path, fixtures.find(file => file.id === object.fixtureId)!); this.live.set(object.path, restored); this.mutations++; return { ...restored };
  }
  async publicRead(path: string, api: "gcs" | "firebase", token?: string) { return api === "firebase" && token && this.live.get(path)?.token === token ? 200 : 403; }
  async sign(path: string) { return path; }
  async signedRead(path: string) { return this.live.has(path) ? 200 : 404; }
}
function localRun(provider: Phase1Provider, input: unknown = plan, execute = true, approval = PHASE1_APPROVAL) {
  const events: Record<string, unknown>[] = [];
  const run = () => executePhase1(input, fixtures, provider, async event => { events.push(safePhase1Journal(plan, event)); }, execute, approval);
  return { run, events };
}

test("scope approval alone, wrong execution signal, changed manifest and production targets stop before all provider calls", async () => {
  for (const [execute, approval] of [[false, ""], [true, ""], [true, `EXECUTE:${PHASE1_RUN}:wrong`]] as const) {
    const provider = new MemoryProvider(); await assert.rejects(localRun(provider, plan, execute, approval).run); assert.deepEqual(provider.calls, []);
  }
  for (const changed of [{ ...plan, projectId: "skole-c09b8" }, { ...plan, runId: "different" }, { ...plan, approved: true },
    { ...plan, objectAllowlist: [...plan.objectAllowlist, "covers/other/image.png"] }]) {
    const provider = new MemoryProvider(); await assert.rejects(localRun(provider, changed).run); assert.deepEqual(provider.calls, []);
  }
  assert.throws(() => assertExecutionSignal(true, PHASE1_DIGEST));
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
  await assert.rejects(executePhase1(plan, fixtures, provider, async event => { if (event.stage === "intent") throw new Error("synthetic_journal_unavailable"); }, true, PHASE1_APPROVAL));
  assert.equal(provider.mutations, 0);
});
test("partial journal writes fail closed and complete lines are synced before returning", async () => {
  let synced = 0;
  await assert.rejects(appendPhase1Journal({ write: async () => ({ bytesWritten: 1 }), sync: async () => { synced++; } }, plan, { stage: "intent" }), /journal_partial_write/);
  assert.equal(synced, 0);
  await appendPhase1Journal({ write: async text => { assert.equal(JSON.parse(text).planDigest, PHASE1_DIGEST); return { bytesWritten: Buffer.byteLength(text) }; }, sync: async () => { synced++; } }, plan, { stage: "intent" });
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
  await assert.rejects(executePhase1(plan, changed, fresh, async () => undefined, true, PHASE1_APPROVAL)); assert.deepEqual(fresh.calls, []);
});

function metadata(object: TestObject) {
  return { name: object.path, bucket, generation: object.generation, metageneration: object.metageneration, size: String(object.size),
    contentType: object.contentType, md5Hash: object.md5Hash, crc32c: object.crc32c, cacheControl: object.cacheControl,
    metadata: { fixtureId: object.fixtureId, testRunId: object.testRunId, ...(object.token ? { firebaseStorageDownloadTokens: object.token } : {}) },
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
    sign: async path => `https://storage.googleapis.com/${bucket}/${path}?X-Goog-Credential=${encodeURIComponent(principal + "/synthetic-scope")}&X-Goog-Expires=300&X-Goog-Signature=synthetic`,
  };
  return { wire, requests };
}
test("actual REST adapter and coordinator complete the approved recipe against an offline GCS simulator", async () => {
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory);
  const provider = new CloudFileTestProvider(plan, wire, true, PHASE1_APPROVAL);
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
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory), provider = new CloudFileTestProvider(plan, wire, true, PHASE1_APPROVAL);
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
    await assert.rejects(localRun(new CloudFileTestProvider(plan, wire, true, PHASE1_APPROVAL)).run); assert.equal(memory.mutations, 0);
  }
});
test("foreign signed URL and missing execution approval cannot reach transport", async () => {
  const memory = new MemoryProvider(), { wire, requests } = fakeWire(memory);
  assert.throws(() => new CloudFileTestProvider(plan, wire, true, ""));
  wire.sign = async () => "https://synthetic.invalid/secret";
  await assert.rejects(new CloudFileTestProvider(plan, wire, true, PHASE1_APPROVAL).sign(plan.objectAllowlist[0]));
  assert.equal(requests.length, 0);
});
