"use client";

import { useMemo, useState } from "react";

type LangOption = { code: string; label: string };

export default function Page() {
  const languages: LangOption[] = useMemo(
    () => [
      { code: "en", label: "English" },
      { code: "pt-BR", label: "Português (Brasil)" },
      { code: "es", label: "Español" },
      { code: "ar", label: "العربية" },
      { code: "uk", label: "Українська" },
      { code: "fr", label: "Français" },
      { code: "de", label: "Deutsch" },
    ],
    []
  );

  const [text, setText] = useState("Hei! Dette er en lesetekst. Velg språk og trykk Oversett.");
  const [target, setTarget] = useState(languages[0].code);
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onTranslate() {
    setLoading(true);
    setError("");
    setTranslation("");

    try {
      const langLabel = languages.find((l) => l.code === target)?.label || target;

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang: langLabel }),
      });

      const data = (await res.json()) as { translation?: string; error?: string };

      if (!res.ok) throw new Error(data.error || "Feil ved oversettelse");
      setTranslation(data.translation || "");
    } catch (e: any) {
      setError(e?.message || "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        321skole – Oversett lesetekst
      </h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Lim inn tekst, velg språk, trykk oversett.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0" }}>
        <label style={{ fontWeight: 600 }}>Språk:</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ padding: "8px 10px" }}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <button
          onClick={onTranslate}
          disabled={loading || !text.trim()}
          style={{ padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Oversetter..." : "Oversett"}
        </button>
      </div>

      {error ? (
        <div style={{ padding: 12, background: "#ffe6e6", borderRadius: 8, marginBottom: 12 }}>
          <b>Feil:</b> {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Original</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            style={{ width: "100%", padding: 12, fontSize: 15 }}
          />
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Oversatt</h2>
          <div
            style={{
              minHeight: 14 * 24,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 4,
              whiteSpace: "pre-wrap",
              background: "#fafafa",
            }}
          >
            {translation || (loading ? "…" : "Oversettelsen vises her.")}
          </div>
        </section>
      </div>
    </main>
  );
}
