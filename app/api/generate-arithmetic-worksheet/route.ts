import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  consumeFeatureAdmin,
  getFeatureStatusAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import {
  emailVerificationRequiredResponse,
  needsEmailVerification,
} from "@/lib/emailVerificationGuard";
import {
  isArithmeticDifficulty,
  isArithmeticLanguage,
  isArithmeticLayout,
  isArithmeticLevel,
  isArithmeticOperation,
  isArithmeticTaskType,
  normalizeArithmeticLanguage,
  type ArithmeticConcreteOperation,
  type ArithmeticDifficulty,
  type ArithmeticGeneratorConfig,
  type ArithmeticGeneratorRules,
  type ArithmeticLanguage,
  type ArithmeticLayout,
  type ArithmeticLevel,
  type ArithmeticNumberRange,
  type ArithmeticOperation,
  type ArithmeticTask,
  type ArithmeticTaskType,
  type ArithmeticWorksheet,
} from "@/lib/math/arithmetic/types";
import { constrainVisualConfig, VISUAL_GROUP_LIMIT } from "@/lib/math/arithmetic/visualLimits";
import { alignDividendRange } from "@/lib/math/arithmetic/ranges";
import { createWholeDivisionSampler, wholeDivisionChoices } from "@/lib/math/arithmetic/division";

export const runtime = "nodejs";

type GenerateArithmeticWorksheetRequest = {
  language?: string;
  level?: string;
  operation?: string;
  difficulty?: string;
  layout?: string;
  taskCount?: number;
  minNumber?: number;
  maxNumber?: number;
  operandA?: Partial<ArithmeticNumberRange>;
  operandB?: Partial<ArithmeticNumberRange>;
  taskType?: string;
  rules?: ArithmeticGeneratorRules;
  mixedOperations?: unknown;
  presetId?: string;
  showAnswerKey?: boolean;
  countUsage?: boolean;
};

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
  studentAccessMode?: string | null;
  devAuthFallback?: boolean;
};

const OPERATIONS: ArithmeticConcreteOperation[] = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
];

function clamp(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeMixedOperations(value: unknown): ArithmeticConcreteOperation[] {
  if (!Array.isArray(value)) return OPERATIONS;

  const operations = value.filter(
    (operation): operation is ArithmeticConcreteOperation =>
      operation === "addition" ||
      operation === "subtraction" ||
      operation === "multiplication" ||
      operation === "division"
  );

  return operations.length > 0 ? Array.from(new Set(operations)) : OPERATIONS;
}

function normalizeTaskCount(value: unknown, layout: ArithmeticLayout) {
  const max = layout === "grid" ? 120 : layout === "vertical" ? 36 : 18;
  const fallback = layout === "grid" ? 60 : layout === "vertical" ? 18 : 8;
  return clamp(value, fallback, 4, max);
}

function normalizeNumberRange(
  value: unknown,
  fallback: ArithmeticNumberRange,
  minAllowed = -10000,
  maxAllowed = 10000
): ArithmeticNumberRange {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<ArithmeticNumberRange>)
      : {};

  const min = clamp(record.min, fallback.min, minAllowed, maxAllowed);
  const max = clamp(record.max, fallback.max, minAllowed, maxAllowed);

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

function defaultGeneratorConfig(
  operation: ArithmeticOperation,
  layout: ArithmeticLayout
): ArithmeticGeneratorConfig {
  if (layout === "visual") {
    return {
      taskType: "standard",
      operandA: { min: 0, max: 10 },
      operandB: { min: 0, max: 10 },
      rules: {
        allowCarry: true,
        allowBorrow: false,
        allowNegative: false,
        wholeNumberDivision: true,
      },
    };
  }

  if (operation === "multiplication") {
    return {
      taskType: "times_table",
      operandA: { min: 0, max: 10 },
      operandB: { min: 0, max: 10 },
      rules: { wholeNumberDivision: true },
      presetId: "times_table_0_10",
    };
  }

  if (operation === "division") {
    return {
      taskType: "whole_division",
      operandA: { min: 10, max: 100 },
      operandB: { min: 1, max: 10 },
      rules: { wholeNumberDivision: true },
      presetId: "division_whole_0_10",
    };
  }

  return {
    taskType: "standard",
    operandA: { min: 0, max: 50 },
    operandB: { min: 0, max: 50 },
    rules: {
      allowCarry: true,
      allowBorrow: true,
      allowNegative: false,
      wholeNumberDivision: true,
    },
  };
}

function normalizeRules(value: unknown): ArithmeticGeneratorRules {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as ArithmeticGeneratorRules)
      : {};

  return {
    allowCarry: record.allowCarry === true,
    allowBorrow: record.allowBorrow === true,
    allowNegative: record.allowNegative === true,
    wholeNumberDivision: record.wholeNumberDivision !== false,
  };
}

function hasAdditionCarry(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (a > 0 || b > 0) {
    if ((a % 10) + (b % 10) >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }

  return false;
}

function hasSubtractionBorrow(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (a > 0 || b > 0) {
    if ((a % 10) < (b % 10)) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }

  return false;
}

function defaultRange(
  level: ArithmeticLevel,
  difficulty: ArithmeticDifficulty,
  operation: ArithmeticOperation,
  layout: ArithmeticLayout
) {
  if (layout === "visual") {
    if (difficulty === "easy") return { min: 0, max: 10 };
    if (difficulty === "medium") return { min: 0, max: 15 };
    return { min: 0, max: 20 };
  }

  if (operation === "multiplication" || operation === "division") {
    if (difficulty === "easy") return { min: 0, max: 5 };
    if (difficulty === "medium") return { min: 0, max: 10 };
    return { min: 0, max: level === "grade_8_10" ? 15 : 12 };
  }

  if (level === "grade_1_2") {
    if (difficulty === "easy") return { min: 0, max: 10 };
    if (difficulty === "medium") return { min: 0, max: 20 };
    return { min: 0, max: 50 };
  }

  if (level === "grade_3_4") {
    if (difficulty === "easy") return { min: 0, max: 50 };
    if (difficulty === "medium") return { min: 0, max: 100 };
    return { min: 0, max: 500 };
  }

  if (level === "grade_5_7") {
    if (difficulty === "easy") return { min: 0, max: 100 };
    if (difficulty === "medium") return { min: 0, max: 1000 };
    return { min: 0, max: 5000 };
  }

  if (difficulty === "easy") return { min: -20, max: 100 };
  if (difficulty === "medium") return { min: -100, max: 1000 };
  return { min: -500, max: 5000 };
}

function localizeTitle(
  language: ArithmeticLanguage,
  operation: ArithmeticOperation,
  layout: ArithmeticLayout
) {
  const op: Record<ArithmeticLanguage, Record<ArithmeticOperation, string>> = {
    nb: {
      addition: "addisjon",
      subtraction: "subtraksjon",
      multiplication: "multiplikasjon",
      division: "divisjon",
      mixed: "blandede regnearter",
    },
    en: {
      addition: "addition",
      subtraction: "subtraction",
      multiplication: "multiplication",
      division: "division",
      mixed: "mixed arithmetic",
    },
    pt: {
      addition: "adição",
      subtraction: "subtração",
      multiplication: "multiplicação",
      division: "divisão",
      mixed: "operações mistas",
    },
  };

  const layoutLabel: Record<ArithmeticLanguage, Record<ArithmeticLayout, string>> = {
    nb: {
      grid: "mengdetrening",
      vertical: "oppstilt regning",
      visual: "med visuell støtte",
    },
    en: {
      grid: "fluency practice",
      vertical: "vertical calculation",
      visual: "with visual support",
    },
    pt: {
      grid: "treino",
      vertical: "conta armada",
      visual: "com apoio visual",
    },
  };

  const rawTitle = `${op[language][operation]} – ${layoutLabel[language][layout]}`;
  return rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
}

function localizeInstructions(language: ArithmeticLanguage, layout: ArithmeticLayout) {
  if (language === "en") {
    if (layout === "vertical") return "Solve the problems. Show your work.";
    if (layout === "visual") return "Use the visual support and write the answer.";
    return "Solve as many problems as you can with accuracy.";
  }

  if (language === "pt") {
    if (layout === "vertical") return "Resolve as tarefas. Mostra os cálculos.";
    if (layout === "visual") return "Usa o apoio visual e escreve a resposta.";
    return "Resolve as tarefas com atenção.";
  }

  if (layout === "vertical") return "Regn ut oppgavene. Vis utregning.";
  if (layout === "visual") return "Bruk den visuelle støtten og skriv svaret.";
  return "Regn ut så mange oppgaver du kan med riktig svar.";
}

function symbol(operation: ArithmeticTask["operation"]) {
  if (operation === "addition") return "+";
  if (operation === "subtraction") return "-";
  if (operation === "multiplication") return "×";
  return "÷";
}

function missingNumberPrompt(params: {
  operation: ArithmeticTask["operation"];
  left: number;
  right: number;
  result: number;
  unknownPosition: "left" | "right";
}) {
  const left = params.unknownPosition === "left" ? "□" : String(params.left);
  const right = params.unknownPosition === "right" ? "□" : String(params.right);

  return `${left} ${symbol(params.operation)} ${right} = ${params.result}`;
}

function randomPositiveFromRange(range: ArithmeticNumberRange) {
  return randomInt(Math.max(1, range.min), Math.max(1, range.max));
}

function randomNonZeroFromRange(range: ArithmeticNumberRange) {
  if (range.min === 0 && range.max === 0) return 1;
  if (range.min > 0 || range.max < 0) return randomInt(range.min, range.max);
  if (range.min === 0) return randomInt(1, range.max);
  if (range.max === 0) return randomInt(range.min, -1);

  return Math.random() < 0.5
    ? randomInt(range.min, -1)
    : randomInt(1, range.max);
}

function buildMissingNumberParts(params: {
  operation: ArithmeticTask["operation"];
  unknownRange: ArithmeticNumberRange;
  knownRange: ArithmeticNumberRange;
  allowNegative?: boolean;
}) {
  const { operation, unknownRange, knownRange, allowNegative } = params;
  let unknown = randomNonZeroFromRange(unknownRange);
  let known = randomNonZeroFromRange(knownRange);
  let unknownPosition: "left" | "right" =
    operation === "division" ? "left" : Math.random() < 0.5 ? "left" : "right";

  if (operation === "addition") {
    return {
      left: unknownPosition === "left" ? unknown : known,
      right: unknownPosition === "right" ? unknown : known,
      result: unknown + known,
      answer: unknown,
      unknownPosition,
    };
  }

  if (operation === "subtraction") {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      unknown = randomNonZeroFromRange(unknownRange);
      known = randomNonZeroFromRange(knownRange);
      unknownPosition = Math.random() < 0.5 ? "left" : "right";

      const result =
        unknownPosition === "left" ? unknown - known : known - unknown;

      if (allowNegative || result >= 0) {
        return {
          left: unknownPosition === "left" ? unknown : known,
          right: unknownPosition === "right" ? unknown : known,
          result,
          answer: unknown,
          unknownPosition,
        };
      }
    }

    unknownPosition = "left";
    known = Math.min(known, unknown);

    return {
      left: unknown,
      right: known,
      result: unknown - known,
      answer: unknown,
      unknownPosition,
    };
  }

  if (operation === "multiplication") {
    return {
      left: unknownPosition === "left" ? unknown : known,
      right: unknownPosition === "right" ? unknown : known,
      result: unknown * known,
      answer: unknown,
      unknownPosition,
    };
  }

  known = randomPositiveFromRange(knownRange);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    unknown = randomNonZeroFromRange(unknownRange);
    if (unknown >= 0 && unknown % known === 0) {
      return {
        left: unknown,
        right: known,
        result: unknown / known,
        answer: unknown,
        unknownPosition,
      };
    }
  }

  const minQuotient = Math.max(0, Math.ceil(unknownRange.min / known));
  const maxQuotient = Math.max(minQuotient, Math.floor(unknownRange.max / known));
  const quotient = randomInt(minQuotient, maxQuotient);
  unknown = known * quotient;

  return {
    left: unknown,
    right: known,
    result: quotient,
    answer: unknown,
    unknownPosition,
  };
}

function buildTask(params: {
  index: number;
  operation: ArithmeticConcreteOperation;
  generatorConfig: ArithmeticGeneratorConfig;
  layout: ArithmeticLayout;
  divisionParts?: { left: number; right: number };
}): ArithmeticTask {
  const { operation, generatorConfig, layout, index, divisionParts } = params;
  const operandA = generatorConfig.operandA;
  const operandB = generatorConfig.operandB;
  const rules = generatorConfig.rules ?? {};
  const taskType = generatorConfig.taskType;

  let left = randomInt(operandA.min, operandA.max);
  let right = randomInt(operandB.min, operandB.max);
  let answer = 0;

  if (operation === "addition") {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidateLeft = randomInt(operandA.min, operandA.max);
      const candidateRight = randomInt(operandB.min, operandB.max);
      const hasCarry = hasAdditionCarry(candidateLeft, candidateRight);

      if (
        taskType === "with_transition" ? hasCarry :
          taskType === "no_transition" ? !hasCarry :
            true
      ) {
        left = candidateLeft;
        right = candidateRight;
        break;
      }
    }

    answer = left + right;
  } else if (operation === "subtraction") {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      let candidateLeft = randomInt(operandA.min, operandA.max);
      let candidateRight = randomInt(operandB.min, operandB.max);

      if (!rules.allowNegative && candidateLeft < candidateRight) {
        [candidateLeft, candidateRight] = [candidateRight, candidateLeft];
      }

      const hasBorrow = hasSubtractionBorrow(candidateLeft, candidateRight);

      if (
        taskType === "with_transition" ? hasBorrow :
          taskType === "no_transition" ? !hasBorrow :
            true
      ) {
        left = candidateLeft;
        right = candidateRight;
        break;
      }
    }

    if (!rules.allowNegative && left < right) [left, right] = [right, left];
    answer = left - right;
  } else if (operation === "multiplication") {
    left = randomInt(operandA.min, operandA.max);
    right = randomInt(operandB.min, operandB.max);
    answer = left * right;
  } else if (divisionParts) {
    ({ left, right } = divisionParts);
    answer = left / right;
  } else {
    left = randomNonZeroFromRange({
      min: Math.max(0, operandA.min),
      max: Math.max(0, operandA.max),
    });
    right = randomPositiveFromRange(operandB);
    answer = right === 0 ? 0 : left / right;
  }

  let expression = `${left} ${symbol(operation)} ${right}`;
  let prompt = layout === "vertical" ? expression : `${expression} =`;
  let unknownPosition: "left" | "right" | undefined;

  if (taskType === "missing_number") {
    const missing = operation === "division" && divisionParts ? {
      ...divisionParts,
      answer: divisionParts.left,
      result: divisionParts.left / divisionParts.right,
      unknownPosition: "left" as const,
    } : buildMissingNumberParts({
      operation,
      unknownRange: operandA,
      knownRange: operandB,
      allowNegative: rules.allowNegative,
    });
    left = missing.left;
    right = missing.right;
    answer = missing.answer;
    unknownPosition = missing.unknownPosition;
    prompt = missingNumberPrompt({
      operation,
      left,
      right,
      result: missing.result,
      unknownPosition,
    });
    expression = prompt;
  }

  const task: ArithmeticTask = {
    id: String(index + 1),
    operation,
    left,
    right,
    answer,
    expression,
    prompt,
  };

  if (unknownPosition) {
    task.unknownPosition = unknownPosition;
  }

  if (
    !unknownPosition &&
    layout === "visual" &&
    (operation === "addition" || operation === "subtraction")
  ) {
    task.visualCount = Math.max(left, right);
  }

  return task;
}

function generateWorksheet(params: {
  language: ArithmeticLanguage;
  level: ArithmeticLevel;
  operation: ArithmeticOperation;
  difficulty: ArithmeticDifficulty;
  layout: ArithmeticLayout;
  taskCount: number;
  generatorConfig: ArithmeticGeneratorConfig;
  showAnswerKey: boolean;
}): ArithmeticWorksheet {
  const mixedOperations =
    params.generatorConfig.mixedOperations?.length
      ? params.generatorConfig.mixedOperations
      : OPERATIONS;
  const divisionSampler = usesWholeDivision(params.generatorConfig, params.layout)
    ? createWholeDivisionSampler(divisionChoices(params.generatorConfig, params.layout))
    : null;
  const tasks = Array.from({ length: params.taskCount }, (_, index) => {
    const operation =
      params.operation === "mixed" ? randomFrom(mixedOperations) : params.operation;

    return buildTask({
      index,
      operation,
      generatorConfig: params.generatorConfig,
      layout: params.layout,
      divisionParts: operation === "division" ? divisionSampler?.() : undefined,
    });
  });

  return {
    version: 1,
    title: localizeTitle(params.language, params.operation, params.layout),
    language: params.language,
    level: params.level,
    operation: params.operation,
    difficulty: params.difficulty,
    layout: params.layout,
    instructions: localizeInstructions(params.language, params.layout),
    showAnswerKey: params.showAnswerKey,
    taskCount: tasks.length,
    numberRange: {
      min: Math.min(params.generatorConfig.operandA.min, params.generatorConfig.operandB.min),
      max: Math.max(params.generatorConfig.operandA.max, params.generatorConfig.operandB.max),
    },
    generatorConfig: params.generatorConfig,
    tasks,
  };
}

function usesWholeDivision(config: ArithmeticGeneratorConfig, layout: ArithmeticLayout) {
  return layout === "visual" || config.taskType === "whole_division" || config.taskType === "missing_number";
}

function divisionChoices(config: ArithmeticGeneratorConfig, layout: ArithmeticLayout) {
  return wholeDivisionChoices(config.operandA, config.operandB, {
    allowZero: layout === "visual",
    maxQuotient: layout === "visual" ? VISUAL_GROUP_LIMIT : undefined,
  });
}

function normalizeRequest(body: GenerateArithmeticWorksheetRequest) {
  const language = isArithmeticLanguage(body.language)
    ? body.language
    : normalizeArithmeticLanguage(body.language);
  const level: ArithmeticLevel = isArithmeticLevel(body.level)
    ? body.level
    : "grade_3_4";
  const operation: ArithmeticOperation = isArithmeticOperation(body.operation)
    ? body.operation
    : "addition";
  const difficulty: ArithmeticDifficulty = isArithmeticDifficulty(body.difficulty)
    ? body.difficulty
    : "easy";
  const layout: ArithmeticLayout = isArithmeticLayout(body.layout)
    ? body.layout
    : "grid";
  const defaultConfig = defaultGeneratorConfig(operation, layout);
  const legacyDefaults = defaultRange(level, difficulty, operation, layout);
  const legacyRange = {
    min: clamp(body.minNumber, legacyDefaults.min, -10000, 10000),
    max: clamp(body.maxNumber, legacyDefaults.max, -10000, 10000),
  };
  const hasOperandA = body.operandA && typeof body.operandA === "object";
  const hasOperandB = body.operandB && typeof body.operandB === "object";
  const operandA = normalizeNumberRange(
    body.operandA,
    hasOperandA ? defaultConfig.operandA : legacyRange
  );
  const operandB = normalizeNumberRange(
    body.operandB,
    hasOperandB ? defaultConfig.operandB : legacyRange
  );
  const taskType: ArithmeticTaskType = isArithmeticTaskType(body.taskType)
    ? body.taskType
    : defaultConfig.taskType;
  const generatorConfig: ArithmeticGeneratorConfig = {
    taskType,
    operandA,
    operandB,
    rules: {
      ...defaultConfig.rules,
      ...normalizeRules(body.rules),
    },
  };

  if (operation === "mixed") {
    generatorConfig.mixedOperations = normalizeMixedOperations(body.mixedOperations);
  }

  const presetId =
    typeof body.presetId === "string" && body.presetId.trim()
      ? body.presetId.trim()
      : defaultConfig.presetId;

  if (presetId) {
    generatorConfig.presetId = presetId;
  }
  const taskCount = normalizeTaskCount(body.taskCount, layout);
  const normalizedConfig = layout === "visual"
    ? constrainVisualConfig(operation, generatorConfig)
    : generatorConfig;
  if (operation === "division") {
    normalizedConfig.operandA = alignDividendRange(normalizedConfig.operandA, normalizedConfig.operandB);
  }

  return {
    language,
    level,
    operation,
    difficulty,
    layout,
    taskCount,
    generatorConfig: normalizedConfig,
    showAnswerKey: body.showAnswerKey === true,
  };
}

function isGoogleApisLookupError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    process.env.NODE_ENV !== "production" &&
    message.includes("getaddrinfo") &&
    message.includes("www.googleapis.com")
  );
}

function decodeTokenPayloadForLocalDev(idToken: string): {
  uid?: string;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
} | null {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    ) as Record<string, unknown>;

    return {
      uid:
        typeof decoded.user_id === "string"
          ? decoded.user_id
          : typeof decoded.sub === "string"
            ? decoded.sub
            : undefined,
      email_verified: decoded.email_verified,
      firebase:
        decoded.firebase && typeof decoded.firebase === "object"
          ? (decoded.firebase as { sign_in_provider?: unknown })
          : undefined,
    };
  } catch {
    return null;
  }
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  let decoded:
    | Awaited<ReturnType<typeof auth.verifyIdToken>>
    | ReturnType<typeof decodeTokenPayloadForLocalDev>;
  let devAuthFallback = false;

  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch (error) {
    if (!isGoogleApisLookupError(error)) throw error;

    decoded = decodeTokenPayloadForLocalDev(idToken);
    devAuthFallback = true;
  }

  if (!decoded?.uid) return null;

  if (needsEmailVerification(decoded)) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }

  const uid = decoded.uid;
  let userSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  try {
    userSnap = await db.collection("users").doc(uid).get();
  } catch (error) {
    if (!devAuthFallback) throw error;
  }

  if (devAuthFallback && !userSnap) {
    return {
      uid,
      role: "teacher",
      plan: "pro",
      studentAccessMode: null,
      devAuthFallback,
    };
  }

  if (!userSnap) return null;

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
    partnerAccess: data?.partnerAccess === true,
    partnerStatus: typeof data?.partnerStatus === "string" ? data.partnerStatus : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return {
    uid,
    role,
    plan,
    studentAccessMode:
      typeof data?.studentAccessMode === "string" ? data.studentAccessMode : null,
    devAuthFallback,
  };
}

export async function POST(req: Request) {
  try {
    const user = await getRequestUserContext(req);

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as GenerateArithmeticWorksheetRequest;
    // Temporarily disabled while the arithmetic generator model is being tuned.
    const shouldCountUsage = false as boolean;

    if (shouldCountUsage && !user.devAuthFallback) {
      const status = await getFeatureStatusAdmin({
        uid: user.uid,
        role: user.role,
        plan: user.plan,
        studentAccessMode: user.studentAccessMode,
        feature: "producer_create_math_worksheet",
      });

      const canReuseCountedDraft =
        !shouldCountUsage && status.reason === "limit_reached";

      if (!status.allowed && !canReuseCountedDraft) {
        return NextResponse.json(
          {
            ok: false,
            error:
              status.reason === "limit_reached"
                ? "You have reached your monthly limit."
                : "This feature requires an upgraded plan.",
            reason: status.reason ?? "upgrade_required",
          },
          { status: 403 }
        );
      }
    }

    const params = normalizeRequest(body);
    const includesDivision = params.operation === "division" ||
      (params.operation === "mixed" && params.generatorConfig.mixedOperations?.includes("division"));
    if (includesDivision && usesWholeDivision(params.generatorConfig, params.layout) && divisionChoices(params.generatorConfig, params.layout).length === 0) {
      const errors = {
        nb: "Tallområdene gir ingen delingsoppgaver uten rest. Juster tallene eller divisoren.",
        en: "The ranges give no division problems without a remainder. Adjust the numbers or divisor.",
        pt: "Os intervalos não permitem divisões sem resto. Ajusta os números ou o divisor.",
      };
      return NextResponse.json({ ok: false, error: errors[params.language] }, { status: 400 });
    }
    const worksheet = generateWorksheet(params);

    if (shouldCountUsage && !user.devAuthFallback) {
      await consumeFeatureAdmin({
        uid: user.uid,
        feature: "producer_create_math_worksheet",
      });
    }

    return NextResponse.json({ ok: true, worksheet, counted: shouldCountUsage });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredResponse();
    }

    console.error("generate-arithmetic-worksheet failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to generate worksheet",
      },
      { status: 500 }
    );
  }
}
