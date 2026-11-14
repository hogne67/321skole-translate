"use client";

import { useId } from "react";
import { coordinatesLabel, getCoordinatesCopy, type CoordinatesAxis, type CoordinatesPoint, type CoordinatesSettings } from "@/lib/math/coordinates/worksheet";
import { COORDINATES_GRID, coordinatesFromGridPosition, coordinatesFromKey, coordinatesInGrid, coordinatesMinimum, coordinatesToSvg } from "@/lib/math/coordinates/grid";

export default function CoordinatesGrid({ settings, language, sourcePoints = [], answerPoints = [], sourceClosed = false, answersClosed = false, reflected = false, reflectionAxis, activeIndex = 0, label = "", onSelect }: {
  settings: CoordinatesSettings; language: string; sourcePoints?: CoordinatesPoint[]; answerPoints?: (CoordinatesPoint | null)[];
  sourceClosed?: boolean; answersClosed?: boolean; reflected?: boolean; reflectionAxis?: CoordinatesAxis; activeIndex?: number; label?: string; onSelect?: (point: CoordinatesPoint) => void;
}) {
  const id = useId(), copy = getCoordinatesCopy(language), min = coordinatesMinimum(settings), grid = COORDINATES_GRID;
  const end = grid.left + grid.size, bottom = grid.top + grid.size, zero = coordinatesToSvg({ x: 0, y: 0 }, settings);
  const ticks = Array.from({ length: (settings.extent - min) / settings.step + 1 }, (_, i) => min + i * settings.step);
  const present = answerPoints.map(p => p && coordinatesInGrid(p, settings) ? p : null);
  const current = present[activeIndex] ?? { x: 0, y: 0 };
  const description = [sourcePoints.length ? `${copy.source}: ${sourcePoints.map((p, i) => `${coordinatesLabel(i)} (${p.x}, ${p.y})`).join("; ")}.` : "", present.some(Boolean) ? `${copy.student}: ${present.map((p, i) => p ? `${coordinatesLabel(i, reflected)} (${p.x}, ${p.y})` : "").filter(Boolean).join("; ")}.` : ""].filter(Boolean).join(" ");
  function edges(points: (CoordinatesPoint | null)[], closed: boolean, className: string) {
    return points.map((point, i) => {
      const previous = i === 0 ? closed ? points[points.length - 1] : null : points[i - 1];
      if (!point || !previous) return null;
      const a = coordinatesToSvg(previous, settings), b = coordinatesToSvg(point, settings);
      return <line key={i} className={className} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth="1.8" fill="none" />;
    });
  }
  function marks(points: (CoordinatesPoint | null)[], answer: boolean) {
    return points.map((point, i) => {
      if (!point) return null;
      const p = coordinatesToSvg(point, settings), onRight = answer && reflected ? p.x > grid.left + 20 : p.x > end - 20;
      const below = answer && reflected ? p.y < bottom - 20 : p.y < grid.top + 16;
      return <g className={answer ? "coordinates-answer-point" : "coordinates-source-point"} key={i}>
        <circle cx={p.x} cy={p.y} r={answer ? 4.5 : 3.5} fill={answer ? "white" : "currentColor"} stroke="currentColor" strokeWidth="1.8" />
        <text x={p.x + (onRight ? -8 : 8)} y={p.y + (below ? 16 : -8)} textAnchor={onRight ? "end" : "start"} fontSize="12" fontWeight="700">{coordinatesLabel(i, answer && reflected)}</text>
      </g>;
    });
  }
  return <div className="coordinates-graphic"><svg className="coordinates-grid" viewBox="0 0 420 420" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{description ? copy.grid : copy.blankGrid}</title><desc id={`${id}-desc`}>{description}</desc>
    {ticks.map((v, i) => {
      const x = coordinatesToSvg({ x: v, y: 0 }, settings).x, y = coordinatesToSvg({ x: 0, y: v }, settings).y;
      const showLabel = settings.showSupport || v === 0 || i === 0 || i === ticks.length - 1 || Math.abs(v / settings.step) % 2 === 0;
      return <g key={v}>
        <line x1={x} x2={x} y1={grid.top} y2={bottom} stroke="#cbd5e1" strokeWidth=".7" />
        <line x1={grid.left} x2={end} y1={y} y2={y} stroke="#cbd5e1" strokeWidth=".7" />
        <line x1={x} x2={x} y1={zero.y - 3} y2={zero.y + 3} stroke="currentColor" />
        <line x1={zero.x - 3} x2={zero.x + 3} y1={y} y2={y} stroke="currentColor" />
        {showLabel ? <text x={x} y={zero.y + 16} textAnchor="middle" fontSize="10">{v}</text> : null}
        {showLabel && v !== 0 ? <text x={zero.x - 8} y={y} textAnchor="end" dominantBaseline="central" fontSize="10">{v}</text> : null}
      </g>;
    })}
    <path d={`M${grid.left - 5} ${zero.y}H${end + 8}M${zero.x} ${bottom + 5}V${grid.top - 8}`} stroke="currentColor" strokeWidth="1.6" fill="none" />
    <path d={`M${end + 3} ${zero.y - 4}L${end + 8} ${zero.y}L${end + 3} ${zero.y + 4}M${zero.x - 4} ${grid.top - 3}L${zero.x} ${grid.top - 8}L${zero.x + 4} ${grid.top - 3}`} stroke="currentColor" fill="none" strokeWidth="1.5" />
    <text x={end + 17} y={zero.y + 4} fontSize="13" fontWeight="700">x</text><text x={zero.x - 4} y={grid.top - 14} fontSize="13" fontWeight="700">y</text>
    {reflectionAxis ? <line className="coordinates-reflection-axis" x1={reflectionAxis === "x" ? grid.left : zero.x} x2={reflectionAxis === "x" ? end : zero.x} y1={reflectionAxis === "x" ? zero.y : grid.top} y2={reflectionAxis === "x" ? zero.y : bottom} stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" /> : null}
    <g className="coordinates-source">{sourceClosed ? edges(sourcePoints, true, "coordinates-source-edge") : null}{marks(sourcePoints, false)}</g>
    <g className="coordinates-answer">{answersClosed ? edges(present, true, "coordinates-answer-edge") : null}{marks(present, true)}</g>
  </svg>{onSelect ? <button type="button" className="coordinates-plot-area" style={{ left: `${grid.left / grid.viewBox * 100}%`, top: `${grid.top / grid.viewBox * 100}%`, width: `${grid.size / grid.viewBox * 100}%`, height: `${grid.size / grid.viewBox * 100}%` }}
    aria-label={`${label}: ${copy.point} ${coordinatesLabel(activeIndex, reflected)}. ${present[activeIndex] ? `(${current.x}, ${current.y})` : copy.unset}. ${copy.plotHint}`}
    onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); onSelect(event.detail === 0 ? current : coordinatesFromGridPosition((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, settings)); }}
    onKeyDown={event => { const next = coordinatesFromKey(current, event.key, settings); if (next) { event.preventDefault(); onSelect(next); } }} /> : null}</div>;
}
