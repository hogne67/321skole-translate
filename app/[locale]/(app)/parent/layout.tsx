// app/(app)/parent/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import ParentEmailVerificationGate from "@/components/ParentEmailVerificationGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="parent">
      <ParentEmailVerificationGate>{children}</ParentEmailVerificationGate>
    </AuthGate>
  );
}
