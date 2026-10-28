import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { CLOUD_TEST_PROJECT, CLOUD_TEST_BUCKET, CLOUD_TEST_PRINCIPAL } from "./cloudTestBoundary";

function crc(bytes: Buffer, polynomial: number) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? polynomial : 0);
  }
  return (~value) >>> 0;
}
export function fixtureChecksums(bytes: Buffer) {
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(bytes, 0x82f63b78));
  return { size: bytes.length, md5Hash: createHash("md5").update(bytes).digest("base64"), crc32c: checksum.toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex") };
}
function wav(seconds: number, podcast = false) {
  const rate = 16000, samples = seconds * rate, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / rate;
    const frequency = podcast && time >= 22 ? 660 : 440;
    const silent = podcast && time >= 18 && time < 22;
    bytes.writeInt16LE(silent ? 0 : Math.round(8191 * Math.sin(2 * Math.PI * frequency * time)), 44 + index * 2);
  }
  return bytes;
}
function png() {
  function chunk(type: string, data: Buffer) {
    const tag = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([tag, data]), 0xedb88320));
    return Buffer.concat([size, tag, data, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(16 * (1 + 16 * 4));
  for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
    const offset = row * 65 + 1 + col * 4, light = (row + col) % 2 === 0;
    pixels.set(light ? [240, 245, 255, 255] : [30, 70, 150, 255], offset);
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
export function syntheticFileFixtures() {
  return [
    { id: "reading", filename: "reading.wav", contentType: "audio/wav", bytes: wav(2) },
    { id: "image", filename: "board.png", contentType: "image/png", bytes: png() },
    { id: "podcast", filename: "podcast-tones.wav", contentType: "audio/wav", bytes: wav(40, true) },
    { id: "generation-v1", filename: "generation-v1.txt", contentType: "text/plain", bytes: Buffer.from("321school synthetic generation v1\n") },
    { id: "generation-v2", filename: "generation-v2.txt", contentType: "text/plain", bytes: Buffer.from("321school synthetic generation v2\n") },
  ];
}
export function buildCloudFileTestPlan(project: string, bucket: string, runId: string) {
  if (project !== CLOUD_TEST_PROJECT || bucket !== CLOUD_TEST_BUCKET || !/^p1-\d{8}-[a-f0-9]{12}$/.test(runId)) throw new Error("isolated_phase_one_target_required");
  const prefix = `cloud-tests/phase1/${runId}/`;
  const objects = ["input/reading.wav", "input/board.png", "input/podcast-tones.wav", "copy/reading.wav", "copy/podcast-tones.wav", "probes/generation.txt", "probes/forbidden.txt"]
    .map(relative => prefix + relative);
  const result = {
    schema: 1, preparationOnly: true, cloudExecutionImplemented: false, approved: false,
    projectId: project, projectNumber: "220379724471", bucket, region: "europe-west1", principal: CLOUD_TEST_PRINCIPAL, runId, prefix,
    objectAllowlist: objects,
    fixtures: syntheticFileFixtures().map(({ id, filename, contentType, bytes }) => ({ id, filename, contentType, ...fixtureChecksums(bytes) })),
    writePlan: [
      { action: "upload", paths: [objects[0], objects[1], objects[2], objects[5]], count: 4, condition: "ifGenerationMatch=0; testRunId metadata; private,no-store; no tokens or ACL arguments" },
      { action: "negative_upload", paths: [objects[6]], count: 1, expected: "403 with read-only-scoped test identity; no object created" },
      { action: "add_synthetic_firebase_token", paths: [objects[0]], count: 1, condition: "exact generation and metageneration; in-memory random token only" },
      { action: "negative_stale_metadata_patch", paths: [objects[0]], count: 1, expected: "412; source token and metadata unchanged" },
      { action: "server_copy_without_token", paths: [objects[3], objects[4]], count: 2, sources: [objects[0], objects[2]], condition: "pinned source generation/metageneration; ifGenerationMatch=0; replace token metadata; no predefinedAcl" },
      { action: "negative_copy_to_existing_destination", paths: [objects[3]], count: 1, expected: "412; destination unchanged" },
      { action: "revoke_synthetic_firebase_token", paths: [objects[0]], count: 1, condition: "exact generation/current metageneration" },
      { action: "replace_generation_probe", paths: [objects[5]], count: 1, condition: "replace v1 with v2 using ifGenerationMatch=v1Generation" },
      { action: "negative_delete_with_stale_generation", paths: [objects[5]], count: 1, expected: "412 for live object with ifGenerationMatch=v1Generation; v2 survives" },
      { action: "delete_verified_reading_source", paths: [objects[0]], count: 1, condition: "copy verified immediately before delete; exact generation/current metageneration; old signed URL then fails" },
      { action: "delete_verified_podcast_copy_for_restore", paths: [objects[4]], count: 1, condition: "synthetic original retained; token-free exact generation; never issue signed URL for this copy" },
      { action: "restore_podcast_copy", paths: [objects[4]], count: 1, condition: "exact soft-deleted generation; ifGenerationMatch=0; no ACL copy or overwrite; validate new generation and all metadata" },
      { action: "cleanup_live_objects", paths: [objects[1], objects[2], objects[3], objects[4], objects[5]], count: 5, condition: "allowlist + matching testRunId + recorded current generations/metagenerations; no bucket-wide listing/deletion" },
    ],
    expectedSuccessfulMutations: 17, expectedDeniedMutationAttempts: 4,
    maximumDistinctObjectNames: 7, expectedDistinctLiveNamesCreated: 6,
    failureHandling: "Stop test stages on unexpected success/failure; journal exact affected generations. Any cleanup must remain inside the seven-name allowlist and match ownership metadata; never delete unknown generations.",
    retention: "Cloud Storage soft-deleted generations remain under existing seven-day policy; no permanent purge or lifecycle change.",
    forbiddenChanges: ["production", "IAM", "API enablement", "bucket configuration", "Firebase rules", "Auth users", "Firestore documents", "application deployment", "real-file migration"],
  };
  return { ...result, planDigest: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
}

export function assertPhaseOneObject(plan: ReturnType<typeof buildCloudFileTestPlan>, objectPath: string) {
  const expected = buildCloudFileTestPlan(plan.projectId, plan.bucket, plan.runId);
  const { planDigest, ...contents } = plan;
  const actualDigest = createHash("sha256").update(JSON.stringify(contents)).digest("hex");
  if (planDigest !== expected.planDigest || actualDigest !== planDigest || !expected.objectAllowlist.includes(objectPath)) throw new Error("phase_one_object_not_approved");
}
