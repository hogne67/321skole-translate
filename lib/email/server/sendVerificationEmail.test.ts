import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type { SendEmailInput } from "../resend";
import { buildVerificationEmail } from "../verificationEmail";
import { sendAccountVerificationEmail, VerificationEmailError } from "./sendVerificationEmail";
import { handleVerificationEmail } from "./verificationHandler";

function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const sent: SendEmailInput[] = [];
  const links: { email: string; url?: string }[] = [];
  const user = { uid: "fred", email: "fred@example.com", displayName: "Fred <Hansen>", emailVerified: false, disabled: false };
  let queue = Promise.resolve();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => ({ data: () => records.get(`${name}/${id}`) }) }),
      add: async (data: Record<string, unknown>) => { records.set(`${name}/log`, data); },
    }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => {
      const run = queue.then(() => fn({
        get: async (ref: { path: string }) => ({ get: (key: string) => records.get(ref.path)?.[key] }),
        set: (ref: { path: string }, data: Record<string, unknown>) => { records.set(ref.path, data); },
      }));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as Firestore;
  const auth: Pick<Auth, "getUser" | "generateEmailVerificationLink"> = {
    getUser: async uid => { assert.equal(uid, "fred"); return user as UserRecord; },
    generateEmailVerificationLink: async (email, settings) => {
      links.push({ email, url: settings?.url });
      return "https://example.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=one-time&apiKey=test";
    },
  };
  const deps = { db, auth, configured: true, baseUrl: "https://321school.com",
    send: async (mail: SendEmailInput) => { sent.push(mail); return { ok: true as const }; } };
  return { records, sent, links, user, deps, input: { uid: "fred", locale: "nb" } };
}

test("recipient and name come from Firebase Auth; exact Firebase verification link reaches HTML and plain text", async () => {
  const f = fixture();
  f.records.set("users/fred", { email: "administrator@example.com", displayName: "Wrong profile name" });
  await sendAccountVerificationEmail(f.input, f.deps);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, "fred@example.com");
  assert.deepEqual(f.links, [{ email: "fred@example.com", url: "https://321school.com/nb/login?verified=1" }]);
  assert.match(f.sent[0].html, /Fred &lt;Hansen&gt;/);
  assert.match(f.sent[0].html, /oobCode=one-time&amp;apiKey=test/);
  assert.match(f.sent[0].text!, /oobCode=one-time&apiKey=test/);
  assert.equal(f.records.get("emailLogs/log")?.status, "sent");
  assert.ok(!JSON.stringify([...f.records]).includes("one-time"));
  assert.equal(f.user.emailVerified, false);
});

test("verified, disabled and email-less accounts never receive a verification email", async () => {
  for (const changes of [{ emailVerified: true }, { disabled: true }, { email: "" }]) {
    const f = fixture(); Object.assign(f.user, changes);
    if (f.user.emailVerified) assert.equal((await sendAccountVerificationEmail(f.input, f.deps)).alreadyVerified, true);
    else await assert.rejects(sendAccountVerificationEmail(f.input, f.deps), /unauthorized/);
    assert.equal(f.sent.length, 0); assert.equal(f.links.length, 0);
  }
});

test("concurrent requests share one reservation and cannot send twice", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    sendAccountVerificationEmail(f.input, f.deps), sendAccountVerificationEmail(f.input, f.deps),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.sent.length, 1);
  const rejected = results.find(r => r.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof VerificationEmailError && rejected.reason.status === 429);
  f.records.set("emailVerificationRequests/fred", { lastAttemptAt: Timestamp.fromMillis(Date.now() - 61_000) });
  await sendAccountVerificationEmail(f.input, f.deps);
  assert.equal(f.sent.length, 2);
});

test("missing configuration and provider failure never report success; logging failure cannot undo accepted email", async () => {
  const f = fixture();
  await assert.rejects(sendAccountVerificationEmail(f.input, { ...f.deps, configured: false }), /email_not_configured/);
  assert.equal(f.records.size, 0);
  await assert.rejects(sendAccountVerificationEmail(f.input, { ...f.deps, send: async () => ({ ok: false, reason: "send_failed" }) }), /send_failed/);
  assert.equal(f.records.get("emailLogs/log")?.status, "failed");
  const g = fixture();
  const originalCollection = g.deps.db.collection.bind(g.deps.db);
  g.deps.db.collection = ((name: string) => name === "emailLogs"
    ? { add: async () => { throw new Error("logging unavailable"); } } : originalCollection(name)) as Firestore["collection"];
  assert.equal((await sendAccountVerificationEmail(g.input, g.deps)).ok, true);
  assert.equal(g.sent.length, 1);
});

test("legacy parent endpoint keeps its parent restriction", async () => {
  const f = fixture();
  await assert.rejects(sendAccountVerificationEmail({ ...f.input, parentOnly: true }, f.deps), /not_parent/);
  f.records.set("users/fred", { roles: { parent: true } });
  await sendAccountVerificationEmail({ ...f.input, parentOnly: true }, f.deps);
  assert.equal(f.sent.length, 1);
});

test("all languages contain usable verification links and neutral account wording", () => {
  for (const locale of ["nb", "en", "pt"]) {
    const mail = buildVerificationEmail({ locale, displayName: "", verifyUrl: "https://example.com/verify?code=test" });
    assert.ok(mail.subject); assert.match(mail.html, /href="https:\/\/example.com\/verify\?code=test"/);
    assert.match(mail.text, /https:\/\/example.com\/verify\?code=test/);
    assert.ok(!mail.html.includes("undefined"));
  }
});

test("API rejects missing/invalid tokens, anonymous callers and client-selected recipients", async () => {
  let sends = 0;
  const deps = {
    verifyToken: async () => ({ uid: "fred", anonymous: false }),
    send: async (input: { uid: string; locale?: string; parentOnly?: boolean }) => {
      sends++; assert.deepEqual(input, { uid: "fred", locale: "en", parentOnly: false });
      return { ok: true as const, alreadyVerified: false };
    },
  };
  const request = (body: unknown, token = "test-token") => new Request("https://321school.com/api/email/verification", {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal((await handleVerificationEmail(request({}, ""), false, deps)).status, 401);
  assert.equal((await handleVerificationEmail(request({}), false, { ...deps, verifyToken: async () => { throw new Error("invalid"); } })).status, 401);
  assert.equal((await handleVerificationEmail(request({}), false, { ...deps, verifyToken: async () => ({ uid: "anon", anonymous: true }) })).status, 401);
  for (const body of [{ email: "someone@example.com" }, { uid: "admin" }, { locale: "xx" }, null, []]) {
    assert.equal((await handleVerificationEmail(request(body), false, deps)).status, 400);
  }
  assert.equal(sends, 0);
  assert.equal((await handleVerificationEmail(request({ locale: "en" }), false, deps)).status, 200);
  assert.equal(sends, 1);
  const response = await handleVerificationEmail(request({}), false, { ...deps,
    send: async () => { throw new VerificationEmailError("too_many_attempts", 429); } });
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "60");
});
