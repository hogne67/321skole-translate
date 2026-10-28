// Standalone read-only test-project preflight. Never imports application bootstrap or .env.local.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCloudTestBoundary, CLOUD_TEST_PROJECT, CLOUD_TEST_BUCKET, CLOUD_TEST_PRINCIPAL, CLOUD_TEST_ADC_PATH } from "../lib/security/cloudTestBoundary";
import { loadCloudTestClient } from "../lib/security/cloudTestAuth";
import { cloudTestErrorSummary } from "../lib/security/cloudTestDiagnostics";

const output = path.resolve(".vercel/security-cloud-test");
await mkdir(output, { recursive: true });
const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), readOnly: true, remoteWrites: false, cloudRequestsMade: false,
  expectedProject: CLOUD_TEST_PROJECT, expectedBucket: CLOUD_TEST_BUCKET, productionEnvironmentLoaded: false, credentialFallbackAllowed: false };
try {
  const args = process.argv.slice(2), options = new Map<string, string>();
  let readCloud = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--read-cloud" && !readCloud) { readCloud = true; continue; }
    if (!["--project", "--bucket", "--adc"].includes(name) || !args[index + 1] || options.has(name)) throw new Error("invalid_preflight_arguments");
    options.set(name, args[++index]);
  }
  assertCloudTestBoundary(options.get("--project") || "", options.get("--bucket") || "", process.env);
  report.environmentBoundaryPassed = true;
  const rc = JSON.parse(await readFile(".firebaserc", "utf8"));
  report.localDefaultTargetsTest = rc.projects?.default === CLOUD_TEST_PROJECT;
  report.defaultProjectUsed = false;
  const client = await loadCloudTestClient(options.get("--adc") || CLOUD_TEST_ADC_PATH);
  report.dedicatedTestImpersonationValidated = true;
  report.targetPrincipal = CLOUD_TEST_PRINCIPAL;
  report.quotaProject = CLOUD_TEST_PROJECT;
  report.privateServiceAccountKeyUsed = false;
  report.crossProjectIamScope = "requires_owner_confirmation_not_proven_by_credential_project_id";
  if (readCloud) {
    // Fixed GET destinations only, with redirects disabled. Auth/Firestore GETs require
    // cloud-platform (not cloud-platform.read-only); resource isolation comes from test IAM.
    const urls = {
      project: `https://cloudresourcemanager.googleapis.com/v1/projects/${CLOUD_TEST_PROJECT}`,
      bucket: `https://storage.googleapis.com/storage/v1/b/${CLOUD_TEST_BUCKET}`,
      bucketIam: `https://storage.googleapis.com/storage/v1/b/${CLOUD_TEST_BUCKET}/iam`,
      rules: `https://firebaserules.googleapis.com/v1/projects/${CLOUD_TEST_PROJECT}/releases?pageSize=10`,
      firestore: `https://firestore.googleapis.com/v1/projects/${CLOUD_TEST_PROJECT}/databases`,
      auth: `https://identitytoolkit.googleapis.com/admin/v2/projects/${CLOUD_TEST_PROJECT}/config`,
    };
    const checks: Record<string, unknown> = {};
    report.cloudRequestsMade = true;
    for (const [name, url] of Object.entries(urls)) {
      try {
        const response = await client.request<Record<string, unknown>>({ url, method: "GET", maxRedirects: 0, timeout: 15_000 });
        const data = response.data;
        checks[name] = { status: response.status, ...(name === "bucket" ? { location: data.location, projectNumber: data.projectNumber,
          iamConfiguration: data.iamConfiguration, softDeletePolicy: data.softDeletePolicy, versioning: data.versioning } : {}),
        ...(name === "project" ? { projectId: data.projectId, projectNumber: data.projectNumber } : {}),
        ...(name === "bucketIam" ? { publicBindingPresent: (data.bindings as { members?: string[] }[] || []).some(binding => binding.members?.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member))) } : {}),
        ...(name === "firestore" ? { databases: (data.databases as { name: string; locationId: string; type: string }[] || []).map(database => ({ name: database.name, location: database.locationId, type: database.type })) } : {}),
        ...(name === "rules" ? { releaseNames: (data.releases as { name: string }[] || []).map(release => release.name), moreReleases: !!data.nextPageToken } : {}) };
      } catch (error) {
        // Never serialize auth-library errors: their request config may contain a bearer token.
        checks[name] = cloudTestErrorSummary(error);
      }
    }
    report.cloudChecks = checks;
    report.status = "read_only_cloud_inspection_completed_review_required";
  } else { report.status = "local_boundary_validated_cloud_not_contacted"; }
} catch (error) {
  const code = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "preflight_failed_without_exposing_credentials";
  report.status = "blocked_before_cloud_access"; report.blocker = code; process.exitCode = 1;
}
const reportPath = path.join(output, `preflight-${Date.now()}.json`);
await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(report));
