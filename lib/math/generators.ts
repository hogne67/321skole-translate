export const MATH_GENERATORS = [
  { id: "arithmetic", path: "arithmetic" },
  { id: "geometry", path: "geometry?new=1" },
  { id: "fractions", path: "fractions" },
  { id: "fractionCalculation", path: "fraction-calculation" },
  { id: "measurement", path: "measurement" },
  { id: "comparison", path: "comparison" },
  { id: "percentage", path: "percentage" },
  { id: "equations", path: "equations" },
] as const;

const nb = {
  equations: "Ligninger", equationsDescription: "Finn x steg for steg, med brøk, parenteser og x på begge sider.",
  percentage: "Prosentregning", percentageDescription: "Finn prosenten, delen eller helheten. Egne oppgaver med rabatt og prosentvis økning.",
  title: "Matematikk", back: "Alle mattegeneratorer",
  comparison: "Sammenlign tall", comparisonDescription: "Brøk, desimaltall og prosent, med valgfri visuell støtte.",
  measurement: "Omregning av enheter", measurementDescription: "Lengde, vekt og volum, med eller uten desimaltall.",
  arithmetic: "Regnearter", arithmeticDescription: "Mengdetrening, oppstilt regning og visuell støtte.",
  geometry: "Geometri", geometryDescription: "Figurer, omkrets og areal.",
  fractions: "Brøk med figurer", fractionsDescription: "Fargelegg, skriv og gjenkjenn brøker.",
  fractionCalculation: "Brøkregning", fractionCalculationDescription: "De fire regneartene med like eller ulike nevnere.",
};
type Copy = { [K in keyof typeof nb]: string };
const en: Copy = {
  equations: "Equations", equationsDescription: "Find x step by step, with fractions, parentheses and x on both sides.",
  percentage: "Percentages", percentageDescription: "Find the percentage, part or whole. Separate tasks on discounts and percentage increases.",
  title: "Mathematics", back: "All maths generators",
  comparison: "Compare numbers", comparisonDescription: "Fractions, decimals and percentages, with optional visual support.",
  measurement: "Unit conversion", measurementDescription: "Length, mass and volume, with or without decimals.",
  arithmetic: "Arithmetic", arithmeticDescription: "Fluency practice, vertical arithmetic and visual support.",
  geometry: "Geometry", geometryDescription: "Shapes, perimeter and area.",
  fractions: "Visual fractions", fractionsDescription: "Shade, write and identify fractions.",
  fractionCalculation: "Fraction arithmetic", fractionCalculationDescription: "Four operations with equal or different denominators.",
};
const pt: Copy = {
  equations: "Equações", equationsDescription: "Calcula x passo a passo, com frações, parênteses e x nos dois membros.",
  percentage: "Percentagens", percentageDescription: "Calcula a percentagem, a parte ou o total. Exercícios separados de descontos e aumentos percentuais.",
  title: "Matemática", back: "Todos os geradores de matemática",
  comparison: "Comparar números", comparisonDescription: "Frações, decimais e percentagens, com apoio visual opcional.",
  measurement: "Conversão de unidades", measurementDescription: "Comprimento, massa e volume, com ou sem decimais.",
  arithmetic: "Operações", arithmeticDescription: "Prática de cálculo, operações em coluna e apoio visual.",
  geometry: "Geometria", geometryDescription: "Figuras, perímetro e área.",
  fractions: "Frações com figuras", fractionsDescription: "Pintar, escrever e identificar frações.",
  fractionCalculation: "Cálculo com frações", fractionCalculationDescription: "As quatro operações com denominadores iguais ou diferentes.",
};
export function getMathGeneratorCopy(locale: string): Copy {
  return locale === "en" ? en : locale === "pt" ? pt : nb;
}
