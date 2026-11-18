import { formatScaleNumber, getScaleCopy, scaleRatioText, type ScaleTask } from "@/lib/math/scale/worksheet";

export default function ScaleFigure({ task, language }: { task: ScaleTask; language: string }) {
  const copy = getScaleCopy(language), n = (value: number) => formatScaleNumber(value, language);
  if (task.type === "similar_sides") {
    const sideA = task.missing === "small" ? `x = ? ${task.unit}` : `${n(task.b)} ${task.unit}`;
    const sideB = task.missing === "large" ? `x = ? ${task.unit}` : `${n(task.b * task.factor)} ${task.unit}`;
    const description = `${copy.figureA} (${copy[task.shape]}): a = ${n(task.a)} ${task.unit}, b = ${sideA}. ${copy.figureB}: a = ${n(task.a * task.factor)} ${task.unit}, b = ${sideB}.`;
    return <figure className="scale-figure"><svg viewBox="0 0 500 190" role="img" aria-label={description}>
      {[{ x: 28, width: 100, height: 70, bottom: 130, title: copy.figureA, a: task.a, b: sideA, unknown: task.missing === "small" }, { x: 245, width: 120, height: 84, bottom: 130, title: copy.figureB, a: task.a * task.factor, b: sideB, unknown: task.missing === "large" }].map(({ x, width, height, bottom, title, a, b, unknown }) => <g key={title}>
        <text x={x + width / 2} y="17" textAnchor="middle" fontSize="17" fontWeight="bold">{title}</text>
        {task.shape === "rectangle" ? <rect x={x} y={bottom - height} width={width} height={height} fill="#e0f2fe" stroke="#334155" strokeWidth="2" /> : <path d={`M${x} ${bottom} L${x + width} ${bottom} L${x + width} ${bottom - height} Z`} fill="#e0f2fe" stroke="#334155" strokeWidth="2" />}
        <text x={x + width / 2} y={bottom + 25} textAnchor="middle">a = {n(a)} {task.unit}</text>
        <text x={x + width + 10} y={bottom - height / 2} dominantBaseline="middle" fill={unknown ? "#0f766e" : "#0f172a"} fontWeight={unknown ? "bold" : "normal"}>{unknown ? b : `b = ${b}`}</text>
      </g>)}
    </svg><figcaption>{copy.sketch}</figcaption></figure>;
  }
  const drawing = task.type === "drawing_length" ? "x = ? cm" : `${n(task.drawing)} cm`;
  const real = task.type === "real_length" ? `x = ? ${task.realUnit}` : `${n(task.real)} ${task.realUnit}`;
  const ratio = task.type === "find_scale" ? "? : ?" : scaleRatioText(task, language);
  return <figure className="scale-figure"><svg viewBox="0 0 500 170" role="img" aria-label={`${copy.drawing}: ${drawing}. ${copy.reality}: ${real}. ${copy.ratio}: ${ratio}.`}>
    {[{ x: 20, title: `${copy.drawing} (${copy[task.context]})`, value: drawing, unknown: task.type === "drawing_length" }, { x: 310, title: copy.reality, value: real, unknown: task.type === "real_length" }].map(({ x, title, value, unknown }) => <g key={title}>
      <text x={x + 85} y="18" textAnchor="middle" fontSize="17" fontWeight="bold">{title}</text>
      <rect x={x} y="32" width="170" height="63" rx="5" fill="#f0fdfa" stroke="#94a3b8" />
      {task.context === "map" ? <path d={`M${x + 18} 78 L${x + 54} 49 L${x + 95} 72 L${x + 151} 44`} fill="none" stroke="#0f766e" strokeWidth="3" /> : task.context === "plan" ? <path d={`M${x + 28} 80 V46 H${x + 143} V80 H${x + 100} M${x + 81} 80 H${x + 28} M${x + 100} 80 V62`} fill="none" stroke="#0f766e" strokeWidth="2" /> : <path d={`M${x + 38} 80 V55 L${x + 85} 38 L${x + 132} 55 V80 Z M${x + 38} 55 H${x + 132}`} fill="#e0f2fe" stroke="#334155" strokeWidth="2" />}
      <path d={`M${x + 10} 109 H${x + 160} M${x + 10} 103 V115 M${x + 160} 103 V115`} fill="none" stroke="#475569" strokeWidth="1.5" />
      <text x={x + 85} y="139" textAnchor="middle" fill={unknown ? "#0f766e" : "#0f172a"} fontWeight={unknown ? "bold" : "normal"}>{value}</text>
    </g>)}
    <text x="250" y="60" textAnchor="middle" fontSize="15">{copy.ratio}</text>
    <text x="250" y="85" textAnchor="middle" fontSize="18" fontWeight="bold">{ratio}</text>
    <path d="M205 108 H292 M285 102 L292 108 L285 114" fill="none" stroke="#64748b" strokeWidth="1.5" />
  </svg><figcaption>{copy.sketch}</figcaption></figure>;
}
