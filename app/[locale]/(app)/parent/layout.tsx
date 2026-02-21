// app/(app)/parent/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  // Hvis du senere vil kreve parent-rolle eksplisitt:
  // <AuthGate requireRole="parent">
  return <AuthGate>{children}</AuthGate>;
}
