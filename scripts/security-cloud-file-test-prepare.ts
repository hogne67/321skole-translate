// Local artifacts only. No SDK, auth client, ADC, network or cloud mutation.
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { assertCloudTestBoundary } from "../lib/security/cloudTestBoundary";
import { buildCloudFileTestPlan, syntheticFileFixtures } from "../lib/security/cloudFileTestPlan";

const args = process.argv.slice(2), options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  if (!["--project", "--bucket"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("preparation_only_arguments_required");
  options.set(args[index], args[index + 1]);
}
const project = options.get("--project") || "", bucket = options.get("--bucket") || "";
assertCloudTestBoundary(project, bucket, process.env);
const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
const runId = `p1-${date}-${randomBytes(6).toString("hex")}`, plan = buildCloudFileTestPlan(project, bucket, runId);
const output = path.resolve(".vercel/security-cloud-test/phase1", runId);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // A run directory must be new; never overwrite earlier approval artifacts.
for (const fixture of syntheticFileFixtures()) await writeFile(path.join(output, fixture.filename), fixture.bytes, { flag: "wx", mode: 0o600 });
await writeFile(path.join(output, "plan.json"), JSON.stringify(plan, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ preparationOnly: true, cloudRequests: 0, approved: false, runId, planDigest: plan.planDigest,
  fixtureCount: plan.fixtures.length, fixtureBytes: plan.fixtures.reduce((total, file) => total + file.size, 0),
  expectedSuccessfulMutations: plan.expectedSuccessfulMutations, expectedDeniedMutationAttempts: plan.expectedDeniedMutationAttempts, output }));
