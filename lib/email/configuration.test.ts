import assert from "node:assert/strict";
import { test } from "node:test";
import { getEmailConfiguration } from "./configuration";

test("missing email setup identifies the missing settings", () => {
  assert.deepEqual(getEmailConfiguration({}), { configured: false, missing: ["RESEND_API_KEY", "MAIL_FROM"], invalid: [] });
});

test("a populated placeholder key must not count as a configured sender", () => {
  assert.deepEqual(getEmailConfiguration({ RESEND_API_KEY: "...", MAIL_FROM: "321school <mail@example.com>" }), { configured: false, missing: [], invalid: ["RESEND_API_KEY"] });
});

test("configuration supports named senders and trims whitespace without exposing values", () => {
  const result = getEmailConfiguration({ RESEND_API_KEY: " re_test_fixture_1234567890 ", MAIL_FROM: " 321school <mail@example.com> " });
  assert.deepEqual(result, { configured: true, missing: [], invalid: [] });
  assert.ok(!JSON.stringify(result).includes("re_test_fixture"));
});

test("an invalid sender is reported separately from a missing API key", () => {
  assert.deepEqual(getEmailConfiguration({ MAIL_FROM: "321school" }), { configured: false, missing: ["RESEND_API_KEY"], invalid: ["MAIL_FROM"] });
});
