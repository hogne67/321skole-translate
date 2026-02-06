// app/321lessons/layout.tsx

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>

      </header>

      <hr style={{ margin: "16px 0" }} />

      {children}
    </div>
  );
}
