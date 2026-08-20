// app\[locale]\(app)\layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import AppShell from "@/components/AppShell";
import { usePathname } from "next/navigation";

function isAnonymousAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;

  return (
    pathname === "/nb/321lessons" ||
    pathname === "/en/321lessons" ||
    pathname === "/pt/321lessons" ||
    pathname === "/nb/321quiz" ||
    pathname === "/en/321quiz" ||
    pathname === "/pt/321quiz" ||
    pathname === "/nb/student" ||
    pathname === "/en/student" ||
    pathname === "/pt/student" ||
    pathname === "/nb/teacher" ||
    pathname === "/en/teacher" ||
    pathname === "/pt/teacher" ||
    pathname === "/nb/teacher/spaces" ||
    pathname === "/en/teacher/spaces" ||
    pathname === "/pt/teacher/spaces" ||
    pathname === "/nb/teacher/board" ||
    pathname === "/en/teacher/board" ||
    pathname === "/pt/teacher/board" ||
    pathname === "/nb/teacher/writing" ||
    pathname === "/en/teacher/writing" ||
    pathname === "/pt/teacher/writing" ||
    pathname === "/nb/parent" ||
    pathname === "/en/parent" ||
    pathname === "/pt/parent" ||
    pathname === "/nb/parent/spaces" ||
    pathname === "/en/parent/spaces" ||
    pathname === "/pt/parent/spaces" ||
    pathname === "/nb/tools" ||
    pathname === "/en/tools" ||
    pathname === "/pt/tools" ||
    pathname === "/nb/academy/courses/marketplace" ||
    pathname === "/en/academy/courses/marketplace" ||
    pathname === "/pt/academy/courses/marketplace" ||

    pathname.startsWith("/nb/lesson/") ||
    pathname.startsWith("/en/lesson/") ||
    pathname.startsWith("/pt/lesson/") ||

    pathname === "/nb/join" ||
    pathname === "/en/join" ||
    pathname === "/pt/join" ||

    pathname.startsWith("/nb/student/lesson/") ||
    pathname.startsWith("/en/student/lesson/") ||
    pathname.startsWith("/pt/student/lesson/") ||

    pathname.startsWith("/nb/student/spaces/") ||
    pathname.startsWith("/en/student/spaces/") ||
    pathname.startsWith("/pt/student/spaces/")
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const allowAnonymous = isAnonymousAllowedPath(pathname);

  return (
    <AuthGate allowAnonymous={allowAnonymous}>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
