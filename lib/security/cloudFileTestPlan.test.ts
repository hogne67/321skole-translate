import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { buildCloudFileTestPlan, assertPhaseOneObject, fixtureChecksums, syntheticFileFixtures } from "./cloudFileTestPlan";
const project = "testbilde-5683f", bucket = "testbilde-5683f.firebasestorage.app", runId = "p1-20261016-abcdef123456";

test("production, wrong buckets and unsafe prefixes are refused", () => {
  for (const args of [["skole-c09b8", bucket, runId], [project, "skole-c09b8.firebasestorage.app", runId], [project, bucket, "../input"], [project, bucket, "p1-20261016-not-hex"]]) {
    assert.throws(() => buildCloudFileTestPlan(...args as [string, string, string]));
  }
});
test("only seven exact synthetic names are allowed and the plan is not executable or approved", () => {
  const plan = buildCloudFileTestPlan(project, bucket, runId);
  assert.equal(plan.approved, false); assert.equal(plan.cloudExecutionImplemented, false);
  assert.equal(new Set(plan.objectAllowlist).size, 7);
  for (const object of plan.objectAllowlist) assert.doesNotThrow(() => assertPhaseOneObject(plan, object));
  for (const object of ["covers/other/image.png", plan.prefix + "other.wav", plan.objectAllowlist[0] + "/../other"]) assert.throws(() => assertPhaseOneObject(plan, object));
  assert.throws(() => assertPhaseOneObject({ ...plan, planDigest: "modified" }, plan.objectAllowlist[0]));
  assert.throws(() => assertPhaseOneObject({ ...plan, objectAllowlist: [...plan.objectAllowlist, "covers/other/image.png"] }, plan.objectAllowlist[0]));
});
test("WAV fixtures contain valid mono PCM and podcast crosses the one-MiB boundary", () => {
  const fixtures = syntheticFileFixtures();
  for (const id of ["reading", "podcast"]) {
    const bytes = fixtures.find(file => file.id === id)!.bytes;
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF"); assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt32LE(4), bytes.length - 8); assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt32LE(24), 16000);
    assert.equal(bytes.length, id === "reading" ? 64044 : 1280044);
  }
});
test("PNG is a real generated 16x16 RGBA image and hashes are deterministic", () => {
  const bytes = syntheticFileFixtures().find(file => file.id === "image")!.bytes;
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 16); assert.equal(bytes.readUInt32BE(20), 16);
  const length = bytes.readUInt32BE(33), pixels = inflateSync(bytes.subarray(41, 41 + length));
  assert.equal(pixels.length, 16 * 65); assert.equal(pixels[0], 0);
  assert.equal(fixtureChecksums(Buffer.from("123456789")).crc32c, "4waSgw==");
  assert.deepEqual(buildCloudFileTestPlan(project, bucket, runId), buildCloudFileTestPlan(project, bucket, runId));
});
test("restore never targets the token-bearing original and cleanup omits that retired source", () => {
  const plan = buildCloudFileTestPlan(project, bucket, runId);
  const restore = plan.writePlan.find(action => action.action === "restore_podcast_copy")!;
  const token = plan.writePlan.find(action => action.action === "add_synthetic_firebase_token")!;
  const cleanup = plan.writePlan.find(action => action.action === "cleanup_live_objects")!;
  assert.ok(!restore.paths.some(path => token.paths.includes(path)));
  assert.ok(!cleanup.paths.some(path => token.paths.includes(path)));
  const denied = plan.writePlan.filter(action => action.action.startsWith("negative_"));
  assert.equal(denied.reduce((sum, action) => sum + action.count, 0), 4);
  assert.equal(plan.writePlan.filter(action => !action.action.startsWith("negative_")).reduce((sum, action) => sum + action.count, 0), 17);
});
