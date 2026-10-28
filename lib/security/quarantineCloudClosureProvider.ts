import {CLOUD_CLOSURE_PLAN,CLOUD_CLOSURE_DIGEST} from "./quarantineCloudClosurePlan";
import { buildFourFileQuarantineRules } from "./quarantineCloudClosureRules";
import { digest } from "./reconciliation";
import type { QuarantineCopy, QuarantineEvent, QuarantineObject, QuarantineOperations, QuarantinePlan } from "./quarantineExecution";

type Version = { seconds: number; nanoseconds: number };
export type QuarantineBoardState = { valueDigest: string | null; version: Version | null; stable: boolean; active: boolean | null; imageMode: boolean };
export type QuarantineStorageRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; destination?: string;
  query: Record<string, string>; body?: Record<string, unknown> };
export type LocalQuarantinePorts = {
  storage(request: QuarantineStorageRequest): Promise<{ status: number; data?: unknown }>;
  board: { read(document: string): Promise<QuarantineBoardState>; clear(document: string, expectedDigest: string, version: Version): Promise<void> };
  rules: { currentDigest(): Promise<string>; replace(expectedDigest: string, source: string): Promise<void>;
    denied(paths: string[]): Promise<boolean>; readable(path: string): Promise<boolean> };
};
type Json = Record<string, unknown>;
const requireValue: (value: unknown, code: string) => asserts value = (value, code) => { if (!value) throw new Error(code); };
function json(value: unknown): Json { requireValue(value && typeof value === "object" && !Array.isArray(value), "invalid_quarantine_metadata"); return value as Json; }
const version = (value: unknown) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const objectPath = (value: string) => value.length <= 1024 && Array.from(value).every(character => character !== "\\" && character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
  && value.split("/").every(segment => segment && segment !== "." && segment !== "..");

import { assertCloudTestBoundary } from "./cloudTestBoundary";
import { CLOUD_QUARANTINE_SOURCES, CLOUD_QUARANTINE_TARGETS, CLOUD_QUARANTINE_BOARD, CLOUD_QUARANTINE_FIXTURES, CLOUD_QUARANTINE_PRIVATE_CONTROL, CLOUD_QUARANTINE_PUBLIC_CONTROL, CLOUD_QUARANTINE_OPEN_RULES } from "./quarantineCloudTestPlan";

/** Test-project closure only. Version-bound existing copies are adopted; downstream conditional operations are retained.
 * Fixed fixture paths and project are checked before any port or credential access. */
export function createQuarantineCloudClosureProvider(input: QuarantinePlan, options: { baseRules: string; archiveControl: string; unaffectedControl: string },
  ports: LocalQuarantinePorts, journal: (event: QuarantineEvent) => Promise<void>, signal: {execute: boolean; approval: string}): QuarantineOperations {
  const plan = structuredClone(input), checksum = digest(plan), config = structuredClone(options);
  function boundary() {
    assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
    requireValue(signal.execute === true && signal.approval === CLOUD_CLOSURE_DIGEST, "explicit_cloud_test_approval_required");
  }
  boundary();
  requireValue(digest(plan)===CLOUD_CLOSURE_PLAN.protocolPlanDigest,"closure_plan_version_mismatch");
  requireValue(plan.files.length === 4 && digest(plan.files.map(f => f.sourcePath)) === digest(CLOUD_QUARANTINE_SOURCES)
    && digest(plan.files.map(f => f.proposedArchivePath)) === digest(CLOUD_QUARANTINE_TARGETS)
    && plan.boardChange.document === CLOUD_QUARANTINE_BOARD && plan.boardChange.updateTime
    && plan.boardChange.expectedValueDigest && plan.boardChange.referenceStillMatches && plan.boardChange.versionStableDuringInspection,
  "invalid_cloud_test_quarantine_plan");
  for (const [i,file] of plan.files.entries()) requireValue(objectPath(file.sourcePath) && version(file.generation) && version(file.metageneration)
    && file.size === CLOUD_QUARANTINE_FIXTURES[i].size && file.contentType === CLOUD_QUARANTINE_FIXTURES[i].contentType
    && file.md5Hash === CLOUD_QUARANTINE_FIXTURES[i].md5Hash, "invalid_cloud_test_fixture");
  requireValue(config.archiveControl === CLOUD_QUARANTINE_PRIVATE_CONTROL && config.unaffectedControl === CLOUD_QUARANTINE_PUBLIC_CONTROL
    && digest(config.baseRules) === digest(CLOUD_QUARANTINE_OPEN_RULES), "invalid_cloud_test_rules_or_controls");
  const paths = new Set([...plan.files.flatMap(file => [file.sourcePath, file.proposedArchivePath]), config.archiveControl, config.unaffectedControl]);
  const lockedRules = buildFourFileQuarantineRules(config.baseRules, plan.files.map(file => file.sourcePath));
  const originalRulesDigest = digest(config.baseRules), lockedRulesDigest = digest(lockedRules);
  const copies = new Map<string, QuarantineCopy>(), verified = new Set<string>(), revoked = new Map<string, string>();
  let inspected = false, locked = false, cleared: QuarantineBoardState | null = null, stopped = false;
  let controlDigests: string[] = [];
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    boundary(); requireValue(!stopped, "quarantine_session_stopped");
    try { return await fn(); } catch (error) { stopped = true; throw error; }
  }
  function member(file: QuarantineObject) { requireValue(plan.files.some(expected => digest(expected) === digest(file)), "file_outside_local_quarantine_plan"); }
  async function request(value: QuarantineStorageRequest, expected: number) {
    requireValue(paths.has(value.path) && (!value.destination || plan.files.some(file => file.sourcePath === value.path && file.proposedArchivePath === value.destination)), "quarantine_resource_not_allowlisted");
    const response = await ports.storage(value);
    requireValue(response.status === expected, "quarantine_storage_request_failed"); return response.data;
  }
  async function head(path: string, allowAbsent = false): Promise<Json | null> {
    requireValue(paths.has(path), "quarantine_resource_not_allowlisted");
    const response = await ports.storage({ method: "GET", path, query: {} });
    if (allowAbsent && response.status === 404) return null;
    requireValue(response.status === 200, "quarantine_object_metadata_unavailable");
    const data = json(response.data);
    requireValue(data.name === path && data.bucket === plan.bucket && version(data.generation) && version(data.metageneration), "quarantine_object_identity_mismatch");
    return data;
  }
  function integrity(file: QuarantineObject, data: Json) {
    requireValue(Number(data.size) === file.size && data.contentType === file.contentType
      && (!file.md5Hash || data.md5Hash === file.md5Hash) && (!file.crc32c || data.crc32c === file.crc32c), "quarantine_object_integrity_mismatch");
  }
  async function source(file: QuarantineObject, metageneration = file.metageneration) {
    const data = (await head(file.sourcePath))!; integrity(file, data);
    requireValue(data.generation === file.generation && data.metageneration === metageneration, "quarantine_source_version_changed"); return data;
  }
  const tokenCount = (data: Json) => String(json(data.metadata ?? {}).firebaseStorageDownloadTokens ?? "").split(",").filter(part => part.trim()).length;
  function copyMetadata(file: QuarantineObject, data: Json): QuarantineCopy {
    integrity(file, data); const metadata = json(data.metadata ?? {});
    requireValue(data.name === file.proposedArchivePath && data.cacheControl === "private,no-store" && tokenCount(data) === 0
      && metadata.quarantinePlanDigest === checksum && metadata.quarantineSourceDigest === digest(file.sourcePath)
      && (!data.acl || (Array.isArray(data.acl) && !data.acl.some(entry => ["allUsers", "allAuthenticatedUsers"].includes(String(json(entry).entity))))), "quarantine_copy_not_private_or_owned");
    return { path: file.proposedArchivePath, generation: String(data.generation), metageneration: String(data.metageneration), size: file.size,
      contentType: file.contentType, md5Hash: typeof data.md5Hash === "string" ? data.md5Hash : null, crc32c: typeof data.crc32c === "string" ? data.crc32c : null,
      tokenCount: 0, publicAcl: false, cacheControl: "private,no-store" };
  }
  async function verify(file: QuarantineObject, expected: QuarantineCopy) {
    requireValue(copies.has(file.sourcePath) && digest(copies.get(file.sourcePath)) === digest(expected), "quarantine_copy_not_in_this_session");
    const before = copyMetadata(file, (await head(file.proposedArchivePath))!);
    requireValue(digest(before) === digest(expected), "quarantine_copy_version_changed");
    requireValue(await ports.rules.denied([file.proposedArchivePath]), "quarantine_copy_client_access_not_denied");
    const after = copyMetadata(file, (await head(file.proposedArchivePath))!);
    requireValue(digest(after) === digest(before), "quarantine_copy_changed_during_access_check");
    verified.add(file.sourcePath); return after;
  }
  async function intent(stage: string, file?: QuarantineObject) {
    await journal({ stage: `provider_intent_${stage}`, planDigest: checksum, ...(file ? { sourceDigest: digest(file.sourcePath) } : {}) });
  }
  async function rulesStill(expected: string) { requireValue(await ports.rules.currentDigest() === expected, "quarantine_rules_changed"); }
  async function clearedBoardStill() {
    const current = await ports.board.read(plan.boardChange.document);
    requireValue(cleared && current.stable && current.valueDigest === digest("") && digest(current.version) === digest(cleared.version), "quarantine_board_changed_after_clear");
  }
  return {
    inspect: () => guarded(async () => {
      requireValue(!inspected,"quarantine_inspection_already_used");await rulesStill(lockedRulesDigest);
      for(const file of plan.files){await source(file);const meta=copyMetadata(file,(await head(file.proposedArchivePath))!);
        const expected=CLOUD_CLOSURE_PLAN.objects.find(v=>v.path===file.proposedArchivePath)!;
        requireValue(meta.generation===expected.generation&&meta.metageneration===expected.metageneration,"closure_copy_version_changed");
        copies.set(file.sourcePath,meta);await verify(file,meta);
      }
      const board=await ports.board.read(plan.boardChange.document);
      requireValue(board.stable&&board.valueDigest===plan.boardChange.expectedValueDigest&&digest(board.version)===digest(plan.boardChange.updateTime),"quarantine_board_version_changed");
      const archive=(await head(config.archiveControl))!,unaffected=(await head(config.unaffectedControl))!;
      for(const value of [archive,unaffected]){const expected=CLOUD_CLOSURE_PLAN.objects.find(v=>v.path===value.name)!;
        requireValue(expected&&value.generation===expected.generation&&value.metageneration===expected.metageneration,"closure_control_version_changed");}
      requireValue(tokenCount(archive)===0&&archive.cacheControl==="private,no-store"&&await ports.rules.denied([...plan.files.map(v=>v.sourcePath),config.archiveControl])&&await ports.rules.readable(config.unaffectedControl),"closure_rule_controls_failed");
      controlDigests=[digest(archive),digest(unaffected)];inspected=true;locked=true;
      return {filesUnchanged:true,boardUnchanged:true,rulesUnchanged:true,archivePrivate:true};
    }),
    copy: file => guarded(async () => {
      member(file); requireValue(inspected && !locked && !copies.has(file.sourcePath), "quarantine_copy_out_of_order"); await source(file);
      requireValue(await head(file.proposedArchivePath, true) === null, "quarantine_target_already_exists_review_required"); await intent("copy", file);
      await request({ method: "POST", path: file.sourcePath, destination: file.proposedArchivePath,
        query: { ifSourceGenerationMatch: file.generation, ifSourceMetagenerationMatch: file.metageneration, ifGenerationMatch: "0" },
        body: { contentType: file.contentType, cacheControl: "private,no-store", metadata: { firebaseStorageDownloadTokens: null,
          quarantinePlanDigest: checksum, quarantineSourceDigest: digest(file.sourcePath) } } }, 200);
      const copy = copyMetadata(file, (await head(file.proposedArchivePath))!); copies.set(file.sourcePath, copy); return copy;
    }),
    verifyCopy: (file, copy) => guarded(async () => { member(file); return verify(file, copy); }),
    lockFourPaths: () => guarded(async () => {
      requireValue(inspected && !locked && copies.size === 4 && verified.size === 4, "quarantine_all_copies_required"); await rulesStill(originalRulesDigest);
      await intent("rules"); await ports.rules.replace(originalRulesDigest, lockedRules); await rulesStill(lockedRulesDigest);
      requireValue(await ports.rules.denied([...plan.files.flatMap(file => [file.sourcePath, file.proposedArchivePath]), config.archiveControl])
        && await ports.rules.readable(config.unaffectedControl), "quarantine_rule_lock_verification_failed"); locked = true;
    }),
    clearBoardReference: () => guarded(async () => {
      requireValue(locked && !cleared, "quarantine_board_clear_out_of_order"); await rulesStill(lockedRulesDigest); await intent("board");
      await ports.board.clear(plan.boardChange.document, plan.boardChange.expectedValueDigest!, plan.boardChange.updateTime!);
      const state = await ports.board.read(plan.boardChange.document);
      requireValue(state.stable && state.version && state.valueDigest === digest(""), "quarantine_board_clear_not_verified"); cleared = state;
    }),
    revokeToken: file => guarded(async () => {
      member(file); requireValue(locked && cleared && !revoked.has(file.sourcePath), "quarantine_token_revocation_out_of_order");
      await rulesStill(lockedRulesDigest); await clearedBoardStill(); await source(file); await intent("token_revoke", file);
      await request({ method: "PATCH", path: file.sourcePath, query: { ifGenerationMatch: file.generation, ifMetagenerationMatch: file.metageneration },
        body: { metadata: { firebaseStorageDownloadTokens: null } } }, 200);
      const data = (await head(file.sourcePath))!; integrity(file, data);
      requireValue(data.generation === file.generation && data.metageneration !== file.metageneration && tokenCount(data) === 0, "quarantine_token_revocation_not_verified");
      revoked.set(file.sourcePath, String(data.metageneration)); return { generation: file.generation, metageneration: String(data.metageneration), tokenCount: 0 };
    }),
    retireSource: (file, metageneration) => guarded(async () => {
      member(file); requireValue(locked && cleared && revoked.size === 4 && revoked.get(file.sourcePath) === metageneration, "quarantine_all_tokens_required");
      await rulesStill(lockedRulesDigest); await clearedBoardStill(); await verify(file, copies.get(file.sourcePath)!);
      const data = await source(file, metageneration); requireValue(tokenCount(data) === 0, "quarantine_source_token_reintroduced"); await intent("retire", file);
      await request({ method: "DELETE", path: file.sourcePath, query: { ifGenerationMatch: file.generation, ifMetagenerationMatch: metageneration } }, 204);
      requireValue(await head(file.sourcePath, true) === null, "quarantine_source_still_live");
    }),
    verifyResult: () => guarded(async () => {
      requireValue(locked && cleared && revoked.size === 4, "quarantine_postcheck_out_of_order"); await rulesStill(lockedRulesDigest); await clearedBoardStill();
      for (const file of plan.files) { requireValue(await head(file.sourcePath, true) === null, "quarantine_source_still_live"); await verify(file, copies.get(file.sourcePath)!); }
      requireValue(digest(await head(config.archiveControl)) === controlDigests[0] && digest(await head(config.unaffectedControl)) === controlDigests[1]
        && await ports.rules.readable(config.unaffectedControl), "quarantine_unaffected_control_changed");
      return { liveOriginals: 0, privateCopies: 4, boardCleared: true, otherFilesUnaffected: true };
    }),
  };
}
