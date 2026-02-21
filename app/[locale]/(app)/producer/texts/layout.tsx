// app/(app)/producer/texts/layout.tsx
"use client";

import SectionShell from "@/components/SectionShell";
import AuthGate from "@/components/AuthGate";

export default function ProducerTextsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <SectionShell
        title=""
        subtitle=""
        items={[
          
        ]}
      >
        {children}
      </SectionShell>
    </AuthGate>
  );
}
