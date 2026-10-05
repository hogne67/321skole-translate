import { comparisonFraction, formatComparisonValue, getComparisonCopy, type ComparisonValue } from "@/lib/math/comparison/worksheet";

export default function ComparisonVisual({ value, language }: { value: ComparisonValue; language: string }) {
  const copy = getComparisonCopy(language);
  const ratio = comparisonFraction(value).valueOf();
  const label = `${copy[value.form]}: ${formatComparisonValue(value, language)}. ${value.form === "decimal" ? copy.numberLine : copy.whole}`;
  if (value.form === "decimal") return <svg className="comparison-visual" viewBox="0 0 120 84" role="img" aria-label={label}>
    <path d="M10 38H110" stroke="#344054" />
    {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${10 + i * 10} 34V42`} stroke="#344054" />)}
    <circle cx={10 + ratio * 100} cy={38} r="4" fill="#047857" stroke="white" />
    <g fill="#344054" fontSize="9" textAnchor="middle"><text x="10" y="57">0</text><text x="60" y="57">{language === "en" ? "0.5" : "0,5"}</text><text x="110" y="57">1</text></g>
  </svg>;
  if (value.form === "fraction") {
    const rows = value.denominator === 20 ? 2 : 1;
    const columns = value.denominator / rows;
    return <svg className="comparison-visual" viewBox="0 0 120 84" role="img" aria-label={label}>
      {Array.from({ length: value.denominator }, (_, i) => <rect key={i} x={10 + (i % columns) * 100 / columns} y={22 + Math.floor(i / columns) * 40 / rows} width={100 / columns} height={40 / rows} fill={i < value.numerator ? "#10b981" : "white"} stroke="#344054" strokeWidth="0.7" />)}
    </svg>;
  }
  const angle = ratio * Math.PI * 2;
  const x = 60 + 30 * Math.sin(angle), y = 42 - 30 * Math.cos(angle);
  return <svg className="comparison-visual" viewBox="0 0 120 84" role="img" aria-label={label}>
    <circle cx="60" cy="42" r="30" fill="white" />
    {ratio === 1 ? <circle cx="60" cy="42" r="30" fill="#10b981" /> : ratio > 0 ? <path d={`M60 42L60 12A30 30 0 ${ratio > .5 ? 1 : 0} 1 ${x} ${y}Z`} fill="#10b981" /> : null}
    {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M60 42L${60 + 30 * Math.sin(i * Math.PI / 5)} ${42 - 30 * Math.cos(i * Math.PI / 5)}`} stroke="#344054" strokeWidth="0.4" />)}
    <circle cx="60" cy="42" r="30" fill="none" stroke="#344054" strokeWidth="0.8" />
  </svg>;
}
