function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const reasons = new Set(["SERVICE_DISABLED", "IAM_PERMISSION_DENIED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "USER_PROJECT_DENIED", "CONSUMER_INVALID",
  "SECURITY_POLICY_VIOLATED", "RATE_LIMIT_EXCEEDED", "QUOTA_EXCEEDED", "CREDENTIALS_MISSING", "BILLING_DISABLED", "forbidden", "insufficientPermissions", "accessNotConfigured", "notFound"]);
const services = new Set(["storage.googleapis.com", "firebaserules.googleapis.com", "firestore.googleapis.com", "identitytoolkit.googleapis.com",
  "cloudresourcemanager.googleapis.com", "iamcredentials.googleapis.com"]);
const permissions = new Set(["storage.buckets.get", "storage.buckets.getIamPolicy", "firebaserules.releases.list", "datastore.databases.list",
  "firebaseauth.configs.get", "resourcemanager.projects.get", "iam.serviceAccounts.getAccessToken", "serviceusage.services.use"]);

/** Whitelisted provider codes only; never log error messages, request config or headers. */
export function cloudTestErrorSummary(error: unknown) {
  const response = object(error) && object(error.response) ? error.response : {};
  const data = object(response.data) && object(response.data.error) ? response.data.error : {};
  const details = Array.isArray(data.details) ? data.details : [];
  const diagnostics: { reason?: string; service?: string; permission?: string }[] = [];
  for (const item of [...details, ...(Array.isArray(data.errors) ? data.errors : [])]) {
    if (!object(item)) continue;
    const metadata = object(item.metadata) ? item.metadata : {};
    const reason = typeof item.reason === "string" && reasons.has(item.reason) ? item.reason : undefined;
    const service = typeof metadata.service === "string" && services.has(metadata.service) ? metadata.service : undefined;
    const permission = typeof metadata.permission === "string" && permissions.has(metadata.permission) ? metadata.permission : undefined;
    if (reason || service || permission) diagnostics.push({ ...(reason ? { reason } : {}), ...(service ? { service } : {}), ...(permission ? { permission } : {}) });
  }
  // Storage can report a missing permission only in its message. Match a fixed vocabulary
  // without retaining or returning any of that message.
  const message = typeof data.message === "string" ? data.message : "";
  const mentionedPermissions = [...permissions].filter(permission => message.includes(`'${permission}'`)
    || message.includes(`\`${permission}\``));
  return { status: typeof response.status === "number" ? response.status : null, unavailable: true,
    ...(diagnostics.length ? { diagnostics } : {}), ...(mentionedPermissions.length ? { mentionedPermissions } : {}) };
}
