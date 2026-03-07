// app/api/images/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { getAdmin } from "@/lib/firebaseAdmin";

type CoverImageStyle = "illustration" | "realistic";
type CoverImagePromptMode = "custom" | "fromText";

type GenerateImageBody = {
  lessonId?: string;
  uid?: string;
  format?: "16:9";
  style?: CoverImageStyle;
  promptMode?: CoverImagePromptMode;
  customPrompt?: string;
  sourceText?: string;
  title?: string;
  level?: string;
  language?: string;
};

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

function safeSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getBucketName(): string {
  const bucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "";

  if (!bucket.trim()) {
    throw new Error(
      "Missing storage bucket env. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET."
    );
  }

  return bucket.trim();
}

function buildPrompt(
  body: Required<Pick<GenerateImageBody, "style" | "promptMode">> & GenerateImageBody
) {
  const styleInstruction =
    body.style === "realistic"
      ? "Create a realistic, photographic-looking educational cover image."
      : "Create a drawn illustrated educational cover image, clearly illustrated rather than photographic.";

  const compositionInstruction =
    "Landscape composition in 16:9. Clean single-scene cover image. No collage. No split panels. No text inside image. No letters, numbers, watermark, or logo.";

  const safetyInstruction =
    "Suitable for a school learning platform. Avoid copyrighted characters, famous branded products, and readable text inside the image.";

  if (body.promptMode === "custom") {
    const custom = (body.customPrompt || "").trim();
    if (!custom) {
      throw new Error("Missing customPrompt.");
    }

    return [
      styleInstruction,
      compositionInstruction,
      safetyInstruction,
      `Image brief: ${custom}`,
    ].join("\n\n");
  }

  const sourceText = (body.sourceText || "").trim();
  if (!sourceText) {
    throw new Error("Missing sourceText.");
  }

  const title = (body.title || "").trim();
  const level = (body.level || "").trim();
  const language = (body.language || "").trim();
  const trimmedText = sourceText.slice(0, 4000);

  return [
    styleInstruction,
    compositionInstruction,
    safetyInstruction,
    "Use the lesson information below as inspiration for one strong cover image.",
    title ? `Title: ${title}` : "",
    level ? `Level: ${level}` : "",
    language ? `Language: ${language}` : "",
    `Lesson text:\n${trimmedText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const authToken = readBearerToken(req);
    if (!authToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const { auth, storage } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);

    const body = (await req.json()) as GenerateImageBody;

    const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";

    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId." }, { status: 400 });
    }

    if (!uid) {
      return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }

    if (decoded.uid !== uid) {
      return NextResponse.json({ error: "UID mismatch." }, { status: 403 });
    }

    const style: CoverImageStyle =
      body.style === "realistic" ? "realistic" : "illustration";

    const promptMode: CoverImagePromptMode =
      body.promptMode === "fromText" ? "fromText" : "custom";

    const prompt = buildPrompt({
      ...body,
      style,
      promptMode,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const imageResult = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: "medium",
      output_format: "webp",
      background: "opaque",
      n: 1,
    });

    const first = imageResult.data?.[0];
    const b64 = first?.b64_json;

    if (!b64) {
      return NextResponse.json({ error: "No image returned from OpenAI." }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");

    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    const downloadToken = randomUUID();
    const titleSlug = safeSlug(body.title || "lesson");
    const storagePath = `covers/${uid}/${lessonId}/ai-${Date.now()}-${titleSlug || "cover"}.webp`;

    const file = bucket.file(storagePath);

    await file.save(buffer, {
      contentType: "image/webp",
      resumable: false,
      metadata: {
        cacheControl: "public,max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          ownerId: uid,
          lessonId,
          generatedBy: "openai",
          imageStyle: style,
          promptMode,
        },
      },
    });

    const imageUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    return NextResponse.json({
      ok: true,
      imageUrl,
      storagePath,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Image generation failed.";

    return NextResponse.json(
      { error: message || "Image generation failed." },
      { status: 500 }
    );
  }
}