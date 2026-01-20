"use client";

import { useState } from "react";

async function translateOne(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data?.translatedText ?? data?.translation ?? data?.text ?? "").toString();
}

export default function StudentTranslatorPage() {
  const [source, setSource] = useState("");
  const [targetLang, setTargetLang] = useState("no");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onTranslate() {
    setErr(null);
    setBusy(true);
    try {
      const t = await translateOne(source, targetLang);
      setOut(t);
    } catch (e: any) {
      setErr(e?.message ?? "Translate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Translator</h3>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
        >
          <option value="no">Norwegian</option>
          <option value="en">English</option>
          <option value="uk">Ukrainian</option>
          <option value="ar">Arabic</option>
          <option value="pl">Polish</option>
          <option value="es">Spanish</option>
          <option value="pt">Portuguese</option>
        </select>

        <button
          type="button"
          onClick={onTranslate}
          disabled={busy || !source.trim()}
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", background: "white" }}
        >
          {busy ? "Translating…" : "Translate"}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Original</div>
          <textarea
            rows={10}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{ width: "100%", border: "1px solid #ddd", borderRadius: 10, padding: 10, fontFamily: "inherit" }}
            placeholder="Paste text here…"
          />
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Translation</div>
          <textarea
            rows={10}
            value={out}
            readOnly
            style={{ width: "100%", border: "1px solid #ddd", borderRadius: 10, padding: 10, fontFamily: "inherit" }}
            placeholder="Result…"
          />
        </div>
      </div>
    </div>
  );
}
