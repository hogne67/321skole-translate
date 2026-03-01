// app/api/teacher/ai-feedback/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";

type SourceType = "myContent" | "library";
type TaskType = "mcq" | "truefalse" | "open";

type Task = {
  id?: string;
  order?: number;
  type?: TaskType | string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
};

type AnswersMap = Record<string, unknown>;

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

function safeTasksArray(tasks: unknown): Task[] {
  if (Array.isArray(tasks)) return tasks as Task[];
  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getStableTaskId(t: Task, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

function readAnswerMap(a: unknown): AnswersMap {
  if (a && typeof a === "object" && !Array.isArray(a)) return a as AnswersMap;
  return {};
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

function isOpenLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "open" || t === "text" || t === "writing";
}

function pickModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5";
}

function requireEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}

function hasAcceptedAttestation(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const att = profile["attestation"];
  if (!isRecord(att)) return false;
  return Boolean(att["acceptedAt"]);
}

function readMode(profile: unknown): string {
  if (!isRecord(profile)) return "";
  return safeString(profile["mode"]);
}

type Body = {
  spaceId: string;
  assignmentId: string;
  subId: string;
};

export async function POST(req: Request) {
  try {
    requireEnv();

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const body = (await req.json()) as Partial<Body>;
    const spaceId = safeString(body.spaceId).trim();
    const assignmentId = safeString(body.assignmentId).trim();
    const subId = safeString(body.subId).trim();

    if (!spaceId || !assignmentId || !subId) {
      return json({ error: "Missing spaceId/assignmentId/subId" }, 400);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);

    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    // ✅ Role check via user profile doc
    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;

    const mode = readMode(profile);
    const attOk = hasAcceptedAttestation(profile);

    const isTeacherish = mode === "teacher" || mode === "creator" || mode === "admin";
    if (!isTeacherish || !attOk) {
      return json({ error: "Not allowed (mode/attestation)" }, 403);
    }

    // valgfritt: krev approved (slå på når dere er klare)
    // const teacherStatus = safeString((profile as any)?.teacherStatus);
    // if (mode === "teacher" && teacherStatus && teacherStatus !== "approved") {
    //   return json({ error: "Teacher not approved" }, 403);
    // }

    // ✅ Read submission
    const subRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(subId);

    const subSnap = await subRef.get();
    if (!subSnap.exists) return json({ error: "Submission not found" }, 404);
    const subDoc = subSnap.data() || {};
    const answers = readAnswerMap(subDoc.answers);

    // ✅ Read assignment
    const aRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const aSnap = await aRef.get();
    const assignment = aSnap.exists ? aSnap.data() || {} : {};

    const sourceType = (safeString(assignment.sourceType) || "library") as SourceType;
    const sourceId = safeString(assignment.sourceId).trim();
    if (!sourceId) return json({ error: "Assignment missing sourceId" }, 400);

    // ✅ Read lesson (library vs myContent)
    const lessonRef =
      sourceType === "library"
        ? db.collection("published_lessons").doc(sourceId)
        : db.collection("lessons").doc(sourceId);

    const lessonSnap = await lessonRef.get();
    const lesson = lessonSnap.exists ? lessonSnap.data() || {} : {};
    const tasks = safeTasksArray(lesson.tasks);

    // ✅ Filter open tasks + gather student answers
    const openItems = tasks
      .slice()
      .sort((x, y) => Number(x?.order ?? 999) - Number(y?.order ?? 999))
      .map((task, idx) => {
        const stableId = getStableTaskId(task, idx);
        const type = safeString(task?.type || "open");
        if (!isOpenLike(type)) return null;

        const prompt = safeString(task?.prompt);
        const ans = asText(answers[stableId]).trim();

        return {
          n: task?.order ?? idx + 1,
          prompt: prompt.trim(),
          answer: ans,
        };
      })
      .filter(Boolean) as Array<{ n: number; prompt: string; answer: string }>;

    if (openItems.length === 0) {
      const msg = "Ingen åpne oppgaver ble funnet i denne innleveringen (eller oppgavene mangler).";
      return json({ text: msg, skipped: true }, 200);
    }

    // ✅ Build prompt (language-aware)
    const lessonTitle = safeString(lesson.title) || safeString(assignment.title) || "Oppgave";
    const level = safeString(lesson.level) || safeString(assignment.level) || "";
    const language = safeString(lesson.language) || safeString(assignment.language) || "norsk";

    const studentName = safeString(subDoc.studentName) || safeString(subDoc.studentDisplayName) || "";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = pickModel();

    // ✅ Call Responses API
    const resp = await client.responses.create({
      model,
      temperature: 0.3,
      input: `
Du er en norsklærerassistent. Du skal gi språkvurdering av elevens ÅPNE svar.
Fokuser kun på: grammatikk, tegnsetting, ordvalg, setningsbygging og språkflyt.
Ikke vurder faglig innhold eller fakta. Ikke gi karakter.
Svar på ${language}.
Hold det kort og lærer-vennlig:
- 1–2 setninger oppsummering
- 3 punkt: "Det fungerer bra", "Å jobbe videre med", "Konkrete tips"
Unngå å nevne at du er en AI.

Oppgave: ${lessonTitle}${level ? ` (${level})` : ""}
${studentName ? `Elev: ${studentName}` : ""}

Her er elevens åpne svar:

${openItems
  .map(
    (x) =>
      `#${x.n}
PROMPT: ${x.prompt || "(ingen prompt)"}
SVAR: ${x.answer || "(ikke besvart)"}`
  )
  .join("\n\n")}
`,
    });

    const textOut = (resp.output_text || "").trim();
    if (!textOut) return json({ error: "Empty AI response" }, 502);

    // ✅ Save to Firestore (nested + index)
    const payload = {
      aiFeedback: {
        text: textOut,
        updatedAt: FieldValue.serverTimestamp(),
        teacherUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(subRef, payload, { merge: true });
    batch.set(db.collection("spaceSubmissions").doc(subId), payload, { merge: true });
    await batch.commit();

    return json({ text: textOut }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}