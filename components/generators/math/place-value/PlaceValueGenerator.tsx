"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { DEFAULT_PLACE_VALUE_SETTINGS, PLACE_VALUE_MODES, getPlaceValueCopy, normalizePlaceValueSettings, sanitizePlaceValueWorksheet, type PlaceValueSettings, type PlaceValueWorksheet } from "@/lib/math/place-value/worksheet";
import { PLACE_VALUE_MAX_TASK_COUNT, placeValuePageCapacity, placeValueFullPageCounts, placeValueCountAfterOptionsChange } from "@/lib/math/place-value/printLayout";
import MathGeneratorBackLink from "../MathGeneratorBackLink";
import MathGeneratorActions from "../MathGeneratorActions";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import PlaceValueWorksheetView from "./PlaceValueWorksheetView";

export default function PlaceValueGenerator() {
  const locale = useLocale(), copy = getPlaceValueCopy(locale), common = getMeasurementCopy(locale);
  const [settings, setSettings] = useState<PlaceValueSettings>({ ...DEFAULT_PLACE_VALUE_SETTINGS });
  const [countMode, setCountMode] = useState<"pages" | "custom">("pages");
  const [worksheet, setWorksheet] = useState<PlaceValueWorksheet | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false), [language, setLanguage] = useState(locale);
  const [generating, setGenerating] = useState(false), [error, setError] = useState("");
  const persistence = useMathWorksheetSave({ worksheet: worksheet ? { ...worksheet, showAnswerKey } : null, endpoint: "/api/producer/save-place-value-worksheet", language: locale });
  const restored = useSavedMathWorksheet(locale, (data, id) => {
    const result = sanitizePlaceValueWorksheet(data.mathWorksheet);
    if (!result) return false;
    setWorksheet(result); setSettings(result.settings); setShowAnswerKey(result.showAnswerKey); setLanguage(result.language);
    setCountMode(placeValueFullPageCounts(result.settings).includes(result.settings.taskCount) ? "pages" : "custom");
    persistence.rememberSaved(id, result);
    return true;
  });
  const busy = generating || persistence.saving || restored.loading;
  function change(next: Partial<PlaceValueSettings>) {
    setSettings(current => { const updated = { ...current, ...next }; return next.taskCount === undefined ? { ...updated, taskCount: placeValueCountAfterOptionsChange(current.taskCount, current, updated, countMode === "custom") } : updated; });
    setWorksheet(null); setError("");
  }
  const capacity = placeValuePageCapacity(settings), pageCounts = placeValueFullPageCounts(settings);
  let validation = "";
  try { normalizePlaceValueSettings(settings); }
  catch { validation = copy.invalid; }
  async function generate() {
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/generate-place-value-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, language, showAnswerKey }) });
      const data = await response.json(), result = sanitizePlaceValueWorksheet(data.worksheet);
      if (!response.ok || !result) throw new Error(common.failed);
      setWorksheet(result);
    } catch (error) { setError(error instanceof Error ? error.message : common.failed); }
    finally { setGenerating(false); }
  }
  return <main className="length-generator"><div className="length-layout">
    <aside className="length-controls"><MathGeneratorBackLink /><h1>{copy.title}</h1><p>{copy.subtitle}</p>
      <label className="length-field">{copy.taskType}<select disabled={busy} value={settings.taskType} onChange={event => change({ taskType: event.target.value as PlaceValueSettings["taskType"] })}>{PLACE_VALUE_MODES.map(mode => <option key={mode} value={mode}>{copy[mode]}</option>)}</select></label>
      <label className="length-field">{copy.integerDigits}<select disabled={busy} value={settings.integerDigits} onChange={event => change({ integerDigits: Number(event.target.value) as PlaceValueSettings["integerDigits"] })}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.decimalPlaces > 0} onChange={event => change({ decimalPlaces: event.target.checked ? 2 : 0 })} />{copy.decimals}</label>
      {settings.decimalPlaces > 0 ? <label className="length-field">{copy.decimalPlaces}<select disabled={busy} value={settings.decimalPlaces} onChange={event => change({ decimalPlaces: Number(event.target.value) as PlaceValueSettings["decimalPlaces"] })}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select></label> : null}
      <label className="length-field">{common.pageCount}<select disabled={busy} aria-describedby="place-value-page-hint" value={countMode === "custom" ? "custom" : settings.taskCount} onChange={event => {
        if (event.target.value === "custom") setCountMode("custom");
        else { setCountMode("pages"); change({ taskCount: Number(event.target.value) }); }
      }}>{pageCounts.map((count, page) => <option key={count} value={count}>{common.pageOption.replace("{pages}", String(page + 1)).replace("{tasks}", String(count))}</option>)}<option value="custom">{common.customCount}</option></select></label>
      {countMode === "custom" ? <label className="length-field">{common.count}<input disabled={busy} type="number" min={1} max={PLACE_VALUE_MAX_TASK_COUNT} value={Number.isNaN(settings.taskCount) ? "" : settings.taskCount} onChange={event => change({ taskCount: event.target.valueAsNumber })} /></label> : null}
      <p id="place-value-page-hint">{copy.pageHint.replace("{first}", String(capacity.first)).replace("{following}", String(capacity.following))}</p>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={settings.showPlaceValueTable} onChange={event => change({ showPlaceValueTable: event.target.checked })} />{copy.table}</label>
      <label className="length-toggle"><input disabled={busy} type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />{common.key}</label>
      {validation ? <p role="status" className="length-error">{validation}</p> : null}
      <MathGeneratorActions language={locale} generating={generating} saving={persistence.saving} loading={restored.loading} canGenerate={!validation} hasWorksheet={!!worksheet}
        onGenerate={() => { void generate(); }} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }} />
      {error || persistence.error || restored.error ? <p role="alert" className="length-error">{error || persistence.error || restored.error}</p> : null}
      {persistence.success ? <p role="status" className="length-success">{persistence.success}</p> : null}
      {persistence.savedId ? <Link href={`/${locale}/content`}>{common.openContent}</Link> : null}
    </aside>
    <section className="length-preview" aria-label={common.worksheet}>{worksheet ? <PlaceValueWorksheetView worksheet={{ ...worksheet, showAnswerKey }} printMode /> : <div className="length-empty"><h2>{copy.empty}</h2></div>}</section>
  </div>{persistence.sharing && persistence.savedId && worksheet ? <MathSpacePicker worksheetId={persistence.savedId} title={worksheet.title} language={worksheet.language} onClose={() => persistence.setSharing(false)} onShared={persistence.shared} /> : null}</main>;
}
