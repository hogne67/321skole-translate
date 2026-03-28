"use client";

import AuthGate from "@/components/AuthGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher">
      <main className="w-full min-w-0">
        {children}
      </main>
    </AuthGate>
  );
}