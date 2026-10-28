import path from "node:path";
import os from "node:os";

export const CLOUD_TEST_PROJECT = "testbilde-5683f";
export const CLOUD_TEST_BUCKET = "testbilde-5683f.firebasestorage.app";
export const CLOUD_TEST_PRINCIPAL = "school321-cloud-test@testbilde-5683f.iam.gserviceaccount.com";
export const CLOUD_TEST_IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${CLOUD_TEST_PRINCIPAL}:generateAccessToken`;
export const CLOUD_TEST_ADC_PATH = path.join(os.homedir(), "AppData", "Local", "321school-cloud-test", "gcloud", "application_default_credentials.json");

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

/** Refuse implicit credentials, project selection, emulator routing and Node preloads. */
export function assertCloudTestBoundary(project: string, bucket: string, environment: NodeJS.ProcessEnv) {
  requireCondition(project === CLOUD_TEST_PROJECT && bucket === CLOUD_TEST_BUCKET, "explicit_test_project_and_bucket_required");
  const conflicting = Object.keys(environment).filter(name => environment[name] &&
    (/^(FIREBASE|FIRESTORE|GOOGLE|GCLOUD|CLOUDSDK|GCP_|NEXT_PUBLIC_FIREBASE|NEXT_PUBLIC_GOOGLE)/.test(name)
      || ["STORAGE_EMULATOR_HOST", "CLOUD_STORAGE_EMULATOR_HOST", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "NODE_TLS_REJECT_UNAUTHORIZED", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].includes(name)));
  requireCondition(conflicting.length === 0, "ambient_cloud_configuration_refused");
}

export function assertCloudTestAdcPath(file: string, workspace: string) {
  const resolved = path.resolve(workspace, file);
  const allowed = [CLOUD_TEST_ADC_PATH, path.resolve(workspace, ".vercel/security-cloud-test/gcloud/application_default_credentials.json")];
  requireCondition(allowed.some(expected => path.relative(expected, resolved) === ""), "dedicated_test_adc_path_required");
  return resolved;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): value is JsonObject { return !!value && typeof value === "object" && !Array.isArray(value); }
export type CloudTestImpersonation = { clientId: string; clientSecret: string; refreshToken: string };
export function validateCloudTestImpersonation(value: unknown): CloudTestImpersonation {
  requireCondition(object(value) && value.type === "impersonated_service_account", "test_impersonation_required");
  requireCondition(value.service_account_impersonation_url === CLOUD_TEST_IMPERSONATION_URL, "exact_test_impersonation_target_required");
  // Impersonated ADC need not contain quota_project_id. The constructed client
  // pins quota to the test project; an explicitly different file value is refused.
  requireCondition(value.quota_project_id === undefined || value.quota_project_id === CLOUD_TEST_PROJECT, "test_quota_project_required");
  requireCondition(value.delegates === undefined || (Array.isArray(value.delegates) && value.delegates.length === 0), "delegation_chain_refused");
  const source = value.source_credentials;
  requireCondition(object(source) && source.type === "authorized_user", "explicit_user_source_required");
  requireCondition(source.quota_project_id === undefined || source.quota_project_id === CLOUD_TEST_PROJECT, "test_quota_project_required");
  for (const config of [value, source]) {
    requireCondition(config.universe_domain === undefined || config.universe_domain === "googleapis.com", "alternate_auth_universe_refused");
    requireCondition(!["private_key", "endpoint", "token_url", "credential_source", "service_account_impersonation"].some(field => field in config), "auth_configuration_override_refused");
    requireCondition(config.token_uri === undefined || config.token_uri === "https://oauth2.googleapis.com/token", "alternate_oauth_endpoint_refused");
  }
  requireCondition([source.client_id, source.client_secret, source.refresh_token].every(field => typeof field === "string" && field.length > 0), "source_user_credentials_incomplete");
  // Pass only scalar source credentials to an explicitly constructed Impersonated client.
  return { clientId: source.client_id as string, clientSecret: source.client_secret as string, refreshToken: source.refresh_token as string };
}
