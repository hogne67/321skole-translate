import "server-only";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { errors } from "oidc-provider";
import { fetchNodeHandler } from "srvx/node";
import { assertSameOrigin, GRANT_TTL, IntegrationError, LESSON_CREATE_SCOPE } from "./config";
import { type OAuthRuntime } from "./provider";

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function appendCookie(res: ServerResponse, cookie: string) {
  const previous = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(previous) ? previous : previous ? [String(previous)] : []), cookie]);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-type"] !== "application/json") throw new IntegrationError("JSON is required.", 415);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 16384) throw new IntegrationError("Request is too large.", 413);
    chunks.push(bytes);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new IntegrationError("Invalid JSON.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new IntegrationError("Invalid request.", 400);
  return body as Record<string, unknown>;
}

function csrfCookieName(runtime: OAuthRuntime) {
  return runtime.config.secureCookies ? "__Host-321oauth-csrf" : "321oauth-csrf-dev";
}

function checkCsrf(req: IncomingMessage, body: Record<string, unknown>, runtime: OAuthRuntime) {
  assertSameOrigin(req.headers.origin, runtime.config);
  const prefix = `${csrfCookieName(runtime)}=`;
  const cookie = req.headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix))?.slice(prefix.length);
  const token = body.csrf;
  if (!cookie || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      cookie.length !== token.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(token))) {
    throw new IntegrationError("Invalid consent request. Reload this page.", 403);
  }
}

export function createOAuthHandler(runtime: OAuthRuntime) {
  const callback = runtime.provider.callback();
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(req.url ?? "/", runtime.config.origin);
      const expectedHost = new URL(runtime.config.origin).host;
      if (req.headers.host !== expectedHost) throw new IntegrationError("Invalid host.", 400);
      // Never let arbitrary forwarding headers change the issuer or redirect origin.
      req.headers["x-forwarded-host"] = expectedHost;
      req.headers["x-forwarded-proto"] = runtime.config.secureCookies ? "https" : "http";
      const path = url.pathname.startsWith("/api/oauth/") ? url.pathname.slice("/api/oauth".length) :
        url.pathname === "/.well-known/oauth-authorization-server/api/oauth" || url.pathname === "/.well-known/oauth-authorization-server"
          ? "/.well-known/oauth-authorization-server" : "";
      if (!path) throw new IntegrationError("Not found.", 404);
      const mountedRequest = req as IncomingMessage & { originalUrl: string; baseUrl: string };
      mountedRequest.originalUrl = `/api/oauth${path}${url.search}`;
      mountedRequest.baseUrl = "/api/oauth";
      req.url = `${path}${url.search}`;
      if (path === "/auth" && req.method !== "GET") throw new IntegrationError("Authorization requires GET.", 405);
      const interactionPath = path.match(/^\/interaction\/([A-Za-z0-9_-]{1,128})$/);
      if (interactionPath) {
        const details = await runtime.provider.interactionDetails(req, res);
        if (details.uid !== interactionPath[1] || details.params.client_id !== runtime.config.clientId ||
            details.params.scope !== LESSON_CREATE_SCOPE || details.params.resource !== runtime.config.resource) {
          throw new IntegrationError("Invalid authorization interaction.", 400);
        }
        if (req.method === "GET") {
          if (!req.headers.accept?.includes("application/json")) {
            res.statusCode = 303;
            res.setHeader("Location", `${runtime.config.origin}/nb/integrations/openai?interaction=${details.uid}`);
            res.end();
            return;
          }
          const csrf = randomBytes(32).toString("base64url");
          appendCookie(res, `${csrfCookieName(runtime)}=${csrf}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${runtime.config.secureCookies ? "; Secure" : ""}`);
          json(res, 200, { clientName: "ChatGPT", scope: LESSON_CREATE_SCOPE, csrf });
          return;
        }
        if (req.method !== "POST") throw new IntegrationError("Method not allowed.", 405);
        const body = await readJson(req);
        if (Object.keys(body).some((key) => !["action", "csrf", "idToken"].includes(key))) throw new IntegrationError("Unknown request field.", 400);
        checkCsrf(req, body, runtime);
        if (body.action === "deny") {
          const redirectTo = await runtime.provider.interactionResult(req, res, { error: "access_denied" }, { mergeWithLastSubmission: false });
          json(res, 200, { redirectTo });
          return;
        }
        if (body.action !== "approve" || typeof body.idToken !== "string") throw new IntegrationError("Sign-in and explicit consent are required.", 400);
        const identity = await runtime.services.verifyFirebaseToken(body.idToken);
        await runtime.services.checkRateLimit(identity.uid);
        const grant = new runtime.provider.Grant({ accountId: identity.uid, clientId: runtime.config.clientId });
        grant.addOIDCScope(LESSON_CREATE_SCOPE);
        grant.addResourceScope(runtime.config.resource, LESSON_CREATE_SCOPE);
        const grantId = await grant.save();
        await runtime.services.saveBinding(grantId, {
          uid: identity.uid, clientId: runtime.config.clientId, authTime: identity.authTime,
          revoked: false, expiresAt: Math.floor(Date.now() / 1000) + GRANT_TTL,
        });
        const redirectTo = await runtime.provider.interactionResult(req, res, {
          login: { accountId: identity.uid, ts: identity.authTime, remember: false }, consent: { grantId },
        }, { mergeWithLastSubmission: false });
        json(res, 200, { redirectTo });
        return;
      }
      const contentLength = Number(req.headers["content-length"] ?? 0);
      if (contentLength > 16384) throw new IntegrationError("Request is too large.", 413);
      // All OAuth parsing, PKCE, code exchange, token issuance and revocation belong to oidc-provider.
      await callback(req, res);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const status = error instanceof IntegrationError ? error.status : error instanceof errors.SessionNotFound ? 400 : 500;
      json(res, status, { error: status < 500 && error instanceof IntegrationError ? error.message : "Could not complete the authorization request." });
    }
  };
}

/** The only HTTP bridge into the App Router; no socket/listener is started. */
export async function handleOAuthRequest(request: Request, runtime: OAuthRuntime) {
  const url = new URL(request.url);
  if (url.origin !== runtime.config.origin || (request.headers.has("host") && request.headers.get("host") !== url.host)) {
    return Response.json({ error: "Invalid host." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const headers = new Headers(request.headers);
  headers.set("host", url.host);
  return fetchNodeHandler(createOAuthHandler(runtime), new Request(request, { headers }));
}
