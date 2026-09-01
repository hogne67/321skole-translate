import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getBucketLimit,
  getEffectivePlan,
  type AppRole,
  type PlanKey,
} from "@/lib/featureAccess";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

type CoverImageStyle = "illustration" | "realistic";
type CoverImagePromptMode = "custom" | "fromText";

type GenerateImageBody = {
  context?: "student_writing_print";
  spaceId?: string;
  activityId?: string;
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

type StudentWritingAccess =
  | {
      ok: true;
      ownerUid: string;
      activity: Record<string, unknown>;
    }
  | {
      ok: false;
      response: NextResponse;
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

    const body = (await req.json()) as GenerateImageBody;

    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const profile = (userData ?? {}) as Record<string, unknown>;
    const studentWritingAccess = await verifyStudentWritingAccess(db, uid, profile, body);

    if (studentWritingAccess?.ok === false) {
      return studentWritingAccess.response;
    }

    if (needsEmailVerification(decoded) && !studentWritingAccess?.ok) {
      return emailVerificationRequiredResponse();
    }

    const quotaUid = studentWritingAccess?.ok ? studentWritingAccess.ownerUid : uid;
    const quotaUserSnap =
      quotaUid === uid ? userSnap : await db.doc(`users/${quotaUid}`).get();
    const quotaUserData = quotaUserSnap.exists ? quotaUserSnap.data() : {};

    const role = normalizeRole(quotaUserData?.role);
    const plan = getEffectivePlan({
      plan: normalizePlan(quotaUserData?.plan),
      billing:
        quotaUserData?.billing && typeof quotaUserData.billing === "object"
          ? (quotaUserData.billing as { plan?: string | null; status?: string | null })
          : null,
      schoolId: typeof quotaUserData?.schoolId === "string" ? quotaUserData.schoolId : null,
      schoolRole: typeof quotaUserData?.schoolRole === "string" ? quotaUserData.schoolRole : null,
      schoolStatus: typeof quotaUserData?.schoolStatus === "string" ? quotaUserData.schoolStatus : null,
    });

    const imageLimit = getBucketLimit(role, plan, "image_generation", {
      studentAccessMode:
        typeof quotaUserData?.studentAccessMode === "string" ? quotaUserData.studentAccessMode : null,
    });
    if (imageLimit <= 0) {
      return NextResponse.json(
        { error: "Image generation is not available on your current plan." },
        { status: 403 }
      );
    }

    const monthId = getMonthId();
    const usageRef = db.doc(`users/${quotaUid}/usage/${monthId}`);
    const usageSnap = await usageRef.get();
    const usageData = (usageSnap.exists ? usageSnap.data() : {}) as UsageDoc;
    const imagesUsed = typeof usageData.image_generation === "number" ? usageData.image_generation : 0;

    if (imagesUsed >= imageLimit) {
      return NextResponse.json(
        { error: "You have reached your image generation limit for this period." },
        { status: 403 }
      );
    }

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
    const croppedBuffer = await sharp(buffer)
      .resize(1536, 864, { fit: "cover", position: "centre" })
      .webp({ quality: 90 })
      .toBuffer();

    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);

    const downloadToken = randomUUID();
    const titleSlug = safeSlug(body.title || "lesson");
    const storagePath = `covers/${uid}/${lessonId}/ai-${Date.now()}-${titleSlug || "cover"}.webp`;

    const file = bucket.file(storagePath);

    await file.save(croppedBuffer, {
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
          aspectRatio: "16:9",
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

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAdminProfile(data: Record<string, unknown>) {
  return data.role === "admin" || data.admin === true || data.isAdmin === true;
}

function isActiveMember(data: Record<string, unknown>) {
  const status = safeString(data.status).toLowerCase();
  if (data.archived === true || data.active === false) return false;
  return !status || status === "active";
}

async function verifyStudentWritingAccess(
  db: Firestore,
  uid: string,
  profile: Record<string, unknown>,
  body: GenerateImageBody
): Promise<StudentWritingAccess | null> {
  if (body.context !== "student_writing_print") return null;

  const spaceId = safeString(body.spaceId);
  const activityId = safeString(body.activityId);
  if (!spaceId || !activityId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing spaceId or activityId." }, { status: 400 }),
    };
  }

  const [spaceSnap, memberSnap, activitySnap] = await Promise.all([
    db.collection("spaces").doc(spaceId).get(),
    db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get(),
    db.collection("spaces").doc(spaceId).collection("writingActivities").doc(activityId).get(),
  ]);

  if (!spaceSnap.exists) {
    return { ok: false, response: NextResponse.json({ error: "Space not found." }, { status: 404 }) };
  }
  if (!activitySnap.exists) {
    return { ok: false, response: NextResponse.json({ error: "Writing activity not found." }, { status: 404 }) };
  }

  const space = (spaceSnap.data() ?? {}) as Record<string, unknown>;
  const activity = (activitySnap.data() ?? {}) as Record<string, unknown>;
  const ownerUid =
    safeString(activity.ownerUid) ||
    safeString(space.ownerUid) ||
    safeString(space.ownerId) ||
    safeString(space.teacherId);
  const member = (memberSnap.data() ?? {}) as Record<string, unknown>;
  const isOwner = ownerUid === uid || safeString(space.ownerId) === uid || safeString(space.ownerUid) === uid;
  const hasMemberAccess = memberSnap.exists && isActiveMember(member);

  if (!ownerUid) {
    return { ok: false, response: NextResponse.json({ error: "Space owner missing." }, { status: 403 }) };
  }
  if (!isOwner && !isAdminProfile(profile) && !hasMemberAccess) {
    return { ok: false, response: NextResponse.json({ error: "No access to this space." }, { status: 403 }) };
  }
  if ((activity.aiPolicy as { enabled?: unknown } | undefined)?.enabled === false) {
    return { ok: false, response: NextResponse.json({ error: "AI is disabled for this activity." }, { status: 403 }) };
  }

  return { ok: true, ownerUid, activity };
}
