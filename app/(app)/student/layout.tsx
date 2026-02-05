// app/(app)/student/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate allowAnonymous>{children}</AuthGate>;
}
