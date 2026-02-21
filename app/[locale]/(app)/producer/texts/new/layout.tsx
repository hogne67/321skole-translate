// app/(app)/producer/texts/[id]/layout.tsx
"use client";

export default function ProducerTextsIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="plain-scope">{children}</div>;
}