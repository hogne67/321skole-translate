import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudTestClient } from "./cloudTestAuth";
import { CLOUD_TEST_PROJECT as project, CLOUD_TEST_BUCKET as bucket, CLOUD_TEST_PRINCIPAL as principal,
  CLOUD_TEST_ADC_PATH, CLOUD_TEST_IMPERSONATION_URL, assertCloudTestBoundary, assertCloudTestAdcPath, validateCloudTestImpersonation } from "./cloudTestBoundary";

test("only the owner's exact test project and bucket are accepted", () => {
  assert.doesNotThrow(() => assertCloudTestBoundary(project, bucket, { NODE_ENV: "test" }));
  for (const [candidateProject, candidateBucket] of [["other-project", bucket], [project, "other-bucket"], ["", bucket],
    ["skole-c09b8", "skole-c09b8.firebasestorage.app"], [project, "skole-c09b8.firebasestorage.app"]]) {
    assert.throws(() => assertCloudTestBoundary(candidateProject, candidateBucket, { NODE_ENV: "test" }), /explicit_test_project_and_bucket_required/);
  }
});
test("inherited credentials, implicit project selection and emulators are rejected", () => {
  for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FIREBASE_ADMIN_SA_JSON", "GCLOUD_PROJECT", "CLOUDSDK_CONFIG",
    "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST", "CLOUD_STORAGE_EMULATOR_HOST", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "GCP_PROJECT"]) {
    assert.throws(() => assertCloudTestBoundary(project, bucket, { NODE_ENV: "test", [name]: "synthetic-conflict" }), /ambient_cloud_configuration_refused/);
  }
});
test("injected Node code, proxies and changed TLS trust are rejected", () => {
  for (const name of ["NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "NODE_TLS_REJECT_UNAUTHORIZED", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "https_proxy"]) {
    assert.throws(() => assertCloudTestBoundary(project, bucket, { NODE_ENV: "test", [name]: "synthetic-conflict" }), /ambient_cloud_configuration_refused/);
  }
});
test("production env files and alternate credential locations cannot be used", () => {
  const workspace = process.cwd();
  assert.ok(assertCloudTestAdcPath(CLOUD_TEST_ADC_PATH, workspace));
  assert.ok(assertCloudTestAdcPath(".vercel/security-cloud-test/gcloud/application_default_credentials.json", workspace));
  for (const candidate of [".env.local", "credentials.json", "../application_default_credentials.json", ".vercel/security-cloud-test/credentials.test.json"]) {
    assert.throws(() => assertCloudTestAdcPath(candidate, workspace), /dedicated_test_adc_path_required/);
  }
});
const synthetic = { type: "impersonated_service_account", quota_project_id: project, service_account_impersonation_url: CLOUD_TEST_IMPERSONATION_URL,
  source_credentials: { type: "authorized_user", client_id: "synthetic-client", client_secret: "synthetic-secret", refresh_token: "synthetic-not-a-real-token" } };
test("only the exact keyless test principal is accepted", () => {
  assert.equal(principal, "school321-cloud-test@testbilde-5683f.iam.gserviceaccount.com");
  assert.deepEqual(validateCloudTestImpersonation(synthetic), { clientId: "synthetic-client", clientSecret: "synthetic-secret", refreshToken: "synthetic-not-a-real-token" });
  for (const type of ["authorized_user", "external_account", "service_account"]) {
    assert.throws(() => validateCloudTestImpersonation({ ...synthetic, type }), /test_impersonation_required/);
  }
});
test("a different account, IAM endpoint or quota project is refused", () => {
  for (const url of [CLOUD_TEST_IMPERSONATION_URL.replace("school321-cloud-test", "other-account"),
    CLOUD_TEST_IMPERSONATION_URL.replace("iamcredentials.googleapis.com", "synthetic.invalid"), `${CLOUD_TEST_IMPERSONATION_URL}?synthetic=1`]) {
    assert.throws(() => validateCloudTestImpersonation({ ...synthetic, service_account_impersonation_url: url }), /exact_test_impersonation_target_required/);
  }
  for (const quota of [null, "", "skole-c09b8"]) assert.throws(() => validateCloudTestImpersonation({ ...synthetic, quota_project_id: quota }), /test_quota_project_required/);
  assert.throws(() => validateCloudTestImpersonation({ ...synthetic, source_credentials: { ...synthetic.source_credentials, quota_project_id: "skole-c09b8" } }), /test_quota_project_required/);
});
test("missing ADC quota is allowed because the client pins the quota header to the test project", async () => {
  const source = validateCloudTestImpersonation({ ...synthetic, quota_project_id: undefined });
  const client = createCloudTestClient(source);
  assert.equal(client.getTargetPrincipal(), principal);
  assert.equal(client.quotaProjectId, project);
  // Only a fake cached access token: getRequestHeaders must not refresh or contact Google.
  client.setCredentials({ access_token: "synthetic-cached-access-token", expiry_date: Date.now() + 3600_000 });
  const headers = await client.getRequestHeaders();
  assert.equal(headers["x-goog-user-project"], project);
  assert.equal(headers.Authorization, "Bearer synthetic-cached-access-token");
});
test("delegation chains, alternate universes and injected provider endpoints are refused", () => {
  assert.throws(() => validateCloudTestImpersonation({ ...synthetic, delegates: ["synthetic-other-service-account"] }), /delegation_chain_refused/);
  for (const defect of [{ universe_domain: "synthetic.invalid" }, { endpoint: "https://synthetic.invalid" }, { token_uri: "https://synthetic.invalid" }, { private_key: "synthetic" }]) {
    assert.throws(() => validateCloudTestImpersonation({ ...synthetic, ...defect }));
    assert.throws(() => validateCloudTestImpersonation({ ...synthetic, source_credentials: { ...synthetic.source_credentials, ...defect } }));
  }
});
test("missing or non-user source credentials are refused", () => {
  for (const source of [null, {}, { ...synthetic.source_credentials, type: "service_account" }, { ...synthetic.source_credentials, refresh_token: "" }]) {
    assert.throws(() => validateCloudTestImpersonation({ ...synthetic, source_credentials: source }));
  }
  for (const value of [null, {}, []]) assert.throws(() => validateCloudTestImpersonation(value));
});
test("unknown configuration fields cannot reach the OAuth client", () => {
  const result = validateCloudTestImpersonation({ ...synthetic, delegates: [], unrelated: "synthetic", source_credentials: { ...synthetic.source_credentials, unrelated: "synthetic" } });
  assert.deepEqual(Object.keys(result).sort(), ["clientId", "clientSecret", "refreshToken"].sort());
});
