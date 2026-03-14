// app/(app)/parent/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate requireRole="parent">{children}</AuthGate>;
}