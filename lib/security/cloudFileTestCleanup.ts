import { createHash } from "node:crypto";
import { buildCloudFileTestPlan } from "./cloudFileTestPlan";
import { CLOUD_TEST_BUCKET, CLOUD_TEST_PROJECT } from "./cloudTestBoundary";
import { approvedPhase1Plan, PHASE1_DIGEST, PHASE1_RUN, requirePhase1, sameVersion, verifyFixture, verifyTestObject,
  type Fixture, type TestObject, type Phase1Provider } from "./cloudFileTestExecution";
import { normalizeDownloadToken, verifyAnonymousAndOldTokenDenied, verifyPrivateTestObject } from "./cloudFileTestTokens";

export const CLEANUP_ID = "cleanup-p1-20261016-574f036cf188-v1";
export const CLEANUP_DIGEST = "aa20666baf3bc011fc39a127c0dbe9e87197ca2f1a07cb9bc0060297245f0c6f";
export const ORIGINAL_JOURNAL_SHA256 = "07c36f4565bd5defb08933a4831fd1d94fcace7ba85970db086be4bf45cd044f";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); }
  return value;
}
const canonicalOriginal = freeze(approvedPhase1Plan(buildCloudFileTestPlan(CLOUD_TEST_PROJECT, CLOUD_TEST_BUCKET, PHASE1_RUN)));
const original = () => canonicalOriginal;
export function buildPhase1CleanupPlan() {
  const source = original();
  const selected = [
    [0, 0, "1792162339524443", "2"], [1, 1, "1792162340272017", "1"],
    [2, 2, "1792162341029796", "1"], [3, 0, "1792162343877763", "1"], [5, 3, "1792162341644578", "1"],
  ] as const;
  const plan = { schema: 1, cleanupId: CLEANUP_ID, sourceRunId: PHASE1_RUN, sourcePlanDigest: PHASE1_DIGEST,
    originalJournalSha256: ORIGINAL_JOURNAL_SHA256,
    evidence: { manifestSha256: "acaecb2a3de7048952f96c5e41a7ccae1ca7f79440209963f0f98ded75e58e85",
      inspectionSha256: "f2f80044f942198b63b71c5c738b48d9873f2ac29ed49d7d6f6d3adb0119ebad",
      copyTokenShapeSha256: "cb0fea24142014e0bc10d79d774703098040339a147360e88f46b355f500af6d" },
    projectId: source.projectId, projectNumber: source.projectNumber, bucket: source.bucket, region: source.region, principal: source.principal,
    objects: selected.map(([objectIndex, fixtureIndex, generation, metageneration]) => ({ path: source.objectAllowlist[objectIndex],
      generation, metageneration, ...source.fixtures[fixtureIndex] })),
    mustRemainAbsent: [source.objectAllowlist[4], source.objectAllowlist[6]], finalAbsenceChecks: [...source.objectAllowlist],
    mutations: { revokeSourceToken: 1, deleteVerifiedLiveObjects: 5, total: 6 },
    tokenRevocation: { path: source.objectAllowlist[0], generation: "1792162339524443", beforeMetageneration: "2", afterMetageneration: "3",
      verifyOldTokenDeniedBeforeAnyDelete: true },
    deletionOrder: selected.map(([index]) => source.objectAllowlist[index]), softDeleteRetentionSeconds: 604800,
    stopOnAnyDeviation: true, automaticRepair: false, automaticFailureCleanup: false, resume: false, cloudExecutionImplemented: false,
  };
  return { ...plan, planDigest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}
export type CleanupPlan = ReturnType<typeof buildPhase1CleanupPlan>;
export type CleanupObject = CleanupPlan["objects"][number];
export function approvedCleanupPlan(input: unknown) {
  const expected = buildPhase1CleanupPlan();
  requirePhase1(expected.planDigest === CLEANUP_DIGEST && JSON.stringify(input) === JSON.stringify(expected), "exact_separate_cleanup_plan_required"); return expected;
}
export function cleanupApproval(plan: CleanupPlan) { return `CLEANUP:${plan.cleanupId}:${plan.planDigest}`; }
export function assertCleanupExecutionSignal(execute: boolean, approval: string) {
  requirePhase1(execute === true && approval === `CLEANUP:${CLEANUP_ID}:${CLEANUP_DIGEST}`, "separate_cleanup_execution_approval_required");
}
export type CleanupIdentity = { projectId: string; projectNumber: string; bucket: string; bucketProjectNumber: string;
  principal: string; region: string; uniformBucketLevelAccess: boolean; publicBinding: boolean; softDeleteRetentionSeconds: number;
  unexpectedStoragePolicy: boolean };
export interface CleanupProvider extends Pick<Phase1Provider, "head" | "read" | "remove" | "publicRead"> {
  preflight(): Promise<CleanupIdentity>;
  revokeToken(object: TestObject): Promise<TestObject>;
}
export type CleanupEvent = { stage: "started" | "preflight_passed" | "revoke_intent" | "revoked" | "access_denied" |
  "delete_intent" | "deleted" | "completed" | "stopped_no_automatic_cleanup"; object?: string; generation?: string; metageneration?: string };
const stages = new Set(["started", "preflight_passed", "revoke_intent", "revoked", "access_denied", "delete_intent", "deleted", "completed", "stopped_no_automatic_cleanup"]);
export function safeCleanupEvent(input: unknown, event: CleanupEvent) {
  const plan = approvedCleanupPlan(input);
  requirePhase1(stages.has(event.stage), "unsafe_cleanup_journal_stage");
  const result: Record<string, unknown> = { cleanupId: plan.cleanupId, planDigest: plan.planDigest, stage: event.stage };
  if (event.object !== undefined) { requirePhase1(plan.objects.some(object => object.path === event.object), "unsafe_cleanup_journal_object"); result.object = event.object; }
  for (const field of ["generation", "metageneration"] as const) if (event[field] !== undefined) {
    requirePhase1(/^[1-9][0-9]*$/.test(event[field]!), "unsafe_cleanup_journal_version"); result[field] = event[field];
  }
  return result;
}
export function assertCleanupIdentity(plan: CleanupPlan, current: CleanupIdentity) {
  requirePhase1(current.projectId === plan.projectId && current.projectNumber === plan.projectNumber && current.bucket === plan.bucket
    && current.bucketProjectNumber === plan.projectNumber && current.principal === plan.principal && current.region === plan.region
    && current.uniformBucketLevelAccess === true && current.publicBinding === false && current.unexpectedStoragePolicy === false
    && current.softDeleteRetentionSeconds === plan.softDeleteRetentionSeconds, "cleanup_target_or_policy_changed");
}
function fixtureFor(expected: CleanupObject, fixtures: Fixture[]) {
  const fixture = fixtures.find(file => file.id === expected.id);
  requirePhase1(fixture, "cleanup_fixture_missing"); verifyFixture(fixture);
  const { bytes: _bytes, ...description } = fixture; void _bytes;
  const { path: _path, generation: _generation, metageneration: _metageneration, ...expectedDescription } = expected;
  void _path; void _generation; void _metageneration;
  requirePhase1(JSON.stringify(description) === JSON.stringify(expectedDescription), "cleanup_fixture_description_changed"); return fixture;
}
function validateObject(plan: CleanupPlan, object: TestObject | null, expected: CleanupObject, file: Fixture, revoked = false) {
  requirePhase1(object && object.path === expected.path && !object.softDeleted, "cleanup_live_object_missing_or_wrong_path");
  requirePhase1(object.generation === expected.generation && object.metageneration === (revoked && expected.path === plan.tokenRevocation.path ? "3" : expected.metageneration), "cleanup_object_version_changed");
  if (expected.path === plan.tokenRevocation.path && !revoked) {
    requirePhase1(typeof object.token === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(object.token), "expected_synthetic_source_token_missing_or_changed");
    verifyTestObject(original(), object, file, object.token);
  } else verifyPrivateTestObject(original(), object, file);
  return object;
}

/** Transport is injected; the separate CLI supplies the gated, restricted cloud provider. */
export async function executePhase1Cleanup(input: unknown, fixtures: Fixture[], provider: CleanupProvider,
  journal: (event: CleanupEvent) => Promise<void>, execute: boolean, approval: string) {
  const plan = approvedCleanupPlan(input);
  assertCleanupExecutionSignal(execute, approval);
  requirePhase1(fixtures.length === 5 && new Set(fixtures.map(file => file.id)).size === 5, "exact_original_fixture_set_required");
  for (const fixture of fixtures) verifyFixture(fixture);
  for (const expected of original().fixtures) {
    const actual = fixtures.find(file => file.id === expected.id);
    requirePhase1(actual && JSON.stringify({ ...actual, bytes: undefined }) === JSON.stringify(expected), "cleanup_fixture_set_changed");
  }
  for (const expected of plan.objects) fixtureFor(expected, fixtures);
  const event = (value: CleanupEvent) => { safeCleanupEvent(plan, value); return journal(value); };
  const check = async (expected: CleanupObject, revoked: boolean) => {
    const file = fixtureFor(expected, fixtures);
    const object = validateObject(plan, await provider.head(expected.path), expected, file, revoked);
    const read = await provider.read(object);
    requirePhase1(read.status === 200 && createHash("sha256").update(read.bytes).digest("hex") === file.sha256, "cleanup_content_checksum_failed");
    const after = validateObject(plan, await provider.head(expected.path), expected, file, revoked); sameVersion(object, after);
    requirePhase1(after.token === object.token, "cleanup_token_changed_during_read"); return after;
  };
  await event({ stage: "started" });
  try {
    assertCleanupIdentity(plan, await provider.preflight());
    for (const path of plan.mustRemainAbsent) requirePhase1(await provider.head(path) === null, "unexpected_live_object_on_absent_path");
    for (const expected of plan.objects) await check(expected, false);
    await event({ stage: "preflight_passed" });
    const expectedSource = plan.objects[0], source = await check(expectedSource, false), oldToken = source.token!;
    // Positive control prevents a failing endpoint from being mistaken for revocation.
    requirePhase1(await provider.publicRead(source.path, "firebase", oldToken) === 200, "source_token_positive_control_failed");
    sameVersion(source, await check(expectedSource, false));
    await event({ stage: "revoke_intent", object: source.path, generation: source.generation, metageneration: source.metageneration });
    const revoked = await provider.revokeToken(source);
    validateObject(plan, revoked, expectedSource, fixtureFor(expectedSource, fixtures), true);
    await event({ stage: "revoked", object: revoked.path, generation: revoked.generation, metageneration: revoked.metageneration });
    const verifiedRevoked = await check(expectedSource, true); sameVersion(revoked, verifiedRevoked);
    await verifyAnonymousAndOldTokenDenied(provider, source.path, oldToken);
    await check(expectedSource, true); // Denial must be proven while the object is still live.
    await event({ stage: "access_denied", object: source.path });
    // Validate every remaining object before the first delete, including the existing copy's old-token denial.
    assertCleanupIdentity(plan, await provider.preflight());
    for (const expected of plan.objects) {
      await check(expected, true); await verifyAnonymousAndOldTokenDenied(provider, expected.path, oldToken); await check(expected, true);
    }
    for (const path of plan.mustRemainAbsent) requirePhase1(await provider.head(path) === null, "unexpected_live_object_before_delete");
    for (const expected of plan.objects) {
      const object = await check(expected, true);
      await verifyAnonymousAndOldTokenDenied(provider, object.path, oldToken); await check(expected, true);
      await event({ stage: "delete_intent", object: object.path, generation: object.generation, metageneration: object.metageneration });
      await provider.remove(object);
      await event({ stage: "deleted", object: object.path, generation: object.generation, metageneration: object.metageneration });
      requirePhase1(await provider.head(object.path) === null, "deleted_cleanup_object_still_live");
    }
    for (const path of plan.finalAbsenceChecks) requirePhase1(await provider.head(path) === null, "cleanup_final_absence_failed");
    await event({ stage: "completed" });
    return { status: "completed", cleanupId: plan.cleanupId, mutations: 6, deleted: 5, liveObjectsRemaining: 0, softDeleteRetained: true };
  } catch {
    await event({ stage: "stopped_no_automatic_cleanup" }); throw new Error("cleanup_stopped_review_separate_journal");
  }
}

/** Exact future write requests. No network dispatch exists in this module. */
export function cleanupMutationRequest(input: unknown, object: TestObject, action: "revoke" | "delete") {
  const plan = approvedCleanupPlan(input), expected = plan.objects.find(entry => entry.path === object.path);
  requirePhase1(expected && ["revoke", "delete"].includes(action), "cleanup_mutation_target_refused");
  const fixture = { ...original().fixtures.find(file => file.id === expected.id)!, bytes: Buffer.alloc(0) };
  validateObject(plan, object, expected, fixture, action === "delete");
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${plan.bucket}/o/${encodeURIComponent(object.path)}`);
  url.searchParams.set("ifGenerationMatch", object.generation); url.searchParams.set("ifMetagenerationMatch", object.metageneration);
  if (action === "revoke") {
    requirePhase1(object.path === plan.tokenRevocation.path, "cleanup_token_target_refused");
    return { method: "PATCH" as const, url: url.toString(), data: { metadata: { testRunId: PHASE1_RUN, fixtureId: "reading", firebaseStorageDownloadTokens: null } } };
  }
  requirePhase1(normalizeDownloadToken(object.token) === null, "cleanup_delete_token_still_present");
  return { method: "DELETE" as const, url: url.toString() };
}
