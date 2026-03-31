"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type VocabItem = {
  term: string;
  baseForm?: string;
  pos?: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
  note?: string;
};

type VocabResponse = {
  items?: VocabItem[];
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

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`Vocab API error (${res.status}): ${raw.slice(0, 300)}`);
  }

  let data: VocabResponse = {};
  try {
    data = raw ? (JSON.parse(raw) as VocabResponse) : {};
  } catch {
    throw new Error(`Vocab API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 300)}`);
  }

  return Array.isArray(data.items) ? data.items : [];
}

export default function ToolsVocabPage() {
  const t = useTranslations("vocabFree");

  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("no");
  const [level, setLevel] = useState("A2");
  const [count, setCount] = useState(10);

  const [items, setItems] = useState<VocabItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasText = useMemo(() => text.trim().length > 0, [text]);

  function getErrMessage(e: unknown) {
    const msg = (e as { message?: unknown })?.message;
    return typeof msg === "string" ? msg : t("errors.default");
  }

  async function onRun() {
    setErr(null);
    setBusy(true);
    setItems([]);

    try {
      const out = await findVocab({ text, targetLang, level, count });
      setItems(out);
    } catch (e: unknown) {
      setErr(getErrMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        {t("title")}
      </h1>

      <hr style={{ margin: "10px 0 14px" }} />

      <p style={{ opacity: 0.75, marginTop: 0 }}>
        {t("subtitle")}
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>
            {t("fields.target")}
          </span>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="no">{t("languages.no")}</option>
            <option value="en">{t("languages.en")}</option>
            <option value="uk">{t("languages.uk")}</option>
            <option value="ar">{t("languages.ar")}</option>
            <option value="pl">{t("languages.pl")}</option>
            <option value="es">{t("languages.es")}</option>
            <option value="pt">{t("languages.pt")}</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>
            {t("fields.cefr")}
          </span>
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
          <span style={{ opacity: 0.75, fontSize: 13 }}>
            {t("fields.count")}
          </span>
          <input
            type="number"
            min={5}
            max={30}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{
              width: 90,
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: "8px 10px",
            }}
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
          {busy ? t("buttons.finding") : t("buttons.findVocabulary")}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      <div style={{ height: 12 }} />

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {t("fields.text")}
        </div>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 10,
            fontFamily: "inherit",
          }}
          placeholder={t("placeholders.text")}
        />
      </div>

      {items.length > 0 && (
        <>
          <div style={{ height: 12 }} />

          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {t("fields.vocabulary")}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {items.map((it, idx) => (
                <div
                  key={`${it.term}_${idx}`}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800 }}>
                      {it.term}
                      {it.baseForm && it.baseForm !== it.term && (
                        <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 600 }}>
                          ({it.baseForm})
                        </span>
                      )}
                    </div>

                    {it.pos && (
                      <span
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {it.pos}
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <span style={{ opacity: 0.75 }}>
                      {t("fields.meaning")}:
                    </span>{" "}
                    <span style={{ fontWeight: 700 }}>{it.meaning}</span>
                    {it.note && <span style={{ opacity: 0.75 }}> — {it.note}</span>}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {t("fields.exampleFromText")}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                      {it.example}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {t("fields.exampleTranslation")}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                      {it.exampleTranslation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}