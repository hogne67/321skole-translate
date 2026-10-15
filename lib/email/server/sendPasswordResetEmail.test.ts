import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth, UserRecord } from "firebase-admin/auth";
import { sendPasswordResetEmail } from "./sendPasswordResetEmail";
import { handlePasswordReset } from "./passwordResetHandler";
import { buildPasswordResetEmail } from "../passwordResetEmail";
import { requestPasswordReset } from "../passwordResetClient";
import type { SendEmailInput } from "../resend";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const sent: SendEmailInput[] = [];
  const links: { email: string; url?: string }[] = [];
  const user = { uid: "fred", email: "Fred@example.com", disabled: false };
  let lookups = 0; let queue = Promise.resolve();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }),
      add: async (data: Record<string, unknown>) => { records.set(`${name}/log`, data); } }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => {
      const run = queue.then(() => fn({
        get: async (ref: { path: string }) => ({ get: (key: string) => records.get(ref.path)?.[key] }),
        set: (ref: { path: string }, data: Record<string, unknown>) => { records.set(ref.path, data); },
      }));
      queue = run.then(() => undefined, () => undefined); return run;
    },
  } as unknown as Firestore;
  const auth: Pick<Auth, "getUserByEmail" | "generatePasswordResetLink"> = {
    getUserByEmail: async () => { lookups++; return user as UserRecord; },
    generatePasswordResetLink: async (email, settings) => {
      links.push({ email, url: settings?.url });
      return "https://example.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=opaque-reset-code&apiKey=test";
    },
  };
  const deps = { db, auth, configured: true, baseUrl: "https://321school.com", send: async (mail: SendEmailInput) => {
    sent.push(mail); return { ok: true as const };
  } };
  return { records, sent, links, user, lookups: () => lookups, deps,
    input: { email: " FRED@example.com ", locale: "nb", clientKey: "203.0.113.5" } };
}

test("sends Firebase reset link via existing mail transport to the Auth account; logs no reset code", async () => {
  const f = fixture(); await sendPasswordResetEmail(f.input, f.deps);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].to, "Fred@example.com");
  assert.deepEqual(f.links, [{ email: "Fred@example.com", url: "https://321school.com/nb/login?reset=1" }]);
  assert.match(f.sent[0].subject, /Tilbakestill passordet ditt/);
  assert.match(f.sent[0].html, /mode=resetPassword&amp;oobCode=opaque-reset-code/);
  assert.match(f.sent[0].text!, /mode=resetPassword&oobCode=opaque-reset-code/);
  assert.equal(f.records.get("emailLogs/log")?.status, "sent");
  assert.ok(!JSON.stringify([...f.records]).includes("opaque-reset-code"));
  assert.ok([...f.records.keys()].every(key => !key.includes("@") && !key.includes(f.input.clientKey)));
});

test("unknown and disabled accounts receive no email and no account details escape the service", async () => {
  for (const disabled of [false, true]) {
    const f = fixture(); f.user.disabled = disabled;
    const deps = disabled ? f.deps : { ...f.deps, auth: { ...f.deps.auth,
      getUserByEmail: async () => { throw Object.assign(new Error("Unknown"), { code: "auth/user-not-found" }); } } };
    assert.equal(await sendPasswordResetEmail(f.input, deps), undefined);
    assert.equal(f.sent.length, 0); assert.equal(f.links.length, 0);
  }
});

test("concurrent requests and repeat clicks send one reset email, with a new send allowed after cooldown", async () => {
  const f = fixture();
  await Promise.all([sendPasswordResetEmail(f.input, f.deps), sendPasswordResetEmail(f.input, f.deps)]);
  assert.equal(f.sent.length, 1); assert.equal(f.lookups(), 1);
  f.records.set(`passwordResetRequests/email-${hash("fred@example.com")}`, { lastAttemptAt: Timestamp.fromMillis(Date.now() - 61_000) });
  await sendPasswordResetEmail(f.input, f.deps); assert.equal(f.sent.length, 2);
});

test("client rate limit is reserved before account lookup and resets after its time window", async () => {
  const f = fixture(); const clientPath = `passwordResetRequests/client-${hash(f.input.clientKey)}`;
  f.records.set(clientPath, { count: 30, windowStart: Timestamp.now() });
  await sendPasswordResetEmail(f.input, f.deps); assert.equal(f.lookups(), 0); assert.equal(f.sent.length, 0);
  f.records.set(clientPath, { count: 30, windowStart: Timestamp.fromMillis(Date.now() - 16 * 60_000) });
  await sendPasswordResetEmail(f.input, f.deps); assert.equal(f.sent.length, 1);
});

test("provider failures are logged as failures, not accepted sends", async () => {
  const f = fixture(); await sendPasswordResetEmail(f.input, { ...f.deps,
    send: async () => ({ ok: false, reason: "send_failed" }) });
  assert.equal(f.records.get("emailLogs/log")?.status, "failed");
});

test("password reset email uses a public return address even from localhost", async () => {
  const f = fixture(); await sendPasswordResetEmail(f.input, { ...f.deps, baseUrl: "http://localhost:3000" });
  assert.equal(f.links[0].url, "https://321school.com/nb/login?reset=1");
});

test("public API validates requests and acknowledges before account lookup, with no account enumeration", async () => {
  const tasks: (() => Promise<void>)[] = []; const calls: Parameters<typeof sendPasswordResetEmail>[0][] = [];
  const deps = { configured: true, schedule: (task: () => Promise<void>) => { tasks.push(task); },
    send: async (input: Parameters<typeof sendPasswordResetEmail>[0]) => { calls.push(input); } };
  const request = (body: unknown) => new Request("https://321school.com/api/email/password-reset", {
    method: "POST", headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.5" }, body: JSON.stringify(body),
  });
  for (const email of ["known@example.com", "unknown@example.com"]) {
    const response = await handlePasswordReset(request({ email, locale: "nb" }), deps);
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(calls.length, 0); await Promise.all(tasks.map(task => task())); assert.equal(calls.length, 2);
  assert.equal(calls[0].clientKey, "203.0.113.5");
  for (const body of [null, [], {}, { email: "invalid" }, { email: "a@example.com", locale: "xx" },
    { email: "a@example.com", resetUrl: "https://attacker.example" }, { email: "a@example.com", password: "never-accepted" }]) {
    assert.equal((await handlePasswordReset(request(body), deps)).status, 400);
  }
  assert.equal((await handlePasswordReset(request({ email: "a@example.com" }), { ...deps, configured: false })).status, 503);
  assert.equal(tasks.length, 2);
});

test("all supported languages have matching HTML and plain-text reset links", () => {
  for (const locale of ["nb", "en", "pt"]) {
    const mail = buildPasswordResetEmail({ locale, resetUrl: "https://example.com/?mode=resetPassword&code=test" });
    assert.match(mail.html, /mode=resetPassword&amp;code=test/);
    assert.match(mail.text, /mode=resetPassword&code=test/);
    assert.ok(mail.subject); assert.ok(!mail.html.includes("undefined"));
  }
});

test("shared browser client uses the server API and does not report failed requests as accepted", async () => {
  const originalFetch = globalThis.fetch; const requests: { url: string; body: unknown }[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(String(options?.body)) });
      return Response.json({ ok: true }, { status: 202 });
    };
    await requestPasswordReset(" a@example.com ", "nb");
    assert.deepEqual(requests, [{ url: "/api/email/password-reset", body: { email: "a@example.com", locale: "nb" } }]);
    globalThis.fetch = async () => Response.json({ ok: false }, { status: 503 });
    await assert.rejects(requestPasswordReset("a@example.com", "nb"), /password_reset_unavailable/);
  } finally { globalThis.fetch = originalFetch; }
});
