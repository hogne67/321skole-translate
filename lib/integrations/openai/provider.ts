import "server-only";
import Provider, { errors, type Configuration } from "oidc-provider";
import { ACCESS_TOKEN_TTL, GRANT_TTL, IntegrationError, LESSON_CREATE_SCOPE, readIntegrationConfig, type IntegrationConfig } from "./config";
import { firebaseOAuthServices, type OAuthServices } from "./services";

export type OAuthRuntime = { config: IntegrationConfig; services: OAuthServices; provider: Provider };

export function createOAuthRuntime(config: IntegrationConfig, services: OAuthServices): OAuthRuntime {
  const settings: Configuration = {
    adapter: services.adapter,
    clients: [{
      client_id: config.clientId, client_name: "ChatGPT / 321school private prototype",
      redirect_uris: config.redirectUris, response_types: ["code"], grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none", scope: LESSON_CREATE_SCOPE,
    }],
    jwks: config.jwks,
    cookies: {
      keys: config.cookieKeys,
      names: { session: "321oauth_session", interaction: "321oauth_interaction", resume: "321oauth_resume" },
      long: { httpOnly: true, sameSite: "lax", secure: config.secureCookies },
      short: { httpOnly: true, sameSite: "lax", secure: config.secureCookies },
    },
    scopes: [LESSON_CREATE_SCOPE], responseTypes: ["code"], clientAuthMethods: ["none"],
    pkce: { required: () => true },
    // Delegation is bounded by its own expiry, grant/binding and live Firebase checks.
    // Reconnecting in the browser must not invalidate an already-issued MCP token.
    expiresWithSession: () => false,
    // Refresh is delegated by the same explicit lessons:create consent; no additional scope.
    issueRefreshToken: (_ctx, client, source) => client.clientId === config.clientId &&
      client.grantTypeAllowed("refresh_token") && source.scopes.has(LESSON_CREATE_SCOPE),
    async rotateRefreshToken(ctx) {
      const token = ctx.oidc.entities.RefreshToken!;
      if (!token.grantId) throw new errors.InvalidGrant("Delegation is missing.");
      try { await assertActiveBinding({ config, services, provider }, token.grantId, token.accountId); }
      catch (error) {
        if (error instanceof IntegrationError) throw new errors.InvalidGrant("Delegated access is no longer valid.");
        throw error;
      }
      await services.checkRateLimit(token.accountId);
      return true; // Provider consumes atomically and detects replay; never reuse a refresh token.
    },
    allowOmittingSingleRegisteredRedirectUri: false,
    features: {
      devInteractions: { enabled: false }, registration: { enabled: false },
      userinfo: { enabled: false }, rpInitiatedLogout: { enabled: false },
      pushedAuthorizationRequests: { enabled: false }, dPoP: { enabled: false },
      revocation: { enabled: true, allowedPolicy: (_ctx, client, token) => client.clientId === config.clientId && token.clientId === client.clientId },
      resourceIndicators: {
        enabled: true, defaultResource: () => config.resource, useGrantedResource: () => true,
        getResourceServerInfo(_ctx, resource) {
          if (resource !== config.resource) throw new errors.InvalidTarget();
          return { scope: LESSON_CREATE_SCOPE, audience: config.resource, accessTokenTTL: ACCESS_TOKEN_TTL, accessTokenFormat: "opaque" };
        },
      },
    },
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL, AuthorizationCode: 60, Interaction: 600, Session: 3600, Grant: GRANT_TTL,
      // Rotation retains the original expiration, rather than extending consent indefinitely.
      RefreshToken: (ctx) => ctx.oidc.entities.RotatedRefreshToken?.remainingTTL ?? GRANT_TTL,
    },
    interactions: { url: (_ctx, interaction) => `/api/oauth/interaction/${interaction.uid}` },
    async findAccount(_ctx, uid) {
      const identity = await services.getIdentity(uid);
      return identity ? { accountId: identity.uid, claims: () => ({ sub: identity.uid }) } : undefined;
    },
    async loadExistingGrant(ctx) {
      // Never silently reuse an old browser consent. Only the just-completed interaction is accepted.
      const id = ctx.oidc.result?.consent?.grantId;
      return id ? provider.Grant.find(id) : undefined;
    },
    async extraTokenClaims(_ctx, token) {
      if (token.kind === "AccessToken") await assertActiveBinding({ config, services, provider }, token.grantId, token.accountId);
      return undefined;
    },
    renderError(ctx) {
      ctx.status = 400;
      ctx.type = "text/plain";
      ctx.body = "The authorization request could not be completed. Restart the connection from ChatGPT.";
    },
  };
  const provider = new Provider(config.issuer, settings);
  provider.proxy = true; // TLS terminates at Vercel; wrapper supplies canonical forwarding headers.
  provider.use(async (ctx, next) => {
    if (ctx.path === "/auth" && ctx.method === "GET") {
      const params = new URLSearchParams(ctx.querystring);
      if (params.getAll("scope").length !== 1 || params.get("scope") !== LESSON_CREATE_SCOPE) throw new errors.InvalidScope("Only lessons:create is supported.", LESSON_CREATE_SCOPE);
      if (params.getAll("resource").length !== 1 || params.get("resource") !== config.resource) throw new errors.InvalidTarget();
    }
    await next();
    if (ctx.path.startsWith("/.well-known/") && ctx.body && typeof ctx.body === "object") {
      // This delegation uses OAuth only: do not advertise/request OIDC profile scopes.
      (ctx.body as Record<string, unknown>).scopes_supported = [LESSON_CREATE_SCOPE];
    }
  });
  return { config, services, provider };
}

export async function assertActiveBinding(runtime: OAuthRuntime, grantId: string, expectedUid: string) {
  const binding = await runtime.services.getBinding(grantId);
  if (!binding || binding.uid !== expectedUid || binding.clientId !== runtime.config.clientId ||
      binding.revoked || binding.expiresAt <= Date.now() / 1000) throw new IntegrationError("Access was revoked or expired.", 401);
  const identity = await runtime.services.getIdentity(binding.uid);
  if (!identity || binding.authTime < identity.tokensValidAfter) throw new IntegrationError("Account access is no longer valid.", 401);
  return identity;
}

export async function authenticateMcp(runtime: OAuthRuntime, header: string | null) {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{20,1024})$/i);
  if (!match) throw new IntegrationError("An OAuth access token is required.", 401);
  const token = await runtime.provider.AccessToken.find(match[1]);
  if (!token || token.isExpired || token.aud !== runtime.config.resource || token.clientId !== runtime.config.clientId) {
    throw new IntegrationError("Invalid or expired access token.", 401);
  }
  if (token.scope !== LESSON_CREATE_SCOPE) throw new IntegrationError("Required scope is missing.", 403);
  const grant = await runtime.provider.Grant.find(token.grantId);
  if (!grant || grant.accountId !== token.accountId || grant.clientId !== token.clientId ||
      grant.getResourceScope(runtime.config.resource) !== LESSON_CREATE_SCOPE) throw new IntegrationError("Access was revoked.", 401);
  const identity = await assertActiveBinding(runtime, token.grantId, token.accountId);
  return { uid: identity.uid, scope: LESSON_CREATE_SCOPE };
}

let cached: OAuthRuntime | undefined;
export function getOAuthRuntime() {
  // Read the feature flag even when a warm instance already has a provider.
  const config = readIntegrationConfig();
  cached ??= createOAuthRuntime(config, firebaseOAuthServices(config));
  return cached;
}
