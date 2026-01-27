"use client";

import Link from "next/link";
import { logout } from "@/lib/auth";
import { useUserProfile } from "@/lib/useUserProfile";

export default function TopNav() {
  const { profile, loading } = useUserProfile();

  const isTeacherApproved = profile?.teacherStatus === "approved";
  const isTeacherPending = profile?.teacherStatus === "pending";
  const isAdmin = !!profile?.roles?.admin;

  return (
    <header
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none", fontWeight: 800 }}>
          321skole
        </Link>

        <nav style={{ display: "flex", gap: 10, opacity: 0.9, flexWrap: "wrap" }}>
          <Link href="/student" style={{ textDecoration: "none" }}>
            Student
          </Link>

          {/* Teacher: bedre tekst */}
          {isTeacherApproved ? (
            <Link href="/teacher" style={{ textDecoration: "none" }}>
              Teacher
            </Link>
          ) : (
            <Link href="/teacher/apply" style={{ textDecoration: "none" }}>
              {isTeacherPending ? "Teacher ⏳" : "Bli teacher"}
            </Link>
          )}

          <Link href="/parent" style={{ textDecoration: "none" }}>
            Parent
          </Link>

          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            Library
          </Link>

          {isAdmin ? (
            <Link href="/admin" style={{ textDecoration: "none" }}>
              Admin
            </Link>
          ) : null}
        </nav>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          {loading ? "Laster profil…" : profile?.email || profile?.displayName || "Innlogget"}
          {profile?.plan ? ` • ${profile.plan}` : ""}
        </span>

        <button
          onClick={logout}
          style={{
            border: "1px solid rgba(0,0,0,0.14)",
            background: "white",
            borderRadius: 10,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          Logg ut
        </button>
      </div>
    </header>
  );
}
