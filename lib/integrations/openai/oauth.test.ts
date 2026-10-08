import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { errors, type AdapterFactory, type AdapterPayload } from "oidc-provider";
import { ACCESS_TOKEN_TTL, IntegrationError, LESSON_CREATE_SCOPE, readIntegrationConfig, type IntegrationConfig } from "./config";
import { createOAuthHandler, handleOAuthRequest } from "./http";
import { authenticateMcp, createOAuthRuntime } from "./provider";
import { handleMcp, protectedResourceMetadata } from "./mcp";
import type { GrantBinding, OAuthServices } from "./services";
import { executeCreateLesson } from "./createLesson";

test("preview discovery diagnostics distinguish missing credentials without logging secrets or request content", async () => {
  const config = readIntegrationConfig(environment());
  const runtime = createOAuthRuntime(config, memoryServices(config).services);
  const oldEnvironment = process.env.VERCEL_ENV;
  const originalInfo = console.info;
  const messages: unknown[][] = [];
  process.env.VERCEL_ENV = "preview";
  console.info = (...args: unknown[]) => { messages.push(args); };
  try {
    const response = await handleMcp(new Request(`${config.origin}/api/mcp`, {
      method: "POST", body: JSON.stringify({ privateContent: "must-not-be-logged" }),
    }), runtime);
    assert.equal(response.status, 401);
    assert.deepEqual(messages, [["openai_mcp_discovery", JSON.stringify({
      event: "access_denied", status: 401, authorizationPresent: false, reason: "missing_or_malformed_bearer",
    })]]);
    messages.length = 0;
    const token = "private-token-must-not-be-logged";
    const invalid = await handleMcp(new Request(`${config.origin}/api/mcp`, {
      method: "POST", headers: { authorization: `Bearer ${token}` }, body: "private-request",
    }), runtime);
    assert.equal(invalid.status, 401);
    assert.deepEqual(messages, [["openai_mcp_discovery", JSON.stringify({
      event: "access_denied", status: 401, authorizationPresent: true, reason: "invalid_or_expired_token",
    })]]);
  } finally {
    console.info = originalInfo;
    if (oldEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnvironment;
  }
});

const privateJwk = { ...generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
function environment(origin = "http://127.0.0.1:3000") {
  return {
    NODE_ENV: "test", OPENAI_MCP_ENABLED: "true", OPENAI_MCP_ORIGIN: origin,
    OPENAI_OAUTH_CLIENT_ID: "private-chatgpt", OPENAI_OAUTH_REDIRECT_URIS_JSON: JSON.stringify([`${origin}/callback`]),
    OPENAI_MCP_ALLOWED_UIDS_JSON: '["firebase-alice"]', OPENAI_OAUTH_COOKIE_KEYS_JSON: JSON.stringify(["a".repeat(64)]),
    OPENAI_OAUTH_JWKS_JSON: JSON.stringify({ keys: [privateJwk] }),
  };
}

function memoryServices(config: IntegrationConfig) {
  const records = new Map<string, { payload: AdapterPayload; expiresAt: number }>();
  const bindings = new Map<string, GrantBinding>();
  const state = { disabled: false, tokensValidAfter: 0 };
  const adapter: AdapterFactory = (name) => {
    const key = (id: string) => `${name}:${id}`;
    const valid = (record: { payload: AdapterPayload; expiresAt: number } | undefined) =>
      record && record.expiresAt > Date.now() ? structuredClone(record.payload) : undefined;
    return {
      async upsert(id, payload, expiresIn = 86400) { records.set(key(id), { payload: structuredClone(payload), expiresAt: Date.now() + expiresIn * 1000 }); },
      async find(id) { return valid(records.get(key(id))); },
      async findByUid(uid) { return [...records.entries()].filter(([id]) => id.startsWith(`${name}:`)).map(([, record]) => valid(record)).find((payload) => payload?.uid === uid); },
      async findByUserCode(userCode) { return [...records.entries()].filter(([id]) => id.startsWith(`${name}:`)).map(([, record]) => valid(record)).find((payload) => payload?.userCode === userCode); },
      async consume(id) {
        const record = records.get(key(id));
        if (!record || record.payload.consumed) throw new errors.InvalidGrant();
        record.payload.consumed = Math.floor(Date.now() / 1000);
      },
      async destroy(id) { records.delete(key(id)); },
      async revokeByGrantId(grantId) { for (const [id, record] of records) if (record.payload.grantId === grantId) records.delete(id); },
    };
  };
  const services: OAuthServices = {
    adapter,
    async getIdentity(uid) { return !state.disabled && config.allowedUids.has(uid) ? { uid, tokensValidAfter: state.tokensValidAfter } : undefined; },
    async verifyFirebaseToken(token) {
      if (token !== "verified-firebase-token" || state.disabled) throw new IntegrationError("Invalid Firebase sign-in.", 401);
      return { uid: "firebase-alice", tokensValidAfter: state.tokensValidAfter, authTime: Math.floor(Date.now() / 1000) };
    },
    async saveBinding(id, binding) { bindings.set(id, binding); },
    async getBinding(id) { return bindings.get(id); },
    async revokeForUser(uid) { for (const binding of bindings.values()) if (binding.uid === uid) binding.revoked = true; },
    async checkRateLimit() {},
  };
  return { services, bindings, state, records };
}

async function fixture() {
  // The server must reserve a port before its canonical issuer can be configured.
  // eslint-disable-next-line prefer-const
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const config = readIntegrationConfig(environment(origin));
  const store = memoryServices(config);
  const runtime = createOAuthRuntime(config, store.services);
  handler = createOAuthHandler(runtime);
  const cookies = new Map<string, { value: string; path: string }>();
  async function request(path: string, init: RequestInit = {}) {
    const url = new URL(path, origin);
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...cookies.entries()].filter(([, cookie]) => url.pathname.startsWith(cookie.path)).map(([name, cookie]) => `${name}=${cookie.value}`).join("; "));
    const response = await handleOAuthRequest(new Request(url, { ...init, headers }), runtime);
    for (const cookie of response.headers.getSetCookie()) {
      const parts = cookie.split(";");
      const [name, ...value] = parts[0].split("=");
      const path = parts.find((part) => part.trim().toLowerCase().startsWith("path="))?.trim().slice(5) ?? "/";
      if (value.join("=")) cookies.set(name, { value: value.join("="), path }); else cookies.delete(name);
    }
    return response;
  }
  const verifier = "v".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = (overrides: Record<string, string> = {}) => `/api/oauth/auth?${new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUris[0], response_type: "code", scope: LESSON_CREATE_SCOPE,
    resource: config.resource, state: "unchanged-client-state", code_challenge: challenge, code_challenge_method: "S256", ...overrides,
  })}`;
  async function consent() {
    const response = await request(authorize());
    assert.equal(response.status, 303);
    const path = response.headers.get("location")!;
    const detailsResponse = await request(path, { headers: { Accept: "application/json" } });
    assert.equal(detailsResponse.status, 200, await detailsResponse.clone().text());
    const details = await detailsResponse.json() as { csrf: string };
    return { path, csrf: details.csrf };
  }
  async function approve() {
    const { path, csrf } = await consent();
    const result = await request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({
      action: "approve", csrf, idToken: "verified-firebase-token",
    }) });
    assert.equal(result.status, 200, await result.clone().text());
    const resume = await result.json() as { redirectTo: string };
    const final = await request(resume.redirectTo);
    assert.equal(final.status, 303, `${resume.redirectTo}: ${await final.clone().text()}`);
    const callback = new URL(final.headers.get("location")!);
    assert.equal(callback.searchParams.get("state"), "unchanged-client-state");
    assert.equal(callback.searchParams.get("iss"), config.issuer);
    assert.ok(callback.searchParams.get("code"), callback.href);
    return callback.searchParams.get("code")!;
  }
  const exchange = (code: string, codeVerifier = verifier, resource = config.resource) => request("/api/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId,
      redirect_uri: config.redirectUris[0], code, code_verifier: codeVerifier, resource }),
  });
  return { runtime, config, store, request, authorize, consent, approve, exchange,
    async close() { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

test("configuration is off by default and rejects unsafe origins, callbacks and missing allowlists", () => {
  assert.throws(() => readIntegrationConfig({}), (error) => error instanceof IntegrationError && error.status === 404);
  for (const override of [
    { OPENAI_MCP_ORIGIN: "http://example.com" }, { OPENAI_MCP_ORIGIN: "https://example.com/path" },
    { OPENAI_OAUTH_REDIRECT_URIS_JSON: '["https://chatgpt.com/callback#fragment"]' },
    { OPENAI_MCP_ALLOWED_UIDS_JSON: "[]" }, { OPENAI_OAUTH_COOKIE_KEYS_JSON: '["short"]' },
    { OPENAI_OAUTH_JWKS_JSON: '{"keys":[]}' },
  ]) assert.throws(() => readIntegrationConfig({ ...environment(), ...override }));
});

type RefreshTokens = { access_token: string; refresh_token: string; expires_in: number; scope: string };
function refresh(f: Awaited<ReturnType<typeof fixture>>, token: string, extra: Record<string, string> = {}) {
  return f.request("/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: f.config.clientId, refresh_token: token, ...extra }),
  });
}

test("refresh works after access expiry, rotates once, keeps UID/audience/scope and rejects replay for the whole grant", async () => {
  const f = await fixture();
  try {
    const first = await (await f.exchange(await f.approve())).json() as RefreshTokens;
    assert.ok(first.refresh_token);
    const originalRefresh = await f.runtime.provider.RefreshToken.find(first.refresh_token);
    assert.ok(originalRefresh);
    const boundedExpiry = originalRefresh.exp! - 3600;
    f.store.records.get(`RefreshToken:${originalRefresh.jti}`)!.payload.exp = boundedExpiry;
    const originalAccess = await f.runtime.provider.AccessToken.find(first.access_token);
    assert.ok(originalAccess);
    const record = f.store.records.get(`AccessToken:${originalAccess.jti}`)!;
    record.payload.exp = Math.floor(Date.now() / 1000) - 1;
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${first.access_token}`), IntegrationError);
    const response = await refresh(f, first.refresh_token);
    assert.equal(response.status, 200, await response.clone().text());
    const second = await response.json() as RefreshTokens;
    assert.notEqual(second.refresh_token, first.refresh_token);
    assert.equal(second.expires_in, ACCESS_TOKEN_TTL);
    assert.equal(second.scope, LESSON_CREATE_SCOPE);
    assert.deepEqual(await authenticateMcp(f.runtime, `Bearer ${second.access_token}`), { uid: "firebase-alice", scope: LESSON_CREATE_SCOPE });
    const rotated = await f.runtime.provider.RefreshToken.find(second.refresh_token);
    assert.ok(rotated);
    assert.equal(rotated.exp, boundedExpiry, "rotation cannot extend the original expiry");
    assert.equal(rotated.grantId, originalRefresh.grantId);
    assert.equal((await refresh(f, first.refresh_token)).status, 400);
    assert.equal((await refresh(f, second.refresh_token)).status, 400, "replay revokes the refresh family");
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${second.access_token}`), IntegrationError);
  } finally { await f.close(); }
});

test("refresh cannot expand scope or audience, and simultaneous retries issue at most one token pair", async () => {
  const f = await fixture();
  try {
    const first = await (await f.exchange(await f.approve())).json() as RefreshTokens;
    assert.equal((await refresh(f, first.refresh_token, { scope: "lessons:create lessons:read" })).status, 400);
    assert.equal((await refresh(f, first.refresh_token, { resource: "https://attacker.example/mcp" })).status, 400);
    assert.equal((await refresh(f, first.refresh_token, { client_id: "foreign-client" })).status, 401);
    // A rejected resource request can consume/revoke its family; use a new consent for the race.
    const race = await (await f.exchange(await f.approve())).json() as RefreshTokens;
    const responses = await Promise.all([refresh(f, race.refresh_token), refresh(f, race.refresh_token)]);
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    assert.equal(responses.filter(r => r.status === 400).length, 1);
  } finally { await f.close(); }
});

test("refresh denies revoked consent, disabled/removed users, Firebase revocation and expired binding/token", async () => {
  for (const reason of ["consent", "oauth", "disabled", "allowlist", "firebase", "binding", "token"] as const) {
    const f = await fixture();
    try {
      const first = await (await f.exchange(await f.approve())).json() as RefreshTokens;
      if (reason === "consent") await f.runtime.services.revokeForUser("firebase-alice");
      if (reason === "oauth") {
        const revoked = await f.request("/api/oauth/token/revocation", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: f.config.clientId, token: first.refresh_token, token_type_hint: "refresh_token" }),
        });
        assert.equal(revoked.status, 200);
        await assert.rejects(authenticateMcp(f.runtime, `Bearer ${first.access_token}`), IntegrationError);
      }
      if (reason === "disabled") f.store.state.disabled = true;
      if (reason === "allowlist") f.config.allowedUids = new Set();
      if (reason === "firebase") f.store.state.tokensValidAfter = Math.floor(Date.now() / 1000) + 1;
      if (reason === "binding") for (const binding of f.store.bindings.values()) binding.expiresAt = 1;
      if (reason === "token") {
        const token = await f.runtime.provider.RefreshToken.find(first.refresh_token);
        assert.ok(token);
        f.store.records.get(`RefreshToken:${token.jti}`)!.payload.exp = 1;
      }
      const response = await refresh(f, first.refresh_token);
      assert.equal(response.status, 400, `${reason}: ${await response.clone().text()}`);
      assert.equal((await response.json()).error, "invalid_grant", reason);
    } finally { await f.close(); }
  }
});

test("a second browser consent does not invalidate an active delegation; explicit revocation still does", async () => {
  const f = await fixture();
  try {
    const first = await (await f.exchange(await f.approve())).json() as { access_token: string };
    assert.equal((await authenticateMcp(f.runtime, `Bearer ${first.access_token}`)).uid, "firebase-alice");
    const second = await f.exchange(await f.approve());
    assert.equal(second.status, 200);
    // Browser session state can be replaced or removed while the explicit grant remains valid.
    for (const key of f.store.records.keys()) if (key.startsWith("Session:")) f.store.records.delete(key);
    assert.equal((await authenticateMcp(f.runtime, `Bearer ${first.access_token}`)).uid, "firebase-alice");
    await f.runtime.services.revokeForUser("firebase-alice");
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${first.access_token}`), (error) =>
      error instanceof IntegrationError && error.status === 401);
  } finally { await f.close(); }
});

test("discovery advertises only lessons:create, PKCE S256 and the canonical resource", async () => {
  const f = await fixture();
  try {
    const response = await f.request("/api/oauth/.well-known/oauth-authorization-server");
    const metadata = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.deepEqual(metadata.scopes_supported, [LESSON_CREATE_SCOPE]);
    assert.deepEqual(metadata.grant_types_supported, ["authorization_code", "refresh_token"]);
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);
    assert.equal(metadata.issuer, f.config.issuer);
    assert.equal(metadata.registration_endpoint, undefined);
    assert.equal(metadata.userinfo_endpoint, undefined);
    assert.equal(protectedResourceMetadata(f.config).resource, f.config.resource);
    const keys = await (await f.request("/api/oauth/jwks")).json() as { keys: Record<string, unknown>[] };
    assert.ok(keys.keys.length);
    assert.ok(keys.keys.every((key) => !key.d && !key.p && !key.q));
  } finally { await f.close(); }
});

test("authorization rejects extra scopes, wrong resource, missing PKCE and unregistered callbacks", async () => {
  const f = await fixture();
  try {
    const invalidRequests: Record<string, string>[] = [
      { scope: "lessons:create lessons:read" }, { resource: "https://attacker.example/mcp" },
      { code_challenge: "", code_challenge_method: "" }, { code_challenge_method: "plain" },
      { redirect_uri: "https://attacker.example/callback" },
    ];
    for (const overrides of invalidRequests) {
      const response = await f.request(f.authorize(overrides));
      assert.ok(response.status >= 400 || response.headers.get("location")?.includes("error="));
      assert.ok(!response.headers.get("location")?.includes("/interaction/"));
    }
  } finally { await f.close(); }
});

test("consent rejects cross-origin, CSRF, invalid Firebase proof and caller-supplied UID", async () => {
  const f = await fixture();
  try {
    const { path, csrf } = await f.consent();
    for (const [origin, body, status] of [
      ["https://attacker.example", { action: "approve", csrf, idToken: "verified-firebase-token" }, 403],
      [f.config.origin, { action: "approve", csrf: "bad", idToken: "verified-firebase-token" }, 403],
      [f.config.origin, { action: "approve", csrf, idToken: "forged" }, 401],
      [f.config.origin, { action: "approve", csrf, idToken: "verified-firebase-token", uid: "victim" }, 400],
    ] as const) {
      const response = await f.request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
      assert.equal(response.status, status);
    }
    assert.equal(f.store.bindings.size, 0);
  } finally { await f.close(); }
});

test("real code+PKCE exchange binds only verified Firebase UID and exposes only createLesson", async () => {
  const f = await fixture();
  try {
    const code = await f.approve();
    assert.equal((await f.exchange(code, "wrong-verifier")).status, 400);
    const response = await f.exchange(code);
    assert.equal(response.status, 200, await response.clone().text());
    const tokens = await response.json() as { access_token: string; expires_in: number; scope: string; refresh_token?: string; id_token?: string };
    assert.equal(tokens.expires_in, ACCESS_TOKEN_TTL);
    assert.equal(tokens.scope, LESSON_CREATE_SCOPE);
    assert.ok(tokens.refresh_token);
    assert.equal(tokens.id_token, undefined);
    assert.deepEqual(await authenticateMcp(f.runtime, `Bearer ${tokens.access_token}`), { uid: "firebase-alice", scope: LESSON_CREATE_SCOPE });
    let calls = 0;
    const mcp = (method: string, params?: object, authenticated = true, execute = executeCreateLesson) => handleMcp(new Request(f.config.resource, {
      method: "POST", headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json",
        ...(authenticated ? { Authorization: `Bearer ${tokens.access_token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    }), f.runtime, execute);
    const initialize = await mcp("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(initialize.status, 200, await initialize.clone().text());
    const list = await mcp("tools/list");
    const tools = (await list.json()).result.tools;
    assert.deepEqual(tools.map((tool: { name: string }) => tool.name), ["createLesson"]);
    assert.deepEqual(tools[0]._meta.securitySchemes, [{ type: "oauth2", scopes: [LESSON_CREATE_SCOPE] }]);
    const call = await mcp("tools/call", { name: "createLesson", arguments: {} });
    assert.equal((await call.json()).result.isError, true, "invalid input must fail before storage");
    const execute: typeof executeCreateLesson = async (identity) => {
      calls++; assert.deepEqual(identity, { uid: "firebase-alice", scope: LESSON_CREATE_SCOPE });
      return { lessonId: "draft-id", title: "Draft", editorUrl: `${f.config.origin}/nb/producer/draft-id`, status: "draft" };
    };
    const saved = await mcp("tools/call", { name: "createLesson", arguments: { idempotencyKey: "save-request-123456", lesson: { title: "Draft", sourceText: "Text" } } }, true, execute);
    assert.equal((await saved.json()).result.structuredContent.lessonId, "draft-id");
    const foreignTool = await mcp("tools/call", { name: "getLesson", arguments: {} }, true, execute);
    assert.equal((await foreignTool.json()).result.isError, true);
    assert.equal(calls, 1);
    assert.equal((await mcp("tools/call", { name: "createLesson", arguments: {} }, false, execute)).status, 401);
    assert.equal(calls, 1);
    const unauthorized = await mcp("tools/list", undefined, false);
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate")!, /oauth-protected-resource/);
    f.store.state.disabled = true;
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${tokens.access_token}`), IntegrationError);
    f.store.state.disabled = false;
    f.store.state.tokensValidAfter = Math.floor(Date.now() / 1000) + 1;
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${tokens.access_token}`), IntegrationError);
    f.store.state.tokensValidAfter = 0;
    await f.store.services.revokeForUser("firebase-alice");
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${tokens.access_token}`), IntegrationError);
    assert.equal((await f.exchange(code)).status, 400);
  } finally { await f.close(); }
});

test("revoked pending grants cannot issue tokens and parallel code exchange succeeds at most once", async () => {
  const f = await fixture();
  try {
    const revokedCode = await f.approve();
    await f.store.services.revokeForUser("firebase-alice");
    assert.notEqual((await f.exchange(revokedCode)).status, 200);
    const code = await f.approve();
    const responses = await Promise.all([f.exchange(code), f.exchange(code)]);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
  } finally { await f.close(); }
});

test("opaque token checks reject wrong audience, missing scope, expiry, foreign binding and OAuth revocation", async () => {
  const f = await fixture();
  try {
    const response = await f.exchange(await f.approve());
    const { access_token: token } = await response.json() as { access_token: string };
    const record = f.store.records.get(`AccessToken:${token}`)!;
    const original = structuredClone(record.payload);
    for (const changes of [{ aud: "https://other.example/mcp" }, { scope: "lessons:read" }, { exp: 1 }, { clientId: "other-client" }, { accountId: "foreign-user" }]) {
      record.payload = { ...original, ...changes };
      await assert.rejects(authenticateMcp(f.runtime, `Bearer ${token}`), IntegrationError);
    }
    record.payload = original;
    await authenticateMcp(f.runtime, `Bearer ${token}`);
    const revoke = await f.request("/api/oauth/token/revocation", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: f.config.clientId, token, token_type_hint: "access_token" }),
    });
    assert.equal(revoke.status, 200);
    await assert.rejects(authenticateMcp(f.runtime, `Bearer ${token}`), IntegrationError);
  } finally { await f.close(); }
});
