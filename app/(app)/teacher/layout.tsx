// app/(app)/teacher/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <header style={{ marginBottom: 16 }}>
          <p style={{ opacity: 0.7, marginTop: 0 }}>
            Her kommer det etterhvert informasjon om din aktivitet.
          </p>
        </header>

        <section>{children}</section>
      </main>
    </AuthGate>
  );
}