// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>321skole</h1>
      <p>Velg hvor du vil gå:</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link
          href="/producer"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Producer
        </Link>

        <Link
          href="/student"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Student
        </Link>
      </div>
    </main>
  );
}
