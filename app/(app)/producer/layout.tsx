// app/(app)/producer/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function ProducerLayout({ children }: { children: React.ReactNode }) {
  // Producer = teacher i MVP (samme rolle)
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      {children}
    </AuthGate>
  );
}

