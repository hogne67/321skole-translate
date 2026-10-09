export function isCourseParticipantPath(path: string, locale: string): boolean {
  if (!["nb", "en", "pt"].includes(locale)) return false;
  return new RegExp(`^/${locale}/student/courses(?:/[A-Za-z0-9_-]+(?:/sessions/[1-9][0-9]*)?)?$`).test(path);
}
