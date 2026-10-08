import "server-only";

export const LESSON_CREATE_SCOPE = "lessons:create";
export const ACCESS_TOKEN_TTL = 300;
export const GRANT_TTL = 86400;

export class IntegrationError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export type IntegrationConfig = {
  origin: string;
  issuer: string;
  resource: string;
  clientId: string;
  redirectUris: string[];
  allowedUids: ReadonlySet<string>;
  cookieKeys: string[];
  jwks: { keys: Record<string, unknown>[] };
  secureCookies: boolean;
};

export function readIntegrationConfig(env: Record<string, string | undefined> = process.env): IntegrationConfig {
  if (env.OPENAI_MCP_ENABLED !== "true") throw new IntegrationError("Integration is disabled.", 404);
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing integration configuration: ${key}`);
    return value;
  };
  const originUrl = new URL(required("OPENAI_MCP_ORIGIN"));
  const local = ["localhost", "127.0.0.1"].includes(originUrl.hostname);
  if (originUrl.username || originUrl.password || originUrl.search || originUrl.hash || originUrl.pathname !== "/" ||
      (originUrl.protocol !== "https:" && !(local && originUrl.protocol === "http:" && env.NODE_ENV !== "production"))) {
    throw new Error("OPENAI_MCP_ORIGIN must be a canonical HTTPS origin (HTTP localhost in development only).");
  }
  const stringArray = (key: string) => {
    const value: unknown = JSON.parse(required(key));
    if (!Array.isArray(value) || !value.length || value.some((v) => typeof v !== "string" || !v.trim())) {
      throw new Error(`${key} must contain a non-empty JSON string array.`);
    }
    return value as string[];
  };
  const redirectUris = stringArray("OPENAI_OAUTH_REDIRECT_URIS_JSON");
  for (const uri of redirectUris) {
    const url = new URL(uri);
    if (url.username || url.password || url.hash ||
        (url.protocol !== "https:" && !(local && env.NODE_ENV !== "production" &&
          ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:"))) {
      throw new Error("OAuth redirect URIs must be exact HTTPS URLs, without credentials or fragments.");
    }
  }
  const cookieKeys = stringArray("OPENAI_OAUTH_COOKIE_KEYS_JSON");
  if (cookieKeys.some((key) => key.length < 43)) throw new Error("Use at least 32 random bytes per cookie signing key.");
  const jwks: unknown = JSON.parse(required("OPENAI_OAUTH_JWKS_JSON"));
  if (!jwks || typeof jwks !== "object" || !("keys" in jwks) || !Array.isArray(jwks.keys) ||
      !jwks.keys.length || jwks.keys.some((key: unknown) => !key || typeof key !== "object" ||
        !("d" in key) || !("kid" in key) || !("kty" in key) || key.kty !== "RSA")) {
    throw new Error("OPENAI_OAUTH_JWKS_JSON must contain private RSA signing JWKs with stable kid values.");
  }
  const origin = originUrl.origin;
  return {
    origin, issuer: `${origin}/api/oauth`, resource: `${origin}/api/mcp`,
    clientId: required("OPENAI_OAUTH_CLIENT_ID"), redirectUris, cookieKeys,
    allowedUids: new Set(stringArray("OPENAI_MCP_ALLOWED_UIDS_JSON")),
    jwks: jwks as IntegrationConfig["jwks"], secureCookies: originUrl.protocol === "https:",
  };
}

export function assertSameOrigin(origin: string | undefined, config: IntegrationConfig) {
  if (origin !== config.origin) throw new IntegrationError("Invalid request origin.", 403);
}
