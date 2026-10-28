// Read-only inspection after the stopped, approved phase 1 run. No content or token output.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCloudTestClient } from "../lib/security/cloudTestAuth";
import { assertCloudTestBoundary, CLOUD_TEST_ADC_PATH } from "../lib/security/cloudTestBoundary";
import { approvedPhase1Plan, PHASE1_RUN } from "../lib/security/cloudFileTestExecution";

async function main() {
  const mode = process.argv.slice(2).join(" ");
  if (!["--read-cloud", "--read-copy-token-shape"].includes(mode)) throw new Error("explicit_read_only_signal_required");
  const root = path.resolve(".vercel/security-cloud-test/phase1", PHASE1_RUN);
  const plan = approvedPhase1Plan(JSON.parse(await readFile(path.join(root, "plan.json"), "utf8")));
  assertCloudTestBoundary(plan.projectId, plan.bucket, process.env);
  const client = await loadCloudTestClient(CLOUD_TEST_ADC_PATH, "read-only");
  if (mode === "--read-copy-token-shape") {
    const object = plan.objectAllowlist[3];
    const response = await client.request<Record<string, unknown>>({ method: "GET",
      url: `https://storage.googleapis.com/storage/v1/b/${plan.bucket}/o/${encodeURIComponent(object)}`,
      validateStatus: () => true, maxRedirects: 0, timeout: 15_000, retry: false });
    if (response.status !== 200 || response.data.name !== object || response.data.bucket !== plan.bucket) throw new Error("copy_metadata_read_failed");
    const meta = response.data.metadata as Record<string, unknown>;
    const token = meta.firebaseStorageDownloadTokens;
    const report = { inspectedAt: new Date().toISOString(), runId: plan.runId, readOnly: true, remoteWrites: 0, objectMetadataGets: 1, object,
      tokenFieldPresent: Object.hasOwn(meta, "firebaseStorageDownloadTokens"), tokenType: typeof token,
      tokenIsEmptyString: token === "", tokenIsLiteralNullString: token === "null", tokenIsNull: token === null,
      tokenLength: typeof token === "string" ? token.length : null,
      tokenIsUuidList: typeof token === "string" && token.length > 0 && token.split(",").every(value => /^[a-f0-9-]{36}$/.test(value.trim())) };
    await writeFile(path.join(root, "copy-token-shape.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(report)); return;
  }
  const objects = [];
  for (const [index, object] of plan.objectAllowlist.entries()) {
    const response = await client.request<Record<string, unknown>>({
      method: "GET", url: `https://storage.googleapis.com/storage/v1/b/${plan.bucket}/o/${encodeURIComponent(object)}`,
      validateStatus: () => true, maxRedirects: 0, timeout: 15_000, retry: false,
    });
    if (response.status === 404) { objects.push({ object, status: 404, live: false }); continue; }
    if (response.status !== 200) throw new Error("metadata_read_failed");
    const data = response.data;
    if (data.name !== object || data.bucket !== plan.bucket) throw new Error("object_identity_failed");
    const meta = data.metadata as Record<string, unknown> | undefined;
    const fixture = plan.fixtures[[0, 1, 2, 0, 2, 3, 3][index]];
    const token = meta?.firebaseStorageDownloadTokens;
    const numericVersion = (value: unknown) => typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? value : "invalid";
    objects.push({ object, status: 200, live: true,
      generation: numericVersion(data.generation), metageneration: numericVersion(data.metageneration),
      matches: { testRunId: meta?.testRunId === plan.runId, fixtureId: meta?.fixtureId === fixture.id,
        size: Number(data.size) === fixture.size, contentType: data.contentType === fixture.contentType,
        md5Hash: data.md5Hash === fixture.md5Hash, crc32c: data.crc32c === fixture.crc32c,
        cacheControl: data.cacheControl === "private,no-store" },
      tokenState: token == null ? "absent" : token === "null" ? "literal_null_string" : typeof token === "string" && /^[a-f0-9-]{36}$/.test(token) ? "uuid_present_value_redacted" : "other_value_redacted",
      sameTokenAsReadingSource: index === 3 && typeof token === "string" && token === (objects[0] as { internalToken?: unknown }).internalToken,
      // Only retained in memory; removed below before any serialization.
      ...(index === 0 ? { internalToken: token } : {}),
    });
  }
  for (const object of objects) delete (object as { internalToken?: unknown }).internalToken;
  const report = { inspectedAt: new Date().toISOString(), runId: plan.runId, planDigest: plan.planDigest,
    readOnly: true, remoteWrites: 0, objectMetadataGets: 7, liveObjects: objects.filter(object => object.live).length, objects };
  await writeFile(path.join(root, "read-only-inspection.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(report));
}
main().catch(() => { console.log(JSON.stringify({ status: "inspection_stopped", remoteWrites: 0, message: "No raw credential or provider response output." })); process.exitCode = 1; });
