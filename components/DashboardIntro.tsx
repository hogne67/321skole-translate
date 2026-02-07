"use client";

import Link from "next/link";
import { useUserProfile } from "@/lib/useUserProfile";
import { useAppMode } from "@/components/ModeProvider";

function labelForMode(mode: string) {
  switch (mode) {
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
      return "User";
  }
}

export function DashboardIntro({ userIsAnon }: { userIsAnon: boolean }) {
  const { profile } = useUserProfile();
  const { mode } = useAppMode();

  const name = (profile?.displayName || "").trim();
  const role = labelForMode(mode);

  return (
    <section
      style={{
        padding: "14px 12px",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        background: "rgba(0,0,0,0.02)",
        marginBottom: 14, // <-- “plass” på mobil
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>
        {userIsAnon ? "Hei! 👋" : `Hei${name ? `, ${name}` : ""} 👋`}
      </h2>

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
        Du er {userIsAnon ? "inne som gjest" : "innlogget"} som <b>{role}</b>.
      </p>

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
        Her ser du din siste aktivitet. På <b>My content</b> finner du alt du har jobbet med tidligere.
      </p>

      {userIsAnon ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Vi anbefaler deg å registrere deg for å lagre påbegynte oppgaver.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <Link href="/join" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", textDecoration: "none" }}>
              Registrer / logg inn
            </Link>
            <Link href="/321lessons" style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", textDecoration: "none" }}>
              Åpne Library
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}