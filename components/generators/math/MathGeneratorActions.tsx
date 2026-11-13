"use client";

import { useState } from "react";
import { Printer, Save, Share2 } from "lucide-react";
import { getMathEditorCopy } from "@/lib/math/editorCopy";
import { printMathWorksheet } from "@/lib/math/printWorksheet";
import "./mathGeneratorActions.css";

export default function MathGeneratorActions({ language, onGenerate, onSave, onShare,
  generating = false, saving = false, loading = false, canGenerate = true, hasWorksheet,
}: {
  language: string; onGenerate: () => void; onSave: () => void; onShare: () => void;
  generating?: boolean; saving?: boolean; loading?: boolean; canGenerate?: boolean; hasWorksheet: boolean;
}) {
  const copy = getMathEditorCopy(language);
  const [printing, setPrinting] = useState(false);
  const busy = generating || saving || loading || printing;
  async function print() {
    setPrinting(true);
    try { await printMathWorksheet(); }
    finally { setPrinting(false); }
  }
  return <div className="math-generator-actions" aria-busy={busy}>
    {loading ? <p role="status">{copy.loading}</p> : null}
    <button type="button" className="math-generator-primary" disabled={busy || !canGenerate} onClick={onGenerate}>{generating ? copy.busy : copy.generate}</button>
    <button type="button" disabled={busy || !hasWorksheet} onClick={onSave}><Save size={16} aria-hidden="true" />{saving ? copy.busy : copy.save}</button>
    <button type="button" disabled={busy || !hasWorksheet} onClick={onShare}><Share2 size={16} aria-hidden="true" />{copy.share}</button>
    <button type="button" disabled={busy || !hasWorksheet} onClick={() => { void print(); }}><Printer size={16} aria-hidden="true" />{copy.print}</button>
  </div>;
}
