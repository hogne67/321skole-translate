import type { FigureSpec, MathWorksheetTask, WorksheetLanguage } from "./types";

export function formatNumber(value: number, lang: WorksheetLanguage): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return lang === "nb" || lang === "pt"
    ? rounded.toFixed(1).replace(".", ",")
    : rounded.toFixed(1);
}

export function formatFigureMeta(figure: FigureSpec, lang: WorksheetLanguage): string {
  if (lang === "nb") {
    if (figure.kind === "square" && figure.sideCm) {
      return `Side: ${figure.sideCm} cm`;
    }
    if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
      return `Lengde: ${figure.widthCm} cm, bredde: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "parallelogram" &&
      figure.baseCm &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Grunnlinje: ${figure.baseCm} cm, side: ${figure.sideCm} cm, høyde: ${figure.heightCm} cm`;
    }
    if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
      return `Side: ${figure.sideCm} cm, høyde: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "trapezoid" &&
      figure.baseCm &&
      figure.topCm &&
      figure.heightCm &&
      figure.sideLeftCm &&
      figure.sideRightCm
    ) {
      return `Nedre grunnlinje: ${figure.baseCm} cm, øvre grunnlinje: ${figure.topCm} cm, høyde: ${figure.heightCm} cm, sider: ${figure.sideLeftCm} cm og ${figure.sideRightCm} cm`;
    }
    if (
      figure.kind === "triangle_right" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Grunnlinje: ${figure.baseCm} cm, katet: ${figure.sideBcm} cm, hypotenus: ${figure.sideCcm} cm, høyde: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_isosceles" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Grunnlinje: ${figure.baseCm} cm, side: ${figure.sideBcm} cm, side: ${figure.sideCcm} cm, høyde: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_equilateral" &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Side: ${figure.sideCm} cm, side: ${figure.sideCm} cm, side: ${figure.sideCm} cm, høyde: ${formatNumber(figure.heightCm, lang)} cm`;
    }
    if (figure.kind === "circle" && figure.radiusCm) {
      return `Radius: ${figure.radiusCm} cm. Bruk π = 3,14`;
    }
  }

  if (lang === "en") {
    if (figure.kind === "square" && figure.sideCm) {
      return `Side: ${figure.sideCm} cm`;
    }
    if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
      return `Length: ${figure.widthCm} cm, width: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "parallelogram" &&
      figure.baseCm &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, side: ${figure.sideCm} cm, height: ${figure.heightCm} cm`;
    }
    if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
      return `Side: ${figure.sideCm} cm, height: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "trapezoid" &&
      figure.baseCm &&
      figure.topCm &&
      figure.heightCm &&
      figure.sideLeftCm &&
      figure.sideRightCm
    ) {
      return `Bottom base: ${figure.baseCm} cm, top base: ${figure.topCm} cm, height: ${figure.heightCm} cm, sides: ${figure.sideLeftCm} cm and ${figure.sideRightCm} cm`;
    }
    if (
      figure.kind === "triangle_right" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, leg: ${figure.sideBcm} cm, hypotenuse: ${figure.sideCcm} cm, height: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_isosceles" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, side: ${figure.sideBcm} cm, side: ${figure.sideCcm} cm, height: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_equilateral" &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Side: ${figure.sideCm} cm, side: ${figure.sideCm} cm, side: ${figure.sideCm} cm, height: ${formatNumber(figure.heightCm, lang)} cm`;
    }
    if (figure.kind === "circle" && figure.radiusCm) {
      return `Radius: ${figure.radiusCm} cm. Use π = 3.14`;
    }
  }

  if (lang === "pt") {
    if (figure.kind === "square" && figure.sideCm) {
      return `Lado: ${figure.sideCm} cm`;
    }
    if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
      return `Comprimento: ${figure.widthCm} cm, largura: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "parallelogram" &&
      figure.baseCm &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, lado: ${figure.sideCm} cm, altura: ${figure.heightCm} cm`;
    }
    if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
      return `Lado: ${figure.sideCm} cm, altura: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "trapezoid" &&
      figure.baseCm &&
      figure.topCm &&
      figure.heightCm &&
      figure.sideLeftCm &&
      figure.sideRightCm
    ) {
      return `Base maior: ${figure.baseCm} cm, base menor: ${figure.topCm} cm, altura: ${figure.heightCm} cm, lados: ${figure.sideLeftCm} cm e ${figure.sideRightCm} cm`;
    }
    if (
      figure.kind === "triangle_right" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, cateto: ${figure.sideBcm} cm, hipotenusa: ${figure.sideCcm} cm, altura: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_isosceles" &&
      figure.baseCm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Base: ${figure.baseCm} cm, lado: ${figure.sideBcm} cm, lado: ${figure.sideCcm} cm, altura: ${figure.heightCm} cm`;
    }
    if (
      figure.kind === "triangle_equilateral" &&
      figure.sideCm &&
      figure.heightCm
    ) {
      return `Lado: ${figure.sideCm} cm, lado: ${figure.sideCm} cm, lado: ${figure.sideCm} cm, altura: ${formatNumber(figure.heightCm, lang)} cm`;
    }
    if (figure.kind === "circle" && figure.radiusCm) {
      return `Raio: ${figure.radiusCm} cm. Usa π = 3,14`;
    }
  }

  return "";
}

// Only remove the exact generated suffix, leaving custom task text untouched.
export function getGeometryTaskPrompt(task: MathWorksheetTask, language: WorksheetLanguage): string {
  if (!task.figure) return task.prompt;
  const measurements = formatFigureMeta(task.figure, language);
  if (!measurements || !task.prompt.endsWith(` ${measurements}`)) return task.prompt;
  return task.prompt.slice(0, -(measurements.length + 1)).trimEnd();
}

export function getGeometryFigureNote(figure: FigureSpec | undefined, language: WorksheetLanguage): string | null {
  if (figure?.kind !== "circle") return null;
  return language === "nb" ? "Bruk π = 3,14" : language === "pt" ? "Usa π = 3,14" : "Use π = 3.14";
}
