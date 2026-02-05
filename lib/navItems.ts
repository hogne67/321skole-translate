// lib/navItems.ts
import type { AppMode } from "@/lib/mode";

export type NavItem = { href: string; label: string };

function homeForMode(mode: AppMode) {
  switch (mode) {
    case "teacher":
      return "/teacher";
    case "creator":
      return "/creator"; // UI-home for creator (legacy ligger fortsatt under /producer)
    case "admin":
      return "/admin";
    case "parent":
      return "/parent";
    case "student":
    default:
      return "/student";
  }
}

export function navItemsForMode(mode: AppMode, opts?: { isAnon?: boolean }): NavItem[] {
  const isAnon = opts?.isAnon === true;

  // Motor + status + verktøy
  const base: NavItem[] = [
    { href: "/content", label: "My content" },
    { href: homeForMode(mode), label: "Dashboard" },
    { href: "/tools", label: "Tools" },
  ];

  if (mode === "student") {
    return [
      ...base,

      // My library kun for innlogget student (ikke anon)
      ...(!isAnon ? [{ href: "/student/browse", label: "My library" }] : []),
    ];
  }

  if (mode === "parent") {
    return [...base];
  }

  if (mode === "teacher") {
    return [
      ...base,
      { href: "/teacher/spaces", label: "Spaces" },
      { href: "/teacher/lessons", label: "My lessons" },
      { href: "/teacher/review", label: "Review" },
      { href: "/teacher/lessons/new", label: "+ New lesson" },
    ];
  }

  if (mode === "creator") {
    return [
      ...base,
      // Legacy-ruter (inntil vi har full creator-område)
      { href: "/producer/texts", label: "My lessons" },
      { href: "/producer/texts/new", label: "+ New lesson" },
    ];
  }

  // admin
  return [
    ...base,
    { href: "/admin/users", label: "Users" },
    { href: "/admin/review", label: "Review" },
    { href: "/admin/submissions", label: "Submissions" },
    { href: "/admin/trash", label: "Trash" },
  ];
}
