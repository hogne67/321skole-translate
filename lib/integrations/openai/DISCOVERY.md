# Staging OAuth discovery investigation — 2026-10-05

Origin: `https://321skole-translate-oauth-staging.vercel.app`.

## Cause and correction

Anonymous GET requests to MCP and all five discovery addresses returned Vercel's HTTP 401 `Protected deployment`, rather than application metadata. MCP had no `WWW-Authenticate` header. Requests were blocked before reaching Next.js. Prior CLI checks automatically bypassed deployment protection and therefore did not establish external reachability.

Created a Vercel alias protection exception (`alias-protection-override`) only for `321skole-translate-oauth-staging.vercel.app`. No application code, OAuth architecture, secrets, environment variables or deployment changed. The exception makes the whole staging alias publicly reachable, including its sign-in page; Firebase authentication, OAuth token validation and the single-UID integration allowlist remain enforced. Remove the alias override to restore Vercel protection when testing finishes.

Project protection remains `all_except_custom_domains`. Immutable preview `321skole-translate-x60d16io8-jan-hogne-christiansens-projects.vercel.app` still returns Vercel's protection 401. Production `321school.com` remains on `dpl_BpgtCrKqytvhNZqdeGDZ32SLo5q2`; staging remains on `dpl_G2pdy6JvVmpRs4b4ohM3cWPHU9oD`. No production deployment or `createLesson` tool was built.

## External checks after correction

Twelve checks passed with direct Node fetch: no Vercel credentials, bypass headers/query, browser cookies or automatic redirects. A reproducible local helper and sanitized results are ignored under `.vercel/discovery-public.mjs` and `.vercel/discovery-public-results.json`.

| Check | Result |
| --- | --- |
| MCP GET and POST without token | 401 JSON, correct Bearer challenge |
| MCP with invalid token | 401 with challenge |
| `/.well-known/oauth-protected-resource/api/mcp` | 200 JSON |
| `/.well-known/oauth-protected-resource` | 200 JSON |
| `/.well-known/oauth-authorization-server/api/oauth` | 200 JSON |
| `/.well-known/oauth-authorization-server` | 200 JSON |
| `/api/oauth/.well-known/oauth-authorization-server` | 200 JSON |
| Token POST with invalid authorization code | 400 JSON `invalid_grant` |
| Authorization endpoint without required parameters | Provider 400, no Vercel gate |
| Revocation POST with unknown token, predefined client | 200 |
| Immutable preview without bypass | Still Vercel-protected, 401 |

MCP advertises:

```http
WWW-Authenticate: Bearer resource_metadata="https://321skole-translate-oauth-staging.vercel.app/.well-known/oauth-protected-resource", scope="lessons:create", error="invalid_token"
```

With that header, the client uses the advertised root metadata URL. Without it, the MCP specification requires trying the path-specific URL `/.well-known/oauth-protected-resource/api/mcp` before the root URL. Both exist and return identical metadata.

Protected resource: `/api/mcp`. `authorization_servers` contains only the exact issuer `https://321skole-translate-oauth-staging.vercel.app/api/oauth`. Because this issuer includes a path, the RFC 8414 discovery address is `/.well-known/oauth-authorization-server/api/oauth`; the existing rewrite already serves it correctly.

Validated authorization-server fields, all under the same staging origin:

- `issuer`: `/api/oauth`.
- `authorization_endpoint`: `/api/oauth/auth`.
- `token_endpoint`: `/api/oauth/token`.
- `revocation_endpoint`: `/api/oauth/token/revocation`.
- `jwks_uri`: `/api/oauth/jwks`.
- `scopes_supported`: exactly `lessons:create`.
- `code_challenge_methods_supported`: exactly `S256`.
- `grant_types_supported`: exactly `authorization_code`.
- `response_types_supported`: `code`.
- `token_endpoint_auth_methods_supported`: `none`.
- `authorization_response_iss_parameter_supported`: true.

No endpoint URL points to localhost or production. No application-code change was needed, so build/typecheck/lint were not rerun; prior phase 1 checks remain documented in STAGING.md. This check verifies anonymous discovery and endpoint reachability, not a completed OAuth flow originating inside ChatGPT.

## Remaining ChatGPT setup

Discovery is separate from client registration. Current phase 1 uses a predefined public PKCE client (`321school-staging-pkce`) and the staging test callback only. Neither DCR nor CIMD is enabled or advertised. OpenAI officially supports predefined clients; automatic metadata discovery does not automatically register one.

The user subsequently supplied the exact callback `https://chatgpt.com/connector_platform_oauth_redirect`. It is now registered alongside the original staging test callback for client `321school-staging-pkce` on preview `dpl_7cq7198Dncbjtqvv7ks1XyYg4Gxn`. A direct anonymous authorization request with that callback and S256 returned 303 to the server's signed consent interaction; interaction details returned 200 and only `lessons:create`. The original callback still works, a trailing-slash variant is rejected, and PKCE remains mandatory. All twelve anonymous discovery checks passed again. Vercel build and TypeScript passed. No other OAuth configuration changed and production was untouched.

Supply this client ID in ChatGPT where requested. No client secret exists for this public client. Authorization/token URLs should come from discovery. Completing account linking in ChatGPT remains necessary; DCR/CIMD remain disabled.

## Official sources

- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth): resource metadata/challenge, PKCE, predefined clients and exact callback requirements.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): resource and authorization-server discovery paths.
- [Vercel domain exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions): per-preview-domain public exception.
- [Vercel September 2026 update](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan): domain exceptions are now free on every plan; older documentation still mentions an add-on.
