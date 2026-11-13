"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import MathSpacePicker from "../MathSpacePicker";
import MathGeneratorActions from "../MathGeneratorActions";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import { DEFAULT_MEASUREMENT_SETTINGS, getMeasurementCopy, measurementPairs, normalizeMeasurementSettings, sanitizeMeasurementWorksheet, type MeasurementSettings, type MeasurementWorksheet } from "@/lib/math/measurement/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import LengthWorksheetView from "./LengthWorksheetView";
import { MEASUREMENT_CATEGORIES, getMeasurementUnits, getMeasurementDefaults, type MeasurementCategory } from "@/lib/math/measurement/worksheet";


export default function MeasurementGenerator() {
  const locale = useLocale();
  const [settings, setSettings] = useState<MeasurementSettings>({ ...DEFAULT_MEASUREMENT_SETTINGS });
  const copy = getMeasurementCopy(locale, settings.category);
  const [worksheet, setWorksheet] = useState<MeasurementWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState(locale);
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-measurement-worksheet", language: locale });
  const { savedId, sharing, setSharing, success } = persistence;
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeMeasurementWorksheet(data.measurementWorksheet ?? data.lengthWorksheet ?? data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);

    persistence.rememberSaved(id, result);
    return true;
  });
  function change(next: Partial<MeasurementSettings>) { setSettings(current => ({ ...current, ...next })); }
  function changeCategory(category: MeasurementCategory) {
    setSettings(current => ({ ...current, category, units: getMeasurementDefaults(category).units }));
    setWorksheet(null); setError("");
  }
  let validation = "";
  let limited = false;
  try {
    const normalized = normalizeMeasurementSettings(settings);
    const pairs = measurementPairs(normalized);
    if (!pairs.length) validation = copy.invalidCombinations;
    else limited = pairs.length < normalized.units.length * (normalized.units.length - 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    validation = message === "INVALID_UNITS" ? copy.invalidUnits : message === "INVALID_COUNT" ? copy.invalidCount : copy.invalidRange;
  }
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/generate-measurement-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json();
      const result = sanitizeMeasurementWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(copy.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : copy.failed); }
    finally { setBusy(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.generatorTitle}</h1><p>{copy.generatorSubtitle}</p>
      <label className="length-field">{copy.category}<select value={settings.category ?? "length"} disabled={busy} onChange={e => changeCategory(e.target.value as MeasurementCategory)}>{MEASUREMENT_CATEGORIES.map(category => <option key={category} value={category}>{copy[category]}</option>)}</select></label>
      <fieldset><legend>{copy.units}</legend><div className="length-unit-choices">{getMeasurementUnits(settings.category ?? "length").map(unit => <label key={unit}><input type="checkbox" checked={settings.units.includes(unit)} onChange={e => change({ units: e.target.checked ? [...settings.units, unit] : settings.units.filter(value => value !== unit) })} />{unit === "mil" ? copy.mil : unit === "t" ? copy.tonne : unit}</label>)}</div></fieldset>
      <label className="length-field">{copy.count}<input type="number" min={1} max={100} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={e => change({ taskCount: e.target.valueAsNumber })} /></label>
      <fieldset><legend>{copy.range}</legend><div className="length-range">{(["minimum", "maximum"] as const).map(key => <label key={key}>{copy[key]}<input type="number" min={0} max={100000} step={settings.allowDecimals ? "0.01" : "1"} value={Number.isNaN(settings[key]) ? "" : settings[key]} onChange={e => change({ [key]: e.target.valueAsNumber })} /></label>)}</div></fieldset>
      <label className="length-toggle"><input type="checkbox" checked={settings.allowDecimals} onChange={e => change({ allowDecimals: e.target.checked })} />{copy.decimals}</label>
      <label className="length-toggle"><input type="checkbox" checked={showAnswerKey} onChange={e => { setShowAnswerKey(e.target.checked); }} />{copy.key}</label>
      {validation ? <p className="length-error" role="status">{validation}</p> : limited ? <p>{copy.limitedPairs}</p> : null}
      <MathGeneratorActions language={locale} generating={busy} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p className="length-error" role="alert">{error || persistence.error || restored.error}</p> : null}{success ? <p className="length-success" role="status">{success}</p> : null}
      {savedId ? <Link href={`/${locale}/content`}>{copy.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={copy.worksheet}>{worksheet ? <LengthWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{sharing && savedId && worksheet ? <MathSpacePicker worksheetId={savedId} title={worksheet.title} language={worksheet.language} onClose={() => setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
