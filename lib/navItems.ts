// lib/navItems.ts
import type { AppMode } from "@/lib/mode";

export type NavItem = { href: string; label: string };

function homeForMode(mode: AppMode) {
  switch (mode) {
    case "teacher":
      return "/teacher";
    case "creator":
      return "/creator";
    case "admin":
      return "/admin";
    case "parent":
      return "/parent";
    case "student":
    default:
      return "/student";
  }
}

export function navItemsForMode(mode: AppMode): NavItem[] {
  const base: NavItem[] = [
    { href: "/content", label: "My content" },
    { href: homeForMode(mode), label: "Dashboard" },
  ];

  if (mode === "student") {
    return [...base];
  }

  if (mode === "parent") {
    return [...base];
  }

  if (mode === "teacher") {
    return [
      ...base,
      { href: "/teacher/spaces", label: "Spaces" },
      { href: "/producer/texts/new", label: "+ Create new lesson" },
    ];
  }

  if (mode === "creator") {
    return [
      ...base,
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