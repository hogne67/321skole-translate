"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

async function translateOne(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  if (!res.ok) throw new Error(await res.text());

  const data: unknown = await res.json();
  const d = data as { translatedText?: unknown; translation?: unknown; text?: unknown };

  return String(d.translatedText ?? d.translation ?? d.text ?? "");
}

export default function ToolsTranslatePage() {
  const t = useTranslations("translateFree");

  const [source, setSource] = useState("");
  const [targetLang, setTargetLang] = useState("no");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function getErrMessage(e: unknown) {
    const msg = (e as { message?: unknown })?.message;
    return typeof msg === "string" ? msg : t("errors.default");
  }

  async function onTranslate() {
    setErr(null);
    setBusy(true);

    try {
      const translated = await translateOne(source, targetLang);
      setOut(translated);
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

        <button
          type="button"
          onClick={onTranslate}
          disabled={busy || !source.trim()}
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            background: "white",
            cursor: "pointer",
            opacity: busy || !source.trim() ? 0.6 : 1,
          }}
        >
          {busy ? t("buttons.translating") : t("buttons.translate")}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {t("fields.source")}
          </div>
          <textarea
            rows={10}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 10,
              fontFamily: "inherit",
            }}
            placeholder={t("placeholders.source")}
          />
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {t("fields.result")}
          </div>
          <textarea
            rows={10}
            value={out}
            readOnly
            style={{
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 10,
              fontFamily: "inherit",
            }}
            placeholder={t("placeholders.result")}
          />
        </div>
      </div>
    </main>
  );
}