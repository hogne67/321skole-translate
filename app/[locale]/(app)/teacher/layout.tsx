// app/(app)/teacher/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>

        <section>{children}</section>
      </main>
    </AuthGate>
  );
}