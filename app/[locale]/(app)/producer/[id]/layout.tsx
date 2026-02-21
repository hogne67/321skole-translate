"use client";

import AuthGate from "@/components/AuthGate";

export default function ProducerDocLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <main className="mx-auto w-full max-w-none px-6 py-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 md:p-6">{children}</div>
          </div>
        </div>
      </main>
    </AuthGate>
  );
}