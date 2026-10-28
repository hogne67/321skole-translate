import { randomUUID } from "node:crypto";
import { CLOUD_TEST_BUCKET, CLOUD_TEST_PROJECT, CLOUD_TEST_PRINCIPAL } from "./cloudTestBoundary";
import { assertCloudTestBoundary, assertCloudTestAdcPath, CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";
import { normalizeDownloadToken } from "./cloudFileTestTokens";
import path from "node:path";
import type { Impersonated } from "google-auth-library";
import { approvedFreshPhase1Plan, assertFreshExecutionSignal, FRESH_PHASE1_RUN, requirePhase1, verifyFixture,
  type Fixture, type Phase1Plan, type Phase1Provider, type TestObject } from "./cloudFileTestFreshExecution";

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
  approvedFreshPhase1Plan(plan);
  const url = new URL(request.url);
  requirePhase1(!url.username && !url.password && !url.hash, "unsafe_resource_url");
  requirePhase1(Object.keys(request).every(key => ["method", "url", "data", "headers", "media", "limited"].includes(key)), "unsafe_request_field");
  const allowedQuery = new Set(["alt", "generation", "softDeleted", "uploadType", "ifGenerationMatch", "ifMetagenerationMatch", "ifSourceGenerationMatch", "ifSourceMetagenerationMatch"]);
  for (const key of url.searchParams.keys()) requirePhase1(allowedQuery.has(key) && url.searchParams.getAll(key).length === 1, "unsafe_resource_query");
  const path = (encoded: string) => { const decoded = decodeURIComponent(encoded); requirePhase1(plan.objectAllowlist.includes(decoded), "object_outside_approved_list"); return decoded; };
  const version = (key: string, zero = false) => requirePhase1((zero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/).test(url.searchParams.get(key) || ""), "resource_version_precondition_required");
  const keys = (...expected: string[]) => requirePhase1(url.searchParams.size === expected.length && expected.every(key => url.searchParams.has(key)), "unexpected_resource_query");
  if (request.headers) requirePhase1(Object.keys(request.headers).every(key => ["Content-Type", "Range"].includes(key)), "unsafe_request_header");
  if (request.limited) requirePhase1((request.method === "GET" && decodeURIComponent(url.pathname).endsWith(`/o/${plan.objectAllowlist[0]}`) && request.media)
    || (request.method === "POST" && url.pathname === `/upload/storage/v1/b/${CLOUD_TEST_BUCKET}/o`), "limited_token_operation_refused");
  if (url.origin === "https://cloudresourcemanager.googleapis.com" && url.pathname === `/v1/projects/${CLOUD_TEST_PROJECT}`) {
    requirePhase1(request.method === "GET" && !url.search && request.data === undefined && !request.media && !request.headers && !request.limited, "unsafe_project_request"); return;
  }
  requirePhase1(url.origin === "https://storage.googleapis.com", "resource_host_refused");
  const bucketPath = `/storage/v1/b/${CLOUD_TEST_BUCKET}`;
  if ([bucketPath, `${bucketPath}/iam`].includes(url.pathname)) {
    requirePhase1(request.method === "GET" && !url.search && request.data === undefined && !request.media && !request.headers && !request.limited, "unsafe_bucket_request"); return;
  }
  if (url.pathname === `/upload/storage/v1/b/${CLOUD_TEST_BUCKET}/o`) {
    requirePhase1(request.method === "POST" && url.searchParams.get("uploadType") === "multipart" && Buffer.isBuffer(request.data), "unsafe_upload_request");
    version("ifGenerationMatch", true);
    keys("uploadType", "ifGenerationMatch"); requirePhase1(!request.media && request.headers && Object.keys(request.headers).length === 1, "unsafe_upload_headers");
    const start = request.data.indexOf("\r\n\r\n") + 4, end = request.data.indexOf("\r\n--", start);
    requirePhase1(start >= 4 && end > start, "invalid_upload_body");
    const metadata = json(JSON.parse(request.data.subarray(start, end).toString("utf8")));
    path(String(metadata.name));
    requirePhase1([0, 1, 2, 5, 6].some(index => plan.objectAllowlist[index] === metadata.name), "upload_target_refused");
    requirePhase1(!("acl" in metadata) && !Object.keys(metadata).some(key => !["name", "contentType", "cacheControl", "metadata"].includes(key)), "upload_metadata_refused");
    const custom = json(metadata.metadata), index = plan.objectAllowlist.indexOf(String(metadata.name));
    const fixtureIndex = index === 0 ? 0 : index === 1 ? 1 : index === 2 ? 2 : index === 5 && url.searchParams.get("ifGenerationMatch") !== "0" ? 4 : 3;
    const fixture = plan.fixtures[fixtureIndex];
    requirePhase1(custom.testRunId === FRESH_PHASE1_RUN && custom.fixtureId === fixture.id && Object.keys(custom).length === 2
      && metadata.cacheControl === "private,no-store" && metadata.contentType === fixture.contentType, "upload_owner_or_fixture_required");
    requirePhase1((index === 6) === !!request.limited && (url.searchParams.get("ifGenerationMatch") === "0" || index === 5), "upload_scope_or_overwrite_refused");
    const boundary = request.headers["Content-Type"]?.match(/^multipart\/related; boundary=(phase1-[a-f0-9-]{36})$/)?.[1];
    requirePhase1(boundary, "upload_boundary_refused");
    const bytesStart = request.data.indexOf("\r\n\r\n", end) + 4, closing = Buffer.from(`\r\n--${boundary}--\r\n`);
    requirePhase1(bytesStart > end && request.data.length === bytesStart + fixture.size + closing.length
      && request.data.subarray(bytesStart + fixture.size).equals(closing), "upload_payload_size_refused");
    verifyFixture({ ...fixture, bytes: request.data.subarray(bytesStart, bytesStart + fixture.size) }); return;
  }
  const prefix = `${bucketPath}/o/`; requirePhase1(url.pathname.startsWith(prefix), "resource_path_refused");
  const rest = url.pathname.slice(prefix.length), copyAnchor = `/copyTo/b/${CLOUD_TEST_BUCKET}/o/`;
  if (rest.includes(copyAnchor)) {
    const parts = rest.split(copyAnchor); requirePhase1(parts.length === 2 && request.method === "POST", "unsafe_copy_request");
    const source = path(parts[0]), destination = path(parts[1]);
    requirePhase1((source === plan.objectAllowlist[0] && destination === plan.objectAllowlist[3])
      || (source === plan.objectAllowlist[2] && destination === plan.objectAllowlist[4]), "copy_pair_refused");
    version("ifSourceGenerationMatch"); version("ifSourceMetagenerationMatch");
    keys("ifSourceGenerationMatch", "ifSourceMetagenerationMatch", "ifGenerationMatch"); requirePhase1(!request.media && !request.limited && !request.headers, "unsafe_copy_flags");
    requirePhase1(url.searchParams.get("ifGenerationMatch") === "0", "copy_overwrite_refused");
    const data = json(request.data), metadata = json(data.metadata);
    requirePhase1(metadata.firebaseStorageDownloadTokens === null && metadata.testRunId === FRESH_PHASE1_RUN
      && metadata.fixtureId === (source === plan.objectAllowlist[0] ? "reading" : "podcast") && data.cacheControl === "private,no-store"
      && Object.keys(metadata).length === 3 && data.contentType === "audio/wav"
      && !Object.keys(data).some(key => !["contentType", "cacheControl", "metadata"].includes(key)), "copy_token_or_acl_refused"); return;
  }
  if (rest.endsWith("/restore")) {
    requirePhase1(path(rest.slice(0, -8)) === plan.objectAllowlist[4] && request.method === "POST" && request.data === undefined
      && url.searchParams.get("ifGenerationMatch") === "0" && !request.headers && !request.media && !request.limited, "restore_target_or_overwrite_refused"); version("generation"); keys("generation", "ifGenerationMatch"); return;
  }
  const target = path(rest);
  if (request.method === "GET") {
    requirePhase1(request.data === undefined, "get_body_refused");
    if (request.media) { requirePhase1(url.searchParams.get("alt") === "media" && target !== plan.objectAllowlist[6], "unsafe_media_mode"); version("generation"); keys("alt", "generation"); }
    else if (url.searchParams.has("softDeleted")) { requirePhase1(target === plan.objectAllowlist[4] && url.searchParams.get("softDeleted") === "true" && !request.headers && !request.limited, "soft_deleted_target_refused"); version("generation"); keys("generation", "softDeleted"); }
    else { keys(); requirePhase1(!request.headers && !request.limited, "unsafe_metadata_flags"); }
    if (request.headers) requirePhase1(request.media && target === plan.objectAllowlist[2] && Object.keys(request.headers).length === 1
      && ["bytes=0-1048575", `bytes=1048576-${plan.fixtures[2].size - 1}`].includes(request.headers.Range), "unexpected_range_request");
    return;
  }
  requirePhase1(request.method === "PATCH" || request.method === "DELETE", "object_method_refused");
  version("ifGenerationMatch"); version("ifMetagenerationMatch");
  keys("ifGenerationMatch", "ifMetagenerationMatch"); requirePhase1(!request.media && !request.limited && !request.headers, "unsafe_write_flags");
  requirePhase1(target !== plan.objectAllowlist[6], "forbidden_probe_mutation_refused");
  requirePhase1(!url.searchParams.has("generation"), "historical_delete_selector_refused");
  if (request.method === "PATCH") {
    requirePhase1(target === plan.objectAllowlist[0], "token_patch_target_refused");
    const data = json(request.data), metadata = json(data.metadata), token = metadata.firebaseStorageDownloadTokens;
    requirePhase1(Object.keys(data).length === 1 && Object.keys(metadata).length === 3 && metadata.fixtureId === "reading" && metadata.testRunId === FRESH_PHASE1_RUN && (token === null || (typeof token === "string" && /^[a-f0-9-]{36}$/.test(token))), "unsafe_token_patch");
  } else requirePhase1(request.data === undefined, "delete_body_refused");
}

export class CloudFileTestFreshProvider implements Phase1Provider {
  private readonly plan: Phase1Plan;
  private readonly signed = new Set<string>();
  constructor(input: unknown, private wire: Phase1Wire, execute: boolean, approval: string) {
    assertFreshExecutionSignal(execute, approval); this.plan = approvedFreshPhase1Plan(input);
  }
  private path(path: string) { requirePhase1(this.plan.objectAllowlist.includes(path), "object_outside_approved_list"); return path; }
  private async request(request: WireRequest, expected: number | number[] = 200) {
    assertPhase1Request(this.plan, request); const response = await this.wire.request(request);
    if (!(Array.isArray(expected) ? expected : [expected]).includes(response.status)) throw new HttpStatusError(response.status);
    return response;
  }
  private object(path: string, value: unknown): TestObject {
    const data = json(value), metadata = json(data.metadata);
    requirePhase1(data.name === path && data.bucket === CLOUD_TEST_BUCKET && typeof data.generation === "string" && typeof data.metageneration === "string"
      && !data.temporaryHold && !data.eventBasedHold && !data.retention, "unexpected_object_identity_or_hold");
    return { path, generation: data.generation, metageneration: data.metageneration, fixtureId: String(metadata.fixtureId), testRunId: String(metadata.testRunId),
      size: Number(data.size), contentType: String(data.contentType), md5Hash: String(data.md5Hash), crc32c: String(data.crc32c), cacheControl: String(data.cacheControl),
      token: normalizeDownloadToken(metadata.firebaseStorageDownloadTokens), softDeleted: typeof data.softDeleteTime === "string" };
  }
  async preflight() {
    const project = json((await this.request({ method: "GET", url: `https://cloudresourcemanager.googleapis.com/v1/projects/${CLOUD_TEST_PROJECT}` })).data);
    const bucket = json((await this.request({ method: "GET", url: base })).data);
    const iam = json((await this.request({ method: "GET", url: `${base}/iam` })).data);
    const config = json(bucket.iamConfiguration), ubla = json(config.uniformBucketLevelAccess), soft = json(bucket.softDeletePolicy);
    requirePhase1(project.projectId === CLOUD_TEST_PROJECT && String(project.projectNumber) === this.plan.projectNumber && bucket.name === CLOUD_TEST_BUCKET
      && String(bucket.projectNumber) === this.plan.projectNumber && String(bucket.location).toLowerCase() === "europe-west1" && ubla.enabled === true
      && String(soft.retentionDurationSeconds) === "604800", "bucket_identity_or_policy_changed");
    const enabled = (value: unknown) => { if (value === undefined) return false; const flag = json(value).enabled;
      requirePhase1(flag === undefined || typeof flag === "boolean", "invalid_bucket_policy_flag"); return flag === true; };
    const lifecycle = bucket.lifecycle === undefined ? [] : json(bucket.lifecycle).rule;
    requirePhase1(lifecycle === undefined || Array.isArray(lifecycle), "invalid_bucket_lifecycle");
    requirePhase1(!bucket.retentionPolicy && !bucket.defaultEventBasedHold && !enabled(bucket.versioning) && !enabled(bucket.hierarchicalNamespace) && !enabled(bucket.autoclass)
      && !(Array.isArray(lifecycle) && lifecycle.length), "unapproved_bucket_policy");
    const bindings = iam.bindings === undefined ? [] : iam.bindings; requirePhase1(Array.isArray(bindings), "invalid_bucket_iam_bindings");
    requirePhase1(!bindings.some(binding => {
      const members = json(binding).members; requirePhase1(Array.isArray(members) && members.every(member => typeof member === "string"), "invalid_bucket_iam_members");
      return members.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member));
    }), "public_bucket_binding");
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
    this.path(path); verifyFixture(fixture); if (previous) requirePhase1(previous.path === path && previous.testRunId === FRESH_PHASE1_RUN, "upload_previous_owner_mismatch");
    const [reading, image, podcast, , , probe, forbidden] = this.plan.objectAllowlist;
    requirePhase1((path === reading && fixture.id === "reading" && !previous && !limited)
      || (path === image && fixture.id === "image" && !previous && !limited)
      || (path === podcast && fixture.id === "podcast" && !previous && !limited)
      || (path === probe && fixture.id === (previous ? "generation-v2" : "generation-v1") && !limited)
      || (path === forbidden && fixture.id === "generation-v1" && limited && !previous), "fixture_target_pair_refused");
    const boundary = `phase1-${randomUUID()}`;
    const metadata = { name: path, contentType: fixture.contentType, cacheControl: "private,no-store", metadata: { testRunId: FRESH_PHASE1_RUN, fixtureId: fixture.id } };
    const data = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${fixture.contentType}\r\n\r\n`), fixture.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response = await this.request({ method: "POST", url: query(`https://storage.googleapis.com/upload/storage/v1/b/${CLOUD_TEST_BUCKET}/o`, {
      uploadType: "multipart", ifGenerationMatch: previous?.generation || "0" }), headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, data, limited });
    return this.object(path, response.data);
  }
  async token(object: TestObject, token: string | null) {
    this.path(object.path); requirePhase1(object.testRunId === FRESH_PHASE1_RUN, "token_owner_mismatch");
    const response = await this.request({ method: "PATCH", url: query(objectUrl(object.path), { ifGenerationMatch: object.generation, ifMetagenerationMatch: object.metageneration }),
      data: { metadata: { testRunId: FRESH_PHASE1_RUN, fixtureId: object.fixtureId, firebaseStorageDownloadTokens: token } } });
    return this.object(object.path, response.data);
  }
  async copy(object: TestObject, destination: string) {
    this.path(object.path); this.path(destination); requirePhase1(object.testRunId === FRESH_PHASE1_RUN, "copy_owner_mismatch");
    const response = await this.request({ method: "POST", url: query(`${objectUrl(object.path)}/copyTo/b/${CLOUD_TEST_BUCKET}/o/${encodeURIComponent(destination)}`, {
      ifSourceGenerationMatch: object.generation, ifSourceMetagenerationMatch: object.metageneration, ifGenerationMatch: "0" }),
      data: { contentType: object.contentType, cacheControl: "private,no-store", metadata: { testRunId: FRESH_PHASE1_RUN, fixtureId: object.fixtureId, firebaseStorageDownloadTokens: null } } });
    return this.object(destination, response.data);
  }
  async remove(object: TestObject) {
    this.path(object.path); requirePhase1(object.testRunId === FRESH_PHASE1_RUN, "delete_owner_mismatch");
    await this.request({ method: "DELETE", url: query(objectUrl(object.path), { ifGenerationMatch: object.generation, ifMetagenerationMatch: object.metageneration }) }, 204);
  }
  async restore(object: TestObject) {
    this.path(object.path); requirePhase1(object.testRunId === FRESH_PHASE1_RUN && object.softDeleted && normalizeDownloadToken(object.token) === null, "restore_source_not_private");
    const response = await this.request({ method: "POST", url: query(`${objectUrl(object.path)}/restore`, { generation: object.generation, ifGenerationMatch: "0" }) });
    return this.object(object.path, response.data);
  }
  async publicRead(path: string, api: "gcs" | "firebase", token?: string) {
    this.path(path); requirePhase1(["gcs", "firebase"].includes(api) && path !== this.plan.objectAllowlist[6], "public_probe_api_refused");
    if (token !== undefined) requirePhase1(api === "firebase" && /^[a-f0-9-]{36}$/.test(token), "public_probe_token_refused");
    const url = api === "gcs" ? query(objectUrl(path), { alt: "media" }) : query(`https://firebasestorage.googleapis.com/v0/b/${CLOUD_TEST_BUCKET}/o/${encodeURIComponent(path)}`, { alt: "media", ...(token ? { token } : {}) });
    return this.wire.publicStatus(url);
  }
  async sign(path: string) {
    this.path(path); requirePhase1(path === this.plan.objectAllowlist[0], "signed_url_target_refused");
    const signed = await this.wire.sign(path), url = new URL(signed);
    const signedKeys = ["X-Goog-Algorithm", "X-Goog-Credential", "X-Goog-Date", "X-Goog-Expires", "X-Goog-SignedHeaders", "X-Goog-Signature"];
    const date = url.searchParams.get("X-Goog-Date") || "", parts = date.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const issued = parts ? Date.parse(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}Z`) : NaN;
    requirePhase1(url.origin === "https://storage.googleapis.com" && !url.username && !url.password && !url.hash && decodeURIComponent(url.pathname) === `/${CLOUD_TEST_BUCKET}/${path}`
      && url.searchParams.size === 6 && signedKeys.every(key => url.searchParams.getAll(key).length === 1)
      && url.searchParams.get("X-Goog-Credential") === `${CLOUD_TEST_PRINCIPAL}/${date.slice(0, 8)}/auto/storage/goog4_request` && url.searchParams.get("X-Goog-Expires") === "300"
      && url.searchParams.get("X-Goog-Algorithm") === "GOOG4-RSA-SHA256" && url.searchParams.get("X-Goog-SignedHeaders") === "host" && !!url.searchParams.get("X-Goog-Signature")
      && Number.isFinite(issued) && Math.abs(Date.now() - issued) <= 30_000, "signed_url_scope_invalid");
    this.signed.add(signed); return signed;
  }
  async signedRead(url: string) { requirePhase1(this.signed.has(url), "unknown_signed_url_refused"); return this.wire.publicStatus(url); }
}

export type FreshCloudBindings = { loadClient(filename: string, mode: "full" | "read-only"): Promise<Impersonated>; fetch: typeof fetch };
async function boundedResponse(response: Response) {
  const reader = response.body?.getReader(), chunks: Buffer[] = []; let size = 0;
  if (!reader) return Buffer.alloc(0);
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
      requirePhase1(size <= 2 * 1024 * 1024, "resource_response_too_large"); chunks.push(Buffer.from(chunk.value)); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}
/** Exact fresh-run gate precedes all ADC and network access. Resource fetches never retry or follow redirects. */
export async function createFreshPhase1CloudProvider(input: unknown, adcPath: string, execute: boolean, approval: string, bindings?: FreshCloudBindings) {
  assertFreshExecutionSignal(execute, approval); const plan = approvedFreshPhase1Plan(input);
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const adc = assertCloudTestAdcPath(adcPath, process.cwd()); requirePhase1(path.relative(CLOUD_TEST_ADC_PATH, adc) === "", "exact_fresh_test_adc_path_required");
  const dependencies = bindings || { loadClient: async (filename: string, mode: "full" | "read-only") => (await import("./cloudTestAuth")).loadCloudTestClient(filename, mode), fetch };
  const full = await dependencies.loadClient(adc, "full"), limited = await dependencies.loadClient(adc, "read-only");
  const { GoogleAuth } = await import("google-auth-library"), { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({ projectId: CLOUD_TEST_PROJECT, authClient: new GoogleAuth({ projectId: CLOUD_TEST_PROJECT, authClient: full }), retryOptions: { autoRetry: false } });
  const wire: Phase1Wire = {
    request: async request => {
      assertPhase1Request(plan, request);
      const headers = new Headers(await (request.limited ? limited : full).getRequestHeaders(request.url)); headers.set("x-goog-user-project", CLOUD_TEST_PROJECT);
      for (const [name, value] of Object.entries(request.headers || {})) headers.set(name, value);
      if (request.data !== undefined && !Buffer.isBuffer(request.data)) headers.set("Content-Type", "application/json");
      const response = await dependencies.fetch(request.url, { method: request.method, headers,
        ...(request.data === undefined ? {} : { body: Buffer.isBuffer(request.data) ? new Uint8Array(request.data) : JSON.stringify(request.data) }),
        credentials: "omit", redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
      const bytes = await boundedResponse(response);
      return { status: response.status, data: request.media ? bytes : bytes.length ? JSON.parse(bytes.toString("utf8")) : null,
        headers: { "content-range": response.headers.get("content-range") || "" } };
    },
    publicStatus: async url => {
      const response = await dependencies.fetch(url, { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
      await response.body?.cancel(); return response.status;
    },
    sign: async target => {
      const accessibleAt = Math.floor(Date.now() / 1000) * 1000;
      const [url] = await storage.bucket(CLOUD_TEST_BUCKET).file(target).getSignedUrl({ action: "read", version: "v4", accessibleAt, expires: accessibleAt + 300_000 }); return url;
    },
  };
  return new CloudFileTestFreshProvider(plan, wire, execute, approval);
}

