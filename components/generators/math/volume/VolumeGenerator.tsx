"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_VOLUME_SETTINGS, getVolumeCopy, VOLUME_LENGTH_UNITS, VOLUME_MODES, VOLUME_SHAPES, normalizeVolumeSettings, sanitizeVolumeWorksheet, type VolumeSettings, type VolumeWorksheet } from "@/lib/math/volume/worksheet";
import { VOLUME_MAX_TASK_COUNT, volumeFullPageCounts, volumePageCapacity } from "@/lib/math/volume/printLayout";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import VolumeWorksheetView from "./VolumeWorksheetView";

export default function VolumeGenerator() {
  const locale = useLocale(), copy = getVolumeCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<VolumeSettings>({ ...DEFAULT_VOLUME_SETTINGS, shapes: [...DEFAULT_VOLUME_SETTINGS.shapes] });
  const [countMode, setCountMode] = useState<"pages" | "custom">("pages");
  const [worksheet, setWorksheet] = useState<VolumeWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-volume-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizeVolumeWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    setCountMode(volumeFullPageCounts(result.settings.showSupport).includes(result.settings.taskCount) ? "pages" : "custom");
    persistence.rememberSaved(id, result); return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  const pageCounts = volumeFullPageCounts(settings.showSupport), capacity = volumePageCapacity(settings.showSupport);
  function change(next: Partial<VolumeSettings>) { setSettings(current => ({ ...current, ...next })); setWorksheet(null); setError(""); }
  function changeSupport(showSupport: boolean) {
    const nextCounts = volumeFullPageCounts(showSupport), page = Math.max(0, pageCounts.indexOf(settings.taskCount));
    change({ showSupport, ...(countMode === "pages" ? { taskCount: nextCounts[Math.min(page, nextCounts.length - 1)] } : {}) });
  }
  function changeType(taskType: VolumeSettings["taskType"]) {
    const shapes = taskType === "count_cubes" ? settings.shapes.filter(shape => shape !== "cylinder") : settings.shapes;
    change({ taskType, shapes: shapes.length ? shapes : ["cube", "cuboid"] });
  }
  let validation = "";
  try { normalizeVolumeSettings(settings); } catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-volume-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizeVolumeWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => changeType(event.target.value as VolumeSettings["taskType"])}>{VOLUME_MODES.map(type => <option key={type} value={type}>{copy[type]}</option>)}</select></label>
      <fieldset disabled={busy}><legend>{copy.shapes}</legend>{VOLUME_SHAPES.map(shape => <label className="length-toggle" key={shape}><input type="checkbox" disabled={shape === "cylinder" && settings.taskType === "count_cubes"} checked={settings.shapes.includes(shape)} onChange={event => change({ shapes: event.target.checked ? [...settings.shapes, shape] : settings.shapes.filter(s => s !== shape) })} />{copy[shape]}</label>)}</fieldset>
      <p>{copy.countNote}</p>
      <label className="length-field">{copy.lengthUnit}<select disabled={busy} value={settings.lengthUnit} onChange={event => change({ lengthUnit: event.target.value as VolumeSettings["lengthUnit"] })}>{VOLUME_LENGTH_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
      <label className="length-field">{copy.maximum}<select disabled={busy || settings.taskType === "count_cubes"} value={settings.maximum} onChange={event => change({ maximum: Number(event.target.value) })}>{[5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="length-toggle"><input disabled={busy || settings.taskType === "count_cubes"} type="checkbox" checked={settings.allowDecimals} onChange={event => change({ allowDecimals: event.target.checked })} />{copy.decimals}</label>
      <label className="length-field">{common.pageCount}<select disabled={busy} aria-describedby="volume-page-hint" value={countMode === "custom" ? "custom" : settings.taskCount} onChange={event => {
        if (event.target.value === "custom") setCountMode("custom");
        else { setCountMode("pages"); change({ taskCount: Number(event.target.value) }); }
      }}>{pageCounts.map((count, page) => <option key={count} value={count}>{common.pageOption.replace("{pages}", String(page + 1)).replace("{tasks}", String(count))}</option>)}<option value="custom">{common.customCount}</option></select></label>
      {countMode === "custom" ? <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={VOLUME_MAX_TASK_COUNT} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label> : null}
      <p id="volume-page-hint">{copy.pageHint.replace("{first}", String(capacity.first)).replace("{following}", String(capacity.following))}</p>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showSupport} onChange={event => changeSupport(event.target.checked)} />{copy.support}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <VolumeWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
