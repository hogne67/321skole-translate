"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import AuthGate from "@/components/AuthGate";

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.10)",
        textDecoration: "none",
        color: "inherit",
        background: "white",
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = useLocale();

  return (
    <AuthGate requireRole="admin">
      <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 16,
              padding: 16,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 18,
              background: "white",
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>321SKOLE</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Admin Console</h1>
            </div>

            <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <NavLink href={`/${locale}/admin`} label="Dashboard" />
              <NavLink href={`/${locale}/admin/review`} label="Moderation" />
              <NavLink href={`/${locale}/admin/users`} label="Users" />
              <NavLink href={`/${locale}/admin/stats`} label="Stats" />
              <NavLink href={`/${locale}/admin/trash`} label="Trash" />
            </nav>
          </header>

          {children}
        </div>
      </div>
    </AuthGate>
  );
}