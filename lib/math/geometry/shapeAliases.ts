// lib/math/geometry/shapeAliases.ts

export type GeometryAliasLanguage = "no" | "nb" | "en" | "pt";

const NO_ALIASES: Record<string, string> = {
  kvadrat: "square",

  rektangel: "rectangle",

  parallellogram: "parallelogram",
  paralellogram: "parallelogram",
  parallelogram: "parallelogram",
  Parallelogram: "parallelogram",

  rombe: "rhombus",

  trapes: "trapezoid",
  trapez: "trapezoid",

  sirkel: "circle",

  trekant: "triangle",

  "rettvinklet trekant": "triangle_right",

  "likebeint trekant": "triangle_isosceles",

  "likesidet trekant": "triangle_equilateral",
};

const EN_ALIASES: Record<string, string> = {
  square: "square",

  rectangle: "rectangle",

  parallelogram: "parallelogram",
  parallellogram: "parallelogram",

  rhombus: "rhombus",

  trapezoid: "trapezoid",
  trapezium: "trapezoid",

  circle: "circle",

  triangle: "triangle",

  "right triangle": "triangle_right",
  "right-angled triangle": "triangle_right",

  "isosceles triangle": "triangle_isosceles",

  "equilateral triangle": "triangle_equilateral",
};

const PT_ALIASES: Record<string, string> = {
  quadrado: "square",

  retangulo: "rectangle",
  retângulo: "rectangle",

  paralelogramo: "parallelogram",

  losango: "rhombus",

  trapezio: "trapezoid",
  trapézio: "trapezoid",

  circulo: "circle",
  círculo: "circle",

  triangulo: "triangle",
  triângulo: "triangle",

  "triangulo retangulo": "triangle_right",
  "triângulo retângulo": "triangle_right",

  "triangulo isosceles": "triangle_isosceles",
  "triângulo isósceles": "triangle_isosceles",

  "triangulo equilatero": "triangle_equilateral",
  "triângulo equilátero": "triangle_equilateral",
};

export const SHAPE_NAME_ALIASES: Record<GeometryAliasLanguage, Record<string, string>> = {
  no: NO_ALIASES,
  nb: NO_ALIASES,
  en: EN_ALIASES,
  pt: PT_ALIASES,
};

export function normalizeGeometryLanguage(value: string | undefined | null): GeometryAliasLanguage {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw === "nb") return "nb";
  if (raw === "no") return "no";
  if (raw === "pt" || raw === "pt-br" || raw === "pt_br") return "pt";
  return "en";
}