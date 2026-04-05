// app/api/producer/save-math-worksheet/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type WorksheetLanguage = "no" | "en" | "pt";
type GeometryTopic = "shapes" | "perimeter" | "area" | "all";
type Difficulty = "easy" | "medium" | "hard";
type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";

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
  selectedShapes: FigureKind[];
  tasks: MathWorksheetTask[];
};

type SaveMathWorksheetRequest = {
  worksheet?: MathWorksheet;
  source?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

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

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefinedDeep(v)]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

function sanitizeNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeExpected(
  value: unknown
): MathWorksheetTask["expected"] | undefined {
  if (!isRecord(value)) return undefined;

  const shapeName = safeString(value.shapeName) || undefined;
  const perimeterValue = sanitizeNullableNumber(value.perimeterValue);
  const areaValue = sanitizeNullableNumber(value.areaValue);

  const perimeterUnit =
    value.perimeterUnit === "cm" || value.perimeterUnit === null
      ? value.perimeterUnit
      : undefined;

  const areaUnit =
    value.areaUnit === "cm2" || value.areaUnit === null
      ? value.areaUnit
      : undefined;

  const cleaned = stripUndefinedDeep({
    shapeName,
    perimeterValue,
    areaValue,
    perimeterUnit,
    areaUnit,
  }) as NonNullable<MathWorksheetTask["expected"]>;

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeInputMode(
  value: unknown
): MathWorksheetTask["inputMode"] | undefined {
  if (
    value === "shape_name" ||
    value === "number_with_unit" ||
    value === "split_name_perimeter_area"
  ) {
    return value;
  }
  return undefined;
}

function sanitizeFigureSpec(value: unknown): FigureSpec | undefined {
  if (!isRecord(value) || !isFigureKind(value.kind)) return undefined;

  const toNumber = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  return stripUndefinedDeep({
    kind: value.kind,
    widthCm: toNumber(value.widthCm),
    heightCm: toNumber(value.heightCm),
    sideCm: toNumber(value.sideCm),
    baseCm: toNumber(value.baseCm),
    topCm: toNumber(value.topCm),
    sideLeftCm: toNumber(value.sideLeftCm),
    sideRightCm: toNumber(value.sideRightCm),
    sideAcm: toNumber(value.sideAcm),
    sideBcm: toNumber(value.sideBcm),
    sideCcm: toNumber(value.sideCcm),
    radiusCm: toNumber(value.radiusCm),
  });
}

function sanitizeTask(value: unknown, index: number): MathWorksheetTask | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  if (
    type !== "shape_name" &&
    type !== "perimeter" &&
    type !== "area" &&
    type !== "all_in_one"
  ) {
    return null;
  }

  const prompt = safeString(value.prompt);
  const answer = safeString(value.answer);

  if (!prompt || !answer) return null;

  return stripUndefinedDeep({
    id: safeString(value.id, String(index + 1)),
    type,
    prompt,
    figure: sanitizeFigureSpec(value.figure),
    answer,
    explanation: safeString(value.explanation) || undefined,
    hint: safeString(value.hint) || undefined,
    formula: safeString(value.formula) || undefined,
    inputMode: sanitizeInputMode(value.inputMode),
    expected: sanitizeExpected(value.expected),
  });
}

function sanitizeWorksheet(value: unknown): MathWorksheet | null {
  if (!isRecord(value)) return null;

  const title = safeString(value.title);
  const instructions = safeString(value.instructions);

  if (!title || !instructions) return null;
  if (!isWorksheetLanguage(value.language)) return null;
  if (!isGeometryLevel(value.level)) return null;
  if (!isGeometryTopic(value.topic)) return null;
  if (!isDifficulty(value.difficulty)) return null;
  if (!Array.isArray(value.tasks)) return null;

  const tasks = value.tasks
    .map((task, index) => sanitizeTask(task, index))
    .filter((task): task is MathWorksheetTask => task !== null);

  if (tasks.length === 0) return null;

  const selectedShapes = Array.isArray(value.selectedShapes)
    ? value.selectedShapes.filter(isFigureKind)
    : [];

  return {
    title,
    language: value.language,
    level: value.level,
    topic: value.topic,
    difficulty: value.difficulty,
    instructions,
    showAnswerKey: value.showAnswerKey === true,
    showFormulas: value.showFormulas === true,
    selectedShapes,
    tasks,
  };
}

async function getUidFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  return decoded.uid || null;
}

function buildPlainTextSummary(worksheet: MathWorksheet): string {
  const lines: string[] = [];

  lines.push(worksheet.instructions);
  lines.push("");

  worksheet.tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.prompt}`);
    if (task.formula && worksheet.showFormulas) {
      lines.push(`Formel: ${task.formula}`);
    }
    if (task.hint) {
      lines.push(`Hint: ${task.hint}`);
    }
    lines.push("");
  });

  if (worksheet.showAnswerKey) {
    lines.push("FASIT");
    lines.push("");

    worksheet.tasks.forEach((task, index) => {
      lines.push(`${index + 1}. ${task.answer}`);
      if (task.formula) lines.push(`Formel: ${task.formula}`);
      if (task.explanation) lines.push(`Forklaring: ${task.explanation}`);
      lines.push("");
    });
  }

  return lines.join("\n").trim();
}

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SaveMathWorksheetRequest;
    const worksheet = sanitizeWorksheet(body.worksheet);

    if (!worksheet) {
      return NextResponse.json(
        { ok: false, error: "Invalid worksheet payload." },
        { status: 400 }
      );
    }

    const { db } = getAdmin();
    const lessonRef = db.collection("lessons").doc();

    const plainText = buildPlainTextSummary(worksheet);
    const source = safeString(body.source, "math-geometry-generator");

    const docData = stripUndefinedDeep({
      ownerId: uid,
      uid,
      title: worksheet.title,
      description: worksheet.instructions,
      text: plainText,
      sourceText: plainText,
      language: worksheet.language,
      level: worksheet.level,
      status: "published",
      lessonType: "math_geometry",
      taskType: "math_geometry",
      textType: "worksheet",
      topic: worksheet.topic,
      difficulty: worksheet.difficulty,
      source,
      isActive: true,
      publishVisibility: "private",
      showInLibrary: false,

      mathWorksheet: {
        version: 1,
        title: worksheet.title,
        instructions: worksheet.instructions,
        language: worksheet.language,
        level: worksheet.level,
        topic: worksheet.topic,
        difficulty: worksheet.difficulty,
        showAnswerKey: worksheet.showAnswerKey,
        showFormulas: worksheet.showFormulas,
        selectedShapes: worksheet.selectedShapes,
        tasks: worksheet.tasks,
      },

      tasks: worksheet.tasks,
      meta: ["math", "worksheet", "geometry"],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await lessonRef.set(docData);

    return NextResponse.json({
      ok: true,
      id: lessonRef.id,
    });
  } catch (error) {
    console.error("save-math-worksheet failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to save worksheet";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}