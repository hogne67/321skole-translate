"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";
import { useUserProfile } from "@/lib/useUserProfile";

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const { profile, loading } = useUserProfile();
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  const isAnon = !!authUser?.isAnonymous;
  const isLoggedIn = !!authUser && !isAnon;

  const isTeacherApproved =
    profile?.teacherStatus === "approved" && !!profile?.roles?.teacher;

  const isTeacherPending = profile?.teacherStatus === "pending";
  const isAdmin = !!profile?.roles?.admin;

  async function handleLogout() {
    await signOut(auth);
    router.replace("/");
  }

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
      {/* LEFT */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none", fontWeight: 800 }}>
          321skole
        </Link>

        <nav style={{ display: "flex", gap: 10, opacity: 0.95, flexWrap: "wrap" }}>
          <Link href="/student" style={{ textDecoration: "none" }}>
            Student
          </Link>

          <Link href="/parent" style={{ textDecoration: "none" }}>
            Parent
          </Link>

          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            Library
          </Link>

          {isTeacherApproved && (
            <Link href="/teacher" style={{ textDecoration: "none" }}>
              Teacher
            </Link>
          )}

          {isAdmin && (
            <Link href="/admin" style={{ textDecoration: "none" }}>
              Admin
            </Link>
          )}

          {/* Apply teacher – kun for innloggede (ikke anon) */}
          {isLoggedIn && !isTeacherApproved && (
            <Link
              href="/apply/teacher"
              style={{
                textDecoration: "none",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.14)",
                background: isTeacherPending
                  ? "rgba(0,0,0,0.06)"
                  : "rgba(190,247,192,1)",
                fontWeight: 900,
                opacity: isTeacherPending ? 0.75 : 1,
                pointerEvents: isTeacherPending ? "none" : "auto",
              }}
              title={
                isTeacherPending
                  ? "Søknaden din er sendt"
                  : "Søk om teacher-tilgang"
              }
            >
              {isTeacherPending ? "Application sent ⏳" : "Apply for teacher access"}
            </Link>
          )}
        </nav>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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

        {/* Innlogget konto */}
        {isLoggedIn && (
          <>
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              {loading
                ? "Laster profil…"
                : profile?.email || profile?.displayName || "Innlogget"}
            </span>

            <button onClick={handleLogout} style={btnStyle}>
              Logg ut
            </button>
          </>
        )}
      </div>
    </header>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.14)",
  background: "white",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  textDecoration: "none",
};
