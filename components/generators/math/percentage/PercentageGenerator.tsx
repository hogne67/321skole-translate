"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Printer, Save, Share2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_PERCENTAGE_SETTINGS, PERCENTAGE_MODES, getPercentageCopy, isPercentageChange, normalizePercentageSettings, percentageChoices, percentageTasksPerPage, sanitizePercentageWorksheet, type PercentageSettings, type PercentageMode, type PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathSpacePicker from "../MathSpacePicker";
import PercentageWorksheetView from "./PercentageWorksheetView";

export default function PercentageGenerator() {
  const locale = useLocale(), copy = getPercentageCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<PercentageSettings>({ ...DEFAULT_PERCENTAGE_SETTINGS });
  const [hasCustomCount, setHasCustomCount] = useState(false);
  const supportLabel = { find_percentage: copy.support, find_part: copy.partSupport, find_whole: copy.wholeSupport, mixed: copy.mixedSupport, discount: copy.changeSupport, increase: copy.changeSupport }[settings.taskType ?? "find_percentage"];
  const [worksheet, setWorksheet] = useState<PercentageWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false), [savedId, setSavedId] = useState<string | null>(null), [sharing, setSharing] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState("");
  function change(next: Partial<PercentageSettings>) {
    setSettings(current => {
      const updated = { ...current, ...next };
      return !hasCustomCount && (next.showConclusion !== undefined || next.taskType !== undefined) ? { ...updated, taskCount: percentageTasksPerPage(updated) } : updated;
    });
    setWorksheet(null); setSavedId(null); setSuccess(""); setError("");
  }
  let validation = "";
  try { if (!percentageChoices(normalizePercentageSettings(settings)).length) validation = copy.invalidCombinations; }
  catch (error) { validation = error instanceof Error && error.message === "INVALID_COUNT" ? common.invalidCount : error instanceof Error && error.message === "INVALID_TYPE" ? copy.invalidType : copy.invalidRange; }
  async function generate() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/generate-percentage-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language: locale, showAnswerKey }) });
      const data = await response.json(), result = sanitizePercentageWorksheet(data.worksheet);
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
        const response = await fetch("/api/producer/save-percentage-worksheet", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ worksheet: { ...worksheet, showAnswerKey } }) });
        const data = await response.json();
        if (!response.ok || !data.ok || typeof data.id !== "string") throw new Error(common.failed);
        id = data.id; setSavedId(id);
      }
      setSuccess(common.saved); if (share) setSharing(true);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setBusy(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType ?? "find_percentage"} onChange={e => change({ taskType: e.target.value as PercentageMode })}>{PERCENTAGE_MODES.map(type => <option key={type} value={type}>{copy[type]}</option>)}</select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={100} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={e => { setHasCustomCount(true); change({ taskCount: e.target.valueAsNumber }); }} /></label>
      <fieldset disabled={busy}><legend>{isPercentageChange(settings.taskType) ? copy.priceRange : copy.range}</legend><div className="length-range">{(["minimum", "maximum"] as const).map(field => <label key={field}>{field === "minimum" ? common.minimum : common.maximum}<input type="number" min={1} max={10000} value={Number.isNaN(settings[field]) ? "" : settings[field]} onChange={e => change({ [field]: e.target.valueAsNumber })} /></label>)}</div></fieldset>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={e => change({ showSupport: e.target.checked })} />{supportLabel}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showConclusion ?? false} onChange={e => change({ showConclusion: e.target.checked })} />{copy.showConclusion}</label>
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
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <PercentageWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={locale} onClose={() => setSharing(false)} onShared={() => { setSharing(false); setSuccess(common.shared); }} /> : null}</main>;
}
