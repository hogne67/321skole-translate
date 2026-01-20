// app/producer/layout.tsx
import Link from "next/link";

export default function ProducerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, opacity: 0.7 }}>321skole</div>
          <h2 style={{ margin: 0 }}>Producer</h2>
        </div>

        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/producer">Dashboard</Link>
          <Link href="/producer/texts">Lessons</Link>
          <Link href="/producer/texts/new">New lesson</Link>
        </nav>
      </header>

      <hr style={{ margin: "16px 0" }} />

      {children}
    </div>
  );
}


