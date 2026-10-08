# Actual staging MCP discovery verification — 2026-10-05

## Follow-up: ChatGPT Refresh failure — 2026-10-06

Reconnecting Primary succeeded in ChatGPT, but Refresh tools still failed. Vercel recorded a token exchange at 06:31:20 UTC, MCP POST responses 200/202 between 06:31:58 and 06:32:00, and a further MCP POST 401 at 06:33:00. That rejection is only about 100 seconds after the token exchange; the five-minute lifetime alone does not explain it. Request status logs do not identify the JSON-RPC method or prove whether Refresh used the fresh token, an older connection, or no credentials.

To distinguish those cases, preview-only diagnostics now record fixed access-denial categories and whether an Authorization header exists. A successful tools/list records the single tool name/count. No tokens, IDs, request bodies, arbitrary headers or raw errors are logged. A regression test verifies the exact allowed diagnostics for missing and invalid credentials. OAuth policy, token lifetime, tool schemas and access controls are unchanged. A new Refresh attempt against the diagnostic staging deployment is required before attributing the failure to a specific cause.

Diagnostic preview deployment: `dpl_DbgnW7efTYs8JiogZH4Z1nmKMTvW`, now assigned to the existing staging alias. Local tests (25 distinct tests), typecheck, changed-file lint, local build and Vercel build passed. An external anonymous smoke request returned application/json HTTP 401 with the correct staging resource metadata challenge; the server diagnostic recorded `authorizationPresent: false`, `missing_or_malformed_bearer`. Protected resource discovery returned HTTP 200 with the canonical staging resource. This smoke request is our own diagnostic control, not a ChatGPT Refresh attempt.

After the user reconnected Primary and selected Refresh tools, staging recorded an anonymous POST 401 (`authorizationPresent: false`) at 06:47:37 UTC, then POST 400, POST 200, POST 200 and notification HTTP 202. At **06:47:41.725 UTC (08:47:41 Norway time)** the authenticated ListTools handler recorded `tools_list`, `toolCount: 1`, `toolName: createLesson`; the request completed HTTP 200. No later rejection appeared in the log query through 06:49:57 UTC. This confirms that a client in the user's reconnect/refresh attempt reached authenticated tools/list and received the one-tool catalog. It does not distinguish the reconnect scan from the manual Refresh scan, expose ChatGPT's cached metadata, or prove a subsequent conversation attached the tool. The initial unauthenticated challenge is followed by successful discovery; it is not by itself the cause of a failing scan. Next verification is the tool list in ChatGPT and a new conversation with the plugin enabled. No further runtime or OAuth changes are justified by this successful result.

Staging: `https://321skole-translate-oauth-staging.vercel.app/api/mcp`, deployment `dpl_9dscnSZU36pazUXdnJDcYmQ6JHDP`. No runtime code, OAuth configuration, additional tools or deployments changed during this investigation. Production alias remained unchanged.

## Remote test method

The user approved a fresh browser OAuth consent with the existing allowlisted Firebase account and registered staging-test callback. The verifier matched the resulting authorization code to its PKCE/S256 challenge and expected account/client before exchanging it over public HTTPS. It did not mint or impersonate Firebase identities, borrow ChatGPT's credentials, use Vercel bypass, or call `createLesson`. Access token and authorization code were never printed or saved in the transcript. Temporary verifier/state file was removed afterwards.

The official `@modelcontextprotocol/sdk` 1.32.1 `Client` with `StreamableHTTPClientTransport` then ran its normal connection lifecycle against staging. This was not a local handler invocation or a mock transport. The actual sanitized request/response transcript, including the entire returned tool metadata and schemas, is saved in [MCP-DISCOVERY-TRANSCRIPT.json](./MCP-DISCOVERY-TRANSCRIPT.json).

## Actual responses

| Request | HTTP | Response |
| --- | --- | --- |
| POST `initialize` | 200 | JSON-RPC 2.0, matching ID 0; protocol `2025-11-25`; server `321school` version `0.2.0`; capabilities `{ "tools": {} }` |
| POST `notifications/initialized` | 202 | Empty accepted notification response; no JSON-RPC ID or response body |
| Optional GET for SSE | 405 | No server-pushed SSE stream; supported by MCP and correctly handled by the standard client |
| POST `tools/list` | 200 | JSON-RPC 2.0, matching ID 1; exactly one tool, `createLesson` |

POST requests carry `Accept: application/json, text/event-stream` and `Content-Type: application/json`. Both JSON-RPC request responses have `Content-Type: application/json`. After initialization, requests carry `MCP-Protocol-Version: 2025-11-25`. The server is stateless: no `MCP-Session-Id` is issued or required. The client successfully lists tools across separate requests; recreating the transport per Vercel request does not break this lifecycle. GET 405 is the specified alternative to an optional SSE stream, not evidence of a broken POST endpoint.

Returned tool name: `createLesson`. Title: `Save a draft lesson in 321school`. Description expressly limits invocation to the user's explicit request to save/create in 321school. Input is an object requiring `idempotencyKey` and `lesson`; nested lesson requires title/sourceText and supports the shared task/language/level/metadata fields. Both input and output schemas validated and compiled with AJV's draft-2020-12 validator. The standard client accepted `tools/list`; its own JSON-RPC/tool metadata parsing succeeded. OAuth `lessons:create` declarations are present both on the tool and in `_meta.securitySchemes`.

These results establish that an external authenticated standard client receives correct discovery from the deployed server. They do not establish that ChatGPT has refreshed its stored plugin metadata or that its particular conversation received callable tools; no internal ChatGPT trace was available.

Vercel request logs corroborated the live test at `20:33:52–20:33:54 UTC`: POST 200, POST 202, GET 405, POST 200. The available two-hour query also returned the earlier anonymous staging checks at `20:17:43–20:17:46 UTC` (401 MCP and 200 resource metadata). It did not expose caller identity or JSON-RPC method bodies, so these logs cannot be used to claim that ChatGPT itself completed a fresh tools/list. Only timestamp, path, method and status were retained from the logs.

## Tokens, consent and metadata

The fresh OAuth exchange returned `expires_in: 300`, exactly `lessons:create`, and no refresh token. Discovery completed within this lifetime. Short lifetime therefore did not prevent this discovery. An old token expires after five minutes, and this prototype cannot silently renew it via a refresh grant. ChatGPT can retain its linked/Primary account UI after token expiry; that label alone does not prove usable credentials. A metadata Refresh attempted with expired credentials may require reconnection/reauthorization. This is a practical limitation, not a reason to change OAuth without evidence of the actual failure.

OAuth grants bind UID, client and scope, not a snapshot of the tool list. The scope has remained `lessons:create` since phase 1. A still-valid phase 1 grant/token therefore does not require a new consent merely because the server now lists one tool. Revocation and expiry still apply. No new scopes or registration methods were enabled.

The server advertises a fixed tool list without `listChanged` notifications. It does not send an unsolicited update to existing ChatGPT conversations. The strongest current explanation for the missing callable tool is stale connection/plugin metadata or an old conversation; expiry is another concrete possibility. The successful independent client test does not conclusively distinguish those client-side cases.

## Recommended ChatGPT steps

For a custom MCP connection, OpenAI's documented procedure after tool metadata changes is:

1. Open the existing 321school connection under ChatGPT Plugins/connection management.
2. Select **Refresh** (or the corresponding tool rescan action in that UI).
3. Confirm the refreshed tool list contains exactly `createLesson`, with the current description/schema.
4. If refresh requests sign-in, reconnect the same 321school account and authorize `lessons:create`, then refresh while the token is fresh.
5. Start a **new conversation**, enable/select the refreshed plugin, and explicitly request saving completed lesson content to 321school.

Reinstalling is not the documented first step for a direct custom MCP connection. If Refresh is absent or cannot replace the old zero-tool snapshot, recreating that custom connection/plugin is a reasonable fallback; copy the exact callback shown for the recreated connection and do not assume it is unchanged. A packaged/local plugin also needs its installed manifest to reference this MCP server; importing only a skill/plugin reference does not itself prove MCP tools were attached. A published plugin follows continuous review for tool updates rather than the direct-connection Refresh flow.

If the UI shows `createLesson` after Refresh but a new conversation still has no callable tool, collect the Refresh error/result and inspect the plugin's actual MCP binding/installation. Asking the chat model to refresh metadata does not substitute for the management action. Do not add extra server tools or randomly modify valid schema/transport code to compensate.

## Official sources

- [OpenAI: Connect and test your plugin, Refresh metadata](https://developers.openai.com/plugins/deploy/connect-chatgpt): Refresh the connection, verify metadata, start a new conversation; published updates follow continuous review.
- [OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server): tool schemas, metadata and capabilities.
- [OpenAI: Authentication](https://developers.openai.com/plugins/build/auth): stale tokens must be rejected; linking and client configuration remain separate from tool metadata.
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): optional sessions, notifications, content negotiation and optional GET/SSE 405 behavior.
