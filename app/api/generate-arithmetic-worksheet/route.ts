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
  normalizeArithmeticLanguage,
  type ArithmeticDifficulty,
  type ArithmeticLanguage,
  type ArithmeticLayout,
  type ArithmeticLevel,
  type ArithmeticOperation,
  type ArithmeticTask,
  type ArithmeticWorksheet,
} from "@/lib/math/arithmetic/types";

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

const OPERATIONS: Array<Exclude<ArithmeticOperation, "mixed">> = [
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

function normalizeTaskCount(value: unknown, layout: ArithmeticLayout) {
  const max = layout === "grid" ? 120 : layout === "vertical" ? 36 : 18;
  const fallback = layout === "grid" ? 60 : layout === "vertical" ? 18 : 8;
  return clamp(value, fallback, 4, max);
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

function buildTask(params: {
  index: number;
  operation: Exclude<ArithmeticOperation, "mixed">;
  minNumber: number;
  maxNumber: number;
  layout: ArithmeticLayout;
}): ArithmeticTask {
  const { operation, minNumber, maxNumber, layout, index } = params;
  let left = randomInt(minNumber, maxNumber);
  let right = randomInt(minNumber, maxNumber);
  let answer = 0;

  if (operation === "addition") {
    answer = left + right;
  } else if (operation === "subtraction") {
    if (left < right) [left, right] = [right, left];
    answer = left - right;
  } else if (operation === "multiplication") {
    const factorMax = Math.max(3, Math.min(12, maxNumber));
    const factorMin = Math.max(0, Math.min(minNumber, factorMax));
    left = randomInt(factorMin, factorMax);
    right = randomInt(0, factorMax);
    answer = left * right;
  } else {
    const divisorMax = Math.max(2, Math.min(12, maxNumber));
    const answerMin = Math.max(0, Math.min(minNumber, divisorMax));
    right = randomInt(1, divisorMax);
    answer = randomInt(answerMin, divisorMax);
    left = right * answer;
  }

  const expression = `${left} ${symbol(operation)} ${right}`;
  const prompt = layout === "vertical" ? expression : `${expression} =`;

  const task: ArithmeticTask = {
    id: String(index + 1),
    operation,
    left,
    right,
    answer,
    expression,
    prompt,
  };

  if (layout === "visual" && (operation === "addition" || operation === "subtraction")) {
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
  minNumber: number;
  maxNumber: number;
  showAnswerKey: boolean;
}): ArithmeticWorksheet {
  const tasks = Array.from({ length: params.taskCount }, (_, index) => {
    const operation =
      params.operation === "mixed" ? randomFrom(OPERATIONS) : params.operation;

    return buildTask({
      index,
      operation,
      minNumber: params.minNumber,
      maxNumber: params.maxNumber,
      layout: params.layout,
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
      min: params.minNumber,
      max: params.maxNumber,
    },
    tasks,
  };
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
  const defaults = defaultRange(level, difficulty, operation, layout);
  const minNumber = clamp(body.minNumber, defaults.min, -500, 5000);
  const maxNumber = Math.max(
    minNumber,
    clamp(body.maxNumber, defaults.max, minNumber, 10000)
  );
  const taskCount = normalizeTaskCount(body.taskCount, layout);

  return {
    language,
    level,
    operation,
    difficulty,
    layout,
    taskCount,
    minNumber,
    maxNumber,
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
    const shouldCountUsage = body.countUsage !== false;

    if (!user.devAuthFallback) {
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

    const worksheet = generateWorksheet(normalizeRequest(body));

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
