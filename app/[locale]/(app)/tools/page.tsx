// app/[locale]/(app)/tools/page.tsx
"use client";

import type React from "react";
import Link from "next/link";

export default function ToolsPage() {
  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1>Tools</h1>
      <p style={{ opacity: 0.85 }}>
        Her samler vi oversetter, glosegenerator, oppgavegenerator og andre gratisverktøy.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <Link href="/tools/translate" style={card}>
          Translator
        </Link>
        <Link href="/tools/generator" style={card}>
          Generate tasks
        </Link>
        <Link href="/tools/vocab" style={card}>
          Glossary generator
        </Link>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  display: "block",
  padding: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 12,
  textDecoration: "none",
  color: "inherit",
};