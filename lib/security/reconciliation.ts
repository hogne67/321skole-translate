import { createHash } from "node:crypto";

// Field projection deliberately excludes names, emails, billing IDs and user content.
export const PROFILE_AUTHORITY_FIELDS = ["role", "roles", "adminLevel", "admin", "isAdmin", "disabled",
  "schoolId", "schoolRole", "schoolStatus", "plan", "billing.plan", "billing.status", "partnerAccess",
  "partnerStatus", "partnerLevel", "academyEnabled", "features", "entitlements", "org.role", "teacherStatus", "creatorStatus"];
export type AuthorityRecord = { uid: string; source: "profile" | "authClaims" | "schoolMember"; scope?: string; fields: Record<string, unknown> };
export type ApprovedAssignment = AuthorityRecord & { approvedBy: string; evidence: string; expiresAt?: string };
export type ApprovalLedger = { projectId: string; complete: boolean; approvedBy: string; approvedAt: string; assignments: ApprovedAssignment[] };

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function authorityKey(record: AuthorityRecord) { return JSON.stringify([record.source, record.uid, record.scope ?? null]); }
export function flatten(value: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item && typeof item === "object" && !Array.isArray(item) ? Object.entries(flatten(item as Record<string, unknown>, path)) : [[path, item]];
  }));
}
export function elevatedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(flatten(fields)).filter(([key, value]) => {
    if (value == null || value === false || value === "" || value === "none" || value === "free") return false;
    if (key === "disabled") return false;
    if (key === "role") return !["student", "teacher", "parent"].includes(String(value));
    if (["roles.student", "roles.teacher", "roles.parent"].includes(key)) return false;
    if (["creatorStatus", "teacherStatus", "partnerStatus"].includes(key)) return ["approved", "active"].includes(String(value));
    return true;
  }));
}

export function reconcile(records: AuthorityRecord[], ledger: ApprovalLedger | undefined, projectId: string, now = new Date()) {
  if (ledger && (ledger.projectId !== projectId || !ledger.approvedBy || !Number.isFinite(Date.parse(ledger.approvedAt)))) throw new Error("Invalid or wrong-project approval ledger");
  const approvals = new Map<string, ApprovedAssignment>();
  for (const grant of ledger?.assignments ?? []) {
    const key = authorityKey(grant);
    if (!grant.uid || !grant.approvedBy || !grant.evidence || approvals.has(key) || !["profile", "authClaims", "schoolMember"].includes(grant.source)) throw new Error("Incomplete or duplicate approval");
    if (grant.expiresAt && !Number.isFinite(Date.parse(grant.expiresAt))) throw new Error("Invalid expiry");
    approvals.set(key, grant);
  }
  const findings: { key: string; kind: string; field?: string; observed?: unknown; expected?: unknown }[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const key = authorityKey(record);
    if (seen.has(key)) throw new Error("Duplicate inventory record");
    seen.add(key);
    const observed = elevatedFields(record.fields);
    const approved = approvals.get(key);
    if (Object.keys(observed).length && !approved) findings.push({ key, kind: ledger?.complete ? "unexpected_assignment" : "unverified_assignment" });
    if (approved) {
      if (approved.expiresAt && Date.parse(approved.expiresAt) <= now.getTime()) findings.push({ key, kind: "expired_approval" });
      const expected = elevatedFields(approved.fields);
      for (const field of new Set([...Object.keys(observed), ...Object.keys(expected)])) {
        if (canonical(observed[field]) !== canonical(expected[field])) findings.push({ key, kind: "field_mismatch", field, observed: observed[field] ?? null, expected: expected[field] ?? null });
      }
    }
    if (Object.keys(observed).length && record.fields.disabled === true) findings.push({ key, kind: "disabled_account_with_stored_authority" });
  }
  for (const key of approvals.keys()) if (!seen.has(key)) findings.push({ key, kind: "approved_assignment_missing" });
  return { automaticChanges: false, inventoryDigest: digest(records), ledgerDigest: ledger ? digest(ledger) : null,
    completeAuthorityBaseline: ledger?.complete === true, findings };
}

export function classifyFile(path: string, metadata: Record<string, unknown> = {}) {
  const custom = (metadata.metadata ?? {}) as Record<string, unknown>;
  const audio = /^spaces\/([^/]+)\/assignments\/([^/]+)\/submissions\/([^/]+)\/audio\/[^/]+$/.exec(path);
  const writing = /^writing-print-images\/[^/]+\/([^/]+)\/([^/]+)\//.exec(path);
  const board = /^board-images\/[^/]+\/([^/]+)\//.exec(path);
  const legacyPrint = /^covers\/[^/]+\/writing-print-([^/]+)\/([^/]+)\//.exec(path);
  const studentContext = custom.context === "student-writing-print" || custom.context === "student_writing_print";
  const protectedFile = !!(audio || writing || board || legacyPrint || studentContext);
  const publicRule = path.startsWith("covers/") || path.startsWith("live-image-activities/");
  const tokens = typeof custom.firebaseStorageDownloadTokens === "string" ? custom.firebaseStorageDownloadTokens.split(",").filter(Boolean).length : 0;
  return { protectedFile, publicRule, spaceId: audio?.[1] ?? writing?.[1] ?? board?.[1] ?? legacyPrint?.[1] ?? (typeof custom.spaceId === "string" ? custom.spaceId : null),
    tokenCount: tokens, actions: protectedFile ? [
      "copy_to_private_namespace_and_rewrite_references",
      ...(tokens ? ["revoke_download_tokens_after_authenticated_reader_ready"] : []),
      "check_object_acl_bucket_iam_and_old_generations", "verify_old_signed_urls_denied_or_expired",
    ] : ["manual_content_classification"] };
}
export function describeLink(value: string) {
  if (value.startsWith("data:")) return { mechanism: "inline_file", digest: digest(value) };
  try {
    const url = new URL(value);
    const firebase = url.hostname === "firebasestorage.googleapis.com" && /^\/v0\/b\/[^/]+\/o\//.test(url.pathname);
    const google = ["storage.googleapis.com", "storage.cloud.google.com"].includes(url.hostname) || url.hostname.endsWith(".storage.googleapis.com");
    const signed = google && (url.searchParams.has("X-Goog-Signature") || url.searchParams.has("Signature"));
    const firebaseParts = firebase ? /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname) : null;
    return { mechanism: firebase && url.searchParams.has("token") ? "firebase_download_token" : signed ? "gcs_signed_url" : google ? "gcs_url" : "external_or_application_url",
      host: url.hostname, path: url.pathname, ...(firebaseParts ? { bucket: firebaseParts[1], objectPath: decodeURIComponent(firebaseParts[2]) } : {}), digest: digest(value) };
  } catch { return { mechanism: "storage_path_or_invalid_url", digest: digest(value) }; }
}
