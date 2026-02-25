// lib/navItems.ts
export type Role = "student" | "teacher";

export type NavItem = { href: string; labelKey: string };

function homeForRole(role: Role) {
  return role === "teacher" ? "/teacher" : "/student";
}

/**
 * navItemsForRole
 * V1: student + teacher only (no modes, no apply/approval bureaucracy).
 *
 * Notes:
 * - Keep hrefs as "internal, no locale prefix" (your components add locale when needed)
 * - If you still want admin links, add them in TopNav separately for your admin user later.
 */
export function navItemsForRole(role: Role): NavItem[] {
  const base: NavItem[] = [
    { href: homeForRole(role), labelKey: "nav.dashboard" },
    { href: "/content", labelKey: "nav.myContent" },
  ];

  if (role === "teacher") {
    return [
      ...base,
      { href: "/teacher/spaces", labelKey: "nav.spaces" },
      { href: "/producer/texts/new", labelKey: "nav.createLesson" },
    ];
  }

  // student
  return [
    ...base,
    { href: "/student/spaces", labelKey: "nav.mySpaces" },
  ];
}