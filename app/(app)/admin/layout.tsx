// app/(app)/admin/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate requireRole="admin">{children}</AuthGate>;
}
