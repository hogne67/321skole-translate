import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFile, describeLink, digest, reconcile, type ApprovalLedger, type AuthorityRecord } from "./reconciliation";
import { planFileMigration } from "./migrationPlan";

const record: AuthorityRecord = { uid: "synthetic-admin", source: "profile", fields: { role: "admin", roles: { admin: true }, adminLevel: "superadmin" } };
const ledger: ApprovalLedger = { projectId: "demo-security-round1b", complete: true, approvedBy: "synthetic-owner", approvedAt: "2026-10-15T00:00:00Z",
  assignments: [{ ...record, approvedBy: "synthetic-owner", evidence: "synthetic-approval-001" }] };
test("missing independent approval is unverified, never automatically revoked", () => {
  const copy = structuredClone(record);
  const result = reconcile([record], undefined, ledger.projectId);
  assert.equal(result.automaticChanges, false);
  assert.equal(result.findings[0].kind, "unverified_assignment");
  assert.deepEqual(record, copy);
});
test("exact independently approved rights match; an added privilege or different school is a deviation", () => {
  assert.deepEqual(reconcile([record], ledger, ledger.projectId).findings, []);
  const changed = { ...record, fields: { ...record.fields, schoolId: "foreign-school", schoolRole: "school_admin" } };
  assert.equal(reconcile([changed], ledger, ledger.projectId).findings.length, 2);
  const extra = { ...record, uid: "unapproved" };
  assert.equal(reconcile([extra], ledger, ledger.projectId).findings[0].kind, "unexpected_assignment");
});
test("wrong project, duplicate approvals and missing evidence cannot authorize grants", () => {
  assert.throws(() => reconcile([record], ledger, "production"));
  assert.throws(() => reconcile([record], { ...ledger, assignments: [...ledger.assignments, ...ledger.assignments] }, ledger.projectId));
  assert.throws(() => reconcile([record], { ...ledger, assignments: [{ ...ledger.assignments[0], evidence: "" }] }, ledger.projectId));
});
test("expired and missing grants, disabled accounts and type mismatches require manual review", () => {
  const expired = { ...ledger, assignments: [{ ...ledger.assignments[0], expiresAt: "2020-01-01" }] };
  assert.equal(reconcile([record], expired, ledger.projectId).findings[0].kind, "expired_approval");
  assert.equal(reconcile([], ledger, ledger.projectId).findings[0].kind, "approved_assignment_missing");
  assert.ok(reconcile([{ ...record, fields: { ...record.fields, disabled: true } }], ledger, ledger.projectId).findings.some(f => f.kind === "disabled_account_with_stored_authority"));
  assert.ok(reconcile([{ ...record, fields: { ...record.fields, roles: { admin: "true" } } }], ledger, ledger.projectId).findings.some(f => f.field === "roles.admin"));
});
test("ordinary signup roles and free-plan defaults do not invent privileged assignments", () => {
  assert.deepEqual(reconcile([{ uid: "pupil", source: "profile", fields: { role: "student", roles: { student: true }, plan: "free", disabled: false } }], undefined, ledger.projectId).findings, []);
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
});
test("file inventory identifies private audio, public student images and unclassified covers", () => {
  assert.equal(classifyFile("spaces/room/assignments/task/submissions/pupil/audio/test.webm").protectedFile, true);
  const image = classifyFile("covers/pupil/writing-print-room/task/test.webp", { metadata: { firebaseStorageDownloadTokens: "secret-1,secret-2" } });
  assert.equal(image.tokenCount, 2);
  assert.equal(image.publicRule, true);
  assert.ok(image.actions.includes("copy_to_private_namespace_and_rewrite_references"));
  assert.ok(!JSON.stringify(image).includes("secret"));
  assert.deepEqual(classifyFile("covers/teacher/some-art.webp").actions, ["manual_content_classification"]);
  assert.equal(classifyFile("covers/pupil/generated.webp", { metadata: { context: "student_writing_print", spaceId: "room" } }).protectedFile, true);
});
test("link inventory distinguishes mechanisms and never retains bearer tokens, signatures or inline files", () => {
  for (const [url, mechanism] of [
    ["https://firebasestorage.googleapis.com/v0/b/demo/o/private?alt=media&token=synthetic-secret", "firebase_download_token"],
    ["https://storage.googleapis.com/demo/private?X-Goog-Signature=synthetic-secret", "gcs_signed_url"],
    ["https://example.invalid/file?token=synthetic-secret", "external_or_application_url"],
    ["data:audio/webm;base64,synthetic-secret", "inline_file"],
  ]) {
    const description = describeLink(url);
    assert.equal(description.mechanism, mechanism);
    assert.ok(!JSON.stringify(description).includes("synthetic-secret"));
  }
});
test("migration plan is deterministic, non-executable and blocks unscoped or unmapped files", () => {
  const objects = [{ path: "spaces/room/assignments/task/submissions/pupil/audio/test.webm", generation: "1", metageneration: "2", spaceId: "room", protectedFile: true, publicRule: false, tokenCount: 1 }];
  const copy = structuredClone(objects);
  const links = [{ document: "spaceSubmissions/test", field: "audioReading.storagePath", digest: digest(objects[0].path) }];
  const plan = planFileMigration("demo-test", "demo-test.appspot.com", objects, links);
  assert.equal(plan.automaticChanges, false);
  assert.equal(plan.executable, false);
  assert.equal(plan.summary.filesWithKnownReferences, 1);
  assert.deepEqual(plan.items[0].blockers, ["reference_update_time_refresh_required", "private_asset_scope_requires_manual_mapping"]);
  assert.ok(plan.items[0].proposedDestination?.startsWith("private-space-files/room/"));
  assert.deepEqual(objects, copy);
  assert.deepEqual(plan, planFileMigration("demo-test", "demo-test.appspot.com", objects, links));
  const blocked = planFileMigration("demo-test", "demo-test.appspot.com", [{ ...objects[0], spaceId: null }], []);
  assert.equal(blocked.items[0].blockers.length, 3);
});
