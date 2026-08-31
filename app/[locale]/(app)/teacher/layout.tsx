"use client";

import AuthGate from "@/components/AuthGate";
import EmailVerificationGate from "@/components/EmailVerificationGate";
import { usePathname } from "next/navigation";

function isTeacherDashboard(pathname: string | null): boolean {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "");
  return (
    path === "/nb/teacher" ||
    path === "/en/teacher" ||
    path === "/pt/teacher" ||
    path === "/nb/teacher/spaces" ||
    path === "/en/teacher/spaces" ||
    path === "/pt/teacher/spaces" ||
    path === "/nb/teacher/board" ||
    path === "/en/teacher/board" ||
    path === "/pt/teacher/board" ||
    path === "/nb/teacher/writing" ||
    path === "/en/teacher/writing" ||
    path === "/pt/teacher/writing"
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const allowGuestPreview = isTeacherDashboard(pathname);

  if (allowGuestPreview) {
    return (
      <AuthGate allowAnonymous>
        <EmailVerificationGate role="teacher">
          <main className="w-full min-w-0">
            {children}
          </main>
        </EmailVerificationGate>
      </AuthGate>
    );
  }

  return (
    <AuthGate requireRole="teacher">
      <EmailVerificationGate role="teacher">
        <main className="w-full min-w-0">
          {children}
        </main>
      </EmailVerificationGate>
    </AuthGate>
  );
}
