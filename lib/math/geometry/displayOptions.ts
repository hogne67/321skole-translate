import type { FigureSpec, MathWorksheet, MathWorksheetTask, WorksheetLanguage, GeometryAnswerSpace } from "./types";

export function buildHint(
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

export function buildFormula(figure: FigureSpec, lang: WorksheetLanguage): string {
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

export function applyGeometryDisplayOptions(
  worksheet: MathWorksheet,
  options: { includeHints: boolean; showFormulas: boolean; showAnswerKey: boolean; answerSpace: GeometryAnswerSpace },
): MathWorksheet {
  return {
    ...worksheet,
    showFormulas: options.showFormulas,
    showAnswerKey: options.showAnswerKey,
    answerSpace: options.answerSpace,
    tasks: worksheet.tasks.map((task) => ({
      ...task,
      hint: options.includeHints ? task.hint ?? buildHint(task.type, task.figure, worksheet.language) : undefined,
      formula: options.showFormulas ? task.formula ?? (task.figure ? buildFormula(task.figure, worksheet.language) : undefined) : undefined,
    })),
  };
}
