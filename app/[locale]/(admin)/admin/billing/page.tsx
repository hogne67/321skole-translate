"use client";

import { useState } from "react";
import { getAuth } from "firebase/auth";

export default function AdminBillingPage() {
  const [uid, setUid] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function runResync() {
    try {
      setLoading(true);
      setResult("");

      const user = getAuth().currentUser;
      if (!user) {
        throw new Error("Ikke logget inn");
      }

      const token = await user.getIdToken();

      const res = await fetch("/api/admin/billing/resync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: uid || undefined,
          customerId: customerId || undefined,
        }),
      });

      const data = await res.json();

      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
      <h1>Billing resync</h1>

      <p style={{ opacity: 0.7 }}>
        Brukes hvis betaling er gjennomført i Stripe, men ikke oppdatert i appen.
      </p>

      <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <input
          placeholder="UID (valgfritt)"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Customer ID (valgfritt)"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          style={inputStyle}
        />

        <button
          onClick={runResync}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Kjører..." : "Resync"}
        </button>
      </div>

      {result && (
        <pre
          style={{
            marginTop: 20,
            padding: 12,
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: 12,
            overflow: "auto",
            fontSize: 13,
          }}
        >
          {result}
        </pre>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#0f766e",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};