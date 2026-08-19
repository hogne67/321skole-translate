const LAST_STUDENT_SPACE_KEY = "321skole:lastStudentSpaceId";

function isBrowser() {
  return typeof window !== "undefined";
}

export function readLastStudentSpaceId(): string | null {
  if (!isBrowser()) return null;

  try {
    const value = window.localStorage.getItem(LAST_STUDENT_SPACE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function saveLastStudentSpaceId(spaceId: string) {
  if (!isBrowser()) return;

  const value = spaceId.trim();
  if (!value) return;

  try {
    window.localStorage.setItem(LAST_STUDENT_SPACE_KEY, value);
  } catch {
    // Ignore storage errors. Firestore membership is still the source of truth.
  }
}

