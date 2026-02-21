// lib/navItems.ts
import type { AppMode } from "@/lib/mode";

export type NavItem = { href: string; labelKey: string };

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
    { href: homeForMode(mode), labelKey: "nav.dashboard" },
    { href: "/content", labelKey: "nav.myContent" },
  ];

  if (mode === "student") {
    return [
      ...base,
      { href: "/student/spaces", labelKey: "nav.mySpaces" },
    ];
  }

  if (mode === "parent") {
    return [
      ...base,
      { href: "/join", labelKey: "nav.joinSpace" },
    ];
  }

  if (mode === "teacher") {
    return [
      ...base,
      { href: "/teacher/spaces", labelKey: "nav.spaces" },
      { href: "/producer/texts/new", labelKey: "nav.createLesson" },
    ];
  }

  if (mode === "creator") {
    return [
      ...base,
      { href: "/producer/texts", labelKey: "nav.myLessons" },
      { href: "/producer/texts/new", labelKey: "nav.newLesson" },
    ];
  }

  // admin
  return [
    ...base,
    { href: "/admin/users", labelKey: "nav.users" },
    { href: "/admin/review", labelKey: "nav.review" },
    { href: "/admin/submissions", labelKey: "nav.submissions" },
  ];
}