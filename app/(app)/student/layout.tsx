// app/(app)/student/layout.tsx
"use client";

import SectionShell from "@/components/SectionShell";
import AuthGate from "@/components/AuthGate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate allowAnonymous>
      <SectionShell
        title="Student"
        subtitle=""
        items={[
          { href: "/student", label: "Dashboard" },
          { href: "/student/browse", label: "My library" },
          { href: "/student/translate", label: "Translater" },
          { href: "/student/generator", label: "Generate own tasks" },
          { href: "/student/vocab", label: "Glossary generator" },
        ]}
      >
        {children}
      </SectionShell>
    </AuthGate>
  );
}
