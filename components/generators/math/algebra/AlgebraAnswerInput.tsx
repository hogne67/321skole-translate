"use client";

import { useRef } from "react";
import { formatAlgebraInput } from "@/lib/math/algebra/expression";
import { getAlgebraCopy } from "@/lib/math/algebra/worksheet";

export default function AlgebraAnswerInput({ value, onChange, readOnly, label, language, inputId }: { value: string; onChange: (value: string) => void; readOnly: boolean; label: string; language: string; inputId: string }) {
  const ref = useRef<HTMLInputElement>(null), copy = getAlgebraCopy(language);
  function insert(text: string) {
    const input = ref.current; if (!input || readOnly) return;
    const start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start;
    const next = value.slice(0, start) + text + value.slice(end); if (next.length > 240) return;
    onChange(next);
    requestAnimationFrame(() => { if (ref.current) { ref.current.focus(); ref.current.setSelectionRange(start + text.length, start + text.length); } });
  }
  return <div className="algebra-input">
    <label htmlFor={inputId}>{copy.answer}</label>
    <input ref={ref} id={inputId} type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={240} value={value} aria-label={`${label}: ${copy.answer}`} aria-describedby={`${inputId}-help`} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
    {!readOnly ? <><div className="algebra-symbols" role="group" aria-label={`${label}: ${copy.insert}`}>{["a", "b", " · ", "²", " + ", " − ", "(", ")"].map(symbol => <button key={symbol} type="button" aria-label={`${label}: ${copy.insert} ${symbol.trim()}`} onMouseDown={event => event.preventDefault()} onClick={() => insert(symbol)}>{symbol.trim()}</button>)}</div><small id={`${inputId}-help`}>{copy.inputHelp}</small></> : <span id={`${inputId}-help`} className="algebra-readonly-help">{copy.inputHelp}</span>}
    {value.trim() ? <div className="algebra-input-preview"><span>{copy.preview}:</span> <output htmlFor={inputId}>{formatAlgebraInput(value)}</output></div> : null}
  </div>;
}
