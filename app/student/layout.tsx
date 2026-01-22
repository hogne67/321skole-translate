// app/student/layout.tsx
import Link from "next/link";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, opacity: 0.7 }}>321skole</div>
          <h2 style={{ margin: 0 }}>Student</h2>
        </div>

        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/student" style={{ textDecoration: "none" }}>
            Student
          </Link>
          <Link href="/producer" style={{ textDecoration: "none" }}>
            Teacher
          </Link>
          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            Library
          </Link>
        </nav>
      </header>

      <hr style={{ margin: "16px 0" }} />

      {children}
    </div>
  );
}

