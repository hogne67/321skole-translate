// app/student/vocab/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type VocabItem = {
  term: string;
  baseForm?: string;
  pos?: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
  note?: string;
};

async function findVocab(args: {
  text: string;
  targetLang: string;
  level: string;
  count: number;
}): Promise<VocabItem[]> {
  const res = await fetch("/api/vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Vocab API error (${res.status}): ${t}`);
  }

  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

export default function StudentVocabPage() {
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("no");
  const [level, setLevel] = useState("A2");
  const [count, setCount] = useState(10);

  const [items, setItems] = useState<VocabItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasText = useMemo(() => text.trim().length > 0, [text]);

  async function onRun() {
    setErr(null);
    setBusy(true);
    setItems([]);

    try {
      const out = await findVocab({ text, targetLang, level, count });
      setItems(out);
    } catch (e: any) {
      setErr(e?.message ?? "Could not find vocabulary");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Glosefinner</h3>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Lim inn en tekst → få gloser med eksempelsetning + oversettelse (kontekst).
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/student">Dashboard</Link>
          <Link href="/student/translator">Translator</Link>
          <Link href="/student/results">My results</Link>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>Target</span>
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
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>CEFR</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>Count</span>
          <input
            type="number"
            min={5}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{ width: 90, border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          />
        </label>

        <button
          type="button"
          onClick={onRun}
          disabled={busy || !hasText}
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            background: "white",
            cursor: "pointer",
            opacity: busy || !hasText ? 0.6 : 1,
          }}
        >
          {busy ? "Finding…" : "Find vocabulary"}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      <div style={{ height: 12 }} />

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Text</div>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: "100%", border: "1px solid #ddd", borderRadius: 10, padding: 10, fontFamily: "inherit" }}
          placeholder="Paste a text here…"
        />
      </div>

      {items.length > 0 && (
        <>
          <div style={{ height: 12 }} />
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Vocabulary</div>

            <div style={{ display: "grid", gap: 12 }}>
              {items.map((it, idx) => (
                <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800 }}>
                      {it.term}
                      {it.baseForm && it.baseForm !== it.term ? (
                        <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 600 }}>
                          ({it.baseForm})
                        </span>
                      ) : null}
                    </div>
                    {it.pos ? (
                      <span style={{ fontSize: 12, opacity: 0.7, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px" }}>
                        {it.pos}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <span style={{ opacity: 0.75 }}>Meaning:</span>{" "}
                    <span style={{ fontWeight: 700 }}>{it.meaning}</span>
                    {it.note ? <span style={{ opacity: 0.75 }}> — {it.note}</span> : null}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Example (from text)</div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{it.example}</div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Example translation</div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{it.exampleTranslation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
