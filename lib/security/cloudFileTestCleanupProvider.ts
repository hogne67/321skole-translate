import { approvedCleanupPlan, assertCleanupExecutionSignal, assertCleanupIdentity, cleanupMutationRequest, type CleanupPlan, type CleanupProvider, type CleanupIdentity } from "./cloudFileTestCleanup";
import { requirePhase1, type TestObject } from "./cloudFileTestExecution";
import { assertCloudTestBoundary, assertCloudTestAdcPath, CLOUD_TEST_ADC_PATH } from "./cloudTestBoundary";
import { normalizeDownloadToken } from "./cloudFileTestTokens";
import path from "node:path";

export type CleanupRequest = { method: "GET" | "PATCH" | "DELETE"; url: string; data?: unknown; media?: boolean };
export type CleanupResponse = { status: number; data: unknown };
export type CleanupPublicRequest = { path: string; api: "gcs" | "firebase"; token?: string };
export interface CleanupWire { request(request: CleanupRequest): Promise<CleanupResponse>; publicStatus(request: CleanupPublicRequest): Promise<number> }
type Json = Record<string, unknown>;
function json(value: unknown): Json { requirePhase1(value && typeof value === "object" && !Array.isArray(value), "cleanup_invalid_provider_json"); return value as Json; }
const bucketUrl = (plan: CleanupPlan) => `https://storage.googleapis.com/storage/v1/b/${plan.bucket}`;
const objectUrl = (plan: CleanupPlan, object: string) => `${bucketUrl(plan)}/o/${encodeURIComponent(object)}`;

/** This allowlist permits no upload, copy, restore, purge, listing or configuration writes. */
export function assertCleanupRequest(input: unknown, request: CleanupRequest) {
  const plan = approvedCleanupPlan(input), url = new URL(request.url);
  requirePhase1(!url.username && !url.password && !url.hash && Object.keys(request).every(key => ["method", "url", "data", "media"].includes(key)), "cleanup_unsafe_request");
  const projectUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${plan.projectId}`;
  if ([projectUrl, bucketUrl(plan), `${bucketUrl(plan)}/iam`].includes(request.url)) {
    requirePhase1(request.method === "GET" && request.data === undefined && !request.media, "cleanup_configuration_write_refused"); return;
  }
  requirePhase1(url.origin === "https://storage.googleapis.com" && url.pathname.startsWith(`/storage/v1/b/${plan.bucket}/o/`), "cleanup_resource_target_refused");
  const target = decodeURIComponent(url.pathname.slice(`/storage/v1/b/${plan.bucket}/o/`.length));
  requirePhase1(plan.finalAbsenceChecks.includes(target), "cleanup_object_not_allowlisted");
  const object = plan.objects.find(entry => entry.path === target);
  const keys = [...url.searchParams.keys()];
  requirePhase1(keys.every(key => url.searchParams.getAll(key).length === 1), "cleanup_duplicate_query_refused");
  if (request.method === "GET") {
    requirePhase1(request.data === undefined, "cleanup_get_body_refused");
    if (request.media) requirePhase1(object && keys.length === 2 && keys.includes("generation") && keys.includes("alt")
      && url.searchParams.get("alt") === "media" && url.searchParams.get("generation") === object.generation, "cleanup_media_version_refused");
    else requirePhase1(keys.length === 0, "cleanup_metadata_query_refused");
    return;
  }
  requirePhase1(object && !request.media && keys.length === 2 && keys.includes("ifGenerationMatch") && keys.includes("ifMetagenerationMatch")
    && url.searchParams.get("ifGenerationMatch") === object.generation, "cleanup_write_version_refused");
  if (request.method === "PATCH") {
    requirePhase1(target === plan.tokenRevocation.path && url.searchParams.get("ifMetagenerationMatch") === "2"
      && JSON.stringify(request.data) === JSON.stringify({ metadata: { testRunId: plan.sourceRunId, fixtureId: "reading", firebaseStorageDownloadTokens: null } }), "cleanup_patch_refused");
  } else requirePhase1(request.method === "DELETE" && request.data === undefined
    && url.searchParams.get("ifMetagenerationMatch") === (target === plan.tokenRevocation.path ? "3" : object.metageneration), "cleanup_delete_refused");
}
export function cleanupPublicUrl(input: unknown, request: CleanupPublicRequest) {
  const plan = approvedCleanupPlan(input);
  requirePhase1(plan.objects.some(object => object.path === request.path) && ["gcs", "firebase"].includes(request.api)
    && Object.keys(request).every(key => ["path", "api", "token"].includes(key)), "cleanup_public_target_refused");
  if (request.token !== undefined) requirePhase1(request.api === "firebase" && typeof request.token === "string"
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.token), "cleanup_public_token_refused");
  const url = new URL(request.api === "gcs" ? objectUrl(plan, request.path)
    : `https://firebasestorage.googleapis.com/v0/b/${plan.bucket}/o/${encodeURIComponent(request.path)}`);
  url.searchParams.set("alt", "media"); if (request.token !== undefined) url.searchParams.set("token", request.token);
  return url.toString();
}

export class CloudFileTestCleanupProvider implements CleanupProvider {
  private readonly plan: CleanupPlan;
  private revokeAttempted = false;
  private nextDelete = 0;
  private failed = false;
  private preflightVerified = false;
  private oldToken: string | null = null;
  private revokedReadback = false;
  private sourceDenials = new Set<string>();
  constructor(input: unknown, private wire: CleanupWire, execute: boolean, approval: string) {
    assertCleanupExecutionSignal(execute, approval); this.plan = approvedCleanupPlan(input);
  }
  private async request(request: CleanupRequest, statuses = [200]) {
    requirePhase1(!this.failed, "cleanup_provider_already_stopped");
    try {
      assertCleanupRequest(this.plan, request); const response = await this.wire.request(request);
      requirePhase1(statuses.includes(response.status), "cleanup_unexpected_http_status"); return response;
    } catch { this.failed = true; throw new Error("cleanup_transport_stopped"); }
  }
  private object(target: string, value: unknown): TestObject {
    const data = json(value), metadata = json(data.metadata);
    requirePhase1(data.name === target && data.bucket === this.plan.bucket && typeof data.generation === "string" && typeof data.metageneration === "string"
      && !data.softDeleteTime && !data.temporaryHold && !data.eventBasedHold && !data.retention, "cleanup_object_identity_or_hold_changed");
    // Validate the metadata type without coercing non-string values or silently discarding non-empty tokens.
    normalizeDownloadToken(metadata.firebaseStorageDownloadTokens);
    return { path: target, generation: data.generation, metageneration: data.metageneration, fixtureId: String(metadata.fixtureId), testRunId: String(metadata.testRunId),
      size: Number(data.size), contentType: String(data.contentType), md5Hash: String(data.md5Hash), crc32c: String(data.crc32c), cacheControl: String(data.cacheControl),
      token: metadata.firebaseStorageDownloadTokens == null ? null : metadata.firebaseStorageDownloadTokens as string, softDeleted: false };
  }
  async preflight(): Promise<CleanupIdentity> {
    const project = json((await this.request({ method: "GET", url: `https://cloudresourcemanager.googleapis.com/v1/projects/${this.plan.projectId}` })).data);
    const bucket = json((await this.request({ method: "GET", url: bucketUrl(this.plan) })).data);
    const iam = json((await this.request({ method: "GET", url: `${bucketUrl(this.plan)}/iam` })).data);
    const bindings = iam.bindings === undefined ? [] : iam.bindings;
    requirePhase1(Array.isArray(bindings), "cleanup_invalid_iam_bindings");
    const publicBinding = bindings.some(binding => {
      const members = json(binding).members; requirePhase1(Array.isArray(members) && members.every(member => typeof member === "string"), "cleanup_invalid_iam_members");
      return members.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member));
    });
    const enabled = (value: unknown) => {
      if (value === undefined) return false;
      const flag = json(value).enabled;
      requirePhase1(flag === undefined || typeof flag === "boolean", "cleanup_invalid_policy_flag"); return flag === true;
    };
    const lifecycle = bucket.lifecycle === undefined ? [] : json(bucket.lifecycle).rule;
    requirePhase1(lifecycle === undefined || Array.isArray(lifecycle), "cleanup_invalid_lifecycle");
    const result = { projectId: String(project.projectId), projectNumber: String(project.projectNumber), bucket: String(bucket.name), bucketProjectNumber: String(bucket.projectNumber),
      principal: this.plan.principal, region: String(bucket.location).toLowerCase(), uniformBucketLevelAccess: json(json(bucket.iamConfiguration).uniformBucketLevelAccess).enabled === true,
      publicBinding, softDeleteRetentionSeconds: Number(json(bucket.softDeletePolicy).retentionDurationSeconds),
      unexpectedStoragePolicy: !!bucket.retentionPolicy || !!bucket.defaultEventBasedHold || enabled(bucket.versioning) || enabled(bucket.hierarchicalNamespace)
        || enabled(bucket.autoclass) || !!(Array.isArray(lifecycle) && lifecycle.length) };
    assertCleanupIdentity(this.plan, result); this.preflightVerified = true; return result;
  }
  async head(target: string, softGeneration?: string) {
    requirePhase1(softGeneration === undefined, "cleanup_soft_deleted_read_refused");
    const response = await this.request({ method: "GET", url: objectUrl(this.plan, target) }, [200, 404]);
    const object = response.status === 404 ? null : this.object(target, response.data);
    if (this.revokeAttempted && object && target === this.plan.tokenRevocation.path
      && object.generation === this.plan.tokenRevocation.generation && object.metageneration === "3" && normalizeDownloadToken(object.token) === null) this.revokedReadback = true;
    return object;
  }
  async read(object: TestObject, range?: [number, number], limited?: boolean) {
    requirePhase1(range === undefined && !limited, "cleanup_alternate_read_mode_refused");
    const url = new URL(objectUrl(this.plan, object.path)); url.searchParams.set("generation", object.generation); url.searchParams.set("alt", "media");
    const response = await this.request({ method: "GET", url: url.toString(), media: true });
    requirePhase1(Buffer.isBuffer(response.data) || response.data instanceof ArrayBuffer, "cleanup_media_response_invalid");
    return { status: response.status, bytes: Buffer.from(response.data as ArrayBuffer) };
  }
  async revokeToken(object: TestObject) {
    requirePhase1(this.preflightVerified && !this.revokeAttempted && this.nextDelete === 0, "cleanup_patch_without_preflight_or_second_patch_refused");
    const request = cleanupMutationRequest(this.plan, object, "revoke"); this.revokeAttempted = true; this.oldToken = object.token;
    const response = await this.request(request); return this.object(object.path, response.data);
  }
  async remove(object: TestObject) {
    requirePhase1(this.preflightVerified && this.revokeAttempted && this.revokedReadback && this.sourceDenials.size === 3
      && object.path === this.plan.deletionOrder[this.nextDelete], "cleanup_delete_without_denial_proof_or_wrong_order_refused");
    const request = cleanupMutationRequest(this.plan, object, "delete"); this.nextDelete++;
    await this.request(request, [204]);
  }
  async publicRead(target: string, api: "gcs" | "firebase", token?: string) {
    requirePhase1(!this.failed, "cleanup_provider_already_stopped");
    const request = { path: target, api, ...(token === undefined ? {} : { token }) }; cleanupPublicUrl(this.plan, request);
    try {
      const status = await this.wire.publicStatus(request);
      if (this.revokedReadback && target === this.plan.tokenRevocation.path && [401, 403, 404].includes(status)) {
        if (token === undefined) this.sourceDenials.add(`${api}:anonymous`);
        else if (api === "firebase" && token === this.oldToken) this.sourceDenials.add("firebase:old");
      }
      return status;
    } catch { this.failed = true; throw new Error("cleanup_public_probe_stopped"); }
  }
}

type AuthHeaders = { getRequestHeaders(url: string): Promise<Record<string, string>> };
export type CleanupCloudBindings = { loadClient(adc: string): Promise<AuthHeaders>; fetch: typeof fetch };
async function responseBytes(response: Response) {
  const reader = response.body?.getReader(), chunks: Buffer[] = []; let size = 0;
  if (!reader) return Buffer.alloc(0);
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; requirePhase1(size <= 2 * 1024 * 1024, "cleanup_response_too_large"); chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}
/** Authentication and network bindings are reached only after the separate cloud gate. */
export async function createCleanupCloudProvider(input: unknown, adc: string, execute: boolean, approval: string, bindings?: CleanupCloudBindings) {
  assertCleanupExecutionSignal(execute, approval); const plan = approvedCleanupPlan(input);
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const file = assertCloudTestAdcPath(adc, process.cwd());
  requirePhase1(path.relative(CLOUD_TEST_ADC_PATH, file) === "", "exact_cleanup_adc_path_required");
  const dependencies = bindings || { loadClient: async (filename: string) => (await import("./cloudTestAuth")).loadCloudTestClient(filename), fetch };
  const client = await dependencies.loadClient(file);
  const wire: CleanupWire = {
    request: async request => {
      assertCleanupRequest(plan, request);
      const headers = new Headers(await client.getRequestHeaders(request.url)); headers.set("x-goog-user-project", plan.projectId);
      if (request.data !== undefined) headers.set("Content-Type", "application/json");
      // Auth only supplies headers. Each resource operation uses exactly one fetch, with no SDK retry.
      const response = await dependencies.fetch(request.url, { method: request.method, headers,
        ...(request.data === undefined ? {} : { body: JSON.stringify(request.data) }), credentials: "omit", redirect: "manual", cache: "no-store",
        referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
      const bytes = await responseBytes(response);
      return { status: response.status, data: request.media ? bytes : bytes.length ? JSON.parse(bytes.toString("utf8")) : null };
    },
    publicStatus: async request => {
      const response = await dependencies.fetch(cleanupPublicUrl(plan, request), { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store",
        referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });
      await response.body?.cancel(); return response.status;
    },
  };
  return new CloudFileTestCleanupProvider(plan, wire, execute, approval);
}
