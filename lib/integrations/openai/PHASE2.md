# Phase 2: createLesson

Deployed to staging on 2026-10-05: https://321skole-translate-oauth-staging.vercel.app/api/mcp.
Preview `dpl_9dscnSZU36pazUXdnJDcYmQ6JHDP`: https://321skole-translate-dyo1s1096-jan-hogne-christiansens-projects.vercel.app.
Production alias `321school.com` still points to `dpl_BpgtCrKqytvhNZqdeGDZ32SLo5q2`. The same seven deployment-scoped OAuth variables, stable keys, exact callbacks and sole allowlisted UID `x9gRQLihwobfyXaoPIl6OZBd5Ov1` were preserved. Staging continues to use existing Firebase identity/data infrastructure.

Only `createLesson` is registered. Its description and server instructions require an explicit request to save/create content in 321school. Conversation drafting and revision precede the call. No read/search/publish/share/edit/delete/Live/image tools are registered.

Input is `{ idempotencyKey, lesson }`, where `lesson` uses `createLessonInputJsonSchema` from shared `lib/lessons/input.ts` and task discovery from `tasks.ts`. Authoritative validation and task normalization remain in `normalizeCreateLessonInput()` and `normalizeLessonTasks()`, called by the existing domain function. Supported tasks are `truefalse`, `mcq`, and `open`; title and sourceText are required, with the existing language/level defaults and other text/metadata fields preserved. Unknown fields including ownerId, status, document ID and images are rejected.

The MCP handler verifies the existing OAuth chain, exact `lessons:create` scope, current Firebase account, allowlist and rate limit before executing. `executeCreateLesson()` receives only that verified UID; no UID or ownership field is accepted from arguments. It calls `createLessonForUser()` and contains no Firestore writes. The domain function continues to enforce profile/feature eligibility and server-owned draft fields.

## Idempotency

The domain function has an optional fourth argument `{ idempotencyKey }`. Existing `/api/producer/create-lesson` retains its unchanged three-argument call and `{ id }` response. The MCP adapter requires a 16–128 character alphanumeric/hyphen/underscore key, preferably a UUID, per intentional save; retries reuse it and the lesson input.

`lessonCreationRequests/{sha256([uid,key])}` stores UID, normalized payload fingerprint, lesson ID, saved title and server timestamp. The receipt and lesson are created atomically in one Firestore transaction. Concurrent requests therefore return the same ID/title. A different payload with the same key fails. Keys are isolated by UID. Automatically generated task IDs are excluded from retry fingerprints, while supplied IDs remain part of the fingerprint. No receipt stores the full source text or OAuth tokens.

Receipts are retained without TTL to prevent late retries from creating duplicates. They are denied to client SDKs by existing default Firestore rules; rule tests cover reads/writes. There is no schema migration, new index, secret, dependency or OAuth configuration change. Do not delete receipts as ordinary temporary OAuth state. If a lesson is later deleted through the existing application, retry still returns the original creation receipt rather than recreating it.

Output is `{ lessonId, title, editorUrl, status: "draft" }` in structuredContent and JSON text. URL is built server-side from the configured staging origin and existing `/nb/producer/{lessonId}` editor route. It contains no tokens or capability-bearing query parameters; normal editor authorization remains required.

The MCP body limit is 1 MB so existing lesson text/task payloads fit; the domain's normalized 750 KB bound still applies. Existing per-UID 30 requests/minute protection remains unchanged.

## Validation

Tests cover shared format/task normalization; owner/status/image injection; disabled profile; missing identity/scope; UID-separated keys; concurrent/later retries; conflicting content; real Firestore transaction atomicity; OAuth token/allowlist/revocation/expiry/audience checks; authenticated MCP tool registration, trusted identity and execution; missing-token calls; unknown tools; and client denial of receipts. Remote authenticated creation through the installed ChatGPT plugin remains the final user acceptance test.

Results: 32 tests passed, none skipped, including three real Firestore emulator tests and five rule tests. The updated OAuth/MCP suite passed again after final tool metadata changes. Typecheck, ESLint on all changed runtime/test/UI files, final local build and Vercel preview build passed. The emulator initially failed under Norwegian Java locale; restarting it with `-Duser.language=en -Duser.country=US` resolved the local harness issue. Test emulator was stopped afterwards. No production data was written by these tests.

After alias activation, 12 anonymous external discovery/endpoint checks and four callback/PKCE checks passed. This verifies public discovery, missing/invalid token rejection and the unchanged callback configuration; it does not claim a remote authenticated `createLesson` call. Authenticated tool registration/execution is covered by local OAuth/MCP tests and creation/concurrency by the real Firestore emulator.

To accept the prototype, refresh/re-scan the plugin tools in ChatGPT if its original empty tool list is cached. Draft a lesson in the conversation, then explicitly request saving it to 321school. Confirm that the returned editor link opens the draft in My Content. A retry with the same idempotency key must return the same lesson ID. No new credentials or environment variables are required.
