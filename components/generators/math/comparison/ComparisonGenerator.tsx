"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Printer, Save, Share2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { COMPARISON_FORMS, COMPARISON_DENOMINATORS, DEFAULT_COMPARISON_SETTINGS, getComparisonCopy, normalizeComparisonSettings, sanitizeComparisonWorksheet, type ComparisonSettings, type ComparisonWorksheet } from "@/lib/math/comparison/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathSpacePicker from "../MathSpacePicker";
import ComparisonWorksheetView from "./ComparisonWorksheetView";

export default function ComparisonGenerator() {
  const locale = useLocale(), copy = getComparisonCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<ComparisonSettings>({ ...DEFAULT_COMPARISON_SETTINGS });
  const [worksheet, setWorksheet] = useState<ComparisonWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function change(next: Partial<ComparisonSettings>) {
    setSettings(current => ({ ...current, ...next }));
    setWorksheet(null); setSavedId(null); setSuccess(""); setError("");
  }
  let validation = "";
  try { normalizeComparisonSettings(settings); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    validation = code === "INVALID_FORMS" ? copy.invalidForms : code === "INVALID_MODE" ? copy.invalidMode : code === "INVALID_DENOMINATORS" ? copy.invalidDenominators : common.invalidCount;
  }
  async function generate() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/generate-comparison-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language: locale, showAnswerKey }) });
      const data = await response.json(), result = sanitizeComparisonWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result); setSavedId(null);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setBusy(false); }
  }
  async function save(share = false) {
    if (!worksheet) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(common.login);
      let id = savedId;
      if (!id) {
        const response = await fetch("/api/producer/save-comparison-worksheet", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ worksheet: { ...worksheet, showAnswerKey } }) });
        const data = await response.json();
        if (!response.ok || !data.ok || typeof data.id !== "string") throw new Error(common.failed);
        id = data.id; setSavedId(id);
      }
      setSuccess(common.saved);
      if (share) setSharing(true);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setBusy(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <fieldset disabled={busy}><legend>{copy.forms}</legend><div className="length-unit-choices">{COMPARISON_FORMS.map(form => <label key={form}><input type="checkbox" checked={settings.forms.includes(form)} onChange={e => {
        const forms = e.target.checked ? [...settings.forms, form] : settings.forms.filter(value => value !== form);
        change({ forms, ...(forms.length === 1 ? { mode: "same" as const } : {}) });
      }} />{copy[form]}</label>)}</div></fieldset>
      <label className="length-field">{copy.mode}<select aria-label={copy.mode} disabled={busy} value={settings.mode} onChange={e => change({ mode: e.target.value as ComparisonSettings["mode"] })}><option value="same">{copy.same}</option><option value="mixed" disabled={settings.forms.length < 2}>{copy.mixed}</option></select></label>
      {settings.forms.includes("fraction") ? <fieldset disabled={busy}><legend>{copy.denominators}</legend><div className="comparison-denominators">{COMPARISON_DENOMINATORS.map(d => <label key={d}><input type="checkbox" checked={settings.denominators.includes(d)} onChange={e => change({ denominators: e.target.checked ? [...settings.denominators, d] : settings.denominators.filter(value => value !== d) })} />{d}</label>)}</div></fieldset> : null}
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={100} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={e => change({ taskCount: e.target.valueAsNumber })} /></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.visualSupport} onChange={e => change({ visualSupport: e.target.checked, taskCount: settings.taskCount === (e.target.checked ? 36 : 12) ? (e.target.checked ? 12 : 36) : settings.taskCount })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={e => { setShowAnswerKey(e.target.checked); setSavedId(null); }} />{common.key}</label>
      {validation ? <p className="length-error" role="status">{validation}</p> : null}
      <div className="length-actions"><button type="button" className="length-primary" disabled={busy || !!validation} onClick={() => { void generate(); }}>{busy ? common.busy : copy.generate}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => { void save(); }}><Save size={15} aria-hidden="true" />{common.save}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => { void save(true); }}><Share2 size={15} aria-hidden="true" />{common.share}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => window.print()}><Printer size={15} aria-hidden="true" />{common.print}</button>
      </div>
      {error ? <p className="length-error" role="alert">{error}</p> : null}{success ? <p className="length-success" role="status">{success}</p> : null}
      {savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <ComparisonWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={locale} onClose={() => setSharing(false)} onShared={() => { setSharing(false); setSuccess(common.shared); }} /> : null}</main>;
}
