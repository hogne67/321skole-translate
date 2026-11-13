"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_CLOCK_SETTINGS, getClockCopy, CLOCK_MINUTE_STEPS, CLOCK_MODES, normalizeClockSettings, sanitizeClockWorksheet, type ClockMinuteStep, type ClockMode, type ClockTimeFormat, type ClockSettings, type ClockWorksheet } from "@/lib/math/clock/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import ClockWorksheetView from "./ClockWorksheetView";

export default function ClockGenerator() {
  const locale = useLocale(), copy = getClockCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<ClockSettings>({ ...DEFAULT_CLOCK_SETTINGS });
  const [worksheet, setWorksheet] = useState<ClockWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-clock-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeClockWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<ClockSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  let validation = "";
  try { normalizeClockSettings(settings); }
  catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-clock-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeClockWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => change({ taskType: event.target.value as ClockMode })}>{CLOCK_MODES.map(mode => <option key={mode} value={mode}>{copy[mode]}</option>)}</select></label>
      <label className="length-field">{copy.precision}<select disabled={busy} value={settings.minuteStep} onChange={event => change({ minuteStep: Number(event.target.value) as ClockMinuteStep })}>{CLOCK_MINUTE_STEPS.map((step, i) => <option key={step} value={step}>{[copy.wholeHours, copy.halfHours, copy.quarterHours, copy.fiveMinutes, copy.everyMinute][i]}</option>)}</select></label>
      <label className="length-field">{copy.timeFormat}<select disabled={busy} value={settings.timeFormat} onChange={event => change({ timeFormat: event.target.value as ClockTimeFormat })}><option value="12h">{copy.format12}</option><option value="24h">{copy.format24}</option></select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={60} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label>
      {settings.taskType === "elapsed" || settings.taskType === "mixed" ? <>
        <label className="length-field">{copy.maxDuration}<select disabled={busy} value={settings.maxDuration} onChange={event => change({ maxDuration: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(hours => <option key={hours} value={hours * 60}>{hours} {hours === 1 ? copy.oneHour : copy.hours}</option>)}</select></label>
        <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.allowMidnight} onChange={event => change({ allowMidnight: event.target.checked })} />{copy.allowMidnight}</label>
      </> : null}
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => change({ showSupport: event.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <ClockWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
