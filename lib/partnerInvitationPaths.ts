export function isPartnerInvitationPath(path: string, locale: string): boolean {
  return new RegExp(`^/${locale}/partner-invitation/[a-f0-9]{64}$`).test(path);
}
