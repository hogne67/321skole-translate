import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getBucketLimit,
  getEffectivePlan,
  type AppRole,
  type PlanKey,
} from "@/lib/featureAccess";

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

type UsageDoc = Partial<Record<"image_generation", number>> & {
  updatedAt?: unknown;
};

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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

function normalizeRole(role?: unknown): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "anonymous";
}

function normalizePlan(plan?: unknown): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function getMonthId(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

    const { auth, db, storage } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) {
      return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const role = normalizeRole(userData?.role);
    const plan = getEffectivePlan({
      plan: normalizePlan(userData?.plan),
      billing:
        userData?.billing && typeof userData.billing === "object"
          ? (userData.billing as { plan?: string | null; status?: string | null })
          : null,
      schoolId: typeof userData?.schoolId === "string" ? userData.schoolId : null,
      schoolRole: typeof userData?.schoolRole === "string" ? userData.schoolRole : null,
      schoolStatus: typeof userData?.schoolStatus === "string" ? userData.schoolStatus : null,
    });

    const imageLimit = getBucketLimit(role, plan, "image_generation");
    if (imageLimit <= 0) {
      return NextResponse.json(
        { error: "Image generation is not available on your current plan." },
        { status: 403 }
      );
    }

    const monthId = getMonthId();
    const usageRef = db.doc(`users/${uid}/usage/${monthId}`);
    const usageSnap = await usageRef.get();
    const usageData = (usageSnap.exists ? usageSnap.data() : {}) as UsageDoc;
    const imagesUsed = typeof usageData.image_generation === "number" ? usageData.image_generation : 0;

    if (imagesUsed >= imageLimit) {
      return NextResponse.json(
        { error: "You have reached your image generation limit for this period." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as GenerateImageBody;

    const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId." }, { status: 400 });
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

    await usageRef.set(
      {
        image_generation: imagesUsed + 1,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const imageUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    return NextResponse.json({
      ok: true,
      imageUrl,
      storagePath,
      usage: {
        used: imagesUsed + 1,
        limit: imageLimit,
        remaining: Math.max(0, imageLimit - (imagesUsed + 1)),
      },
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
