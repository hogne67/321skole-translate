import { createHash, randomUUID } from "node:crypto";
import { buildCloudFileTestPlan, fixtureChecksums } from "./cloudFileTestPlan";

export const PHASE1_RUN = "p1-20261016-574f036cf188";
export const PHASE1_DIGEST = "3bc034f263dd4f9f64302832dcd6105808e6c6320fec2967651cd12094a4582e";
export const PHASE1_APPROVAL = `EXECUTE:${PHASE1_RUN}:${PHASE1_DIGEST}`;
export type Phase1Plan = ReturnType<typeof buildCloudFileTestPlan>;
export type Fixture = Phase1Plan["fixtures"][number] & { bytes: Buffer };
export type TestObject = { path: string; generation: string; metageneration: string; fixtureId: string; testRunId: string;
  size: number; contentType: string; md5Hash: string; crc32c: string; cacheControl: string; token: string | null; softDeleted: boolean };
export type JournalEvent = { stage: string; object?: string; generation?: string; metageneration?: string; status?: number };
export function requirePhase1(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
export function approvedPhase1Plan(input: unknown): Phase1Plan {
  const expected = buildCloudFileTestPlan("testbilde-5683f", "testbilde-5683f.firebasestorage.app", PHASE1_RUN);
  requirePhase1(expected.planDigest === PHASE1_DIGEST && JSON.stringify(input) === JSON.stringify(expected), "unchanged_approved_manifest_required");
  return expected;
}
export function assertExecutionSignal(execute: boolean, approval: string) {
  requirePhase1(execute === true && approval === PHASE1_APPROVAL, "separate_explicit_cloud_signal_required");
}
export function verifyFixture(file: Fixture) {
  const hash = fixtureChecksums(file.bytes);
  requirePhase1(hash.size === file.size && hash.md5Hash === file.md5Hash && hash.crc32c === file.crc32c && hash.sha256 === file.sha256, "local_fixture_changed");
}
export function verifyTestObject(plan: Phase1Plan, object: TestObject | null, fixture: Fixture, token: string | null = null): asserts object is TestObject {
  requirePhase1(object && plan.objectAllowlist.includes(object.path) && object.testRunId === PHASE1_RUN && object.fixtureId === fixture.id
    && /^[1-9][0-9]*$/.test(object.generation) && /^[1-9][0-9]*$/.test(object.metageneration)
    && object.size === fixture.size && object.contentType === fixture.contentType && object.md5Hash === fixture.md5Hash && object.crc32c === fixture.crc32c
    && object.cacheControl === "private,no-store" && object.token === token, "object_integrity_or_ownership_failed");
}
export function sameVersion(left: TestObject, right: TestObject) {
  requirePhase1(left.path === right.path && left.generation === right.generation && left.metageneration === right.metageneration, "object_version_changed");
}
const journalStages = new Set(["execution_started", "preflight_passed", "intent", "applied", "verified", "denied_as_expected", "completed", "stopped_no_automatic_cleanup"]);
/** Never journal a provider response, URL, token, headers or exception. */
export function safePhase1Journal(plan: Phase1Plan, value: JournalEvent) {
  requirePhase1(journalStages.has(value.stage), "unsafe_journal_stage");
  const result: Record<string, unknown> = { at: new Date().toISOString(), runId: PHASE1_RUN, planDigest: PHASE1_DIGEST, stage: value.stage };
  if (value.object !== undefined) { requirePhase1(plan.objectAllowlist.includes(value.object), "unsafe_journal_object"); result.object = value.object; }
  for (const field of ["generation", "metageneration"] as const) if (value[field] !== undefined) {
    requirePhase1(/^[1-9][0-9]*$/.test(value[field]!), "unsafe_journal_version"); result[field] = value[field];
  }
  if (value.status !== undefined) { requirePhase1(Number.isInteger(value.status) && value.status >= 100 && value.status <= 599, "unsafe_journal_status"); result.status = value.status; }
  return result;
}
export async function appendPhase1Journal(handle: { write(text: string): Promise<{ bytesWritten: number }>; sync(): Promise<void> }, plan: Phase1Plan, event: JournalEvent) {
  const line = JSON.stringify(safePhase1Journal(plan, event)) + "\n";
  const result = await handle.write(line);
  requirePhase1(result.bytesWritten === Buffer.byteLength(line), "journal_partial_write");
  await handle.sync();
}
export interface Phase1Provider {
  preflight(): Promise<void>;
  head(path: string, softGeneration?: string): Promise<TestObject | null>;
  read(object: TestObject, range?: [number, number], limited?: boolean): Promise<{ status: number; bytes: Buffer; contentRange?: string }>;
  upload(path: string, fixture: Fixture, previous?: TestObject, limited?: boolean): Promise<TestObject>;
  token(object: TestObject, token: string | null): Promise<TestObject>;
  copy(object: TestObject, destination: string): Promise<TestObject>;
  remove(object: TestObject): Promise<void>;
  restore(object: TestObject): Promise<TestObject>;
  publicRead(path: string, api: "gcs" | "firebase", token?: string): Promise<number>;
  sign(path: string): Promise<string>;
  signedRead(url: string): Promise<number>;
}

export async function executePhase1(input: unknown, fixtures: Fixture[], provider: Phase1Provider,
  journal: (event: JournalEvent) => Promise<void>, execute: boolean, approval: string) {
  assertExecutionSignal(execute, approval);
  const plan = approvedPhase1Plan(input);
  requirePhase1(fixtures.length === plan.fixtures.length && new Set(fixtures.map(file => file.id)).size === plan.fixtures.length, "fixture_set_mismatch");
  for (const expected of plan.fixtures) {
    const actual = fixtures.find(file => file.id === expected.id);
    requirePhase1(actual && JSON.stringify({ ...actual, bytes: undefined }) === JSON.stringify(expected), "fixture_manifest_mismatch"); verifyFixture(actual);
  }
  const [reading, image, podcast, v1, v2] = plan.fixtures.map(file => fixtures.find(candidate => candidate.id === file.id)!);
  const [r, i, p, rc, pc, g, forbidden] = plan.objectAllowlist;
  async function applied(object: TestObject) { await journal({ stage: "applied", object: object.path, generation: object.generation, metageneration: object.metageneration }); return object; }
  async function mutation(path: string, fn: () => Promise<TestObject>) { await journal({ stage: "intent", object: path }); return applied(await fn()); }
  async function checked(object: TestObject, file: Fixture, token: string | null = null) {
    const current = await provider.head(object.path); verifyTestObject(plan, current, file, token); sameVersion(object, current);
    requirePhase1(!current.softDeleted, "unexpected_soft_deleted_object"); return current;
  }
  async function bytes(object: TestObject, file: Fixture) {
    const response = await provider.read(object);
    requirePhase1(response.status === 200 && createHash("sha256").update(response.bytes).digest("hex") === file.sha256, "read_checksum_failed");
  }
  async function denied(path: string, fn: () => Promise<unknown>, status: number) {
    await journal({ stage: "intent", object: path });
    let observed = 0;
    try { await fn(); } catch (error) { observed = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0; }
    requirePhase1(observed === status, "negative_write_did_not_fail_as_expected");
    await journal({ stage: "denied_as_expected", object: path, status });
  }
  async function privateRead(path: string, token?: string) {
    for (const api of ["gcs", "firebase"] as const) {
      const status = await provider.publicRead(path, api, api === "firebase" ? token : undefined);
      requirePhase1([401, 403, 404].includes(status), "public_access_not_denied");
    }
  }
  async function remove(object: TestObject, file: Fixture) {
    await checked(object, file); await journal({ stage: "intent", object: object.path }); await provider.remove(object);
    await journal({ stage: "applied", object: object.path, generation: object.generation });
    requirePhase1(await provider.head(object.path) === null, "deleted_object_still_live");
  }
  await journal({ stage: "execution_started" });
  try {
    await provider.preflight();
    for (const path of plan.objectAllowlist) requirePhase1(await provider.head(path) === null, "test_object_already_exists");
    await journal({ stage: "preflight_passed" });
    const objects = new Map<string, TestObject>();
    for (const [path, file] of [[r, reading], [i, image], [p, podcast], [g, v1]] as const) {
      const object = await mutation(path, () => provider.upload(path, file)); verifyTestObject(plan, object, file); objects.set(path, object);
      await bytes(object, file); await privateRead(path);
    }
    const firstRange = await provider.read(objects.get(p)!, [0, 1048575]), lastRange = await provider.read(objects.get(p)!, [1048576, podcast.size - 1]);
    requirePhase1(firstRange.status === 206 && lastRange.status === 206 && firstRange.contentRange === `bytes 0-1048575/${podcast.size}`
      && lastRange.contentRange === `bytes 1048576-${podcast.size - 1}/${podcast.size}` && Buffer.concat([firstRange.bytes, lastRange.bytes]).equals(podcast.bytes), "range_verification_failed");
    const limitedRead = await provider.read(objects.get(r)!, undefined, true);
    requirePhase1(limitedRead.status === 200 && limitedRead.bytes.equals(reading.bytes), "limited_token_not_valid_for_read");
    await denied(forbidden, () => provider.upload(forbidden, v1, undefined, true), 403);
    requirePhase1(await provider.head(forbidden) === null, "forbidden_probe_created");
    const token = randomUUID(), originalReading = objects.get(r)!;
    let source = await mutation(r, () => provider.token(originalReading, token)); verifyTestObject(plan, source, reading, token);
    requirePhase1(source.generation === originalReading.generation && source.metageneration !== originalReading.metageneration, "token_patch_version_failed");
    requirePhase1(await provider.publicRead(r, "firebase", token) === 200, "synthetic_token_not_readable");
    await privateRead(r, randomUUID());
    await denied(r, () => provider.token(originalReading, null), 412); await checked(source, reading, token);
    const readingCopy = await mutation(rc, () => provider.copy(source, rc)); verifyTestObject(plan, readingCopy, reading); await bytes(readingCopy, reading);
    const podcastCopy = await mutation(pc, () => provider.copy(objects.get(p)!, pc)); verifyTestObject(plan, podcastCopy, podcast); await bytes(podcastCopy, podcast);
    await privateRead(rc, token); await privateRead(pc);
    await denied(rc, () => provider.copy(source, rc), 412); await checked(readingCopy, reading);
    const signed = await provider.sign(r); requirePhase1(await provider.signedRead(signed) === 200, "signed_probe_not_readable");
    const tokenSource = source;
    source = await mutation(r, () => provider.token(tokenSource, null)); verifyTestObject(plan, source, reading);
    requirePhase1(source.generation === tokenSource.generation && source.metageneration !== tokenSource.metageneration, "token_revoke_version_failed");
    await privateRead(r, token); requirePhase1(await provider.signedRead(signed) === 200, "independent_signed_link_unexpectedly_revoked");
    const generationV1 = objects.get(g)!;
    const generationV2 = await mutation(g, () => provider.upload(g, v2, generationV1)); verifyTestObject(plan, generationV2, v2);
    requirePhase1(generationV2.generation !== generationV1.generation, "generation_not_changed");
    await denied(g, () => provider.remove(generationV1), 412); await checked(generationV2, v2);
    await checked(readingCopy, reading); await bytes(readingCopy, reading); await remove(source, reading);
    await privateRead(r, token); requirePhase1([401, 403, 404].includes(await provider.signedRead(signed)), "retired_signed_source_still_readable");
    await checked(objects.get(p)!, podcast); await bytes(objects.get(p)!, podcast); await remove(podcastCopy, podcast);
    const deleted = await provider.head(pc, podcastCopy.generation); verifyTestObject(plan, deleted, podcast);
    requirePhase1(deleted.softDeleted && deleted.generation === podcastCopy.generation && deleted.metageneration === podcastCopy.metageneration, "soft_deleted_generation_not_verified");
    const restored = await mutation(pc, () => provider.restore(deleted)); verifyTestObject(plan, restored, podcast);
    requirePhase1(restored.generation !== deleted.generation && restored.metageneration === "1" && !restored.softDeleted, "restored_generation_invalid"); await bytes(restored, podcast); await privateRead(pc);
    await provider.preflight(); // Recheck global bucket policy before the planned cleanup.
    // Cleanup is part of the successful test recipe only. A failure never enters this block.
    for (const [object, file] of [[objects.get(i)!, image], [objects.get(p)!, podcast], [readingCopy, reading], [restored, podcast], [generationV2, v2]] as const) await remove(object, file);
    for (const path of plan.objectAllowlist) requirePhase1(await provider.head(path) === null, "cleanup_incomplete");
    await journal({ stage: "completed" });
    return { status: "completed", runId: PHASE1_RUN, liveObjectsRemaining: 0, softDeletedGenerationsRetained: true };
  } catch {
    await journal({ stage: "stopped_no_automatic_cleanup" });
    throw new Error("phase_one_stopped_review_journal");
  }
}
