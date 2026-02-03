// app/(app)/teacher/layout.tsx
"use client";

import SectionShell from "@/components/SectionShell";
import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <SectionShell
        title="Teacher"
        subtitle="Lærerverktøy: spaces, lessons og vurdering."
        items={[
          { href: "/teacher", label: "Dashboard" },
          { href: "/teacher/spaces", label: "Spaces" },
          { href: "/teacher/lessons", label: "My lessons" },
          { href: "/teacher/review", label: "Review" },

          // Snarvei (kan stå selv om /teacher/lessons/new ikke finnes ennå)
          { href: "/teacher/lessons/new", label: "+ New lesson" },
        ]}
      >
        {children}
      </SectionShell>
    </AuthGate>
  );
}
