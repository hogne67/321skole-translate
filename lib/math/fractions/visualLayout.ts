import type { FractionVisualKind } from "./types";

export function getFractionVisualLayout(total: number, visual: FractionVisualKind) {
  if (!Number.isInteger(total) || total < 1) throw new Error("Invalid number of fraction parts");
  if (visual === "circle") {
    const point = (angle: number) => ({ x: 100 + 88 * Math.cos(angle), y: 100 + 88 * Math.sin(angle) });
    const parts = Array.from({ length: total }, (_, index) => {
      if (total === 1) return "M 100 12 A 88 88 0 1 1 100 188 A 88 88 0 1 1 100 12 Z";
      const start = point(index * 2 * Math.PI / total - Math.PI / 2);
      const end = point((index + 1) * 2 * Math.PI / total - Math.PI / 2);
      return `M 100 100 L ${start.x} ${start.y} A 88 88 0 0 1 ${end.x} ${end.y} Z`;
    });
    return { width: 200, height: 200, columns: 1, rows: 1, parts };
  }

  // Use exact factors so the equal parts always form one complete rectangle.
  let rows = visual === "bar" ? 1 : Math.floor(Math.sqrt(total));
  while (total % rows !== 0) rows -= 1;
  const columns = total / rows;
  const width = 240;
  const height = visual === "bar" ? 72 : Math.max(72, Math.min(160, rows * 44));
  const cellWidth = (width - 8) / columns;
  const cellHeight = (height - 8) / rows;
  const parts = Array.from({ length: total }, (_, index) => {
    const x = 4 + (index % columns) * cellWidth;
    const y = 4 + Math.floor(index / columns) * cellHeight;
    return `M ${x} ${y} h ${cellWidth} v ${cellHeight} h ${-cellWidth} Z`;
  });
  return { width, height, columns, rows, parts };
}
