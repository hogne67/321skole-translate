import type { PosterPlan } from "./model";
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function wrap(value: string, width: number): string[] {
  const tokens = value.split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${width}}`, "gu")) || []);
  const lines: string[] = []; let line = "";
  for (const word of tokens) {
    if (line && (line + " " + word).length > width) { lines.push(line); line = ""; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function renderPosterSvg(plan: PosterPlan, images: string[], hidden = false, logoDataUrl = "") {
  function highlight(line: string) {
    if (!plan.focus) return xml(line);
    let rest = line; let result = "";
    while (rest) {
      const at = rest.toLocaleLowerCase().indexOf(plan.focus.toLocaleLowerCase());
      if (at < 0) return result + xml(rest);
      result += xml(rest.slice(0, at)) + `<tspan fill="#0284c7" font-weight="700">${xml(rest.slice(at, at + plan.focus.length))}</tspan>`;
      rest = rest.slice(at + plan.focus.length);
    }
    return result;
  }
  const text = (value: string, x: number, y: number, size: number, width: number, color = "#172554", bold = false) => {
    const lines = wrap(value, width);
    return { height: lines.length * (size + 6), svg: `<text font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" fill="${color}" font-weight="${bold ? 700 : 400}">${lines.map((line, i) => `<tspan x="${x}" y="${y + i * (size + 6)}">${highlight(line)}</tspan>`).join("")}</text>` };
  };
  const cards = plan.items.map((item, i) => {
    const x = 40 + (i % 3) * 620; const y = 230 + Math.floor(i / 3) * 585;
    let out = `<rect x="${x}" y="${y}" width="600" height="565" rx="22" fill="white" stroke="#cbd5e1" stroke-width="2"/>`;
    const fields = [[item.label, 29, 32, "#075985", true], [item.caption, 23, 43, "#172554", false], [item.explanation, 21, 48, "#475569", false]] as const;
    let scale = 1;
    const blockHeight = () => fields.reduce((sum, [value, size, width]) => sum + wrap(value, Math.floor(width / scale)).length * (Math.floor(size * scale) + 6) + (value ? 12 : 0), 0);
    while (blockHeight() > 275 && scale > 0.45) scale -= 0.05;
    const imageHeight = hidden ? 530 : Math.min(390, 515 - blockHeight());
    if (images[i]) out += `<image x="${x + 24}" y="${y + 16}" width="552" height="${imageHeight}" preserveAspectRatio="xMidYMid meet" href="${images[i]}"/>`;
    if (hidden) return out;
    let nextY = y + imageHeight + 45;
    for (const [value, size, width, color, bold] of fields) {
      const block = text(value, x + 26, nextY, Math.floor(size * scale), Math.floor(width / scale), color, bold);
      out += block.svg; nextY += block.height + (value ? 12 : 0);
    }
    return out;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1440" viewBox="0 0 1920 1440">
    <rect width="1920" height="1440" fill="#f0f9ff"/>
    ${text(`${plan.level} · ${plan.language}`, 42, 48, 23, 120, "#0369a1", true).svg}
    ${logoDataUrl ? `<image x="1670" y="15" width="54" height="49" preserveAspectRatio="xMidYMid meet" href="${xml(logoDataUrl)}"/>` : ""}
    <text x="1735" y="48" font-family="DejaVu Sans,Arial,sans-serif" font-size="25" fill="#0369a1" font-weight="700">321school</text>
    ${text(plan.title, 42, 103, 40, 72, "#0f172a", true).svg}
    ${text(plan.goal, 42, 177, 22, 155, "#475569").svg}
    ${cards}</svg>`;
}
