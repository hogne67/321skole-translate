// app/(app)/parent/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import EmailVerificationGate from "@/components/EmailVerificationGate";
import { usePathname } from "next/navigation";

function isParentDashboard(pathname: string | null): boolean {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "");
  return (
    path === "/nb/parent" ||
    path === "/en/parent" ||
    path === "/pt/parent" ||
    path === "/nb/parent/spaces" ||
    path === "/en/parent/spaces" ||
    path === "/pt/parent/spaces"
  );
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const allowGuestPreview = isParentDashboard(pathname);

  if (allowGuestPreview) {
    return <AuthGate allowAnonymous>{children}</AuthGate>;
  }

  return (
    <AuthGate requireRole="parent">
      <EmailVerificationGate role="parent">{children}</EmailVerificationGate>
    </AuthGate>
  );
}
