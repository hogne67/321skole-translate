export function isSchoolInvitationPath(path: string, locale: string): boolean {
  return path.split(/[?#]/, 1)[0].replace(/\/+$/, "") === `/${locale}/school/accept`;
}
