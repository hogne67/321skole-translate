import type { CoordinatesPoint, CoordinatesSettings } from "./worksheet";

export const COORDINATES_GRID = { left: 44, top: 24, size: 344, viewBox: 420 };
export function coordinatesMinimum(settings: CoordinatesSettings): number { return settings.quadrants === "all" ? -settings.extent : 0; }
export function coordinatesInGrid(point: CoordinatesPoint, settings: CoordinatesSettings): boolean {
  const min = coordinatesMinimum(settings);
  return [point.x, point.y].every(v => Number.isInteger(v) && v >= min && v <= settings.extent && v % settings.step === 0);
}
export function coordinatesToSvg(point: CoordinatesPoint, settings: CoordinatesSettings): CoordinatesPoint {
  const min = coordinatesMinimum(settings), span = settings.extent - min;
  return { x: COORDINATES_GRID.left + (point.x - min) / span * COORDINATES_GRID.size, y: COORDINATES_GRID.top + (settings.extent - point.y) / span * COORDINATES_GRID.size };
}
export function coordinatesFromGridPosition(xRatio: number, yRatio: number, settings: CoordinatesSettings): CoordinatesPoint {
  const min = coordinatesMinimum(settings), span = settings.extent - min;
  const snap = (v: number) => { const n = Math.max(min, Math.min(settings.extent, Math.round(v / settings.step) * settings.step)); return n === 0 ? 0 : n; };
  return { x: snap(min + Math.max(0, Math.min(1, xRatio)) * span), y: snap(settings.extent - Math.max(0, Math.min(1, yRatio)) * span) };
}
export function coordinatesFromKey(point: CoordinatesPoint, key: string, settings: CoordinatesSettings): CoordinatesPoint | null {
  const min = coordinatesMinimum(settings), clamp = (v: number) => Math.max(min, Math.min(settings.extent, v));
  if (key === "Home") return { x: 0, y: 0 };
  if (key === "ArrowLeft") return { x: clamp(point.x - settings.step), y: point.y };
  if (key === "ArrowRight") return { x: clamp(point.x + settings.step), y: point.y };
  if (key === "ArrowUp") return { x: point.x, y: clamp(point.y + settings.step) };
  if (key === "ArrowDown") return { x: point.x, y: clamp(point.y - settings.step) };
  return null;
}
