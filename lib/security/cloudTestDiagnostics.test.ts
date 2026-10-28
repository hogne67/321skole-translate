import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudTestErrorSummary } from "./cloudTestDiagnostics";

test("API-disabled diagnosis keeps only known provider fields", () => {
  const result = cloudTestErrorSummary({ response: { status: 403, config: { headers: { Authorization: "synthetic-secret" } }, data: { error: {
    message: "synthetic-secret", details: [{ reason: "SERVICE_DISABLED", metadata: { service: "firebaserules.googleapis.com", activationUrl: "https://synthetic.invalid/synthetic-secret" } }],
  } } } });
  assert.deepEqual(result, { status: 403, unavailable: true, diagnostics: [{ reason: "SERVICE_DISABLED", service: "firebaserules.googleapis.com" }] });
  assert.ok(!JSON.stringify(result).includes("synthetic-secret"));
});
test("known Storage permissions can be classified without printing a message", () => {
  assert.deepEqual(cloudTestErrorSummary({ response: { status: 403, data: { error: { message: "synthetic-secret lacks 'storage.buckets.getIamPolicy'" } } } }),
    { status: 403, unavailable: true, mentionedPermissions: ["storage.buckets.getIamPolicy"] });
});
test("unknown fields and unstructured exceptions remain redacted", () => {
  for (const error of [new Error("synthetic-secret"), { response: { data: { error: { details: [{ reason: "synthetic-secret", metadata: { service: "synthetic-secret", permission: "synthetic-secret" } }] } } } }]) {
    assert.deepEqual(cloudTestErrorSummary(error), { status: null, unavailable: true });
  }
});
