// app/(app)/teacher/page.tsx
import Link from "next/link";

export default function TeacherPage() {
  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Teacher</h1>
      <hr style={{ margin: "10px 0 14px" }} />

      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Her finner du snarveier til biblioteket og verktøy for å lage og publisere oppgaver.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 560 }}>
        <Link href="/321lessons" style={{ textDecoration: "none" }}>
          📚 Library
        </Link>

        <Link href="/producer/texts" style={{ textDecoration: "none" }}>
          ✍️ My lessons (editor)
        </Link>

        <Link href="/producer/texts/new" style={{ textDecoration: "none" }}>
          ➕ Create a new lesson
        </Link>

        <Link href="/producer" style={{ textDecoration: "none" }}>
          ⚙️ Producer dashboard
        </Link>
      </div>
    </main>
  );
}
