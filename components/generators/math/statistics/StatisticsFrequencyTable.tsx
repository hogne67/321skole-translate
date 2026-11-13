"use client";

import { getStatisticsCopy, type StatisticsDataset } from "@/lib/math/statistics/worksheet";

export default function StatisticsFrequencyTable({ dataset, language, entries, onChange, readOnly = false, blank = false, label }: {
  dataset: StatisticsDataset; language: string; entries?: string[]; onChange?: (entries: string[]) => void; readOnly?: boolean; blank?: boolean; label: string;
}) {
  const copy = getStatisticsCopy(language);
  return <div className="statistics-table-wrap"><table className="statistics-table"><caption className="sr-only">{label}</caption>
    <thead><tr><th scope="col">{copy.value}</th>{dataset.values.map(value => <th key={value} scope="col">{value}</th>)}</tr></thead>
    <tbody><tr><th scope="row">{copy.frequency}</th>{dataset.values.map((value, i) => <td key={value}>{blank ? <span className="statistics-blank-cell" /> : entries ? <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} aria-label={`${label}: ${copy.frequency}, ${copy.value.toLowerCase()} ${value}`} value={entries[i] ?? ""} readOnly={readOnly} onChange={event => onChange?.(dataset.values.map((_, j) => i === j ? event.target.value : entries[j] ?? ""))} /> : dataset.frequencies[i]}</td>)}</tr></tbody>
  </table></div>;
}
