"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_NUMBER_LINE_SETTINGS, getNumberLineCopy, NUMBER_LINE_FORMS, NUMBER_LINE_MODES, NUMBER_LINE_STEPS, normalizeNumberLineSettings, sanitizeNumberLineWorksheet, type NumberLineForm, type NumberLineMode, type NumberLineSettings, type NumberLineWorksheet } from "@/lib/math/number-line/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import NumberLineWorksheetView from "./NumberLineWorksheetView";

export default function NumberLineGenerator() {
  const locale = useLocale(), copy = getNumberLineCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<NumberLineSettings>({ ...DEFAULT_NUMBER_LINE_SETTINGS });
  const [worksheet, setWorksheet] = useState<NumberLineWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-number-line-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeNumberLineWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<NumberLineSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  function changeForm(form: NumberLineForm) {
    change({ form, step: NUMBER_LINE_STEPS[form][0], minimum: 0, maximum: form === "integers" ? 20 : form === "decimals" ? 2 : 5 });
  }
  let validation = "";
  try { normalizeNumberLineSettings(settings); }
  catch (error) { validation = error instanceof Error && error.message === "INVALID_COMBINATIONS" ? copy.incompatible : copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-number-line-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeNumberLineWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => change({ taskType: event.target.value as NumberLineMode })}>{NUMBER_LINE_MODES.map(mode => <option key={mode} value={mode}>{copy[mode]}</option>)}</select></label>
      <label className="length-field">{copy.form}<select disabled={busy} value={settings.form} onChange={event => changeForm(event.target.value as NumberLineForm)}>{NUMBER_LINE_FORMS.map(form => <option key={form} value={form}>{copy[form]}</option>)}</select></label>
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={60} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label>
      <fieldset disabled={busy}><legend>{copy.range}</legend><div className="length-range">{(["minimum", "maximum"] as const).map(key => <label key={key}>{common[key]}<input type="number" min={-1000} max={1000} step={settings.form === "decimals" ? "0.1" : "1"} value={Number.isNaN(settings[key]) ? "" : settings[key]} onChange={event => change({ [key]: event.target.valueAsNumber })} /></label>)}</div></fieldset>
      <label className="length-field">{copy.step}<select disabled={busy} value={settings.step} onChange={event => change({ step: event.target.value })}>{NUMBER_LINE_STEPS[settings.form].map(step => <option key={step} value={step}>{locale === "en" ? step : step.replace(".", ",")}</option>)}</select></label>
      <label className="length-field">{copy.intervals}<select disabled={busy} value={settings.intervals} onChange={event => change({ intervals: Number(event.target.value) })}>{[4, 5, 6, 7, 8, 9, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => change({ showSupport: event.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <NumberLineWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
