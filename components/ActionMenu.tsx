// components/ActionMenu.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

export type ActionItem = {
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void | Promise<void>;
};

export default function ActionMenu({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hasEnabled = items.some((x) => !x.disabled);
  if (!items.length) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasEnabled}
        title="Actions"
        style={{
          border: "1px solid rgba(0,0,0,0.14)",
          background: "white",
          borderRadius: 10,
          padding: "6px 10px",
          cursor: hasEnabled ? "pointer" : "not-allowed",
          opacity: hasEnabled ? 1 : 0.6,
          fontWeight: 900,
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            marginTop: 8,
            minWidth: 210,
            background: "white",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={!!it.disabled}
              onClick={async () => {
                if (it.disabled) return;
                setOpen(false);
                await it.onClick();
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: "white",
                cursor: it.disabled ? "not-allowed" : "pointer",
                fontWeight: 800,
                color: it.danger ? "#ef4444" : "inherit",
                opacity: it.disabled ? 0.55 : 1,
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
