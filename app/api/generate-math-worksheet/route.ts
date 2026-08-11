// app\api\generate-math-worksheet\route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

type WorksheetLanguage = "nb" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "all";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";
type AnswerSpace = "small" | "medium" | "large";

type FigureKind =
  | "rectangle"
  | "square"
  | "parallelogram"
  | "rhombus"
  | "trapezoid"
  | "triangle_right"
  | "triangle_isosceles"
  | "triangle_equilateral"
  | "circle";

type FigureSpec = {
  kind: FigureKind;
  widthCm?: number;
  heightCm?: number;
  sideCm?: number;
  baseCm?: number;
  topCm?: number;
  sideLeftCm?: number;
  sideRightCm?: number;
  sideAcm?: number;
  sideBcm?: number;
  sideCcm?: number;
  radiusCm?: number;
};

type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "perimeter" | "area" | "all_in_one";
  prompt: string;
  figure?: FigureSpec;
  answer: string;
  explanation?: string;
  hint?: string;
  formula?: string;
  inputMode?: "shape_name" | "number_with_unit" | "split_name_perimeter_area";
  expected?: {
    shapeName?: string;
    perimeterValue?: number | null;
    areaValue?: number | null;
    perimeterUnit?: "cm" | null;
    areaUnit?: "cm2" | null;
  };
};

type MathWorksheet = {
  title: string;
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  instructions: string;
  showAnswerKey: boolean;
  showFormulas: boolean;
  answerSpace?: AnswerSpace;
  selectedShapes: FigureKind[];
  tasks: MathWorksheetTask[];
};

type GenerateMathWorksheetRequest = {
  language?: string;
  level?: string;
  topic?: string;
  difficulty?: string;
  taskCount?: number;
  includeHints?: boolean;
  showAnswerKey?: boolean;
  showFormulas?: boolean;
  answerSpace?: string;
  selectedShapes?: string[];
  countUsage?: boolean;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

const ALL_FIGURES: FigureKind[] = [
  "square",
  "rectangle",
  "parallelogram",
  "rhombus",
  "trapezoid",
  "triangle_right",
  "triangle_isosceles",
  "triangle_equilateral",
  "circle",
];

function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return value === "nb" || value === "en" || value === "pt";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return (
    value === "shapes" ||
    value === "perimeter" ||
    value === "area" ||
    value === "all"
  );
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isGeometryLevel(value: unknown): value is GeometryLevel {
  return (
    value === "grade_3_4" ||
    value === "grade_5_7" ||
    value === "grade_8_10"
  );
}

function isAnswerSpace(value: unknown): value is AnswerSpace {
  return value === "small" || value === "medium" || value === "large";
}

function isFigureKind(value: unknown): value is FigureKind {
  return (
    value === "rectangle" ||
    value === "square" ||
    value === "parallelogram" ||
    value === "rhombus" ||
    value === "trapezoid" ||
    value === "triangle_right" ||
    value === "triangle_isosceles" ||
    value === "triangle_equilateral" ||
    value === "circle"
  );
}

function normalizeSelectedShapes(value: unknown): FigureKind[] {
  if (!Array.isArray(value)) return ALL_FIGURES;
  const filtered = value.filter(isFigureKind);
  return filtered.length > 0 ? Array.from(new Set(filtered)) : ALL_FIGURES;
}

function clampTaskCount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 6;
  return Math.max(4, Math.min(12, Math.round(value)));
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function makeId(index: number): string {
  return `${index + 1}`;
}

function normalizeLanguage(value: unknown): WorksheetLanguage {
  if (value === "no") return "nb";
  return isWorksheetLanguage(value) ? value : "nb";
}

function localizeShapeName(kind: FigureKind, lang: WorksheetLanguage): string {
  const map: Record<WorksheetLanguage, Record<FigureKind, string>> = {
    nb: {
      rectangle: "rektangel",
      square: "kvadrat",
      parallelogram: "parallellogram",
      rhombus: "rombe",
      trapezoid: "trapes",
      triangle_right: "rettvinklet trekant",
      triangle_isosceles: "likebeint trekant",
      triangle_equilateral: "likesidet trekant",
      circle: "sirkel",
    },
    en: {
      rectangle: "rectangle",
      square: "square",
      parallelogram: "parallelogram",
      rhombus: "rhombus",
      trapezoid: "trapezoid",
      triangle_right: "right triangle",
      triangle_isosceles: "isosceles triangle",
      triangle_equilateral: "equilateral triangle",
      circle: "circle",
    },
    pt: {
      rectangle: "retângulo",
      square: "quadrado",
      parallelogram: "paralelogramo",
      rhombus: "losango",
      trapezoid: "trapézio",
      triangle_right: "triângulo retângulo",
      triangle_isosceles: "triângulo isósceles",
      triangle_equilateral: "triângulo equilátero",
      circle: "círculo",
    },
  };

  return map[lang][kind];
}

function localizePrompt(
  lang: WorksheetLanguage,
  key: "shape_name" | "perimeter" | "area" | "all_in_one" | "instructions"
): string {
  const prompts: Record<WorksheetLanguage, Record<string, string[]>> = {
    nb: {
      shape_name: [
        "Hva heter figuren?",
        "Skriv navnet på figuren.",
        "Hvilken figur ser du her?",
      ],
      perimeter: [
        "Finn omkretsen av figuren.",
        "Regn ut omkretsen.",
        "Hvor stor er omkretsen til figuren?",
      ],
      area: [
        "Finn arealet av figuren.",
        "Regn ut arealet.",
        "Hvor stort areal har figuren?",
      ],
      all_in_one: [
        "Skriv navnet på figuren. Finn deretter omkretsen og arealet.",
        "Hva heter figuren? Regn så ut omkrets og areal.",
        "Navngi figuren og finn både omkrets og areal.",
      ],
      instructions: ["Svar på oppgavene. Vis utregning der det passer."],
    },
    en: {
      shape_name: [
        "What is the name of the shape?",
        "Write the name of the shape.",
        "Which shape do you see?",
      ],
      perimeter: [
        "Find the perimeter of the shape.",
        "Calculate the perimeter.",
        "What is the perimeter of the shape?",
      ],
      area: [
        "Find the area of the shape.",
        "Calculate the area.",
        "What is the area of the shape?",
      ],
      all_in_one: [
        "Write the name of the shape. Then find the perimeter and the area.",
        "What is the name of the shape? Then calculate perimeter and area.",
        "Name the shape and find both perimeter and area.",
      ],
      instructions: ["Answer the questions. Show your work when relevant."],
    },
    pt: {
      shape_name: [
        "Como se chama a figura?",
        "Escreve o nome da figura.",
        "Que figura vês aqui?",
      ],
      perimeter: [
        "Encontra o perímetro da figura.",
        "Calcula o perímetro.",
        "Qual é o perímetro da figura?",
      ],
      area: [
        "Encontra a área da figura.",
        "Calcula a área.",
        "Qual é a área da figura?",
      ],
      all_in_one: [
        "Escreve o nome da figura. Depois encontra o perímetro e a área.",
        "Como se chama a figura? Depois calcula o perímetro e a área.",
        "Dá o nome da figura e encontra o perímetro e a área.",
      ],
      instructions: [
        "Responde às tarefas. Mostra os cálculos quando fizer sentido.",
      ],
    },
  };

  return randomFrom(prompts[lang][key]);
}

function getTitle(lang: WorksheetLanguage, topic: GeometryTopic): string {
  const titles: Record<WorksheetLanguage, Record<GeometryTopic, string>> = {
    nb: {
      shapes: "Geometri – former",
      perimeter: "Geometri – omkrets",
      area: "Geometri – areal",
      all: "Geometri – former, omkrets og areal",
    },
    en: {
      shapes: "Geometry – shapes",
      perimeter: "Geometry – perimeter",
      area: "Geometry – area",
      all: "Geometry – shapes, perimeter and area",
    },
    pt: {
      shapes: "Geometria – formas",
      perimeter: "Geometria – perímetro",
      area: "Geometria – área",
      all: "Geometria – formas, perímetro e área",
    },
  };

  return titles[lang][topic];
}

function buildHint(
  type: MathWorksheetTask["type"],
  figure: FigureSpec | undefined,
  lang: WorksheetLanguage
): string | undefined {
  if (!figure) return undefined;

  if (lang === "nb") {
    if (type === "shape_name") return "Se på figurens sider, vinkler og form.";
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Bruk formelen for omkrets av sirkel."
        : "Legg sammen alle sidene rundt figuren.";
    }
    if (type === "area") return "Bruk riktig arealformel for figuren.";
    if (type === "all_in_one") {
      return "Start med å navngi figuren, finn så omkrets og til slutt areal.";
    }
  }

  if (lang === "en") {
    if (type === "shape_name") {
      return "Look at the sides, angles and the overall form.";
    }
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Use the formula for the circumference of a circle."
        : "Add all side lengths around the shape.";
    }
    if (type === "area") return "Use the correct area formula for the shape.";
    if (type === "all_in_one") {
      return "Start by naming the shape, then find the perimeter and the area.";
    }
  }

  if (lang === "pt") {
    if (type === "shape_name") {
      return "Observa os lados, os ângulos e a forma geral.";
    }
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Usa a fórmula do perímetro da circunferência."
        : "Soma todos os lados da figura.";
    }
    if (type === "area") return "Usa a fórmula correta da área para a figura.";
    if (type === "all_in_one") {
      return "Começa por escrever o nome da figura, depois encontra o perímetro e a área.";
    }
  }

  return undefined;
}

function pickDifficultyValues(
  difficulty: Difficulty,
  easy: number[],
  medium: number[],
  hard: number[]
): number {
  if (difficulty === "easy") return randomFrom(easy);
  if (difficulty === "medium") return randomFrom(medium);
  return randomFrom(hard);
}

function generateRightTriangleSpec(difficulty: Difficulty): FigureSpec {
  const presets =
    difficulty === "easy"
      ? [
          { base: 3, height: 4, hyp: 5 },
          { base: 6, height: 8, hyp: 10 },
        ]
      : difficulty === "medium"
        ? [
            { base: 5, height: 12, hyp: 13 },
            { base: 8, height: 15, hyp: 17 },
          ]
        : [
            { base: 7, height: 24, hyp: 25 },
            { base: 9, height: 40, hyp: 41 },
          ];

  const preset = randomFrom(presets);

  return {
    kind: "triangle_right",
    baseCm: preset.base,
    heightCm: preset.height,
    sideAcm: preset.base,
    sideBcm: preset.height,
    sideCcm: preset.hyp,
  };
}

function generateIsoscelesTriangleSpec(difficulty: Difficulty): FigureSpec {
  const presets =
    difficulty === "easy"
      ? [
          { base: 6, side: 5, height: 4 },
          { base: 8, side: 5, height: 3 },
        ]
      : difficulty === "medium"
        ? [
            { base: 10, side: 13, height: 12 },
            { base: 12, side: 10, height: 8 },
          ]
        : [
            { base: 16, side: 10, height: 6 },
            { base: 24, side: 25, height: 7 },
          ];

  const preset = randomFrom(presets);

  return {
    kind: "triangle_isosceles",
    baseCm: preset.base,
    heightCm: preset.height,
    sideAcm: preset.base,
    sideBcm: preset.side,
    sideCcm: preset.side,
  };
}

function generateEquilateralTriangleSpec(difficulty: Difficulty): FigureSpec {
  const side = pickDifficultyValues(
    difficulty,
    [4, 6, 8],
    [6, 8, 10, 12],
    [10, 12, 14, 16]
  );

  const height = Math.round((Math.sqrt(3) / 2) * side * 10) / 10;

  return {
    kind: "triangle_equilateral",
    sideCm: side,
    baseCm: side,
    heightCm: height,
    sideAcm: side,
    sideBcm: side,
    sideCcm: side,
  };
}

function generateCircleSpec(difficulty: Difficulty): FigureSpec {
  return {
    kind: "circle",
    radiusCm: pickDifficultyValues(
      difficulty,
      [2, 3, 4, 5],
      [4, 5, 6, 7],
      [6, 7, 8, 9]
    ),
  };
}

function generateDistinctPair(
  difficulty: Difficulty,
  firstEasy: number[],
  firstMedium: number[],
  firstHard: number[],
  secondEasy: number[],
  secondMedium: number[],
  secondHard: number[]
): [number, number] {
  const first = pickDifficultyValues(
    difficulty,
    firstEasy,
    firstMedium,
    firstHard
  );
  let second = pickDifficultyValues(
    difficulty,
    secondEasy,
    secondMedium,
    secondHard
  );

  let guard = 0;
  while (second === first && guard < 10) {
    second = pickDifficultyValues(
      difficulty,
      secondEasy,
      secondMedium,
      secondHard
    );
    guard += 1;
  }

  if (second === first) {
    second += 1;
  }

  return [first, second];
}

function generateFigureSpec(
  difficulty: Difficulty,
  selectedShapes: FigureKind[]
): FigureSpec {
  const kind = randomFrom(selectedShapes);

  if (kind === "square") {
    return {
      kind,
      sideCm: pickDifficultyValues(
        difficulty,
        [3, 4, 5, 6],
        [5, 6, 7, 8, 9],
        [7, 8, 9, 10, 11]
      ),
    };
  }

  if (kind === "rectangle") {
    const [width, height] = generateDistinctPair(
      difficulty,
      [4, 5, 6, 7],
      [6, 7, 8, 9, 10],
      [8, 9, 10, 11, 12],
      [2, 3, 4, 5],
      [3, 4, 5, 6],
      [4, 5, 6, 7]
    );

    return {
      kind,
      widthCm: width,
      heightCm: height,
    };
  }

  if (kind === "parallelogram") {
    const base = pickDifficultyValues(
      difficulty,
      [8, 9, 10, 11],
      [10, 12, 14, 16],
      [14, 16, 18, 20]
    );

    const side = pickDifficultyValues(difficulty, [4, 5], [5, 6, 7], [6, 7, 8]);

    let height = pickDifficultyValues(
      difficulty,
      [2, 3, 4],
      [3, 4, 5],
      [4, 5, 6]
    );

    if (height >= side) {
      height = Math.max(2, side - 1);
    }

    return {
      kind,
      baseCm: base,
      sideCm: side,
      heightCm: height,
    };
  }

  if (kind === "rhombus") {
    const side = pickDifficultyValues(
      difficulty,
      [4, 5, 6, 7],
      [6, 7, 8, 9],
      [8, 9, 10, 11]
    );

    let height = pickDifficultyValues(
      difficulty,
      [2, 3, 4],
      [3, 4, 5],
      [4, 5, 6]
    );

    if (height >= side) {
      height = Math.max(2, side - 1);
    }

    return {
      kind,
      sideCm: side,
      heightCm: height,
    };
  }

  if (kind === "trapezoid") {
    const base = pickDifficultyValues(
      difficulty,
      [8, 10, 12],
      [10, 12, 14, 16],
      [12, 14, 16, 18]
    );

    const top = Math.min(
      pickDifficultyValues(
        difficulty,
        [4, 6, 8],
        [6, 8, 10, 12],
        [8, 10, 12, 14]
      ),
      base - 2
    );

    const height = pickDifficultyValues(
      difficulty,
      [2, 4, 6],
      [4, 6, 8],
      [6, 8, 10]
    );

    const side = pickDifficultyValues(
      difficulty,
      [4, 5, 6],
      [5, 6, 7, 8],
      [7, 8, 9, 10]
    );

    return {
      kind,
      baseCm: Math.max(base, top + 2),
      topCm: top,
      heightCm: height,
      sideLeftCm: side,
      sideRightCm: side,
    };
  }

  if (kind === "triangle_right") {
    return generateRightTriangleSpec(difficulty);
  }

  if (kind === "triangle_isosceles") {
    return generateIsoscelesTriangleSpec(difficulty);
  }

  if (kind === "triangle_equilateral") {
    return generateEquilateralTriangleSpec(difficulty);
  }

  return generateCircleSpec(difficulty);
}

function formatNumber(value: number, lang: WorksheetLanguage): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return lang === "nb" || lang === "pt"
    ? rounded.toFixed(1).replace(".", ",")
    : rounded.toFixed(1);
}

function extractNumericValue(value: string): number | null {
  const cleaned = value
    .replace("cm²", "")
    .replace("cm2", "")
    .replace("cm", "")
    .trim()
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatFigureMeta(figure: FigureSpec, lang: WorksheetLanguage): string {
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

function buildFormula(figure: FigureSpec, lang: WorksheetLanguage): string {
  if (lang === "nb") {
    if (figure.kind === "square") {
      return "Omkrets: 4 × side\nAreal: side × side";
    }
    if (figure.kind === "rectangle") {
      return "Omkrets: 2 × (lengde + bredde)\nAreal: lengde × bredde";
    }
    if (figure.kind === "parallelogram") {
      return "Omkrets: 2 × (grunnlinje + side)\nAreal: grunnlinje × høyde";
    }
    if (figure.kind === "rhombus") {
      return "Omkrets: 4 × side\nAreal: side × høyde";
    }
    if (figure.kind === "trapezoid") {
      return "Omkrets: summen av alle sidene\nAreal: ((øvre grunnlinje + nedre grunnlinje) × høyde) / 2";
    }
    if (
      figure.kind === "triangle_right" ||
      figure.kind === "triangle_isosceles" ||
      figure.kind === "triangle_equilateral"
    ) {
      return "Omkrets: summen av de tre sidene\nAreal: (grunnlinje × høyde) / 2";
    }
    return "Omkrets: 2 × π × radius\nAreal: π × radius × radius";
  }

  if (lang === "en") {
    if (figure.kind === "square") {
      return "Perimeter: 4 × side\nArea: side × side";
    }
    if (figure.kind === "rectangle") {
      return "Perimeter: 2 × (length + width)\nArea: length × width";
    }
    if (figure.kind === "parallelogram") {
      return "Perimeter: 2 × (base + side)\nArea: base × height";
    }
    if (figure.kind === "rhombus") {
      return "Perimeter: 4 × side\nArea: side × height";
    }
    if (figure.kind === "trapezoid") {
      return "Perimeter: sum of all sides\nArea: ((top base + bottom base) × height) / 2";
    }
    if (
      figure.kind === "triangle_right" ||
      figure.kind === "triangle_isosceles" ||
      figure.kind === "triangle_equilateral"
    ) {
      return "Perimeter: sum of the three sides\nArea: (base × height) / 2";
    }
    return "Perimeter: 2 × π × radius\nArea: π × radius × radius";
  }

  if (figure.kind === "square") {
    return "Perímetro: 4 × lado\nÁrea: lado × lado";
  }
  if (figure.kind === "rectangle") {
    return "Perímetro: 2 × (comprimento + largura)\nÁrea: comprimento × largura";
  }
  if (figure.kind === "parallelogram") {
    return "Perímetro: 2 × (base + lado)\nÁrea: base × altura";
  }
  if (figure.kind === "rhombus") {
    return "Perímetro: 4 × lado\nÁrea: lado × altura";
  }
  if (figure.kind === "trapezoid") {
    return "Perímetro: soma de todos os lados\nÁrea: ((base maior + base menor) × altura) / 2";
  }
  if (
    figure.kind === "triangle_right" ||
    figure.kind === "triangle_isosceles" ||
    figure.kind === "triangle_equilateral"
  ) {
    return "Perímetro: soma dos três lados\nÁrea: (base × altura) / 2";
  }
  return "Perímetro: 2 × π × raio\nÁrea: π × raio × raio";
}

function solveFigure(
  figure: FigureSpec,
  lang: WorksheetLanguage
): { perimeter: string; area: string; explanation: string } {
  if (figure.kind === "square" && figure.sideCm) {
    const perimeter = figure.sideCm * 4;
    const area = figure.sideCm * figure.sideCm;

    return {
      perimeter: `${perimeter} cm`,
      area: `${area} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = 4 × ${figure.sideCm} = ${perimeter} cm. Areal = ${figure.sideCm} × ${figure.sideCm} = ${area} cm².`
          : lang === "en"
            ? `Perimeter = 4 × ${figure.sideCm} = ${perimeter} cm. Area = ${figure.sideCm} × ${figure.sideCm} = ${area} cm².`
            : `Perímetro = 4 × ${figure.sideCm} = ${perimeter} cm. Área = ${figure.sideCm} × ${figure.sideCm} = ${area} cm².`,
    };
  }

  if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
    const perimeter = 2 * (figure.widthCm + figure.heightCm);
    const area = figure.widthCm * figure.heightCm;

    return {
      perimeter: `${perimeter} cm`,
      area: `${area} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Areal = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`
          : lang === "en"
            ? `Perimeter = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Area = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`
            : `Perímetro = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Área = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`,
    };
  }

  if (
    figure.kind === "parallelogram" &&
    figure.baseCm &&
    figure.sideCm &&
    figure.heightCm
  ) {
    const perimeter = 2 * (figure.baseCm + figure.sideCm);
    const area = figure.baseCm * figure.heightCm;

    return {
      perimeter: `${perimeter} cm`,
      area: `${area} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = 2 × (${figure.baseCm} + ${figure.sideCm}) = ${perimeter} cm. Areal = ${figure.baseCm} × ${figure.heightCm} = ${area} cm².`
          : lang === "en"
            ? `Perimeter = 2 × (${figure.baseCm} + ${figure.sideCm}) = ${perimeter} cm. Area = ${figure.baseCm} × ${figure.heightCm} = ${area} cm².`
            : `Perímetro = 2 × (${figure.baseCm} + ${figure.sideCm}) = ${perimeter} cm. Área = ${figure.baseCm} × ${figure.heightCm} = ${area} cm².`,
    };
  }

  if (figure.kind === "rhombus" && figure.sideCm && figure.heightCm) {
    const perimeter = 4 * figure.sideCm;
    const area = figure.sideCm * figure.heightCm;

    return {
      perimeter: `${perimeter} cm`,
      area: `${area} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = 4 × ${figure.sideCm} = ${perimeter} cm. Areal = ${figure.sideCm} × ${figure.heightCm} = ${area} cm².`
          : lang === "en"
            ? `Perimeter = 4 × ${figure.sideCm} = ${perimeter} cm. Area = ${figure.sideCm} × ${figure.heightCm} = ${area} cm².`
            : `Perímetro = 4 × ${figure.sideCm} = ${perimeter} cm. Área = ${figure.sideCm} × ${figure.heightCm} = ${area} cm².`,
    };
  }

  if (
    figure.kind === "trapezoid" &&
    figure.baseCm &&
    figure.topCm &&
    figure.heightCm &&
    figure.sideLeftCm &&
    figure.sideRightCm
  ) {
    const perimeter =
      figure.baseCm + figure.topCm + figure.sideLeftCm + figure.sideRightCm;
    const area = ((figure.baseCm + figure.topCm) * figure.heightCm) / 2;

    return {
      perimeter: `${perimeter} cm`,
      area: `${formatNumber(area, lang)} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Areal = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
          : lang === "en"
            ? `Perimeter = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Area = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
            : `Perímetro = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Área = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`,
    };
  }

  if (
    (figure.kind === "triangle_right" ||
      figure.kind === "triangle_isosceles" ||
      figure.kind === "triangle_equilateral") &&
    figure.sideAcm &&
    figure.sideBcm &&
    figure.sideCcm &&
    figure.baseCm &&
    figure.heightCm
  ) {
    const perimeter = figure.sideAcm + figure.sideBcm + figure.sideCcm;
    const area = (figure.baseCm * figure.heightCm) / 2;

    return {
      perimeter: `${formatNumber(perimeter, lang)} cm`,
      area: `${formatNumber(area, lang)} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = ${formatNumber(figure.sideAcm, lang)} + ${formatNumber(figure.sideBcm, lang)} + ${formatNumber(figure.sideCcm, lang)} = ${formatNumber(perimeter, lang)} cm. Areal = (${formatNumber(figure.baseCm, lang)} × ${formatNumber(figure.heightCm, lang)}) / 2 = ${formatNumber(area, lang)} cm².`
          : lang === "en"
            ? `Perimeter = ${formatNumber(figure.sideAcm, lang)} + ${formatNumber(figure.sideBcm, lang)} + ${formatNumber(figure.sideCcm, lang)} = ${formatNumber(perimeter, lang)} cm. Area = (${formatNumber(figure.baseCm, lang)} × ${formatNumber(figure.heightCm, lang)}) / 2 = ${formatNumber(area, lang)} cm².`
            : `Perímetro = ${formatNumber(figure.sideAcm, lang)} + ${formatNumber(figure.sideBcm, lang)} + ${formatNumber(figure.sideCcm, lang)} = ${formatNumber(perimeter, lang)} cm. Área = (${formatNumber(figure.baseCm, lang)} × ${formatNumber(figure.heightCm, lang)}) / 2 = ${formatNumber(area, lang)} cm².`,
    };
  }

  if (figure.kind === "circle" && figure.radiusCm) {
    const perimeter = 2 * 3.14 * figure.radiusCm;
    const area = 3.14 * figure.radiusCm * figure.radiusCm;

    return {
      perimeter: `${formatNumber(perimeter, lang)} cm`,
      area: `${formatNumber(area, lang)} cm²`,
      explanation:
        lang === "nb"
          ? `Omkrets = 2 × 3,14 × ${figure.radiusCm} = ${formatNumber(perimeter, lang)} cm. Areal = 3,14 × ${figure.radiusCm} × ${figure.radiusCm} = ${formatNumber(area, lang)} cm².`
          : lang === "en"
            ? `Perimeter = 2 × 3.14 × ${figure.radiusCm} = ${formatNumber(perimeter, lang)} cm. Area = 3.14 × ${figure.radiusCm} × ${figure.radiusCm} = ${formatNumber(area, lang)} cm².`
            : `Perímetro = 2 × 3,14 × ${figure.radiusCm} = ${formatNumber(perimeter, lang)} cm. Área = 3,14 × ${figure.radiusCm} × ${figure.radiusCm} = ${formatNumber(area, lang)} cm².`,
    };
  }

  return {
    perimeter: "",
    area: "",
    explanation: "",
  };
}

function generateShapeTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean,
  showFormulas: boolean,
  selectedShapes: FigureKind[]
): MathWorksheetTask {
  const figure = generateFigureSpec(difficulty, selectedShapes);
  const shapeName = localizeShapeName(figure.kind, lang);

  return {
    id: makeId(index),
    type: "shape_name",
    prompt: `${localizePrompt(lang, "shape_name")} ${formatFigureMeta(figure, lang)}`,
    figure,
    answer: shapeName,
    hint: includeHints ? buildHint("shape_name", figure, lang) : undefined,
    formula: showFormulas ? buildFormula(figure, lang) : undefined,
    inputMode: "shape_name",
    expected: {
      shapeName,
      perimeterUnit: null,
      areaUnit: null,
    },
  };
}

function generatePerimeterTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean,
  showFormulas: boolean,
  selectedShapes: FigureKind[]
): MathWorksheetTask {
  const figure = generateFigureSpec(difficulty, selectedShapes);
  const solved = solveFigure(figure, lang);

  return {
    id: makeId(index),
    type: "perimeter",
    prompt: `${localizePrompt(lang, "perimeter")} ${formatFigureMeta(figure, lang)}`,
    figure,
    answer: solved.perimeter,
    explanation: solved.explanation,
    hint: includeHints ? buildHint("perimeter", figure, lang) : undefined,
    formula: showFormulas ? buildFormula(figure, lang) : undefined,
    inputMode: "number_with_unit",
    expected: {
      perimeterValue: extractNumericValue(solved.perimeter),
      perimeterUnit: "cm",
      areaUnit: null,
    },
  };
}

function generateAreaTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean,
  showFormulas: boolean,
  selectedShapes: FigureKind[]
): MathWorksheetTask {
  const figure = generateFigureSpec(difficulty, selectedShapes);
  const solved = solveFigure(figure, lang);

  return {
    id: makeId(index),
    type: "area",
    prompt: `${localizePrompt(lang, "area")} ${formatFigureMeta(figure, lang)}`,
    figure,
    answer: solved.area,
    explanation: solved.explanation,
    hint: includeHints ? buildHint("area", figure, lang) : undefined,
    formula: showFormulas ? buildFormula(figure, lang) : undefined,
    inputMode: "number_with_unit",
    expected: {
      areaValue: extractNumericValue(solved.area),
      perimeterUnit: null,
      areaUnit: "cm2",
    },
  };
}

function generateAllInOneTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean,
  showFormulas: boolean,
  selectedShapes: FigureKind[]
): MathWorksheetTask {
  const figure = generateFigureSpec(difficulty, selectedShapes);
  const solved = solveFigure(figure, lang);
  const name = localizeShapeName(figure.kind, lang);

  const answer =
    lang === "nb"
      ? `Navn: ${name}\nOmkrets: ${solved.perimeter}\nAreal: ${solved.area}`
      : lang === "en"
        ? `Name: ${name}\nPerimeter: ${solved.perimeter}\nArea: ${solved.area}`
        : `Nome: ${name}\nPerímetro: ${solved.perimeter}\nÁrea: ${solved.area}`;

  return {
    id: makeId(index),
    type: "all_in_one",
    prompt: `${localizePrompt(lang, "all_in_one")} ${formatFigureMeta(figure, lang)}`,
    figure,
    answer,
    explanation: solved.explanation,
    hint: includeHints ? buildHint("all_in_one", figure, lang) : undefined,
    formula: showFormulas ? buildFormula(figure, lang) : undefined,
    inputMode: "split_name_perimeter_area",
    expected: {
      shapeName: name,
      perimeterValue: extractNumericValue(solved.perimeter),
      areaValue: extractNumericValue(solved.area),
      perimeterUnit: "cm",
      areaUnit: "cm2",
    },
  };
}

function buildTaskTypes(topic: GeometryTopic): Array<MathWorksheetTask["type"]> {
  if (topic === "shapes") return ["shape_name"];
  if (topic === "perimeter") return ["perimeter"];
  if (topic === "area") return ["area"];
  return ["all_in_one"];
}

function generateWorksheet(params: {
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  taskCount: number;
  includeHints: boolean;
  showAnswerKey: boolean;
  showFormulas: boolean;
  answerSpace: AnswerSpace;
  selectedShapes: FigureKind[];
}): MathWorksheet {
  const taskTypes = buildTaskTypes(params.topic);

  const tasks: MathWorksheetTask[] = Array.from(
    { length: params.taskCount },
    (_, index) => {
      const type = randomFrom(taskTypes);

      if (type === "shape_name") {
        return generateShapeTask(
          index,
          params.language,
          params.difficulty,
          params.includeHints,
          params.showFormulas,
          params.selectedShapes
        );
      }

      if (type === "perimeter") {
        return generatePerimeterTask(
          index,
          params.language,
          params.difficulty,
          params.includeHints,
          params.showFormulas,
          params.selectedShapes
        );
      }

      if (type === "area") {
        return generateAreaTask(
          index,
          params.language,
          params.difficulty,
          params.includeHints,
          params.showFormulas,
          params.selectedShapes
        );
      }

      return generateAllInOneTask(
        index,
        params.language,
        params.difficulty,
        params.includeHints,
        params.showFormulas,
        params.selectedShapes
      );
    }
  );

  return {
    title: getTitle(params.language, params.topic),
    language: params.language,
    level: params.level,
    topic: params.topic,
    difficulty: params.difficulty,
    instructions: localizePrompt(params.language, "instructions"),
    showAnswerKey: params.showAnswerKey,
    showFormulas: params.showFormulas,
    answerSpace: params.answerSpace,
    selectedShapes: params.selectedShapes,
    tasks,
  };
}

function normalizeRequest(body: GenerateMathWorksheetRequest) {
  const language = normalizeLanguage(body.language);
  const level: GeometryLevel = isGeometryLevel(body.level)
    ? body.level
    : "grade_5_7";
  const topic: GeometryTopic = isGeometryTopic(body.topic)
    ? body.topic
    : "all";
  const difficulty: Difficulty = isDifficulty(body.difficulty)
    ? body.difficulty
    : "easy";
  const taskCount = clampTaskCount(body.taskCount);
  const includeHints =
    typeof body.includeHints === "boolean" ? body.includeHints : true;
  const showAnswerKey =
    typeof body.showAnswerKey === "boolean" ? body.showAnswerKey : false;
  const showFormulas =
    typeof body.showFormulas === "boolean" ? body.showFormulas : false;
  const answerSpace: AnswerSpace = isAnswerSpace(body.answerSpace)
    ? body.answerSpace
    : "medium";
  const selectedShapes = normalizeSelectedShapes(body.selectedShapes);

  return {
    language,
    level,
    topic,
    difficulty,
    taskCount,
    includeHints,
    showAnswerKey,
    showFormulas,
    answerSpace,
    selectedShapes,
  };
}

async function getRequestUserContext(
  req: Request
): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  if (needsEmailVerification(decoded)) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }
  const uid = decoded.uid;

  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;

  const role =
    typeof data?.role === "string"
      ? data.role
      : typeof data?.mode === "string"
        ? data.mode
        : "anonymous";

  const plan = getEffectivePlan({
    plan: typeof data?.plan === "string" ? data.plan : "free",
    billing:
      data?.billing && typeof data.billing === "object"
        ? (data.billing as { plan?: string | null; status?: string | null })
        : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return { uid, role, plan };
}

function mapStatusToResponse(
  status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>
) {
  if (status.reason === "teacher_only") {
    return NextResponse.json(
      {
        ok: false,
        error: "This feature is only available for teachers.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  if (status.reason === "limit_reached") {
    return NextResponse.json(
      {
        ok: false,
        error: "You have reached your monthly limit.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "This feature requires an upgraded plan.",
      reason: status.reason ?? "upgrade_required",
    },
    { status: 403 }
  );
}

export async function POST(req: Request) {
  try {
    const user = await getRequestUserContext(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_math_worksheet",
    });

    const body = (await req.json()) as GenerateMathWorksheetRequest;
    const shouldCountUsage = body.countUsage !== false;
    const canReuseCountedDraft =
      !shouldCountUsage && status.reason === "limit_reached";

    if (!status.allowed && !canReuseCountedDraft) {
      return mapStatusToResponse(status);
    }

    const params = normalizeRequest(body);
    const worksheet = generateWorksheet(params);

    if (shouldCountUsage) {
      await consumeFeatureAdmin({
        uid: user.uid,
        feature: "producer_create_math_worksheet",
      });
    }

    return NextResponse.json({
      ok: true,
      worksheet,
      counted: shouldCountUsage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredResponse();
    }
    console.error("generate-math-worksheet failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate worksheet";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
