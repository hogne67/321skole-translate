# Phase 1 staging verification — 2026-10-05

Status: phase 1 verification passed on private staging. Phase 2 subsequently added `createLesson`; see [PHASE2.md](./PHASE2.md) for the current deployment and verification. No production deployment.

- Stable preview alias: https://321skole-translate-oauth-staging.vercel.app
- Phase 1 callback deployment: `dpl_7cq7198Dncbjtqvv7ks1XyYg4Gxn` (immutable preview URL: https://321skole-translate-cxn090bno-jan-hogne-christiansens-projects.vercel.app). Phase 1 end-to-end tests originally ran on `dpl_G2pdy6JvVmpRs4b4ohM3cWPHU9oD`. Current phase 2 staging is `dpl_9dscnSZU36pazUXdnJDcYmQ6JHDP`.
- Production `321school.com` remains on its original deployment `dpl_BpgtCrKqytvhNZqdeGDZ32SLo5q2`.
- Vercel project: `321skole-translate`, Node 24 runtime.
- Firebase identity/data project: existing `skole-c09b8`; this is a separate application deployment, not an isolated Firebase database.
- The staging alias was added to Firebase Authentication authorized domains; existing domains and sign-in methods were preserved.
- Only UID `x9gRQLihwobfyXaoPIl6OZBd5Ov1` is allowlisted. Firebase user is active and its profile exists.
- Seven OAuth/MCP variables are scoped to the preview deployment itself, not Production or all previews. A branch-scoped attempt was rejected because the proposed branch does not exist remotely; no Git branch was pushed.
- Cookie/signing secrets were generated once in ignored `.env.openai-oauth.local` and passed through process environment without logging values. Temporary token/PKCE/cookie/request/response artifacts were removed after testing; test helpers and sanitized reports remain ignored under `.vercel/` and are excluded from uploads.
- Client: `321school-staging-pkce`, with the existing exact staging callback `/nb/integrations/openai` and the user-supplied ChatGPT callback `https://chatgpt.com/connector_platform_oauth_redirect`. The exact ChatGPT callback reaches a signed browser-bound consent interaction with PKCE/S256; a trailing-slash variant and missing PKCE are rejected. No user consent or token was issued in this callback check.
- Initial phase 1 HTTP tests used authenticated Vercel CLI protection bypass. A subsequent discovery investigation found that anonymous external clients were blocked by Vercel Authentication. A protection exception now applies only to the stable staging alias; anonymous discovery passed after this change. Project-wide protection and the immutable preview remain protected. See [DISCOVERY.md](./DISCOVERY.md).

## Verified remotely

- Three OAuth discovery paths: correct issuer, single `lessons:create` scope, S256 and authorization-code-only grant.
- Both protected-resource discovery paths: canonical MCP audience and issuer.
- JWKS publishes public fields only.
- Missing/invalid MCP tokens return 401 and resource metadata challenge.
- Invalid authorization code is rejected.
- Valid PKCE authorization creates a browser-bound interaction with Secure/HttpOnly cookies through `srvx` in Vercel.
- Interaction details expose only `lessons:create`; signed cookie round trip succeeds.
- Cross-origin consent and invalid Firebase proof are rejected.
- Missing PKCE, plain PKCE, wrong resource and extra scope are rejected.
- Real user browser consent produced the verified UID binding, followed by a successful code+S256 exchange. Opaque-token storage confirms exact audience, UID and 300-second lifetime; no refresh/ID token is returned.
- The corrected preview passed authenticated MCP `initialize` and `tools/list`, returning exactly `[]`.
- The actual issued token was denied after its natural five-minute expiry. No token timestamp was edited to accelerate this test.
- The user completed the existing Create Lesson flow on staging without errors. Firestore metadata confirms lesson `PiCh9hpooQFEeOGyZSo8`, title `Staging kontroll fase 1`, owner UID matching the allowlist, status `draft`, source `producer-texts-new`.
- The user signed in with their other existing 321school account and reported the expected consent rejection: `Account is not enabled for this private prototype.` The allowlist was not expanded.
- The user returned to the allowlisted account, approved a new grant and revoked it through the existing connection page. MCP accepted the new token before revocation and returned 401 immediately after revocation, while its 300-second lifetime was still active. Grant-binding tombstones confirmed revocation.

## Staging finding and fix

The initial issued token was rejected at MCP despite a valid grant/binding and unexpired token. The provider's default session-bound policy rejected it because its browser session referenced a different grant. The explicit delegation policy now uses `expiresWithSession: false`; revocation, expiry and all live Firebase checks remain required. A regression test verifies that another consent/session removal preserves active delegation and that explicit revocation still denies it. The corrected preview passed authenticated MCP and real expiry/revocation tests. Old session-bound staging tokens required a new consent; no lesson/user-data migration was performed.

## Local validation

- 8 provider/HTTP/OAuth tests and 12 existing lesson input/domain tests passed.
- TypeScript, ESLint on changed runtime/test files, and the Vercel preview build passed.
- `srvx` was tested with discovery, browser cookies/CSRF, real Firebase consent, token POST/code exchange and authenticated MCP on Node 24 Vercel Functions.

## Remaining configuration before ChatGPT account-link testing

- Actual ChatGPT callback is registered. Complete account linking in ChatGPT with predefined client `321school-staging-pkce`; a full OAuth flow originating in ChatGPT remains to be tested.
- ChatGPT can now reach staging discovery/OAuth/MCP without Vercel login through the staging-alias protection exception. No bypass secrets are placed in URLs. The staging application is publicly reachable; Firebase authentication and OAuth/UID authorization still apply.
- Preserve the same seven deployment-scoped variables and stable keys on future staging redeployments; they are not global Preview/Production settings. Moving to a branch-scoped configuration requires a real remote staging branch.
- Optional Firestore TTL cleanup: `openaiOAuthState.expiresAt`, `openaiOAuthDelegations.cleanupAt`, `openaiOAuthRateLimits.expiresAt`. Expiry/revocation enforcement already works independently of cleanup.

Authentication and runtime infrastructure are ready for developing the first private `createLesson` tool. Direct ChatGPT interoperability has not yet been tested. Additional Google/Feide/email variants were not individually exercised; existing sign-in code was unchanged. No readiness claim is based solely on mocked Firebase tests. No lesson storage logic was added to the integration.
# Token renewal update — 2026-10-06

## Authorized test-account expansion — 2026-10-06

The user explicitly authorized adding six existing test accounts to the staging OAuth allowlist, retaining the original account. Firebase UID/email pairs and active profiles were verified read-only; all seven accounts passed the existing producer_create_lesson eligibility check. No Firebase users, roles, plans or identity mappings were changed. Each account signs in and consents independently; the authenticated UID remains the draft owner. Refresh, scopes, callbacks and secrets are unchanged.

| Account | Firebase UID |
| --- | --- |
| Original user | x9gRQLihwobfyXaoPIl6OZBd5Ov1 |
| Harriet Gold (english@test.no) | x23l8XBxmCMjEkNJG257TfmC0Eu1 |
| Manuela Costa Lima (brazil@test.no) | 0Ail3uIkSMcXNtoPthvqw1Vo8J13 |
| Hanne Ulriksen (teacher1@test.no) | l8ml4rx8d3cuEl2C0z4JAbcMSxp1 |
| Fred Hansen (teacher3@test.no) | 4RV87yMA7tSaFNMRPe0646e67eI3 |
| Josefine Isaksen (teacher@test.no) | S7iz4a3ZVMQfXR1YpYXzrvqoMa42 |
| John Keating (english1@test.no) | pnYsbvaSkUWWiE2rUHyqIXCdsIZ2 |

The ignored preview-deploy helper reads this seven-UID set from `.vercel/staging-allowlist.json`, so subsequent staging deploys retain it. It does not change production environment variables. A UID outside the configured set was verified denied by the existing identity service. Real OAuth login/create tests for these six accounts remain manual; no user impersonation or content creation was used for this configuration change.

Active staging preview: `dpl_6mZAaMVLj9P68xypucW2L8GCrZv9`, assigned to the existing staging alias after Vercel build/typecheck passed. Application/runtime logic is unchanged. Public discovery returned HTTP 200 with the canonical staging issuer, lessons:create only and the existing authorization_code/refresh_token grants; anonymous MCP remained HTTP 401. Production alias remained at `dpl_BpgtCrKqytvhNZqdeGDZ32SLo5q2`.

Current staging deployment: `dpl_8yZu8sWgusEM7ZBULsNTgCdFq9wM`. Rotating refresh-token support is enabled with the existing 24-hour grant limit and five-minute access-token lifetime. Discovery and invalid-token rejection were verified over public HTTPS. Reconnect Primary once; real ChatGPT renewal after six minutes remains to be verified. See [REFRESH-TOKENS.md](./REFRESH-TOKENS.md) for implementation, tests and compatibility. Earlier results below are historical.
