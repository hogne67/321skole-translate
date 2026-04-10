// app/(app)/layout.tsx
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