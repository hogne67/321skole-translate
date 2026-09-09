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
    hasPartnerAccess?: boolean;
  }
): NavItem[] {
  const base: NavItem[] = [
    { href: homeForRole(role), labelKey: "dashboard" },
    { href: "/content", labelKey: "myContent" },
  ];

  if (role === "teacher") {
    const teacherItems = [
      ...base,
      { href: "/teacher/board", labelKey: "board" },
      { href: "/teacher/writing", labelKey: "writingStation" },
      { href: "/teacher/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];

    if (opts?.hasPartnerAccess) {
      teacherItems.push({ href: "/partner", labelKey: "partner" });
    }

    return teacherItems;
  }

  if (role === "parent") {
    const parentItems = [
      ...base,
      { href: "/parent/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];

    if (opts?.hasPartnerAccess) {
      parentItems.push({ href: "/partner", labelKey: "partner" });
    }

    return parentItems;
  }

  if (role === "admin") {
    const adminItems = [
      ...base,
      { href: "/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
      { href: "/admin/users", labelKey: "users" },
      { href: "/admin/review", labelKey: "review" },
    ];

    if (opts?.hasPartnerAccess) {
      adminItems.push({ href: "/partner", labelKey: "partner" });
    }

    return adminItems;
  }

  if (role === "creator") {
    const creatorItems = [
      ...base,
      { href: "/spaces", labelKey: "spaces" },
      { href: "/tools", labelKey: "tools" },
    ];

    if (opts?.hasPartnerAccess) {
      creatorItems.push({ href: "/partner", labelKey: "partner" });
    }

    return creatorItems;
  }

  // student
  const studentItems: NavItem[] = [
    ...base,
    { href: "/student/spaces", labelKey: "mySpaces" },
  ];

  if (opts?.studentAccessMode !== "space_only") {
    studentItems.push({ href: "/tools", labelKey: "tools" });
  }

  if (opts?.hasPartnerAccess) {
    studentItems.push({ href: "/partner", labelKey: "partner" });
  }

  return studentItems;
}
