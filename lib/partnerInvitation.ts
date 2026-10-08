import { createHash } from "node:crypto";

export function invitationId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readPartnerContact(body: Record<string, unknown>) {
  const read = (key: string, max: number) => typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
  const contact = { name: read("name", 120), email: read("email", 160).toLowerCase(), address: read("address", 300), phone: read("phone", 60) };
  if (!contact.name) throw new Error("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error("A valid email is required");
  return contact;
}

export function checkPartnerInvitation(
  invitation: Record<string, unknown> | undefined,
  user: { uid: string; email?: string; email_verified?: boolean },
  profile: Record<string, unknown>,
) {
  if (!user.email || !user.email_verified) throw new Error("Verify your email before accepting the invitation.");
  if (!invitation || invitation.email !== user.email.toLowerCase()) throw new Error("Sign in with the email address that received this invitation.");
  if (profile.role === "admin" || (profile.roles as Record<string, unknown> | undefined)?.admin === true) throw new Error("Admin accounts cannot accept partner invitations.");
  if (invitation.status === "approved" && invitation.uid === user.uid) return "accepted";
  if (invitation.status !== "invited") throw new Error("This invitation is no longer available.");
  return "accept";
}
