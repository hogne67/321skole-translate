import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Language = "nb" | "en" | "pt";
type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type TaskType = "describe" | "story" | "dialogue" | "reflection";
type ImageSource = "ai_generated" | "uploaded";

type ImageTaskInput = {
  id?: string;
  imageUrl?: string;
  imageSource?: ImageSource;
  imagePrompt?: string;
  imageDescription?: string;
  instruction?: string;
  supportWords?: unknown;
  successCriteria?: unknown;
  printSupportWords?: unknown;
  printSuccessCriteria?: unknown;
};

type SaveImageWritingBody = {
  title?: string;
  language?: Language;
  level?: Level;
  taskType?: TaskType;
  imageTasks?: ImageTaskInput[];
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function pickLanguage(value: unknown): Language {
  return value === "en" || value === "pt" ? value : "nb";
}

function pickLevel(value: unknown): Level {
  return value === "A1" ||
    value === "A2" ||
    value === "B1" ||
    value === "B2" ||
    value === "C1" ||
    value === "C2"
    ? value
    : "A2";
}

function pickTaskType(value: unknown): TaskType {
  return value === "story" ||
    value === "dialogue" ||
    value === "reflection" ||
    value === "describe"
    ? value
    : "describe";
}

function pickImageSource(value: unknown): ImageSource {
  return value === "ai_generated" ? "ai_generated" : "uploaded";
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function pickName(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  for (const key of ["producerName", "displayName", "fullName", "name"]) {
    const value = safeString(data[key]);
    if (value) return value;
  }
  return "";
}

function sourceLabels(language: Language) {
  if (language === "en") {
    return {
      taskType: "Task type",
      imageDescription: "Image description:",
      supportWords: "Support words",
      successCriteria: "Success criteria",
      texttype: "Image writing task",
    };
  }
  if (language === "pt") {
    return {
      taskType: "Tipo de tarefa",
      imageDescription: "Descrição da imagem:",
      supportWords: "Palavras de apoio",
      successCriteria: "Critérios de sucesso",
      texttype: "Tarefa de escrita com imagem",
    };
  }
  return {
    taskType: "Oppgavetype",
    imageDescription: "Bildebeskrivelse:",
    supportWords: "Støtteord",
    successCriteria: "Kriterier",
    texttype: "Skriveoppgave med bilde",
  };
}

function taskTypeLabel(language: Language, taskType: TaskType) {
  const labels: Record<Language, Record<TaskType, string>> = {
    nb: {
      describe: "Beskriv bildet",
      story: "Skriv en historie",
      dialogue: "Skriv en dialog",
      reflection: "Reflekter",
    },
    en: {
      describe: "Describe the picture",
      story: "Write a story",
      dialogue: "Write a dialogue",
      reflection: "Reflect",
    },
    pt: {
      describe: "Descrever a imagem",
      story: "Escrever uma história",
      dialogue: "Escrever um diálogo",
      reflection: "Refletir",
    },
  };

  return labels[language][taskType];
}

function makeTaskId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);
    const profileSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const profile = profileSnap?.exists ? (profileSnap.data() as Record<string, unknown>) : null;
    const producerName = pickName(profile) || safeString(decoded.name);

    const body = (await req.json().catch(() => ({}))) as SaveImageWritingBody;

    const title = safeString(body.title);
    const language = pickLanguage(body.language);
    const level = pickLevel(body.level);
    const taskType = pickTaskType(body.taskType);
    const first = Array.isArray(body.imageTasks) ? body.imageTasks[0] : null;

    if (!title) return json({ ok: false, error: "Title is required." }, 400);
    if (!first) return json({ ok: false, error: "Image task is required." }, 400);

    const imageUrl = safeString(first.imageUrl);
    const imageDescription = safeString(first.imageDescription);
    const instruction = safeString(first.instruction);
    const imageSource = pickImageSource(first.imageSource);
    const imagePrompt = safeString(first.imagePrompt);
    const taskId = safeString(first.id) || makeTaskId();

    if (!imageUrl) return json({ ok: false, error: "Image URL is required." }, 400);
    if (!imageDescription) {
      return json({ ok: false, error: "Image description is required." }, 400);
    }
    if (!instruction) return json({ ok: false, error: "Instruction is required." }, 400);
    if (imageSource === "ai_generated" && !imagePrompt) {
      return json({ ok: false, error: "Image prompt is required for AI-generated images." }, 400);
    }

    const supportWords = stringList(first.supportWords);
    const successCriteria = stringList(first.successCriteria);
    const printSupportWords = first.printSupportWords === true;
    const printSuccessCriteria = first.printSuccessCriteria === true;
    const labels = sourceLabels(language);
    const taskTypeText = taskTypeLabel(language, taskType);
    const now = new Date();

    const imageTask = {
      id: taskId,
      taskType,
      imageUrl,
      imageSource,
      ...(imageSource === "ai_generated" ? { imagePrompt } : {}),
      imageDescription,
      instruction,
      supportWords,
      successCriteria,
      printSupportWords,
      printSuccessCriteria,
      createdAt: now,
    };

    const sourceText = [
      `${labels.taskType}: ${taskTypeText}`,
      "",
      instruction,
      "",
      labels.imageDescription,
      imageDescription,
      supportWords.length ? `${labels.supportWords}: ${supportWords.join(", ")}` : "",
      successCriteria.length ? `${labels.successCriteria}: ${successCriteria.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const lessonRef = db.collection("lessons").doc();
    await lessonRef.set({
      ownerId: uid,
      uid,
      status: "published",
      title,
      producerName,
      language,
      level,
      lessonType: "image_writing",
      taskType,
      textType: "image_writing",
      texttype: labels.texttype,
      source: "producer-image-writing",
      sourceText,
      text: sourceText,
      coverImageUrl: imageUrl,
      imageTasks: [imageTask],
      tasks: [
        {
          id: taskId,
          order: 1,
          type: "open",
          prompt: instruction,
          supportWords,
          successCriteria,
          printSupportWords,
          printSuccessCriteria,
          imageDescription,
          imageUrl,
          taskType,
        },
      ],
      estimatedMinutes: 20,
      releaseMode: "ALL_AT_ONCE",
      isActive: true,
      publishVisibility: "private",
      showInLibrary: false,
      meta: ["image_writing", "writing", "image"],
      deletedAt: null,
      activePublishedId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, id: lessonRef.id }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save image writing task.";
    return json({ ok: false, error: message }, 500);
  }
}
