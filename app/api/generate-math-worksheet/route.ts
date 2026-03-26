// app\api\generate-math-worksheet\route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import type { AppRole, PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type WorksheetLanguage = "no" | "en" | "pt";
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
  | "triangle"
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
  "triangle",
  "circle",
];

function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return value === "no" || value === "en" || value === "pt";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return value === "shapes" || value === "perimeter" || value === "area" || value === "all";
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isGeometryLevel(value: unknown): value is GeometryLevel {
  return value === "grade_3_4" || value === "grade_5_7" || value === "grade_8_10";
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
    value === "triangle" ||
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

function localizeShapeName(kind: FigureKind, lang: WorksheetLanguage): string {
  const map: Record<WorksheetLanguage, Record<FigureKind, string>> = {
    no: {
      rectangle: "rektangel",
      square: "kvadrat",
      parallelogram: "parallellogram",
      rhombus: "rombe",
      trapezoid: "trapes",
      triangle: "trekant",
      circle: "sirkel",
    },
    en: {
      rectangle: "rectangle",
      square: "square",
      parallelogram: "parallelogram",
      rhombus: "rhombus",
      trapezoid: "trapezoid",
      triangle: "triangle",
      circle: "circle",
    },
    pt: {
      rectangle: "retângulo",
      square: "quadrado",
      parallelogram: "paralelogramo",
      rhombus: "losango",
      trapezoid: "trapézio",
      triangle: "triângulo",
      circle: "círculo",
    },
  };

  return map[lang][kind];
}

function localizePrompt(
  lang: WorksheetLanguage,
  key: "shape_name" | "perimeter" | "area" | "all_in_one" | "instructions"
): string {
  const prompts: Record<WorksheetLanguage, Record<string, string>> = {
    no: {
      shape_name: "Hva heter figuren?",
      perimeter: "Finn omkretsen av figuren.",
      area: "Finn arealet av figuren.",
      all_in_one: "Skriv navnet på figuren. Finn deretter omkretsen og arealet.",
      instructions: "Svar på oppgavene. Vis utregning der det passer.",
    },
    en: {
      shape_name: "What is the name of the shape?",
      perimeter: "Find the perimeter of the shape.",
      area: "Find the area of the shape.",
      all_in_one: "Write the name of the shape. Then find the perimeter and the area.",
      instructions: "Answer the questions. Show your work when relevant.",
    },
    pt: {
      shape_name: "Como se chama a figura?",
      perimeter: "Encontra o perímetro da figura.",
      area: "Encontra a área da figura.",
      all_in_one: "Escreve o nome da figura. Depois encontra o perímetro e a área.",
      instructions: "Responde às tarefas. Mostra os cálculos quando fizer sentido.",
    },
  };

  return prompts[lang][key];
}

function getTitle(lang: WorksheetLanguage, topic: GeometryTopic): string {
  const titles: Record<WorksheetLanguage, Record<GeometryTopic, string>> = {
    no: {
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

  if (lang === "no") {
    if (type === "shape_name") return "Se på figurens sider, vinkler og form.";
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Bruk formelen for omkrets av sirkel."
        : "Legg sammen alle sidene rundt figuren.";
    }
    if (type === "area") return "Bruk riktig arealformel for figuren.";
    if (type === "all_in_one") return "Start med å navngi figuren, finn så omkrets og til slutt areal.";
  }

  if (lang === "en") {
    if (type === "shape_name") return "Look at the sides, angles and the overall form.";
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Use the formula for the circumference of a circle."
        : "Add all side lengths around the shape.";
    }
    if (type === "area") return "Use the correct area formula for the shape.";
    if (type === "all_in_one") return "Start by naming the shape, then find the perimeter and the area.";
  }

  if (lang === "pt") {
    if (type === "shape_name") return "Observa os lados, os ângulos e a forma geral.";
    if (type === "perimeter") {
      return figure.kind === "circle"
        ? "Usa a fórmula do perímetro da circunferência."
        : "Soma todos os lados da figura.";
    }
    if (type === "area") return "Usa a fórmula correta da área para a figura.";
    if (type === "all_in_one") return "Começa por escrever o nome da figura, depois encontra o perímetro e a área.";
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

function generateTriangleSpec(difficulty: Difficulty): FigureSpec {
  const triplesEasy = [
    { a: 3, b: 4, c: 5 },
    { a: 5, b: 12, c: 13 },
  ];
  const triplesMedium = [
    { a: 6, b: 8, c: 10 },
    { a: 8, b: 15, c: 17 },
  ];
  const triplesHard = [
    { a: 7, b: 24, c: 25 },
    { a: 9, b: 12, c: 15 },
  ];

  const triple =
    difficulty === "easy"
      ? randomFrom(triplesEasy)
      : difficulty === "medium"
        ? randomFrom(triplesMedium)
        : randomFrom(triplesHard);

  return {
    kind: "triangle",
    baseCm: triple.a,
    heightCm: triple.b,
    sideAcm: triple.a,
    sideBcm: triple.b,
    sideCcm: triple.c,
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
    return {
      kind,
      widthCm: pickDifficultyValues(
        difficulty,
        [4, 5, 6, 7],
        [6, 7, 8, 9, 10],
        [8, 9, 10, 11, 12]
      ),
      heightCm: pickDifficultyValues(
        difficulty,
        [2, 3, 4, 5],
        [3, 4, 5, 6],
        [4, 5, 6, 7]
      ),
    };
  }

  if (kind === "parallelogram") {
    return {
      kind,
      baseCm: pickDifficultyValues(
        difficulty,
        [5, 6, 7, 8],
        [7, 8, 9, 10],
        [9, 10, 11, 12]
      ),
      sideCm: pickDifficultyValues(
        difficulty,
        [3, 4, 5, 6],
        [4, 5, 6, 7],
        [5, 6, 7, 8]
      ),
      heightCm: pickDifficultyValues(
        difficulty,
        [2, 3, 4],
        [3, 4, 5],
        [4, 5, 6]
      ),
    };
  }

  if (kind === "rhombus") {
    return {
      kind,
      sideCm: pickDifficultyValues(
        difficulty,
        [4, 5, 6, 7],
        [6, 7, 8, 9],
        [8, 9, 10, 11]
      ),
      heightCm: pickDifficultyValues(
        difficulty,
        [2, 3, 4],
        [3, 4, 5],
        [4, 5, 6]
      ),
    };
  }

  if (kind === "trapezoid") {
    const base = pickDifficultyValues(
      difficulty,
      [8, 10, 12],
      [10, 12, 14, 16],
      [12, 14, 16, 18]
    );
    const top = pickDifficultyValues(
      difficulty,
      [4, 6, 8],
      [6, 8, 10, 12],
      [8, 10, 12, 14]
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
      topCm: Math.min(top, base - 2),
      heightCm: height,
      sideLeftCm: side,
      sideRightCm: side,
    };
  }

  if (kind === "triangle") {
    return generateTriangleSpec(difficulty);
  }

  return generateCircleSpec(difficulty);
}

function formatNumber(value: number, lang: WorksheetLanguage): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return lang === "no" || lang === "pt"
    ? rounded.toFixed(1).replace(".", ",")
    : rounded.toFixed(1);
}

function formatFigureMeta(figure: FigureSpec, lang: WorksheetLanguage): string {
  if (lang === "no") {
    if (figure.kind === "square" && figure.sideCm) {
      return `Side: ${figure.sideCm} cm`;
    }
    if (figure.kind === "rectangle" && figure.widthCm && figure.heightCm) {
      return `Lengde: ${figure.widthCm} cm, bredde: ${figure.heightCm} cm`;
    }
    if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
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
      figure.kind === "triangle" &&
      figure.sideAcm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Sider: ${figure.sideAcm} cm, ${figure.sideBcm} cm og ${figure.sideCcm} cm. Høyde til grunnlinja: ${figure.heightCm} cm`;
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
    if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
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
      figure.kind === "triangle" &&
      figure.sideAcm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Sides: ${figure.sideAcm} cm, ${figure.sideBcm} cm and ${figure.sideCcm} cm. Height to the base: ${figure.heightCm} cm`;
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
    if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
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
      figure.kind === "triangle" &&
      figure.sideAcm &&
      figure.sideBcm &&
      figure.sideCcm &&
      figure.heightCm
    ) {
      return `Lados: ${figure.sideAcm} cm, ${figure.sideBcm} cm e ${figure.sideCcm} cm. Altura em relação à base: ${figure.heightCm} cm`;
    }
    if (figure.kind === "circle" && figure.radiusCm) {
      return `Raio: ${figure.radiusCm} cm. Usa π = 3,14`;
    }
  }

  return "";
}

function buildFormula(figure: FigureSpec, lang: WorksheetLanguage): string {
  if (lang === "no") {
    if (figure.kind === "square") return "Omkrets: 4 × side\nAreal: side × side";
    if (figure.kind === "rectangle") return "Omkrets: 2 × (lengde + bredde)\nAreal: lengde × bredde";
    if (figure.kind === "parallelogram") return "Omkrets: 2 × (grunnlinje + side)\nAreal: grunnlinje × høyde";
    if (figure.kind === "rhombus") return "Omkrets: 4 × side\nAreal: grunnlinje × høyde";
    if (figure.kind === "trapezoid") return "Omkrets: summen av alle sidene\nAreal: ((øvre grunnlinje + nedre grunnlinje) × høyde) / 2";
    if (figure.kind === "triangle") return "Omkrets: summen av de tre sidene\nAreal: (grunnlinje × høyde) / 2";
    return "Omkrets: 2 × π × radius\nAreal: π × radius × radius";
  }

  if (lang === "en") {
    if (figure.kind === "square") return "Perimeter: 4 × side\nArea: side × side";
    if (figure.kind === "rectangle") return "Perimeter: 2 × (length + width)\nArea: length × width";
    if (figure.kind === "parallelogram") return "Perimeter: 2 × (base + side)\nArea: base × height";
    if (figure.kind === "rhombus") return "Perimeter: 4 × side\nArea: base × height";
    if (figure.kind === "trapezoid") return "Perimeter: sum of all sides\nArea: ((top base + bottom base) × height) / 2";
    if (figure.kind === "triangle") return "Perimeter: sum of the three sides\nArea: (base × height) / 2";
    return "Perimeter: 2 × π × radius\nArea: π × radius × radius";
  }

  if (figure.kind === "square") return "Perímetro: 4 × lado\nÁrea: lado × lado";
  if (figure.kind === "rectangle") return "Perímetro: 2 × (comprimento + largura)\nÁrea: comprimento × largura";
  if (figure.kind === "parallelogram") return "Perímetro: 2 × (base + lado)\nÁrea: base × altura";
  if (figure.kind === "rhombus") return "Perímetro: 4 × lado\nÁrea: base × altura";
  if (figure.kind === "trapezoid") return "Perímetro: soma de todos os lados\nÁrea: ((base maior + base menor) × altura) / 2";
  if (figure.kind === "triangle") return "Perímetro: soma dos três lados\nÁrea: (base × altura) / 2";
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
        lang === "no"
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
        lang === "no"
          ? `Omkrets = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Areal = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`
          : lang === "en"
            ? `Perimeter = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Area = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`
            : `Perímetro = 2 × (${figure.widthCm} + ${figure.heightCm}) = ${perimeter} cm. Área = ${figure.widthCm} × ${figure.heightCm} = ${area} cm².`,
    };
  }

  if (figure.kind === "parallelogram" && figure.baseCm && figure.sideCm && figure.heightCm) {
    const perimeter = 2 * (figure.baseCm + figure.sideCm);
    const area = figure.baseCm * figure.heightCm;

    return {
      perimeter: `${perimeter} cm`,
      area: `${area} cm²`,
      explanation:
        lang === "no"
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
        lang === "no"
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
        lang === "no"
          ? `Omkrets = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Areal = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
          : lang === "en"
            ? `Perimeter = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Area = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
            : `Perímetro = ${figure.baseCm} + ${figure.topCm} + ${figure.sideLeftCm} + ${figure.sideRightCm} = ${perimeter} cm. Área = ((${figure.baseCm} + ${figure.topCm}) × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`,
    };
  }

  if (
    figure.kind === "triangle" &&
    figure.sideAcm &&
    figure.sideBcm &&
    figure.sideCcm &&
    figure.baseCm &&
    figure.heightCm
  ) {
    const perimeter = figure.sideAcm + figure.sideBcm + figure.sideCcm;
    const area = (figure.baseCm * figure.heightCm) / 2;

    return {
      perimeter: `${perimeter} cm`,
      area: `${formatNumber(area, lang)} cm²`,
      explanation:
        lang === "no"
          ? `Omkrets = ${figure.sideAcm} + ${figure.sideBcm} + ${figure.sideCcm} = ${perimeter} cm. Areal = (${figure.baseCm} × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
          : lang === "en"
            ? `Perimeter = ${figure.sideAcm} + ${figure.sideBcm} + ${figure.sideCcm} = ${perimeter} cm. Area = (${figure.baseCm} × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`
            : `Perímetro = ${figure.sideAcm} + ${figure.sideBcm} + ${figure.sideCcm} = ${perimeter} cm. Área = (${figure.baseCm} × ${figure.heightCm}) / 2 = ${formatNumber(area, lang)} cm².`,
    };
  }

  if (figure.kind === "circle" && figure.radiusCm) {
    const perimeter = 2 * 3.14 * figure.radiusCm;
    const area = 3.14 * figure.radiusCm * figure.radiusCm;

    return {
      perimeter: `${formatNumber(perimeter, lang)} cm`,
      area: `${formatNumber(area, lang)} cm²`,
      explanation:
        lang === "no"
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

  return {
    id: makeId(index),
    type: "shape_name",
    prompt: `${localizePrompt(lang, "shape_name")} ${formatFigureMeta(figure, lang)}`,
    figure,
    answer: localizeShapeName(figure.kind, lang),
    hint: includeHints ? buildHint("shape_name", figure, lang) : undefined,
    formula: showFormulas ? buildFormula(figure, lang) : undefined,
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
    lang === "no"
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

  const tasks: MathWorksheetTask[] = Array.from({ length: params.taskCount }, (_, index) => {
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
  });

  return {
    title: getTitle(params.language, params.topic),
    language: params.language,
    level: params.level,
    topic: params.topic,
    difficulty: params.difficulty,
    instructions: localizePrompt(params.language, "instructions"),
    showAnswerKey: params.showAnswerKey,
    showFormulas: params.showFormulas,
    selectedShapes: params.selectedShapes,
    tasks,
  };
}

function normalizeRequest(body: GenerateMathWorksheetRequest) {
  const language: WorksheetLanguage = isWorksheetLanguage(body.language) ? body.language : "no";
  const level: GeometryLevel = isGeometryLevel(body.level) ? body.level : "grade_5_7";
  const topic: GeometryTopic = isGeometryTopic(body.topic) ? body.topic : "all";
  const difficulty: Difficulty = isDifficulty(body.difficulty) ? body.difficulty : "easy";
  const taskCount = clampTaskCount(body.taskCount);
  const includeHints = typeof body.includeHints === "boolean" ? body.includeHints : true;
  const showAnswerKey = typeof body.showAnswerKey === "boolean" ? body.showAnswerKey : false;
  const showFormulas = typeof body.showFormulas === "boolean" ? body.showFormulas : false;
  const answerSpace: AnswerSpace = isAnswerSpace(body.answerSpace) ? body.answerSpace : "medium";
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

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  const uid = decoded.uid;

  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;

  const role =
    typeof data?.role === "string"
      ? data.role
      : typeof data?.mode === "string"
        ? data.mode
        : "anonymous";

  const plan = typeof data?.plan === "string" ? data.plan : "free";

  return { uid, role, plan };
}

function mapStatusToResponse(
  status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>
) {
  if (status.reason === "teacher_only") {
    return NextResponse.json(
      { ok: false, error: "This feature is only available for teachers.", reason: status.reason },
      { status: 403 }
    );
  }

  if (status.reason === "limit_reached") {
    return NextResponse.json(
      { ok: false, error: "You have reached your monthly limit.", reason: status.reason },
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
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_math_worksheet",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateMathWorksheetRequest;
    const params = normalizeRequest(body);
    const worksheet = generateWorksheet(params);

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_math_worksheet",
    });

    return NextResponse.json({
      ok: true,
      worksheet,
    });
  } catch (error) {
    console.error("generate-math-worksheet failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to generate worksheet";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}