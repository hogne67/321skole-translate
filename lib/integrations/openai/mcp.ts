import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { LessonError } from "../../lessons/validation";
import { createLessonTool, executeCreateLesson } from "./createLesson";
import { IntegrationError, LESSON_CREATE_SCOPE, type IntegrationConfig } from "./config";
import { authenticateMcp, type OAuthRuntime } from "./provider";

export function protectedResourceMetadata(config: IntegrationConfig) {
  return { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [LESSON_CREATE_SCOPE], bearer_methods_supported: ["header"] };
}

export async function handleMcp(request: Request, runtime: OAuthRuntime, execute = executeCreateLesson) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (new URL(request.url).origin !== runtime.config.origin) throw new IntegrationError("Invalid host.", 400);
    const origin = request.headers.get("origin");
    if (origin && ![runtime.config.origin, "https://chatgpt.com"].includes(origin)) throw new IntegrationError("Invalid origin.", 403);
    const identity = await authenticateMcp(runtime, request.headers.get("authorization"));
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
    await runtime.services.checkRateLimit(identity.uid);
    const server = new Server({ name: "321school", version: "0.2.0" }, {
      capabilities: { tools: {} },
      instructions: "Develop and revise lesson content in the conversation. Call createLesson only after the user explicitly asks to save/create it in 321school. This creates a new private draft in their own My Content. Reuse the idempotencyKey and unchanged content when retrying a save.",
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (process.env.VERCEL_ENV === "preview") console.info("openai_mcp_discovery", JSON.stringify({ event: "tools_list", toolCount: 1, toolName: "createLesson" }));
      return { tools: [createLessonTool] };
    });
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      if (params.name !== "createLesson") return { isError: true, content: [{ type: "text", text: "Unknown tool." }] };
      try {
        const result = await execute(identity, params.arguments, runtime.config.origin);
        return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof LessonError || error instanceof IntegrationError ? error.message : "Could not create lesson. Retry with the same idempotencyKey and unchanged content.";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, maxRequestBodySize: 1000000 });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request, { authInfo: {
        token: "", clientId: runtime.config.clientId, scopes: [identity.scope], resource: new URL(runtime.config.resource),
        extra: { firebaseUid: identity.uid },
      } });
      // Buffered JSON transport only; no long-lived Vercel process or process-local MCP sessions.
      return new Response(await response.arrayBuffer(), { status: response.status, headers: { ...Object.fromEntries(response.headers), ...headers } });
    } finally { await server.close(); }
  } catch (error) {
    const status = error instanceof IntegrationError ? error.status : 503;
    if (process.env.VERCEL_ENV === "preview" && (status === 401 || status === 403)) {
      // Fixed categories only: never log credentials, UID, headers, request content or raw errors.
      const reasons: Record<string, string> = {
        "An OAuth access token is required.": "missing_or_malformed_bearer",
        "Invalid or expired access token.": "invalid_or_expired_token",
        "Required scope is missing.": "missing_scope",
        "Access was revoked.": "invalid_grant",
        "Access was revoked or expired.": "invalid_binding",
        "Account access is no longer valid.": "invalid_account",
        "Invalid origin.": "invalid_origin",
      };
      console.info("openai_mcp_discovery", JSON.stringify({
        event: "access_denied", status, authorizationPresent: request.headers.has("authorization"),
        reason: error instanceof IntegrationError ? reasons[error.message] ?? "other" : "other",
      }));
    }
    const challenge: Record<string, string> = status === 401 || status === 403 ? {
      "WWW-Authenticate": `Bearer resource_metadata="${runtime.config.origin}/.well-known/oauth-protected-resource", scope="${LESSON_CREATE_SCOPE}", error="${status === 403 ? "insufficient_scope" : "invalid_token"}"`,
    } : {};
    return Response.json({ error: status === 503 ? "Integration is unavailable." : "OAuth access denied." }, {
      status, headers: { ...headers, ...challenge, ...(status === 429 ? { "Retry-After": "60" } : {}) },
    });
  }
}
