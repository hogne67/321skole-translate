"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_COORDINATES_SETTINGS, getCoordinatesCopy, COORDINATES_AXES, COORDINATES_EXTENTS, COORDINATES_MODES, coordinatesSteps, normalizeCoordinatesSettings, sanitizeCoordinatesWorksheet, type CoordinatesMode, type CoordinatesSettings, type CoordinatesWorksheet } from "@/lib/math/coordinates/worksheet";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import CoordinatesWorksheetView from "./CoordinatesWorksheetView";

export default function CoordinatesGenerator() {
  const locale = useLocale(), copy = getCoordinatesCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<CoordinatesSettings>({ ...DEFAULT_COORDINATES_SETTINGS });
  const [worksheet, setWorksheet] = useState<CoordinatesWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-coordinates-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeCoordinatesWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<CoordinatesSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  function changeMode(taskType: CoordinatesMode) {
    const quadrants = taskType === "reflect" ? "all" : settings.quadrants;
    const steps = coordinatesSteps(settings.extent, quadrants);
    change({ taskType, quadrants, step: steps.includes(settings.step) ? settings.step : steps[0], pointCount: taskType === "draw_figure" || taskType === "mixed" ? Math.max(3, settings.pointCount) : settings.pointCount });
  }
  function changeRange(next: Pick<CoordinatesSettings, "quadrants" | "extent">) {
    const steps = coordinatesSteps(next.extent, next.quadrants);
    change({ ...next, step: steps.includes(settings.step) ? settings.step : steps[0] });
  }
  let validation = "";
  try { normalizeCoordinatesSettings(settings); }
  catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-coordinates-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeCoordinatesWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => changeMode(event.target.value as CoordinatesMode)}>{COORDINATES_MODES.map(mode => <option key={mode} value={mode}>{copy[mode]}</option>)}</select></label>
      <label className="length-field">{copy.quadrants}<select disabled={busy} value={settings.quadrants} onChange={event => changeRange({ extent: settings.extent, quadrants: event.target.value as CoordinatesSettings["quadrants"] })}><option value="positive" disabled={settings.taskType === "reflect"}>{copy.positive}</option><option value="all">{copy.all}</option></select></label>
      <label className="length-field">{copy.extent}<select disabled={busy} value={settings.extent} onChange={event => changeRange({ quadrants: settings.quadrants, extent: Number(event.target.value) as CoordinatesSettings["extent"] })}>{COORDINATES_EXTENTS.map(extent => <option key={extent} value={extent}>{settings.quadrants === "all" ? -extent : 0} … {extent}</option>)}</select></label>
      <label className="length-field">{copy.step}<select disabled={busy} value={settings.step} onChange={event => change({ step: Number(event.target.value) })}>{coordinatesSteps(settings.extent, settings.quadrants).map(step => <option key={step} value={step}>{step}</option>)}</select></label>
      <label className="length-field">{copy.pointCount}<select disabled={busy} value={settings.pointCount} onChange={event => change({ pointCount: Number(event.target.value) })}>{[1, 2, 3, 4, 5].filter(n => n >= (settings.taskType === "draw_figure" || settings.taskType === "mixed" ? 3 : 1)).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      {settings.taskType === "reflect" || settings.taskType === "mixed" && settings.quadrants === "all" ? <label className="length-field">{copy.reflectionAxis}<select disabled={busy} value={settings.reflectionAxis} onChange={event => change({ reflectionAxis: event.target.value as CoordinatesSettings["reflectionAxis"] })}>{COORDINATES_AXES.map(axis => <option key={axis} value={axis}>{copy[axis]}</option>)}</select></label> : null}
      {settings.quadrants === "positive" && settings.taskType === "mixed" ? <p>{copy.positiveNote}</p> : null}
      <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={60} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => change({ showSupport: event.target.checked })} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <CoordinatesWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
