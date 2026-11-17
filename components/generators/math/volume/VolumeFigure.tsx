import { formatVolumeNumber, getVolumeCopy, volumeUnitLabel, type VolumeTask } from "@/lib/math/volume/worksheet";

export default function VolumeFigure({ task, language }: { task: VolumeTask; language: string }) {
  const copy = getVolumeCopy(language), n = (v: number) => formatVolumeNumber(v, language);
  const missing = task.type === "missing_measure", count = task.type === "count_cubes", unit = task.lengthUnit;
  const height = missing ? "?" : `${n(task.height)} ${unit}`;
  const description = count ? copy.gridDescription.replace("{length}", String(task.length)).replace("{width}", String(task.width)).replace("{height}", String(task.height))
    : task.shape === "cube" ? `${copy.cube}: ${copy.side} ${missing ? "?" : `${n(task.length)} ${unit}`}.`
    : task.shape === "cylinder" ? `${copy.cylinder}: ${copy.radius} ${n(task.length)} ${unit}, ${copy.height} ${height}.`
    : `${copy.cuboid}: ${copy.length} ${n(task.length)} ${unit}, ${copy.width} ${n(task.width)} ${unit}, ${copy.height} ${height}.`;
  if (task.shape === "cylinder") return <figure className="volume-figure">
    <svg viewBox="0 0 280 180" role="img" aria-label={description}>
      <path d="M65 45 V135 C65 158 185 158 185 135 V45 Z" fill="#e0f2fe" stroke="#334155" strokeWidth="1.8" />
      <path d="M65 135 C65 112 185 112 185 135" fill="none" stroke="#64748b" strokeDasharray="5 4" />
      <ellipse cx="125" cy="45" rx="60" ry="18" fill="#d1fae5" stroke="#334155" strokeWidth="1.8" />
      <circle cx="125" cy="45" r="2" fill="#0f172a" /><path d="M125 45 H185" stroke="#0f766e" strokeWidth="2" />
      <text x="151" y="34" textAnchor="middle">r = {n(task.length)} {unit}</text>
      <path d="M200 45 H211 M206 45 V135 M200 135 H211" stroke="#475569" fill="none" />
      <text x="210" y="94">h = {height}</text>
    </svg><figcaption>{copy.radius}: r · {copy.height}: h</figcaption>
  </figure>;
  const l = count ? task.length : task.shape === "cube" ? 3 : 4, w = count ? task.width : task.shape === "cube" ? 3 : 2, h = count ? task.height : 3;
  const cell = Math.min(160 / (l + .6 * w), 110 / (h + .4 * w));
  const p = (x: number, y: number, z: number) => [38 + cell * (x + .6 * y), 137 - cell * (z + .4 * y)];
  const point = (x: number, y: number, z: number) => p(x, y, z).join(",");
  const line = (a: number[], b: number[]) => <line key={`${a}:${b}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
  const frontGrid = count ? [...Array.from({ length: l - 1 }, (_, i) => line(p(i + 1, 0, 0), p(i + 1, 0, h))), ...Array.from({ length: h - 1 }, (_, i) => line(p(0, 0, i + 1), p(l, 0, i + 1)))] : [];
  const rightGrid = count ? [...Array.from({ length: w - 1 }, (_, i) => line(p(l, i + 1, 0), p(l, i + 1, h))), ...Array.from({ length: h - 1 }, (_, i) => line(p(l, 0, i + 1), p(l, w, i + 1)))] : [];
  const topGrid = count ? [...Array.from({ length: l - 1 }, (_, i) => line(p(i + 1, 0, h), p(i + 1, w, h))), ...Array.from({ length: w - 1 }, (_, i) => line(p(0, i + 1, h), p(l, i + 1, h)))] : [];
  return <figure className="volume-figure">
    <svg viewBox="0 0 280 180" role="img" aria-label={description}>
      <g stroke="#334155" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points={[point(0, 0, 0), point(l, 0, 0), point(l, 0, h), point(0, 0, h)].join(" ")} fill="#e0f2fe" />
        <polygon points={[point(l, 0, 0), point(l, w, 0), point(l, w, h), point(l, 0, h)].join(" ")} fill="#bfdbfe" />
        <polygon points={[point(0, 0, h), point(l, 0, h), point(l, w, h), point(0, w, h)].join(" ")} fill="#d1fae5" />
      </g>
      <g stroke="#64748b" strokeWidth=".8">{frontGrid}{rightGrid}{topGrid}</g>
      {!count ? <><path d={`M${point(0, 0, 0)} L${point(0, w, 0)} L${point(l, w, 0)} M${point(0, w, 0)} L${point(0, w, h)}`} fill="none" stroke="#64748b" strokeDasharray="4 4" />
        {task.shape === "cube" ? <text x="100" y="158" textAnchor="middle">a = {missing ? "?" : `${n(task.length)} ${unit}`}</text> : <>
          <text x="103" y="158" textAnchor="middle">l = {n(task.length)} {unit}</text>
          <text x="204" y="147" textAnchor="middle">w = {n(task.width)} {unit}</text>
          <text x="206" y="78">h = {height}</text>
        </>}
      </> : null}
    </svg>
    <figcaption>{count ? `${copy.oneCube} = 1 ${volumeUnitLabel(`${unit}3`)}` : task.shape === "cube" ? `${copy.side}: a` : `${copy.length}: l · ${copy.width}: w · ${copy.height}: h`}</figcaption>
  </figure>;
}
