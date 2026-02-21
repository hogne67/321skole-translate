export default function ToolsPage() {
  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1>Tools</h1>
      <p style={{ opacity: 0.85 }}>
        Her samler vi oversetter, glosegenerator, oppgavegenerator og andre gratisverktøy.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <a href="/student/translate" style={card}>Translator</a>
        <a href="/student/generator" style={card}>Generate tasks</a>
        <a href="/student/vocab" style={card}>Glossary generator</a>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  padding: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 12,
  textDecoration: "none",
  color: "inherit",
};
