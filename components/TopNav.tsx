// components/TopNav.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";
import type { AppMode } from "@/lib/mode";

function labelForMode(m: AppMode) {
  switch (m) {
    case "student":
      return "Student";
    case "parent":
      return "Parent";
    case "teacher":
      return "Teacher";
    case "creator":
      return "Creator";
    case "admin":
      return "Admin";
    default:
      return m;
  }
}

function homeForMode(m: AppMode) {
  switch (m) {
    case "teacher":
      return "/teacher";
    case "creator":
      return "/creator";
    case "admin":
      return "/admin";
    case "parent":
      return "/parent";
    case "student":
    default:
      return "/student";
  }
}

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const { profile, loading } = useUserProfile();
  const { mode, setMode, allowed } = useAppMode();

  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  const isAnon = !!authUser?.isAnonymous;
  const isLoggedIn = !!authUser && !isAnon;

  const isTeacherApproved = useMemo(() => {
    return profile?.teacherStatus === "approved" && !!profile?.roles?.teacher;
  }, [profile]);

  const isTeacherPending = profile?.teacherStatus === "pending";

  async function handleLogout() {
    await signOut(auth);
    router.replace("/");
  }

  function handleModeChange(next: AppMode) {
    setMode(next);
    router.push(homeForMode(next));
  }

  return (
    <header
      style={{
        background: "rgba(69, 57, 97, 0.15)",
        backdropFilter: "saturate(150%) blur(6px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* LEFT */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/" style={{ textDecoration: "none", fontWeight: 900 }}>
          321skole
        </Link>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Apply teacher – kun for innloggede (ikke anon) */}
        {isLoggedIn && !isTeacherApproved && (
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
        )}

        {/* Anon */}
        {isAnon && (
          <>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Gjestemodus</span>
            <Link
              href={`/login?next=${encodeURIComponent(pathname || "/student")}`}
              style={btnStyle}
            >
              Logg inn / Opprett konto
            </Link>
          </>
        )}

        {/* Innlogget */}
        {isLoggedIn && (
          <>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as AppMode)}
              disabled={loading || allowed.length <= 1}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.14)",
                background: "white",
              }}
              title={allowed.length <= 1 ? "Ingen andre moduser tilgjengelig" : "Bytt modus"}
            >
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {labelForMode(m)}
                </option>
              ))}
            </select>

            <button onClick={handleLogout} style={btnStyle}>
              Logg ut
            </button>
          </>
        )}

        {/* Ikke logget inn (ingen authUser ennå) */}
        {!authUser && (
          <Link
            href={`/login?next=${encodeURIComponent(pathname || "/student")}`}
            style={btnStyle}
          >
            Logg inn
          </Link>
        )}
      </div>
    </header>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(89, 131, 93, 0.23)",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  textDecoration: "none",
};