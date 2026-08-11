"use client";

import AuthGate from "@/components/AuthGate";
import EmailVerificationGate from "@/components/EmailVerificationGate";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate requireRole="teacher">
      <EmailVerificationGate role="teacher">
        <main className="w-full min-w-0">
          {children}
        </main>
      </EmailVerificationGate>
    </AuthGate>
  );
}
