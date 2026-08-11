// app/(app)/student/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import EmailVerificationGate from "@/components/EmailVerificationGate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate allowAnonymous>
      <EmailVerificationGate role="student">{children}</EmailVerificationGate>
    </AuthGate>
  );
}
