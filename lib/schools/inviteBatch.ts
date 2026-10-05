export type InviteRecipient = { email: string; displayName?: string };
export function inviteCapacityReason(limit: number, active: number, pending: number, requested: number): string | null {
  if (!Number.isInteger(limit) || limit <= 0) return "invalid_seat_limit";
  return active + pending + requested > limit ? "seat_limit_reached" : null;
}
export function validateInviteRecipients(value: unknown): InviteRecipient[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("invalid_batch");
  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid_email");
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_email");
    if (displayName.length > 120) throw new Error("invalid_name");
    if (seen.has(email)) throw new Error("duplicate_email");
    seen.add(email);
    return { email, displayName };
  });
}
