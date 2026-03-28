// app/(app)/teacher/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher">
      <main className="w-full min-w-0">
        <section className="mx-auto w-full min-w-0 max-w-6xl px-3 py-4 sm:px-4 lg:px-6">
          {children}
        </section>
      </main>
    </AuthGate>
  );
}