// app/(app)/admin/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";
import SectionShell from "@/components/SectionShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="admin">
      <SectionShell
        title="Admin"
        subtitle=""
        items={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/submissions", label: "Submissions" },
          { href: "/admin/users", label: "Users" },
        ]}
      >
        {children}
      </SectionShell>
    </AuthGate>
  );
}
