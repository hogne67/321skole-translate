"use client";

import { useId } from "react";
import { getStatisticsCopy, statisticsAxis, type StatisticsChart, type StatisticsDataset } from "@/lib/math/statistics/worksheet";

export default function StatisticsDiagram({ dataset, chart, language, frequencies = dataset.frequencies, showSupport = false, student = false, onSelect, label = "" }: {
  dataset: StatisticsDataset; chart: StatisticsChart; language: string; frequencies?: (number | null)[]; showSupport?: boolean; student?: boolean; onSelect?: (index: number, frequency: number) => void; label?: string;
}) {
  const id = useId(), copy = getStatisticsCopy(language), axis = statisticsAxis(dataset);
  const left = 54, right = 400, top = 27, bottom = 187, width = right - left;
  const x = (i: number) => left + width / dataset.values.length * (i + .5);
  const y = (value: number) => bottom - value / axis.maximum * (bottom - top);
  const present = frequencies.map(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= axis.maximum ? n : null);
  const description = present.map((n, i) => n === null ? "" : `${dataset.values[i]}: ${n}`).filter(Boolean).join("; ");
  return <div className="statistics-graphic"><svg className="statistics-diagram" viewBox="0 0 420 240" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{description ? student ? copy.studentChart : `${copy[dataset.theme]} — ${copy[chart]}` : copy.blankChart}</title><desc id={`${id}-desc`}>{description ? `${copy.chartDescription} ${description}.` : ""}</desc>
    {dataset.values.map((value, i) => <line key={value} x1={x(i)} x2={x(i)} y1={top} y2={bottom} stroke="#e2e8f0" strokeWidth=".75" />)}
    {Array.from({ length: axis.maximum / axis.step + 1 }, (_, i) => i * axis.step).map(tick => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#cbd5e1" strokeWidth=".75" /><text x={left - 9} y={y(tick)} textAnchor="end" dominantBaseline="central" fontSize="12">{tick}</text></g>)}
    <path d={`M${left} ${top - 3}V${bottom}H${right + 3}`} stroke="currentColor" strokeWidth="1.5" fill="none" />
    {dataset.values.map((value, i) => <g key={value}><line x1={x(i)} x2={x(i)} y1={bottom} y2={bottom + 5} stroke="currentColor" /><text x={x(i)} y={bottom + 19} textAnchor="middle" fontSize="12">{value}</text></g>)}
    <text x={(left + right) / 2} y="231" textAnchor="middle" fontSize="12">{copy[`${dataset.theme}Axis`]}</text>
    <text transform="translate(14 110) rotate(-90)" textAnchor="middle" fontSize="12">{dataset.theme === "goals" ? copy.games : copy.students}</text>
    {chart === "line" ? present.map((n, i) => n !== null && i > 0 && present[i - 1] !== null ? <line className="statistics-data-line" key={i} x1={x(i - 1)} y1={y(present[i - 1]!)} x2={x(i)} y2={y(n)} stroke="currentColor" strokeWidth="2" /> : null) : null}
    {present.map((n, i) => n === null ? null : <g key={i} data-value={dataset.values[i]} className="statistics-data-mark">
      {chart === "bar" ? n === 0 ? <line x1={x(i) - 9} x2={x(i) + 9} y1={bottom} y2={bottom} stroke="currentColor" strokeWidth="3" /> : <rect x={x(i) - width / dataset.values.length * .28} y={y(n)} width={width / dataset.values.length * .56} height={bottom - y(n)} fill="#ccfbf1" stroke="currentColor" strokeWidth="1.5" /> : <circle cx={x(i)} cy={y(n)} r="3.5" fill="currentColor" />}
      {showSupport ? <text x={x(i)} y={y(n) - 7} textAnchor="middle" fontSize="11" fontWeight="600">{n}</text> : null}
    </g>)}
  </svg>{onSelect ? dataset.values.map((value, i) => <button key={value} type="button" className="statistics-plot-button"
    aria-label={`${label ? `${label}: ` : ""}${copy.value} ${value}: ${copy.frequency} ${present[i] ?? copy.unset}`}
    style={{ left: `${(left + width / dataset.values.length * i) / 420 * 100}%`, top: `${top / 240 * 100}%`, width: `${width / dataset.values.length / 420 * 100}%`, height: `${(bottom - top) / 240 * 100}%` }}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const frequency = event.detail === 0 ? present[i] ?? 0 : Math.max(0, Math.min(axis.maximum, Math.round((1 - (event.clientY - bounds.top) / bounds.height) * axis.maximum)));
      onSelect(i, frequency);
    }} onKeyDown={event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      onSelect(i, event.key === "Home" ? 0 : event.key === "End" ? axis.maximum : Math.max(0, Math.min(axis.maximum, (present[i] ?? 0) + (event.key === "ArrowUp" ? 1 : -1))));
    }} />) : null}</div>;
}
