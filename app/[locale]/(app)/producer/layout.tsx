// app/(app)/producer/layout.tsx
"use client";

import AuthGate from "@/components/AuthGate";

export default function ProducerLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}