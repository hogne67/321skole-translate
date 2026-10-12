# OAuth lesson ownership investigation — 2026-10-11

Read-only Firebase audit at 19:10 UTC found that the createLesson receipt for
`969Z2ygUrjO4Gnyc1tzG` (Hva er radikalisering?, created 18:49:50 UTC) recorded
the administrator's UID. The lesson owner matches that UID. All 14 available
creation receipts matched their lesson owners, including Fred's three earlier
lessons from October 6.

Fred's account is `teacher3@test.no` / `4RV87yMA7tSaFNMRPe0646e67eI3`.
His only stored delegation expired October 7 at 13:49:53 UTC. No live Fred
grant/access/refresh token was found. The administrator has one active
delegation and a live refresh token/grant. None of the 158 inspected OAuth
artifacts had a conflicting delegation/account binding. Reads were bounded to
40 receipts, 200 bindings and 300 artifacts; actual counts were 14, 17 and 158.
No credentials were printed, tokens issued, accounts impersonated or data changed.

## Identity chain

- Consent verifies the browser's Firebase ID token in `http.ts`; the resulting
  UID becomes both the OAuth grant accountId and server-side delegation UID.
- `authenticateMcp()` validates the bearer token, client, resource, scope,
  grant/account match, binding, expiry and current Firebase account eligibility.
- `handleMcp()` passes that identity to `executeCreateLesson()`, which passes
  the UID to `createLessonForUser()`. The domain sets `ownerId: uid` after
  normalizing client input. Client-supplied ownerId is rejected.
- Idempotency receipts are keyed by UID and request key; they cannot reuse
  another account's save. My Content queries by the signed-in UID as ownerId.
- `link_id` is not consumed or mapped anywhere in this API. ChatGPT's internal
  connection selection and its mapping to bearer credentials are not visible
  in the available server records. These records prove the account used for
  saving, not the exact cause of ChatGPT selecting that account.

## Verification and next action

Added a regression test covering two separate accounts, browser account
switching, MCP execution and refresh. Each token continues to identify its
original account. All 24 OAuth/createLesson/domain tests and targeted lint pass.
No runtime authorization changes or deployment were needed.

Reconnect the intended ChatGPT connection with Fred's actual Firebase account;
the consent page must show `teacher3@test.no` before approval. Then explicitly
save a new draft with a new idempotency key through that connection and check
its receipt/owner and Fred's My Content. This human consent and client-side
connection selection remain unverified. Existing administrator-owned content
was not moved or duplicated.

## Account switch follow-up

The supplied consent screenshot showed the administrator's persisted Firebase
login. Added an explicit **Bytt konto** action that signs out Firebase before
opening the existing login page, preserving the OAuth interaction in `next`.
The consent screen explains which account will own new lessons. Post-login
navigation now accepts the exact localized `/integrations/openai` path, with
its query string, so login returns to the pending consent rather than dropping
the return destination. This changes navigation only; server-side Firebase
verification, OAuth bindings, allowlist and lesson ownership remain unchanged.
