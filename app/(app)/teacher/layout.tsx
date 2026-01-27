// app/(app)/teacher/layout.tsx
"use client";

import SectionShell from "@/components/SectionShell";
import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <SectionShell
        title="Teacher"
        subtitle=""
        items={[
          { href: "/teacher", label: "Dashboard" },
          { href: "/producer/texts", label: "My content" },
          { href: "/producer/texts/new", label: "Create new lesson" },
        ]}
      >
        {children}
      </SectionShell>
    </AuthGate>
  );
}
