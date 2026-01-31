import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Unauthorized</h1>

      <p style={{ opacity: 0.8 }}>
        Du har ikke tilgang til denne delen ennå. Hvis du er ny bruker, fullfør registrering
        eller søk om teacher-tilgang.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 16, maxWidth: 420 }}>
        <Link href="/" style={{ textDecoration: "none" }}>🏠 Hjem</Link>
        <Link href="/student" style={{ textDecoration: "none" }}>👩‍🎓 Student</Link>
        <Link href="/teacher/apply" style={{ textDecoration: "none" }}>🧑‍🏫 Bli teacher</Link>
        <Link href="/onboarding" style={{ textDecoration: "none" }}>📝 Fullfør registrering</Link>
      </div>
    </main>
  );
}
