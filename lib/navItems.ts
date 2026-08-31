// lib/navItems.ts
export type Role = "student" | "teacher" | "parent" | "admin" | "creator";
export type StudentAccessMode = "space_only" | "self_study";

export type NavItem = { href: string; labelKey: string };

function homeForRole(role: Role) {
  if (role === "teacher") return "/teacher";
  if (role === "parent") return "/parent";
  if (role === "admin") return "/admin";
  if (role === "creator") return "/creator";
  return "/student";
}

/**
 * navItemsForRole
 *
 * Notes:
 * - hrefs are internal and WITHOUT locale prefix
 * - labelKey must exist inside the "nav" namespace
 */
export function navItemsForRole(
  role: Role,
  opts?: {
    studentAccessMode?: StudentAccessMode;
  }
): NavItem[] {
  const base: NavItem[] = [
    { href: homeForRole(role), labelKey: "dashboard" },
    { href: "/content", labelKey: "myContent" },
  ];

  if (role === "teacher") {
    return [
      ...base,
      { href: "/teacher/board", labelKey: "board" },
      { href: "/teacher/writing", labelKey: "writingStation" },
      { href: "/teacher/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];
  }

  if (role === "parent") {
    return [
      ...base,
      { href: "/parent/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];
  }

  if (role === "admin") {
    return [
      ...base,
      { href: "/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
      { href: "/admin/users", labelKey: "users" },
      { href: "/admin/review", labelKey: "review" },
    ];
  }

  if (role === "creator") {
    return [
      ...base,
      { href: "/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];
  }

  // student
  const studentItems: NavItem[] = [
    ...base,
    { href: "/student/spaces", labelKey: "mySpaces" },
  ];

  if (opts?.studentAccessMode !== "space_only") {
    studentItems.push({ href: "/tools", labelKey: "tools" });
  }

  return studentItems;
}
