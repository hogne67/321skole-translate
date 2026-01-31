// components/geo/GeoSearchSelect.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

export default function GeoSearchSelect({
  label,
  value,
  options,
  placeholder = "Søk…",
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label || "";
  }, [options, value]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options.slice(0, 40);

    // prioriter startsWith, så contains
    const starts = [];
    const contains = [];
    for (const o of options) {
      const s = o.label.toLowerCase();
      if (s.startsWith(query)) starts.push(o);
      else if (s.includes(query)) contains.push(o);
      if (starts.length + contains.length >= 60) break;
    }
    return [...starts, ...contains];
  }, [q, options]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          textAlign: "left",
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.14)",
          background: "white",
          cursor: "pointer",
        }}
      >
        {selectedLabel || "Velg…"}
      </button>

      {open ? (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.14)",
            borderRadius: 12,
            padding: 10,
            background: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.14)",
              outline: "none",
            }}
          />

          <div style={{ marginTop: 10, maxHeight: 280, overflow: "auto" }}>
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 10px",
                    border: 0,
                    background: active ? "rgba(0,0,0,0.06)" : "white",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  {o.label}
                </button>
              );
            })}

            {filtered.length === 0 ? (
              <div style={{ padding: 10, opacity: 0.7 }}>Ingen treff</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
