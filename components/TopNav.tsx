// components/TopNav.tsx
"use client";

import Link from "next/link";
import { logout } from "@/lib/auth";
import { useUserProfile } from "@/lib/useUserProfile";

export default function TopNav() {
  const { profile, loading } = useUserProfile();

  const isTeacherApproved = profile?.teacherStatus === "approved" && !!profile?.roles?.teacher;
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

        <nav style={{ display: "flex", gap: 10, opacity: 0.95, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/student" style={{ textDecoration: "none" }}>
            Student
          </Link>

          <Link href="/parent" style={{ textDecoration: "none" }}>
            Parent
          </Link>

          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            Library
          </Link>

          {/* Teacher: kun synlig for godkjente teachers */}
          {isTeacherApproved ? (
            <Link href="/teacher" style={{ textDecoration: "none" }}>
              Teacher
            </Link>
          ) : null}

          {isAdmin ? (
            <Link href="/admin" style={{ textDecoration: "none" }}>
              Admin
            </Link>
          ) : null}

          {/* Apply-knapp: alltid sist, kun hvis du IKKE er teacher */}
          {!isTeacherApproved ? (
            <Link
              href="/apply/teacher"
              style={{
                textDecoration: "none",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.14)",
                background: isTeacherPending ? "rgba(0,0,0,0.06)" : "rgba(190,247,192,1)",
                fontWeight: 900,
                opacity: isTeacherPending ? 0.75 : 1,
                pointerEvents: isTeacherPending ? "none" : "auto",
              }}
              title={isTeacherPending ? "Søknaden din er sendt" : "Søk om teacher-tilgang"}
            >
              {isTeacherPending ? "Application sent ⏳" : "Apply for teacher access"}
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


