import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { log } from "node:console";

// Local, ignored output; never print private key material into build/agent logs.
const output = resolve(process.cwd(), ".env.openai-oauth.local");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...privateKey.export({ format: "jwk" }), kid: randomUUID(), use: "sig", alg: "RS256" };
writeFileSync(output, [
  `OPENAI_OAUTH_COOKIE_KEYS_JSON='${JSON.stringify([randomBytes(48).toString("base64url")])}'`,
  `OPENAI_OAUTH_JWKS_JSON='${JSON.stringify({ keys: [jwk] })}'`,
  "",
].join("\n"), { flag: "wx", mode: 0o600 });
log(`Secrets written to ignored file: ${output}. Keep it private; copy values into server environment settings.`);
