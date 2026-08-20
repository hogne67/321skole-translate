export type GuestRole = "student" | "teacher" | "parent";

const GUEST_ROLE_KEY = "321skole:guestRole";

export function isGuestRole(value: unknown): value is GuestRole {
  return value === "student" || value === "teacher" || value === "parent";
}

export function roleFromPathname(pathname: string | null | undefined): GuestRole | null {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "");
  const withoutLocale = path.replace(/^\/(en|no|nb|pt)(?=\/|$)/, "") || "/";

  if (withoutLocale === "/teacher" || withoutLocale.startsWith("/teacher/")) return "teacher";
  if (withoutLocale === "/parent" || withoutLocale.startsWith("/parent/")) return "parent";
  if (withoutLocale === "/student" || withoutLocale.startsWith("/student/spaces")) return "student";

  return null;
}

export function readGuestRole(): GuestRole {
  if (typeof window === "undefined") return "student";

  try {
    const stored = window.localStorage.getItem(GUEST_ROLE_KEY);
    return isGuestRole(stored) ? stored : "student";
  } catch {
    return "student";
  }
}

export function saveGuestRole(role: GuestRole) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(GUEST_ROLE_KEY, role);
  } catch {
    // Guest role is only a local UI hint, never an authorization source.
  }
}
