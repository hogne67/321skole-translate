"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

export function SearchableSelect({
  label,
  value,
  options,
  placeholder = "Søk…",
  onChange,
  buttonWidth = 260,
  fullWidth = false,
}: {
  label?: string;
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  buttonWidth?: number;
  fullWidth?: boolean;
}) {

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label ?? value ?? "";
  }, [options, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)
    );
  }, [options, q]);

  

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // ✅ Close on click outside + Escape
  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(e: MouseEvent) {
      const el = wrapperRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  return (
    <div
  ref={wrapperRef}
  style={{ display: "grid", gap: 6, position: "relative", zIndex: open ? 9999 : "auto" }}
>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // ✅ prevents focus weirdness
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: fullWidth ? "100%" : buttonWidth,
          textAlign: "left",
          padding: "10px 12px",
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "#fff",
          cursor: "pointer",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel || "Velg…"}
        <span style={{ float: "right", opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
  <div
    style={{
      position: "absolute",
      top: label ? 72 : 52,
      left: 0,
      zIndex: 10000,

      // ✅ viktig: full width i grid når fullWidth brukes
      width: fullWidth ? "100%" : buttonWidth,

      // ✅ viktig: ikke klipp innhold i containeren
      overflow: "visible",

      border: "1px solid #e5e7eb",
      borderRadius: 12,
      background: "#fff",
      boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
    }}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
  >

          <div style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: 10,
              }}
            />
          </div>

          <div style={{ maxHeight: 320, overflow: "auto" }} role="listbox">
            {filtered.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.7 }}>Ingen treff.</div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(o.value);
                      setOpen(false); // ✅ close immediately
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: 0,
                      background: active ? "rgba(0,0,0,0.04)" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{o.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{o.value}</div>
                  </button>
                );
              })
            )}
          </div>

          <div
            style={{
              padding: 10,
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {filtered.length} språk
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Lukk
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
