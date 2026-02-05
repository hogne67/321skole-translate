// app/(app)/unauthorized/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type Roles = {
  admin?: boolean;
  teacher?: boolean;
  creator?: boolean;
};

export default function UnauthorizedPage() {
  const { user, profile, loading } = useUserProfile();
  const pathname = usePathname();

  if (loading) return null;

  // Ikke innlogget
  if (!user) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Unauthorized</h1>
        <p style={{ opacity: 0.85 }}>
          Du må være innlogget for å få tilgang til denne siden.
        </p>
        <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`}>
          Gå til login
        </Link>
      </main>
    );
  }

  // Anonym bruker
  if (user.isAnonymous) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Du har ikke tilgang ennå</h1>
        <p style={{ opacity: 0.85 }}>
          Du er inne som gjest (anonym). Noen deler krever en innlogget konto.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/login">Logg inn</Link>
          <Link href="/student">Tilbake til Student</Link>
        </div>
      </main>
    );
  }

  // ---------- Trygg lesing av profile ----------
  const profileObj =
    profile && typeof profile === "object" ? profile : undefined;

  const roles: Roles | undefined =
    profileObj && "roles" in profileObj && typeof profileObj.roles === "object"
      ? (profileObj.roles as Roles)
      : undefined;

  const teacherStatus =
    profileObj && "teacherStatus" in profileObj && typeof profileObj.teacherStatus === "string"
      ? profileObj.teacherStatus
      : undefined;

  const creatorStatus =
    profileObj && "creatorStatus" in profileObj && typeof profileObj.creatorStatus === "string"
      ? profileObj.creatorStatus
      : undefined;

  const isAdmin = roles?.admin === true;
  const isTeacher = roles?.teacher === true;
  const isCreator = roles?.creator === true;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Du har ikke tilgang ennå</h1>

      <p style={{ opacity: 0.85 }}>
        Kontoen din mangler riktig tilgang for denne delen.
      </p>

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Din tilgang</div>

        <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
          <div>
            admin: <b>{isAdmin ? "ja" : "nei"}</b>
          </div>

          <div>
            teacher: <b>{isTeacher ? "ja" : "nei"}</b>{" "}
            {teacherStatus ? (
              <span style={{ opacity: 0.7 }}>(status: {teacherStatus})</span>
            ) : null}
          </div>

          <div>
            creator: <b>{isCreator ? "ja" : "nei"}</b>{" "}
            {creatorStatus ? (
              <span style={{ opacity: 0.7 }}>(status: {creatorStatus})</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/student">Tilbake til Student</Link>

          {!isTeacher && <Link href="/teacher/apply">Søk om teacher</Link>}
          {!isCreator && <Link href="/apply/creator">Søk om creator</Link>}

          <Link href="/">Forsiden</Link>
        </div>

        <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Hvis du nettopp ble godkjent: prøv å refresh siden.
        </p>
      </div>
    </main>
  );
}

