# Private OpenAI integration

Phase 1 OAuth is deployed to staging; see [STAGING.md](./STAGING.md). Phase 2 adds exactly one tool, `createLesson`; see [PHASE2.md](./PHASE2.md). Production has not been deployed. The integration is OFF unless explicitly enabled.

## Component choice

- `oidc-provider` 9.12.2 is the maintained v9 OAuth/OIDC authorization server. It owns protocol parsing, metadata, code generation/exchange, PKCE S256, token issuance and OAuth revocation. Firebase is its only account source. No credentials or users are migrated to another identity database.
- `srvx` 1.0.5 bridges the Node HTTP callback into an App Router route without starting another server. Its `fetchNodeHandler` API is marked experimental upstream; the version is pinned and the complete OAuth flow is tested through this adapter. Staging verification on Vercel is required before any production rollout.
- The MCP TypeScript SDK 1.32.1 supplies stateless Streamable HTTP. Phase 2 advertises only `createLesson`. JSON responses avoid long-lived streams or process-local sessions.
- Better Auth's provider is integrated with its own user/session layer; Hydra would add another server/storage deployment. Those are more infrastructure than this Firebase-only private prototype needs.

Sources checked 2026-10-05:

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://github.com/panva/node-oidc-provider
- https://better-auth.com/docs/plugins/oauth-provider
- https://www.ory.com/docs/network/hydra
- https://srvx.h3.dev/guide/node

## Authentication and security

One manually registered public OAuth client uses `authorization_code`, PKCE S256, rotating `refresh_token` grants and exact configured callback URLs. There is no public client registration, client credentials flow, userinfo endpoint or additional permission scope. Discovery advertises only `lessons:create` (OAuth delegation, not a separate OIDC login to 321school). See [REFRESH-TOKENS.md](./REFRESH-TOKENS.md) for the bounded renewal policy and reconnect requirements.

The provider stores a browser-bound interaction using signed, HttpOnly cookies. Its login/consent page routes the user through existing Firebase Google/Feide/email login when needed. On an explicit approval, the backend verifies a Firebase ID token with `verifyIdToken(token, true)`, rejects anonymous, missing, disabled and non-allowlisted accounts, and sets the provider account ID to that verified Firebase UID. A second server-only grant binding records UID, client ID, original Firebase auth time and expiry. No UID, email or roles supplied by ChatGPT are accepted as identity.

Access tokens are **opaque**, with provider-managed state containing the exact MCP audience and a five-minute expiry. The provider resolves and validates tokens on every MCP request, followed by checks of audience, registered client, exact scope, live grant, binding and Firebase account. No ID token is emitted. The OAuth issuer is the configured provider and tokens are resolved only through that provider's private storage; this is not JWT validation of externally supplied Firebase tokens at `/api/mcp`.

Delegation lifetime is independent of the provider's browser session (`expiresWithSession: false`). A subsequent consent/browser session replacement must not accidentally invalidate an active five-minute token. Explicit delegation/token revocation, expiry, the allowlist and live Firebase identity checks remain authoritative; signing out of only a browser's local Firebase session is not a delegation revocation.

Disabling a Firebase user, removing it from the prototype allowlist, setting its profile `disabled`, revoking Firebase refresh tokens (`tokensValidAfterTime`) or revoking the delegation denies subsequent MCP calls. No positive authorization cache is used. OAuth token revocation is also available through the library. The account page can revoke all existing delegations for its UID; this includes pending authorization codes through binding checks at token issuance.

Consent requires same origin, provider interaction cookies and CSRF proof. URLs and issuer use the configured origin, never untrusted forwarding headers. Token failures include MCP `WWW-Authenticate` resource metadata. Per-user Firestore rate limiting allows 30 integration requests per minute, shared across serverless instances. Anonymous authorization/discovery traffic still needs hosting-level abuse controls before a broader rollout.

Firestore collections:

- `openaiOAuthState`: provider artifacts, model namespaced/hashed document IDs; expired records are denied even before cleanup; code consumption uses a transaction and stale saves preserve consumption markers.
- `openaiOAuthDelegations`: grant bindings/revocation tombstones, not user accounts.
- `openaiOAuthRateLimits`: per-user request windows.

Existing default-deny Firestore rules protect all three collections from browser clients. Their denial is tested; no rule change or rule deployment is needed for phase 1. Only Firebase Admin accesses these collections, server-side. Never make them readable to support a consent page.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/api/oauth/.well-known/oauth-authorization-server` | Library-generated OAuth metadata |
| `/.well-known/oauth-authorization-server/api/oauth` | Standard RFC 8414 discovery location for path-based issuer, rewritten to provider |
| `/.well-known/oauth-authorization-server` | Convenience discovery alias; same actual issuer |
| `/api/oauth/.well-known/openid-configuration` | Provider's discovery alias, only delegation scope advertised |
| `/api/oauth/auth` | Authorization Code + PKCE authorization |
| `/api/oauth/token` | Code exchange; access tokens last 300 seconds |
| `/api/oauth/jwks` | Public signing keys only; private key fields never returned |
| `/api/oauth/token/revocation` | Library-provided token revocation |
| `/api/oauth/interaction/:id` | Browser-bound Firebase proof and consent |
| `/.well-known/oauth-protected-resource` | MCP resource, issuer and `lessons:create` |
| `/.well-known/oauth-protected-resource/api/mcp` | Resource-specific discovery alias |
| `/api/mcp` | Authenticated, stateless MCP POST; only `createLesson` |
| `/{locale}/integrations/openai` | Consent/connection page; without interaction, revoke access |
| `/api/integrations/openai/revoke` | Same-origin POST with verified Firebase bearer token |

GET/DELETE on MCP do not start streams or maintain sessions; authenticated requests receive 405. ChatGPT client calls use bearer tokens, not Firebase Admin credentials. A signed-in editor browser session remains separate from OAuth.

## Required server environment

Nothing new is required when the integration is disabled. When enabled:

| Variable | Example / requirement |
| --- | --- |
| `OPENAI_MCP_ENABLED` | `true` to explicitly activate; otherwise 404 |
| `OPENAI_MCP_ORIGIN` | Fixed staging HTTPS origin, e.g. `https://prototype.example.com`, no path/query |
| `OPENAI_OAUTH_CLIENT_ID` | A stable locally chosen client ID; configure the same value in OpenAI |
| `OPENAI_OAUTH_REDIRECT_URIS_JSON` | JSON array of **exact** callback URLs shown by OpenAI for this connection |
| `OPENAI_MCP_ALLOWED_UIDS_JSON` | Nonempty JSON array of test users' actual Firebase UIDs |
| `OPENAI_OAUTH_COOKIE_KEYS_JSON` | Secret JSON array of stable, random signing keys; first signs, later keys permit rotation |
| `OPENAI_OAUTH_JWKS_JSON` | Secret private RSA JWKS, stable `kid`; public JWKS endpoint strips private material |

Existing server Firebase Admin configuration is reused; no new service account is created or exposed. Keep all new variables server-only, never `NEXT_PUBLIC_*`. No OpenAI API key is needed for MCP.

Generate local key material once with `node scripts/generate-openai-oauth-secrets.mjs`. It creates `.env.openai-oauth.local` with exclusive-create semantics (no overwrite) and prints only its path. This ignored file is **not automatically loaded by Next.js**: copy the two values into `.env.local` for local use or into server environment settings for staging. Do not commit, paste into ChatGPT, or publish the file. File permissions on Windows follow the directory ACL.

Use Node 22 LTS or a compatible newer supported runtime. Local development can use `http://localhost:3000` or `http://127.0.0.1:3000`; production runtime requires HTTPS. Keep the origin stable across redirects, login, provider cookies and OpenAI discovery. A changing preview URL is unsuitable for a persistent connection. Do not rotate signing/cookie keys on every cold start.

## Staging setup

1. Select a stable staging host and server environment; add it to Firebase Authentication's authorized domains if needed. Verify existing Firebase login on it.
2. Generate/store the server secrets, choose a stable client ID, allowlist your test UID and enable only this environment. No automatic production deploy is authorized.
3. In OpenAI developer mode, configure a private MCP connection for `https://<staging-host>/api/mcp` with the predefined OAuth client. Copy the **exact** callback from its management UI into the redirect allowlist. No wildcard callbacks. This connection intentionally does not support CIMD or DCR; choose predefined client configuration.
4. Configure optional Firestore TTL cleanup policies: `openaiOAuthState.expiresAt`, `openaiOAuthDelegations.cleanupAt`, `openaiOAuthRateLimits.expiresAt`. Authorization expiry does not depend on TTL cleanup. Firestore reads/writes, retained protocol state, key rotation and dependency maintenance are the operating costs.
5. Check discovery, PKCE exchange, consent and revoke access on staging with MCP Inspector, then ChatGPT. Empty tool list means lesson creation cannot be tested yet; some clients may not present an account-linking prompt until a tool exists.

## Tests and next phase

`npm run test:openai` runs the real provider/HTTP bridge tests with a fake Firebase identity boundary. The Firestore adapter test runs only when `FIRESTORE_EMULATOR_HOST` is set to localhost; it never targets production. `npm run test:lessons` covers unchanged lesson validation/domain behavior. `npm run test:lessons:rules` requires the local emulator and now also checks that OAuth state cannot be read or written by clients. Windows emulator may require JVM `-Duser.language=en -Duser.country=US` for rule compilation.

Before adding `createLesson`: implement idempotency inside the existing lesson domain, export/derive one shared external input schema, adapt its trusted auth context without forging Firebase decoded tokens, and register exactly one tool that calls `createLessonForUser()`. The tool must force draft/owner on the server and return a configured editor URL. Review protection of server-managed entitlement fields in user profiles before broader access. No integration code should implement independent lesson Firestore writes.
