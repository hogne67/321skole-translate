// app/(app)/parent/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import EmailVerificationGate from "@/components/EmailVerificationGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="parent">
      <EmailVerificationGate role="parent">{children}</EmailVerificationGate>
    </AuthGate>
  );
}
