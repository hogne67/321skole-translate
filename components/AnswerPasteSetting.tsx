"use client";

import { useId } from "react";
import { useLocale } from "next-intl";
import { answerPasteCopy } from "@/lib/lessons/answerPaste";

export default function AnswerPasteSetting({ allowed, onChange, disabled = false }: {
  allowed: boolean;
  onChange: (allowed: boolean) => void;
  disabled?: boolean;
}) {
  const copy = answerPasteCopy(useLocale());
  const helpId = useId();
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ display: "flex", alignItems: "start", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={!allowed} disabled={disabled}
          aria-describedby={helpId} onChange={event => onChange(!event.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <span style={{ fontWeight: 700 }}>{copy.label}</span>
      </label>
      <div id={helpId} style={{ color: "#64748b", fontSize: 13, paddingLeft: 23 }}>{copy.help}</div>
    </div>
  );
}
