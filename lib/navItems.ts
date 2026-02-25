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
 * - hrefs are "internal, no locale prefix" (AppShell/TopNav handles locale)
 * - labelKey MUST be inside the "nav" namespace (no "nav." prefix)
 */
export function navItemsForRole(role: Role): NavItem[] {
  const base: NavItem[] = [
    { href: homeForRole(role), labelKey: "dashboard" },
    { href: "/content", labelKey: "myContent" },
  ];

  if (role === "teacher") {
    return [
      ...base,
      { href: "/teacher/spaces", labelKey: "spaces" },
      { href: "/producer/texts/new", labelKey: "createLesson" },
    ];
  }

  // student
  return [...base, { href: "/student/spaces", labelKey: "mySpaces" }];
}