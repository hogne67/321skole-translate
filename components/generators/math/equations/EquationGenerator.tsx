"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Printer, Save, Share2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_EQUATION_SETTINGS, EQUATION_MODES, getEquationCopy, normalizeEquationSettings, equationTasksPerPage, sanitizeEquationWorksheet, type EquationSettings, type EquationMode, type EquationWorksheet } from "@/lib/math/equations/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathSpacePicker from "../MathSpacePicker";
import EquationWorksheetView from "./EquationWorksheetView";

export default function EquationGenerator() {
  const locale = useLocale(), copy = getEquationCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<EquationSettings>({ ...DEFAULT_EQUATION_SETTINGS });
  const [customCount, setCustomCount] = useState(false);
  const [worksheet, setWorksheet] = useState<EquationWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false), [savedId, setSavedId] = useState<string | null>(null), [sharing, setSharing] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState("");
  function change(next: Partial<EquationSettings>) {
    setSettings(current => { const updated = { ...current, ...next }; return next.taskType && !customCount ? { ...updated, taskCount: equationTasksPerPage(updated) } : updated; });
    setWorksheet(null); setSavedId(null); setSuccess(""); setError("");
  }
  function changeNumbers(field: "allowNegative" | "allowDecimals", checked: boolean) {
    const updated = { ...settings, [field]: checked };
    let minimum = Number.isFinite(settings.minimum) ? settings.minimum : DEFAULT_EQUATION_SETTINGS.minimum;
    let maximum = Number.isFinite(settings.maximum) ? settings.maximum : DEFAULT_EQUATION_SETTINGS.maximum;
    if (field === "allowNegative" && checked && minimum >= 0) minimum = -Math.max(Math.abs(minimum), Math.abs(maximum));
    if (!updated.allowDecimals) { minimum = Math.ceil(minimum); maximum = Math.floor(maximum); }
    if (!updated.allowNegative) minimum = Math.max(updated.allowDecimals ? .1 : 1, minimum);
    maximum = Math.max(minimum, maximum);
    change({ [field]: checked, minimum, maximum });
  }
  let validation = "";
  try { normalizeEquationSettings(settings); } catch (e) { validation = e instanceof Error && e.message === "INVALID_COMBINATIONS" ? copy.divisionHelp : settings.allowNegative || settings.allowDecimals ? copy.rangeHelp : copy.invalid; }
  async function generate() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/generate-equation-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language: locale, showAnswerKey }) });
      const data = await response.json(), result = sanitizeEquationWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result); setSavedId(null);
    } catch (e) { setError(e instanceof Error ? e.message : common.failed); } finally { setBusy(false); }
  }
  async function save(share = false) {
    if (!worksheet) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(common.login);
      let id = savedId;
      if (!id) {
        const response = await fetch("/api/producer/save-equation-worksheet", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ worksheet: { ...worksheet, showAnswerKey } }) });
        const data = await response.json();
        if (!response.ok || !data.ok || typeof data.id !== "string") throw new Error(common.failed);
        id = data.id; setSavedId(id);
      }
      setSuccess(common.saved); if (share) setSharing(true);
    } catch (e) { setError(e instanceof Error ? e.message : common.failed); } finally { setBusy(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={e => change({ taskType: e.target.value as EquationMode })}>{EQUATION_MODES.map(type => <option key={type} value={type}>{copy[type]}</option>)}</select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={100} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={e => { setCustomCount(true); change({ taskCount: e.target.valueAsNumber }); }} /></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.allowNegative ?? false} onChange={e => changeNumbers("allowNegative", e.target.checked)} />{copy.allowNegative}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.allowDecimals ?? false} onChange={e => changeNumbers("allowDecimals", e.target.checked)} />{copy.allowDecimals}</label>
      <fieldset disabled={busy}><legend>{copy.range}</legend><div className="length-range">{(["minimum", "maximum"] as const).map(field => <label key={field}>{field === "minimum" ? common.minimum : common.maximum}<input type="number" min={settings.allowNegative ? -100 : settings.allowDecimals ? .1 : 1} max={100} step={settings.allowDecimals ? .1 : 1} value={Number.isNaN(settings[field]) ? "" : settings[field]} onChange={e => change({ [field]: e.target.valueAsNumber })} /></label>)}</div></fieldset>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={e => change({ showSupport: e.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={e => { setShowAnswerKey(e.target.checked); setSavedId(null); }} />{common.key}</label>
      {validation ? <p className="length-error" role="status">{validation}</p> : null}
      <div className="length-actions"><button type="button" className="length-primary" disabled={busy || !!validation} onClick={() => void generate()}>{busy ? common.busy : copy.generate}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => void save()}><Save size={15} aria-hidden="true" />{common.save}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => void save(true)}><Share2 size={15} aria-hidden="true" />{common.share}</button>
        <button type="button" disabled={busy || !worksheet} onClick={() => window.print()}><Printer size={15} aria-hidden="true" />{common.print}</button>
      </div>
      {error ? <p className="length-error" role="alert">{error}</p> : null}{success ? <p className="length-success" role="status">{success}</p> : null}
      {savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <EquationWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={locale} onClose={() => setSharing(false)} onShared={() => { setSharing(false); setSuccess(common.shared); }} /> : null}</main>;
}
