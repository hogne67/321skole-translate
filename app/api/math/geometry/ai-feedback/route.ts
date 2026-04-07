import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";

export const runtime = "nodejs";

type MathWorksheetTask = {
  id?: string;
  prompt?: string;
  type?: string;
  expected?: {
    shapeName?: string;
    perimeterValue?: number | null;
    areaValue?: number | null;
  } | null;
};

type MathWorksheet = {
  title?: string;
  level?: string;
  topic?: string;
  language?: string;
  tasks?: MathWorksheetTask[];
};

type GeometryAnswerRow = {
  taskId?: string;
  shapeName?: string;
  perimeterValue?: number | null;
  areaValue?: number | null;
};

type GeometryTaskAuto = {
  shapeName?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  perimeterValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
  areaValue?: {
    isCorrect?: boolean;
    studentValue?: unknown;
    expectedValue?: unknown;
  };
};

type GeometryAutoResult = {
  total?: number;
  correct?: number;
  partial?: number;
  wrong?: number;
  unanswered?: number;
  percent?: number | null;
  byTaskId?: Record<string, GeometryTaskAuto>;
};

type AttemptDoc = {
  worksheet?: MathWorksheet;
  answersByTaskId?: Record<string, unknown>;
  auto?: GeometryAutoResult | null;
  aiFeedback?: {
    text?: string;
    updatedAt?: unknown;
  } | null;
};

type Body = {
  attemptId?: string;
  locale?: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function normalizeLocale(raw: string): "no" | "en" | "pt" {
  const v = (raw || "").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt";
  return "no";
}

function isMathWorksheet(value: unknown): value is MathWorksheet {
  if (!value || typeof value !== "object") return false;
  const v = value as { tasks?: unknown; title?: unknown };
  return Array.isArray(v.tasks) && typeof v.title === "string";
}

function pickModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function buildGeometrySystemPrompt(lang: "no" | "en" | "pt") {
  if (lang === "en") {
    return [
      "You are an experienced math teacher giving feedback to a student.",
      "Write directly to the student using 'you'.",
      "Be supportive, concrete, and short.",
      "Use the geometry auto-check actively.",
      "Mention what the student got right, what needs improvement, and what to practice next.",
      "Do not invent scores that are not provided.",
      "Do not explain every single task in detail.",
      "",
      "Use these exact headings:",
      "1) DET DU HAR FÅTT TIL",
      "2) DET DU BØR ØVE MER PÅ",
      "3) NESTE STEG",
      "",
      "Keep it concise and teacher-like.",
    ].join("\n");
  }

  if (lang === "pt") {
    return [
      "Você é um professor experiente de matemática dando feedback ao aluno.",
      "Fale diretamente com o aluno usando 'você'.",
      "Seja encorajador, concreto e breve.",
      "Use ativamente o resultado da autocorreção de geometria.",
      "",
      "Use estes títulos exatos:",
      "1) DET DU HAR FÅTT TIL",
      "2) DET DU BØR ØVE MER PÅ",
      "3) NESTE STEG",
    ].join("\n");
  }

  return [
    "Du er en erfaren matematikklærer som gir tilbakemelding til en elev.",
    "Skriv direkte til eleven med 'du'.",
    "Vær vennlig, konkret og kort.",
    "Bruk geometry-autokorrekturen aktivt.",
    "Trekk fram hva eleven har fått til, hva som bør forbedres, og hva neste øvingspunkt bør være.",
    "Ikke forklar hver enkelt oppgave i detalj.",
    "",
    "Bruk nøyaktig disse overskriftene:",
    "1) DET DU HAR FÅTT TIL",
    "2) DET DU BØR ØVE MER PÅ",
    "3) NESTE STEG",
    "",
    "Hold det kort og læreraktig.",
  ].join("\n");
}

function summarizeGeometryAuto(auto: unknown): string {
  if (!auto || typeof auto !== "object" || Array.isArray(auto)) return "(not provided)";

  const rec = auto as Record<string, unknown>;
  const total = safeNumber(rec.total);
  const correct = safeNumber(rec.correct);
  const partial = safeNumber(rec.partial);
  const wrong = safeNumber(rec.wrong);
  const unanswered = safeNumber(rec.unanswered);
  const percent = safeNumber(rec.percent);

  return [
    `total: ${total ?? "unknown"}`,
    `correct: ${correct ?? "unknown"}`,
    `partial: ${partial ?? "unknown"}`,
    `wrong: ${wrong ?? "unknown"}`,
    `unanswered: ${unanswered ?? "unknown"}`,
    `percent: ${percent ?? "unknown"}`,
  ].join("\n");
}

function summarizeGeometryWorksheet(
  worksheet: MathWorksheet | null,
  answersByTaskId: Record<string, unknown>,
  geometryAuto: GeometryAutoResult | null
): string {
  if (!worksheet || !Array.isArray(worksheet.tasks) || worksheet.tasks.length === 0) {
    return "(No geometry worksheet tasks found.)";
  }

  return worksheet.tasks
    .map((task, idx) => {
      const taskId = safeString(task.id).trim() || `task_${idx + 1}`;
      const answerRaw = answersByTaskId[taskId];
      const answer =
        answerRaw && typeof answerRaw === "object" && !Array.isArray(answerRaw)
          ? (answerRaw as GeometryAnswerRow)
          : {};

      const autoByTask = geometryAuto?.byTaskId?.[taskId];

      const lines = [
        `#${idx + 1}`,
        `Task id: ${taskId}`,
        `Prompt: ${safeString(task.prompt) || "(no prompt)"}`,
        `Task type: ${safeString(task.type) || "unknown"}`,
        `Expected shape: ${task.expected?.shapeName ?? "unknown"}`,
        `Expected perimeter: ${task.expected?.perimeterValue ?? "unknown"}`,
        `Expected area: ${task.expected?.areaValue ?? "unknown"}`,
        `Student shape: ${answer.shapeName ?? "not answered"}`,
        `Student perimeter: ${answer.perimeterValue ?? "not answered"}`,
        `Student area: ${answer.areaValue ?? "not answered"}`,
      ];

      if (autoByTask) {
        lines.push(
          `Shape correct: ${
            safeBoolean(autoByTask.shapeName?.isCorrect) === true
              ? "yes"
              : safeBoolean(autoByTask.shapeName?.isCorrect) === false
                ? "no"
                : "unknown"
          }`,
          `Perimeter correct: ${
            safeBoolean(autoByTask.perimeterValue?.isCorrect) === true
              ? "yes"
              : safeBoolean(autoByTask.perimeterValue?.isCorrect) === false
                ? "no"
                : "unknown"
          }`,
          `Area correct: ${
            safeBoolean(autoByTask.areaValue?.isCorrect) === true
              ? "yes"
              : safeBoolean(autoByTask.areaValue?.isCorrect) === false
                ? "no"
                : "unknown"
          }`
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

export async function POST(req: Request) {
  try {
    requireEnv();

    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const attemptId = safeString(body.attemptId).trim();
    const locale = normalizeLocale(safeString(body.locale || "no"));

    if (!attemptId) {
      return json({ ok: false, error: "Missing attemptId" }, 400);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    if (!uid) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const attemptRef = db
      .collection("users")
      .doc(uid)
      .collection("geometryAttempts")
      .doc(attemptId);

    const attemptSnap = await attemptRef.get();
    if (!attemptSnap.exists) {
      return json({ ok: false, error: "Attempt not found" }, 404);
    }

    const attempt = (attemptSnap.data() || {}) as AttemptDoc;
    const worksheet = isMathWorksheet(attempt.worksheet) ? attempt.worksheet : null;
    const answersByTaskId =
      attempt.answersByTaskId && isRecord(attempt.answersByTaskId)
        ? attempt.answersByTaskId
        : {};
    const geometryAuto = (attempt.auto ?? null) as GeometryAutoResult | null;

    if (!worksheet) {
      return json({ ok: false, error: "Attempt is missing a valid worksheet" }, 400);
    }

    const systemPrompt = buildGeometrySystemPrompt(locale);
    const userContent =
      `Worksheet title: ${worksheet.title || "Geometry worksheet"}\n` +
      `Level: ${worksheet.level || "unknown"}\n` +
      `Topic: ${worksheet.topic || "unknown"}\n` +
      (worksheet.language ? `Language hint: ${worksheet.language}\n` : "") +
      `Geometry auto summary:\n${summarizeGeometryAuto(geometryAuto)}\n\n` +
      `Geometry tasks and student answers:\n${summarizeGeometryWorksheet(
        worksheet,
        answersByTaskId,
        geometryAuto
      )}\n\n` +
      `Instruction:\n` +
      `Write feedback for the student in the required structure. ` +
      `Use the auto-check actively. Mention what the student understands, what is partly correct or wrong, and what should be practiced next.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = pickModel();

    const resp = await client.responses.create({
      model,
      temperature: 0.3,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const textOut = (resp.output_text || "").trim();
    if (!textOut) {
      return json({ ok: false, error: "Empty AI response" }, 502);
    }

    await attemptRef.set(
      {
        aiFeedback: {
          text: textOut,
          updatedAt: new Date(),
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ ok: true, text: textOut }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg || "Unknown error" }, 500);
  }
}