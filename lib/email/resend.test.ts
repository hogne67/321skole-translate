import assert from "node:assert/strict";
import test from "node:test";
import { sendEmail } from "./resend";

test("email transport sends base64 PDF and plain text without changing HTML-only callers", async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = process.env.RESEND_API_KEY;
  const fromBefore = process.env.MAIL_FROM;
  process.env.RESEND_API_KEY = "re_test_fixture_1234567890";
  process.env.MAIL_FROM = "321school <test@example.com>";
  const payloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response('{"id":"test-message-id"}', { status: 200 });
  };
  try {
    const email = { to: "recipient@example.com", subject: "Invitation", html: "<p>Hello</p>" };
    assert.deepEqual(await sendEmail({ ...email, text: "Hello", attachments: [{ filename: "invitation.pdf", content: "JVBERi0=", contentType: "application/pdf" }] }), { ok: true });
    assert.deepEqual(payloads[0].attachments, [{ filename: "invitation.pdf", content: "JVBERi0=", content_type: "application/pdf" }]);
    assert.equal(payloads[0].text, "Hello");
    await sendEmail(email);
    assert.equal("attachments" in payloads[1], false); assert.equal("text" in payloads[1], false);
  } finally {
    globalThis.fetch = fetchBefore;
    if (keyBefore === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = keyBefore;
    if (fromBefore === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = fromBefore;
  }
});
