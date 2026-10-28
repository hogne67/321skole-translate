import { randomUUID } from "node:crypto";
import { CLOUD_TEST_BUCKET, CLOUD_TEST_PROJECT, CLOUD_TEST_PRINCIPAL } from "./cloudTestBoundary";
import { approvedPhase1Plan, assertExecutionSignal, PHASE1_RUN, requirePhase1, verifyFixture,
  type Fixture, type Phase1Plan, type Phase1Provider, type TestObject } from "./cloudFileTestExecution";

export type WireRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; url: string; data?: unknown; headers?: Record<string, string>; media?: boolean; limited?: boolean };
export type WireResponse = { status: number; data: unknown; headers?: Record<string, string> };
export interface Phase1Wire { request(request: WireRequest): Promise<WireResponse>; publicStatus(url: string): Promise<number>; sign(path: string): Promise<string> }
type Json = Record<string, unknown>;
function json(value: unknown): Json { requirePhase1(!!value && typeof value === "object" && !Array.isArray(value), "invalid_provider_json"); return value as Json; }
const base = `https://storage.googleapis.com/storage/v1/b/${CLOUD_TEST_BUCKET}`;
const objectUrl = (path: string) => `${base}/o/${encodeURIComponent(path)}`;
function query(url: string, values: Record<string, string>) { const result = new URL(url); for (const [key, value] of Object.entries(values)) result.searchParams.set(key, value); return result.toString(); }
class HttpStatusError extends Error { constructor(public status: number) { super("unexpected_provider_status"); } }

/** Defense at the transport boundary, independent of the coordinator. No bucket listing. */
export function assertPhase1Request(plan: Phase1Plan, request: WireRequest) {
  const url = new URL(request.url);
  requirePhase1(!url.username && !url.password && !url.hash, "unsafe_resource_url");
  const allowedQuery = new Set(["alt", "generation", "softDeleted", "uploadType", "ifGenerationMatch", "ifMetagenerationMatch", "ifSourceGenerationMatch", "ifSourceMetagenerationMatch"]);
  for (const key of url.searchParams.keys()) requirePhase1(allowedQuery.has(key) && url.searchParams.getAll(key).length === 1, "unsafe_resource_query");
  const path = (encoded: string) => { const decoded = decodeURIComponent(encoded); requirePhase1(plan.objectAllowlist.includes(decoded), "object_outside_approved_list"); return decoded; };
  const version = (key: string, zero = false) => requirePhase1((zero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/).test(url.searchParams.get(key) || ""), "resource_version_precondition_required");
  if (url.origin === "https://cloudresourcemanager.googleapis.com" && url.pathname === `/v1/projects/${CLOUD_TEST_PROJECT}`) {
    requirePhase1(request.method === "GET" && !url.search && request.data === undefined, "unsafe_project_request"); return;
  }
  requirePhase1(url.origin === "https://storage.googleapis.com", "resource_host_refused");
  const bucketPath = `/storage/v1/b/${CLOUD_TEST_BUCKET}`;
  if ([bucketPath, `${bucketPath}/iam`].includes(url.pathname)) {
    requirePhase1(request.method === "GET" && !url.search && request.data === undefined, "unsafe_bucket_request"); return;
  }
  if (url.pathname === `/upload/storage/v1/b/${CLOUD_TEST_BUCKET}/o`) {
    requirePhase1(request.method === "POST" && url.searchParams.get("uploadType") === "multipart" && Buffer.isBuffer(request.data), "unsafe_upload_request");
    version("ifGenerationMatch", true);
    const start = request.data.indexOf("\r\n\r\n") + 4, end = request.data.indexOf("\r\n--", start);
    requirePhase1(start >= 4 && end > start, "invalid_upload_body");
    const metadata = json(JSON.parse(request.data.subarray(start, end).toString("utf8")));
    path(String(metadata.name));
    requirePhase1([0, 1, 2, 5, 6].some(index => plan.objectAllowlist[index] === metadata.name), "upload_target_refused");
    requirePhase1(!("acl" in metadata) && !Object.keys(metadata).some(key => !["name", "contentType", "cacheControl", "metadata"].includes(key)), "upload_metadata_refused");
    requirePhase1(json(metadata.metadata).testRunId === PHASE1_RUN && metadata.cacheControl === "private,no-store", "upload_owner_required"); return;
  }
  const prefix = `${bucketPath}/o/`; requirePhase1(url.pathname.startsWith(prefix), "resource_path_refused");
  const rest = url.pathname.slice(prefix.length), copyAnchor = `/copyTo/b/${CLOUD_TEST_BUCKET}/o/`;
  if (rest.includes(copyAnchor)) {
    const parts = rest.split(copyAnchor); requirePhase1(parts.length === 2 && request.method === "POST", "unsafe_copy_request");
    const source = path(parts[0]), destination = path(parts[1]);
    requirePhase1((source === plan.objectAllowlist[0] && destination === plan.objectAllowlist[3])
      || (source === plan.objectAllowlist[2] && destination === plan.objectAllowlist[4]), "copy_pair_refused");
    version("ifSourceGenerationMatch"); version("ifSourceMetagenerationMatch");
    requirePhase1(url.searchParams.get("ifGenerationMatch") === "0", "copy_overwrite_refused");
    const data = json(request.data), metadata = json(data.metadata);
    requirePhase1(metadata.firebaseStorageDownloadTokens === null && metadata.testRunId === PHASE1_RUN
      && metadata.fixtureId === (source === plan.objectAllowlist[0] ? "reading" : "podcast") && data.cacheControl === "private,no-store"
      && !Object.keys(data).some(key => !["contentType", "cacheControl", "metadata"].includes(key)), "copy_token_or_acl_refused"); return;
  }
  if (rest.endsWith("/restore")) {
    requirePhase1(path(rest.slice(0, -8)) === plan.objectAllowlist[4] && request.method === "POST" && request.data === undefined
      && url.searchParams.get("ifGenerationMatch") === "0", "restore_target_or_overwrite_refused"); version("generation"); return;
  }
  const target = path(rest);
  if (request.method === "GET") {
    requirePhase1(request.data === undefined, "get_body_refused");
    if (url.searchParams.has("alt")) { requirePhase1(url.searchParams.get("alt") === "media", "unsafe_media_mode"); version("generation"); }
    if (url.searchParams.has("softDeleted")) { requirePhase1(target === plan.objectAllowlist[4] && url.searchParams.get("softDeleted") === "true", "soft_deleted_target_refused"); version("generation"); }
    return;
  }
  requirePhase1(request.method === "PATCH" || request.method === "DELETE", "object_method_refused");
  version("ifGenerationMatch"); version("ifMetagenerationMatch");
  requirePhase1(!url.searchParams.has("generation"), "historical_delete_selector_refused");
  if (request.method === "PATCH") {
    requirePhase1(target === plan.objectAllowlist[0], "token_patch_target_refused");
    const data = json(request.data), metadata = json(data.metadata), token = metadata.firebaseStorageDownloadTokens;
    requirePhase1(Object.keys(data).length === 1 && metadata.testRunId === PHASE1_RUN && (token === null || (typeof token === "string" && /^[a-f0-9-]{36}$/.test(token))), "unsafe_token_patch");
  } else requirePhase1(request.data === undefined, "delete_body_refused");
}

export class CloudFileTestProvider implements Phase1Provider {
  private readonly plan: Phase1Plan;
  private readonly signed = new Set<string>();
  constructor(input: unknown, private wire: Phase1Wire, execute: boolean, approval: string) {
    assertExecutionSignal(execute, approval); this.plan = approvedPhase1Plan(input);
  }
  private path(path: string) { requirePhase1(this.plan.objectAllowlist.includes(path), "object_outside_approved_list"); return path; }
  private async request(request: WireRequest, expected: number | number[] = 200) {
    assertPhase1Request(this.plan, request); const response = await this.wire.request(request);
    if (!(Array.isArray(expected) ? expected : [expected]).includes(response.status)) throw new HttpStatusError(response.status);
    return response;
  }
  private object(path: string, value: unknown): TestObject {
    const data = json(value), metadata = json(data.metadata);
    requirePhase1(data.name === path && data.bucket === CLOUD_TEST_BUCKET && typeof data.generation === "string" && typeof data.metageneration === "string", "unexpected_object_identity");
    return { path, generation: data.generation, metageneration: data.metageneration, fixtureId: String(metadata.fixtureId), testRunId: String(metadata.testRunId),
      size: Number(data.size), contentType: String(data.contentType), md5Hash: String(data.md5Hash), crc32c: String(data.crc32c), cacheControl: String(data.cacheControl),
      token: metadata.firebaseStorageDownloadTokens == null ? null : String(metadata.firebaseStorageDownloadTokens), softDeleted: typeof data.softDeleteTime === "string" };
  }
  async preflight() {
    const project = json((await this.request({ method: "GET", url: `https://cloudresourcemanager.googleapis.com/v1/projects/${CLOUD_TEST_PROJECT}` })).data);
    const bucket = json((await this.request({ method: "GET", url: base })).data);
    const iam = json((await this.request({ method: "GET", url: `${base}/iam` })).data);
    const config = json(bucket.iamConfiguration), ubla = json(config.uniformBucketLevelAccess), soft = json(bucket.softDeletePolicy);
    requirePhase1(project.projectId === CLOUD_TEST_PROJECT && String(project.projectNumber) === this.plan.projectNumber && bucket.name === CLOUD_TEST_BUCKET
      && String(bucket.projectNumber) === this.plan.projectNumber && String(bucket.location).toLowerCase() === "europe-west1" && ubla.enabled === true
      && String(soft.retentionDurationSeconds) === "604800", "bucket_identity_or_policy_changed");
    requirePhase1(!bucket.retentionPolicy && !bucket.defaultEventBasedHold && !(bucket.versioning && json(bucket.versioning).enabled)
      && !(bucket.hierarchicalNamespace && json(bucket.hierarchicalNamespace).enabled) && !(bucket.autoclass && json(bucket.autoclass).enabled)
      && !(bucket.lifecycle && Array.isArray(json(bucket.lifecycle).rule) && (json(bucket.lifecycle).rule as unknown[]).length), "unapproved_bucket_policy");
    requirePhase1(!(Array.isArray(iam.bindings) && iam.bindings.some(binding => Array.isArray(json(binding).members)
      && (json(binding).members as unknown[]).some(member => ["allUsers", "allAuthenticatedUsers"].includes(String(member))))), "public_bucket_binding");
  }
  async head(path: string, softGeneration?: string) {
    this.path(path); const url = softGeneration ? query(objectUrl(path), { generation: softGeneration, softDeleted: "true" }) : objectUrl(path);
    const response = await this.request({ method: "GET", url }, [200, 404]); return response.status === 404 ? null : this.object(path, response.data);
  }
  async read(object: TestObject, range?: [number, number], limited = false) {
    const response = await this.request({ method: "GET", url: query(objectUrl(this.path(object.path)), { generation: object.generation, alt: "media" }),
      media: true, limited, ...(range ? { headers: { Range: `bytes=${range[0]}-${range[1]}` } } : {}) }, range ? 206 : 200);
    requirePhase1(Buffer.isBuffer(response.data) || response.data instanceof ArrayBuffer, "invalid_media_response");
    return { status: response.status, bytes: Buffer.isBuffer(response.data) ? Buffer.from(response.data) : Buffer.from(response.data as ArrayBuffer), contentRange: response.headers?.["content-range"] };
  }
  async upload(path: string, fixture: Fixture, previous?: TestObject, limited = false) {
    this.path(path); verifyFixture(fixture); if (previous) requirePhase1(previous.path === path && previous.testRunId === PHASE1_RUN, "upload_previous_owner_mismatch");
    const [reading, image, podcast, , , probe, forbidden] = this.plan.objectAllowlist;
    requirePhase1((path === reading && fixture.id === "reading" && !previous && !limited)
      || (path === image && fixture.id === "image" && !previous && !limited)
      || (path === podcast && fixture.id === "podcast" && !previous && !limited)
      || (path === probe && fixture.id === (previous ? "generation-v2" : "generation-v1") && !limited)
      || (path === forbidden && fixture.id === "generation-v1" && limited && !previous), "fixture_target_pair_refused");
    const boundary = `phase1-${randomUUID()}`;
    const metadata = { name: path, contentType: fixture.contentType, cacheControl: "private,no-store", metadata: { testRunId: PHASE1_RUN, fixtureId: fixture.id } };
    const data = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${fixture.contentType}\r\n\r\n`), fixture.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response = await this.request({ method: "POST", url: query(`https://storage.googleapis.com/upload/storage/v1/b/${CLOUD_TEST_BUCKET}/o`, {
      uploadType: "multipart", ifGenerationMatch: previous?.generation || "0" }), headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, data, limited });
    return this.object(path, response.data);
  }
  async token(object: TestObject, token: string | null) {
    this.path(object.path); requirePhase1(object.testRunId === PHASE1_RUN, "token_owner_mismatch");
    const response = await this.request({ method: "PATCH", url: query(objectUrl(object.path), { ifGenerationMatch: object.generation, ifMetagenerationMatch: object.metageneration }),
      data: { metadata: { testRunId: PHASE1_RUN, fixtureId: object.fixtureId, firebaseStorageDownloadTokens: token } } });
    return this.object(object.path, response.data);
  }
  async copy(object: TestObject, destination: string) {
    this.path(object.path); this.path(destination); requirePhase1(object.testRunId === PHASE1_RUN, "copy_owner_mismatch");
    const response = await this.request({ method: "POST", url: query(`${objectUrl(object.path)}/copyTo/b/${CLOUD_TEST_BUCKET}/o/${encodeURIComponent(destination)}`, {
      ifSourceGenerationMatch: object.generation, ifSourceMetagenerationMatch: object.metageneration, ifGenerationMatch: "0" }),
      data: { contentType: object.contentType, cacheControl: "private,no-store", metadata: { testRunId: PHASE1_RUN, fixtureId: object.fixtureId, firebaseStorageDownloadTokens: null } } });
    return this.object(destination, response.data);
  }
  async remove(object: TestObject) {
    this.path(object.path); requirePhase1(object.testRunId === PHASE1_RUN, "delete_owner_mismatch");
    await this.request({ method: "DELETE", url: query(objectUrl(object.path), { ifGenerationMatch: object.generation, ifMetagenerationMatch: object.metageneration }) }, 204);
  }
  async restore(object: TestObject) {
    this.path(object.path); requirePhase1(object.testRunId === PHASE1_RUN && object.softDeleted && object.token === null, "restore_source_not_private");
    const response = await this.request({ method: "POST", url: query(`${objectUrl(object.path)}/restore`, { generation: object.generation, ifGenerationMatch: "0" }) });
    return this.object(object.path, response.data);
  }
  async publicRead(path: string, api: "gcs" | "firebase", token?: string) {
    this.path(path); requirePhase1(["gcs", "firebase"].includes(api), "public_probe_api_refused");
    const url = api === "gcs" ? query(objectUrl(path), { alt: "media" }) : query(`https://firebasestorage.googleapis.com/v0/b/${CLOUD_TEST_BUCKET}/o/${encodeURIComponent(path)}`, { alt: "media", ...(token ? { token } : {}) });
    return this.wire.publicStatus(url);
  }
  async sign(path: string) {
    this.path(path); requirePhase1(path === this.plan.objectAllowlist[0], "signed_url_target_refused");
    const signed = await this.wire.sign(path), url = new URL(signed);
    requirePhase1(url.origin === "https://storage.googleapis.com" && !url.username && !url.password && !url.hash && decodeURIComponent(url.pathname) === `/${CLOUD_TEST_BUCKET}/${path}`
      && url.searchParams.get("X-Goog-Credential")?.startsWith(`${CLOUD_TEST_PRINCIPAL}/`) && url.searchParams.get("X-Goog-Expires") === "300"
      && !url.searchParams.has("generation"), "signed_url_scope_invalid");
    this.signed.add(signed); return signed;
  }
  async signedRead(url: string) { requirePhase1(this.signed.has(url), "unknown_signed_url_refused"); return this.wire.publicStatus(url); }
}

/** Actual cloud transport, created only after the separate execution gate. */
export async function createPhase1CloudProvider(input: unknown, adcPath: string, execute: boolean, approval: string) {
  assertExecutionSignal(execute, approval); const plan = approvedPhase1Plan(input);
  const { loadCloudTestClient } = await import("./cloudTestAuth");
  const full = await loadCloudTestClient(adcPath), limited = await loadCloudTestClient(adcPath, "read-only");
  const { GoogleAuth } = await import("google-auth-library"), { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({ projectId: CLOUD_TEST_PROJECT, authClient: new GoogleAuth({ projectId: CLOUD_TEST_PROJECT, authClient: full }), retryOptions: { autoRetry: false } });
  const wire: Phase1Wire = {
    request: async request => {
      assertPhase1Request(plan, request);
      const result = await (request.limited ? limited : full).request({ method: request.method, url: request.url, data: request.data, headers: request.headers,
        responseType: request.media ? "arraybuffer" : "json", validateStatus: () => true, maxRedirects: 0, timeout: 15_000,
        maxContentLength: 2 * 1024 * 1024, retry: false });
      return { status: result.status, data: result.data, headers: result.headers as Record<string, string> };
    },
    publicStatus: async url => {
      const response = await fetch(url, { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
      await response.body?.cancel(); return response.status;
    },
    sign: async path => {
      const accessibleAt = Math.floor(Date.now() / 1000) * 1000;
      const [url] = await storage.bucket(CLOUD_TEST_BUCKET).file(path).getSignedUrl({ action: "read", version: "v4", accessibleAt, expires: accessibleAt + 300_000 }); return url;
    },
  };
  return new CloudFileTestProvider(plan, wire, execute, approval);
}
