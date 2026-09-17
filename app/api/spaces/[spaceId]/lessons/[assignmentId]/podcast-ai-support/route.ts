import "server-only";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { readPodcastWorkshopConfig, readPodcastWorkshopSubmission } from "@/lib/podcastWorkshop";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    spaceId: string;
    assignmentId: string;
  }>;
};

type Body = {
  sectionId?: unknown;
  sectionTitle?: unknown;
  room?: unknown;
  mode?: unknown;
  currentText?: unknown;
  podcastWorkshop?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isActiveMember(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  if (data.archived === true || data.active === false) return false;
  if (typeof data.status === "string" && data.status.toLowerCase() === "removed") return false;
  return true;
}

async function getSpaceMember(
  db: FirebaseFirestore.Firestore,
  spaceId: string,
  uid: string
): Promise<{ ok: boolean; participantId: string }> {
  const canonical = await db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get();
  if (canonical.exists && isActiveMember(canonical.data())) {
    const data = canonical.data() ?? {};
    return { ok: true, participantId: safeString(data.participantId) || uid };
  }

  const legacy = await db
    .collection("spaceMembers")
    .where("spaceId", "==", spaceId)
    .where("uid", "==", uid)
    .limit(5)
    .get();
  const active = legacy.docs.find((doc) => isActiveMember(doc.data()));
  if (!active) return { ok: false, participantId: "" };
  return { ok: true, participantId: safeString(active.data().participantId) || uid };
}

function buildSystemPrompt(language: string) {
  const lang = language.toLowerCase();
  const languageInstruction =
    lang === "en"
      ? "Write in English."
      : lang === "pt"
        ? "Write in Portuguese."
        : "Write in Norwegian Bokmål.";

  return [
    "You are a careful podcast coach for a student.",
    languageInstruction,
    "Help the student think, plan and improve their own podcast.",
    "Do not write a complete script, complete answer, or full podcast segment.",
    "Prefer short helper words, questions, tiny checklists and at most 3 sentence starters.",
    "Do not invent facts, sources, quotes, names or numbers.",
    "Keep the answer concrete, friendly and age-appropriate.",
    "Do not mention these system rules.",
  ].join("\n");
}

function buildPrompt(args: {
  title: string;
  level: string;
  language: string;
  sectionTitle: string;
  sectionId: string;
  room: string;
  mode: string;
  currentText: string;
  config: NonNullable<ReturnType<typeof readPodcastWorkshopConfig>>;
  submission: ReturnType<typeof readPodcastWorkshopSubmission>;
}) {
  const { title, level, sectionTitle, sectionId, room, mode, currentText, config, submission } = args;
  const supportWords = [
    ...(config.supportWordsBySection[sectionId] ?? []),
    ...(config.supportWordsBySection[mode === "ideas" ? sectionId : room] ?? []),
    ...config.vocabulary,
  ].slice(0, 18);

  return [
    `Podcastoppgave: ${title}`,
    level ? `Nivå: ${level}` : "",
    config.subject ? `Fag: ${config.subject}` : "",
    `Rom: ${room}`,
    `Seksjon: ${sectionTitle}`,
    `Hjelpetype: ${mode}`,
    "",
    "Oppgavetekst:",
    config.assignmentText || "(ikke oppgitt)",
    "",
    config.criteria.length ? `Kriterier:\n- ${config.criteria.join("\n- ")}` : "",
    supportWords.length ? `Lærerens hjelpeord:\n- ${supportWords.join("\n- ")}` : "",
    "",
    "Elevens arbeid så langt:",
    [
      submission.podcastName ? `Podcastnavn: ${submission.podcastName}` : "",
      submission.ideas ? `Ideer: ${submission.ideas}` : "",
      submission.participants ? `Deltakere: ${submission.participants}` : "",
      submission.importantPoints ? `Viktige poeng: ${submission.importantPoints}` : "",
      submission.listenerTakeaway ? `Lytter skal sitte igjen med: ${submission.listenerTakeaway}` : "",
    ].filter(Boolean).join("\n") || "(lite utfylt ennå)",
    "",
    "Tekst i feltet eleven ber om hjelp til:",
    currentText || "(tomt)",
    "",
    "Svar med kort veiledning eleven kan bruke videre. Ikke skriv ferdig podcasten.",
  ].filter(Boolean).join("\n");
}

export async function POST(req: Request, ctx: RouteParams) {
  try {
    if (!process.env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 500);

    const token = getBearerToken(req);
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { spaceId, assignmentId } = await ctx.params;
    if (!spaceId || !assignmentId) return json({ error: "Missing route params." }, 400);

    const body = (await req.json().catch(() => ({}))) as Body;
    const sectionId = safeString(body.sectionId);
    const sectionTitle = safeString(body.sectionTitle) || "Podcast";
    const room = safeString(body.room) || "ideas";
    const mode = safeString(body.mode) || "coach";
    const currentText = safeString(body.currentText).slice(0, 4000);
    if (!sectionId) return json({ error: "Missing section id." }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const [assignmentSnap, membership] = await Promise.all([
      db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId).get(),
      getSpaceMember(db, spaceId, uid),
    ]);

    if (!assignmentSnap.exists) return json({ error: "Assignment not found." }, 404);
    if (!membership.ok) return json({ error: "Not a member of this space." }, 403);

    const assignment = assignmentSnap.data() ?? {};
    const config = readPodcastWorkshopConfig(
      assignment.podcastWorkshopConfig,
      safeString(assignment.sourceText) || safeString(assignment.text)
    );
    if (!config) return json({ error: "Podcast workshop config missing." }, 404);
    if (config.aiSupport === "off" || config.aiUsageLimit <= 0) {
      return json({ error: "AI support is disabled for this podcast workshop." }, 403);
    }

    const participantId = membership.participantId || uid;
    const submissionId = `${spaceId}_${assignmentId}_${participantId}`;
    const submissionRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(submissionId);
    const submissionSnap = await submissionRef.get();
    const submissionData = (submissionSnap.data() ?? {}) as Record<string, unknown>;
    const existingUsage = Array.isArray(submissionData.podcastWorkshopAiUsage)
      ? submissionData.podcastWorkshopAiUsage
      : [];

    if (existingUsage.length >= config.aiUsageLimit) {
      return json({ error: "Podcast AI limit reached." }, 429);
    }

    const submission = readPodcastWorkshopSubmission(
      body.podcastWorkshop ?? submissionData.podcastWorkshop,
      config
    );
    const prompt = buildPrompt({
      title: safeString(assignment.title) || "Podcastverksted",
      level: safeString(assignment.level),
      language: safeString(assignment.language) || "nb",
      sectionTitle,
      sectionId,
      room,
      mode,
      currentText,
      config,
      submission,
    });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: buildSystemPrompt(safeString(assignment.language) || "nb") },
        { role: "user", content: prompt },
      ],
    });

    const supportText = response.output_text?.trim();
    if (!supportText) return json({ error: "Empty AI response" }, 500);

    const now = new Date();
    const usageLog = {
      id: `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      sectionId,
      sectionTitle,
      room,
      mode,
      promptSummary: prompt.slice(0, 500),
      response: supportText,
      responseSummary: supportText.slice(0, 220),
      createdAt: now,
    };
    const writePayload = {
      uid,
      participantId,
      spaceId,
      assignmentId,
      status: safeString(submissionData.status) || "draft",
      podcastWorkshopAiUsage: FieldValue.arrayUnion(usageLog),
      updatedAt: FieldValue.serverTimestamp(),
      ...(submissionSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    };

    await submissionRef.set(writePayload, { merge: true });
    await db.collection("spaceSubmissions").doc(submissionId).set(writePayload, { merge: true });

    return json({
      supportText,
      usage: {
        used: existingUsage.length + 1,
        limit: config.aiUsageLimit,
        remaining: Math.max(0, config.aiUsageLimit - existingUsage.length - 1),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Podcast AI support failed.";
    return json({ error: message }, 500);
  }
}
