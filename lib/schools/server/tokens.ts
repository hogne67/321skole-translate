import { createHash, randomBytes } from "crypto";

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createInviteCode(): string {
  return randomBytes(10).toString("hex").toUpperCase().match(/.{5}/g)!.join("-");
}
export function normalizeInviteCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
export function inviteLookupField(value: string): { field: string; hash: string } {
  const code = normalizeInviteCode(value);
  return /^[A-F0-9]{20}$/.test(code)
    ? { field: "inviteCodeHash", hash: hashInviteToken(code) }
    : { field: "inviteTokenHash", hash: hashInviteToken(value) };
}
