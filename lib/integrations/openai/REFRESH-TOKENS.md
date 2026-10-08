# Staging token renewal — 2026-10-06

The user verified that ChatGPT created the Sola draft with text and tasks in My Content. The remaining usability issue was reconnecting whenever the five-minute access token expired.

## Policy and implementation

The existing pinned `oidc-provider` owns the standard refresh_token grant, protocol validation, token generation, rotation and replay revocation. No new auth service, custom OAuth protocol, endpoint or MCP tool is added. Firebase remains the sole identity source. Access tokens remain opaque and last 300 seconds, with the exact staging MCP audience and only lessons:create. The public client and PKCE/S256 registration are unchanged except for allowing refresh_token in addition to authorization_code.

A new explicit consent/code exchange returns a refresh token without adding offline_access or any other scope. Refresh tokens rotate on every successful renewal and retain their original expiration. The existing grant and Firebase binding impose an absolute 24-hour consent lifetime; rotation does not extend it. The rotation hook checks the same live allowlisted Firebase UID, account/profile status, tokensValidAfter and binding revocation/expiry, and uses the existing per-UID request limit. Token issuance checks the binding again. A delayed renewal cannot restore revoked consent.

Sequential reuse of a consumed refresh token revokes the provider grant and token family. The Firestore adapter atomically consumes refresh tokens and preserves consumption markers under stale writes; simultaneous refresh requests can issue at most one successful pair. A rejected refresh request may consume its token; clients should handle invalid_grant by reconnecting, rather than indefinitely retrying a consumed credential. The OAuth revocation endpoint also revokes a refresh token's family. No credential is exposed in logs or documentation.

## Compatibility and manual verification

Existing access tokens remain valid until their original five-minute expiry. Existing connections cannot acquire a refresh token retroactively: reconnect Primary once after the staging deployment. No database migration, new secret or Firebase login configuration is needed. The earlier phase-1 and discovery documents describe historical tests without refresh tokens.

After reconnecting in ChatGPT, wait more than five minutes, then request creation of a new small test draft in the same connected chat. Confirm that creation succeeds without another reconnect. This client-side acceptance test is required before claiming ChatGPT renews automatically; server support alone cannot prove that its stored connection uses the new credential. A reconnect after 24 hours, revocation, account disablement or token replay remains expected.

## Validation

Protocol tests cover renewal after access-token expiry; unchanged UID, scope and audience; mandatory rotation; preservation of an artificially shortened original expiry; old-token replay/family revocation; concurrent renewal; scope/audience/client attacks; Firebase revocation, allowlist removal, disabled account, expired binding/token and both consent and OAuth revocation. Firestore emulator tests cover atomic refresh consumption, stale-write marker preservation and grant-wide artifact revocation. Existing MCP and lesson tests continue to cover exactly one tool, ownership, draft status, validation and idempotency.

19 relevant tests passed (12 OAuth/protocol tests, 4 lesson-tool tests, 3 real Firestore-emulator tests), with no skipped emulator tests. Typecheck, changed-file lint, local build and Vercel preview build passed. The test emulator was stopped after verification.

Staging deployment `dpl_8yZu8sWgusEM7ZBULsNTgCdFq9wM` is READY and assigned to `https://321skole-translate-oauth-staging.vercel.app`. Public HTTPS discovery returned HTTP 200 with authorization_code and refresh_token, only lessons:create, PKCE S256 and the correct staging issuer/token endpoint. Protected resource metadata returned HTTP 200 and the exact staging MCP audience. An invalid refresh token was rejected by the deployed token endpoint with HTTP 400, application/json and invalid_grant.

### Real ChatGPT acceptance: passed

The user reconnected Primary and requested a new draft after waiting beyond five minutes, without reconnecting again. ChatGPT reported the Helle og Jesper på lekeplassen draft. Read-only, sanitized verification of protocol-state metadata confirmed the same grant family: initial authorization_code access token at **07:08:58 UTC**, followed by refresh_token issuance at 07:09:02, 07:10:20, 07:16:00 and **07:22:18 UTC**. Each access token retained lifetime 300 seconds, exact staging audience, lessons:create and the allowlisted Firebase UID. The family had four rotations; previous refresh tokens were consumed and the latest remained unconsumed. No credential values or grant IDs were printed or persisted in the verification report.

At **07:22:21.306 UTC (09:22:21 Norway time)** the idempotency receipt and lesson confirmed draft `chfXJGWgLv4BvyhKFz5M`, title Helle og Jesper på lekeplassen, owner equal to the allowed Firebase UID, nonempty source text and four tasks. Vercel also recorded MCP POST HTTP 200 during this request. This verifies real automatic ChatGPT renewal and subsequent lesson creation about 13 minutes after the initial code exchange. The 24-hour expiration and revocation policies remain enforced; the test does not establish renewal beyond that bound.

The production alias still points to `dpl_BpgtCrKqytvhNZqdeGDZ32SLo5q2`. No production deployment, new secrets, database migration or client callback changes were made. The allowlist contains only the existing authorized Firebase UID.

## Sources

- [OpenAI authentication](https://developers.openai.com/plugins/build/auth): OAuth metadata and handling stale/revoked credentials.
- [oidc-provider v9.12.2 configuration](https://github.com/panva/node-oidc-provider/blob/v9.12.2/docs/README.md): issueRefreshToken, rotateRefreshToken, token TTL and persistent adapter contracts. Behavior was also checked against the installed pinned implementation.
