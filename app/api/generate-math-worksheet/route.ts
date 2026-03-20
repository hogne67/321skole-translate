// app/api/generate-math-worksheet/route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import type { AppRole, PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type WorksheetLanguage = "no" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "mixed";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";
type AnswerSpace = "small" | "medium" | "large";

type FigureKind =
  | "rectangle"
  | "square"
  | "triangle"
  | "circle"
  | "trapezoid";

type FigureSpec = {
  kind: FigureKind;
  widthCm?: number;
  heightCm?: number;
  sideCm?: number;
  sides?: number;
  corners?: number;
};

type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "count_sides" | "perimeter" | "area";
  prompt: string;
  figure?: FigureSpec;
  options?: string[];
  answer: string;
  explanation?: string;
  hint?: string;
};

type MathWorksheet = {
  title: string;
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  instructions: string;
  teacherVersion: boolean;
  tasks: MathWorksheetTask[];
};

type GenerateMathWorksheetRequest = {
  language?: string;
  level?: string;
  topic?: string;
  difficulty?: string;
  taskCount?: number;
  includeHints?: boolean;
  teacherVersion?: boolean;
  answerSpace?: string;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return value === "no" || value === "en" || value === "pt";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return value === "shapes" || value === "perimeter" || value === "area" || value === "mixed";
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
      triangle: "trekant",
      circle: "sirkel",
      trapezoid: "trapes",
    },
    en: {
      rectangle: "rectangle",
      square: "square",
      triangle: "triangle",
      circle: "circle",
      trapezoid: "trapezoid",
    },
    pt: {
      rectangle: "retângulo",
      square: "quadrado",
      triangle: "triângulo",
      circle: "círculo",
      trapezoid: "trapézio",
    },
  };

  return map[lang][kind];
}

function localizePrompt(
  lang: WorksheetLanguage,
  key:
    | "shape_name"
    | "count_sides"
    | "perimeter_rectangle"
    | "perimeter_square"
    | "area_rectangle"
    | "area_square"
    | "instructions"
): string {
  const prompts: Record<WorksheetLanguage, Record<string, string>> = {
    no: {
      shape_name: "Hva heter figuren?",
      count_sides: "Hvor mange sider har figuren?",
      perimeter_rectangle: "Finn omkretsen av rektangelet.",
      perimeter_square: "Finn omkretsen av kvadratet.",
      area_rectangle: "Finn arealet av rektangelet.",
      area_square: "Finn arealet av kvadratet.",
      instructions: "Svar på oppgavene. Vis utregning der det passer.",
    },
    en: {
      shape_name: "What is the name of the shape?",
      count_sides: "How many sides does the shape have?",
      perimeter_rectangle: "Find the perimeter of the rectangle.",
      perimeter_square: "Find the perimeter of the square.",
      area_rectangle: "Find the area of the rectangle.",
      area_square: "Find the area of the square.",
      instructions: "Answer the questions. Show your work when relevant.",
    },
    pt: {
      shape_name: "Como se chama a figura?",
      count_sides: "Quantos lados tem a figura?",
      perimeter_rectangle: "Encontra o perímetro do retângulo.",
      perimeter_square: "Encontra o perímetro do quadrado.",
      area_rectangle: "Encontra a área do retângulo.",
      area_square: "Encontra a área do quadrado.",
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
      mixed: "Geometri – former, omkrets og areal",
    },
    en: {
      shapes: "Geometry – shapes",
      perimeter: "Geometry – perimeter",
      area: "Geometry – area",
      mixed: "Geometry – shapes, perimeter and area",
    },
    pt: {
      shapes: "Geometria – formas",
      perimeter: "Geometria – perímetro",
      area: "Geometria – área",
      mixed: "Geometria – formas, perímetro e área",
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
    if (type === "shape_name") return "Se på hvor mange sider og hjørner figuren har.";
    if (type === "count_sides") return "Tell kantene rundt figuren.";
    if (type === "perimeter") return "Legg sammen lengdene rundt hele figuren.";
    if (type === "area") return "Areal av rektangel eller kvadrat finner du ved å gange sidene.";
  }

  if (lang === "en") {
    if (type === "shape_name") return "Look at the number of sides and corners.";
    if (type === "count_sides") return "Count the edges around the shape.";
    if (type === "perimeter") return "Add all side lengths around the shape.";
    if (type === "area") return "For rectangles and squares, multiply the side lengths.";
  }

  if (lang === "pt") {
    if (type === "shape_name") return "Observa o número de lados e cantos.";
    if (type === "count_sides") return "Conta os lados à volta da figura.";
    if (type === "perimeter") return "Soma todos os lados da figura.";
    if (type === "area") return "Para retângulos e quadrados, multiplica os lados.";
  }

  return undefined;
}

function generateShapeTask(
  index: number,
  lang: WorksheetLanguage,
  includeHints: boolean
): MathWorksheetTask {
  const kind = randomFrom<FigureKind>(["rectangle", "square", "triangle", "circle", "trapezoid"]);

  return {
    id: makeId(index),
    type: "shape_name",
    prompt: localizePrompt(lang, "shape_name"),
    figure: { kind },
    answer: localizeShapeName(kind, lang),
    hint: includeHints ? buildHint("shape_name", { kind }, lang) : undefined,
  };
}

function generateCountSidesTask(
  index: number,
  lang: WorksheetLanguage,
  includeHints: boolean
): MathWorksheetTask {
  const choices: Array<{ kind: FigureKind; sides: number }> = [
    { kind: "rectangle", sides: 4 },
    { kind: "square", sides: 4 },
    { kind: "triangle", sides: 3 },
    { kind: "trapezoid", sides: 4 },
  ];

  const chosen = randomFrom(choices);

  return {
    id: makeId(index),
    type: "count_sides",
    prompt: localizePrompt(lang, "count_sides"),
    figure: { kind: chosen.kind, sides: chosen.sides },
    answer: String(chosen.sides),
    hint: includeHints ? buildHint("count_sides", { kind: chosen.kind }, lang) : undefined,
  };
}

function generatePerimeterTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean
): MathWorksheetTask {
  const isSquare = Math.random() < 0.4;

  if (isSquare) {
    const side =
      difficulty === "easy"
        ? randomFrom([3, 4, 5, 6, 7])
        : difficulty === "medium"
          ? randomFrom([6, 7, 8, 9])
          : randomFrom([8, 9, 10, 11, 12]);

    return {
      id: makeId(index),
      type: "perimeter",
      prompt: localizePrompt(lang, "perimeter_square"),
      figure: { kind: "square", sideCm: side },
      answer: `${side * 4} cm`,
      explanation:
        lang === "no"
          ? `Omkrets = ${side} + ${side} + ${side} + ${side} = ${side * 4} cm`
          : lang === "en"
            ? `Perimeter = ${side} + ${side} + ${side} + ${side} = ${side * 4} cm`
            : `Perímetro = ${side} + ${side} + ${side} + ${side} = ${side * 4} cm`,
      hint: includeHints ? buildHint("perimeter", { kind: "square", sideCm: side }, lang) : undefined,
    };
  }

  const width =
    difficulty === "easy"
      ? randomFrom([4, 5, 6, 7, 8])
      : difficulty === "medium"
        ? randomFrom([6, 7, 8, 9, 10])
        : randomFrom([8, 9, 10, 11, 12]);

  const height =
    difficulty === "easy"
      ? randomFrom([2, 3, 4, 5])
      : difficulty === "medium"
        ? randomFrom([3, 4, 5, 6])
        : randomFrom([4, 5, 6, 7]);

  const perimeter = width * 2 + height * 2;

  return {
    id: makeId(index),
    type: "perimeter",
    prompt: localizePrompt(lang, "perimeter_rectangle"),
    figure: { kind: "rectangle", widthCm: width, heightCm: height },
    answer: `${perimeter} cm`,
    explanation:
      lang === "no"
        ? `Omkrets = ${width} + ${height} + ${width} + ${height} = ${perimeter} cm`
        : lang === "en"
          ? `Perimeter = ${width} + ${height} + ${width} + ${height} = ${perimeter} cm`
          : `Perímetro = ${width} + ${height} + ${width} + ${height} = ${perimeter} cm`,
    hint: includeHints
      ? buildHint("perimeter", { kind: "rectangle", widthCm: width, heightCm: height }, lang)
      : undefined,
  };
}

function generateAreaTask(
  index: number,
  lang: WorksheetLanguage,
  difficulty: Difficulty,
  includeHints: boolean
): MathWorksheetTask {
  const isSquare = Math.random() < 0.35;

  if (isSquare) {
    const side =
      difficulty === "easy"
        ? randomFrom([2, 3, 4, 5, 6])
        : difficulty === "medium"
          ? randomFrom([4, 5, 6, 7, 8])
          : randomFrom([6, 7, 8, 9, 10]);

    return {
      id: makeId(index),
      type: "area",
      prompt: localizePrompt(lang, "area_square"),
      figure: { kind: "square", sideCm: side },
      answer: `${side * side} cm²`,
      explanation:
        lang === "no"
          ? `Areal = ${side} × ${side} = ${side * side} cm²`
          : lang === "en"
            ? `Area = ${side} × ${side} = ${side * side} cm²`
            : `Área = ${side} × ${side} = ${side * side} cm²`,
      hint: includeHints ? buildHint("area", { kind: "square", sideCm: side }, lang) : undefined,
    };
  }

  const width =
    difficulty === "easy"
      ? randomFrom([3, 4, 5, 6, 7])
      : difficulty === "medium"
        ? randomFrom([5, 6, 7, 8, 9])
        : randomFrom([7, 8, 9, 10, 11]);

  const height =
    difficulty === "easy"
      ? randomFrom([2, 3, 4, 5])
      : difficulty === "medium"
        ? randomFrom([3, 4, 5, 6])
        : randomFrom([4, 5, 6, 7]);

  const area = width * height;

  return {
    id: makeId(index),
    type: "area",
    prompt: localizePrompt(lang, "area_rectangle"),
    figure: { kind: "rectangle", widthCm: width, heightCm: height },
    answer: `${area} cm²`,
    explanation:
      lang === "no"
        ? `Areal = ${width} × ${height} = ${area} cm²`
        : lang === "en"
          ? `Area = ${width} × ${height} = ${area} cm²`
          : `Área = ${width} × ${height} = ${area} cm²`,
    hint: includeHints
      ? buildHint("area", { kind: "rectangle", widthCm: width, heightCm: height }, lang)
      : undefined,
  };
}

function buildTaskTypes(topic: GeometryTopic): Array<MathWorksheetTask["type"]> {
  if (topic === "shapes") return ["shape_name", "count_sides"];
  if (topic === "perimeter") return ["perimeter"];
  if (topic === "area") return ["area"];
  return ["shape_name", "count_sides", "perimeter", "area"];
}

function generateWorksheet(params: {
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  taskCount: number;
  includeHints: boolean;
  teacherVersion: boolean;
  answerSpace: AnswerSpace;
}): MathWorksheet {
  const taskTypes = buildTaskTypes(params.topic);

  const tasks: MathWorksheetTask[] = Array.from({ length: params.taskCount }, (_, index) => {
    const type = randomFrom(taskTypes);

    if (type === "shape_name") {
      return generateShapeTask(index, params.language, params.includeHints);
    }

    if (type === "count_sides") {
      return generateCountSidesTask(index, params.language, params.includeHints);
    }

    if (type === "perimeter") {
      return generatePerimeterTask(index, params.language, params.difficulty, params.includeHints);
    }

    return generateAreaTask(index, params.language, params.difficulty, params.includeHints);
  });

  return {
    title: getTitle(params.language, params.topic),
    language: params.language,
    level: params.level,
    topic: params.topic,
    difficulty: params.difficulty,
    instructions: localizePrompt(params.language, "instructions"),
    teacherVersion: params.teacherVersion,
    tasks,
  };
}

function normalizeRequest(body: GenerateMathWorksheetRequest) {
  const language: WorksheetLanguage = isWorksheetLanguage(body.language) ? body.language : "no";
  const level: GeometryLevel = isGeometryLevel(body.level) ? body.level : "grade_5_7";
  const topic: GeometryTopic = isGeometryTopic(body.topic) ? body.topic : "mixed";
  const difficulty: Difficulty = isDifficulty(body.difficulty) ? body.difficulty : "easy";
  const taskCount = clampTaskCount(body.taskCount);
  const includeHints = typeof body.includeHints === "boolean" ? body.includeHints : true;
  const teacherVersion = typeof body.teacherVersion === "boolean" ? body.teacherVersion : false;
  const answerSpace: AnswerSpace = isAnswerSpace(body.answerSpace) ? body.answerSpace : "medium";

  return {
    language,
    level,
    topic,
    difficulty,
    taskCount,
    includeHints,
    teacherVersion,
    answerSpace,
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