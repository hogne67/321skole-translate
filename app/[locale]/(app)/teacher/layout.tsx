// app/(app)/teacher/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher">
      <main className="w-full">
        <section className="w-full px-3 py-4 sm:px-4 lg:mx-auto lg:max-w-6xl lg:px-6">
          {children}
        </section>
      </main>
    </AuthGate>
  );
}