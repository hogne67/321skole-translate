import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

export type StudentAudioActivityType = "audio_reading" | "podcast" | string;

export type StudentAudioAsset = {
  version: 1;
  activityType: StudentAudioActivityType;
  audioDataUrl?: string;
  storagePath?: string;
  mimeType: string;
  durationSeconds: number;
  sizeBytes?: number;
  recordedAt: number;
  uploadedAt?: number;
  visibility?: "teacher" | "owner";
  retentionPolicy?: "review_plus_30_days";
};

export function readStudentAudioAsset(
  value: unknown,
  activityType: StudentAudioActivityType
): StudentAudioAsset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const data = value as Record<string, unknown>;
  const audioDataUrl = typeof data.audioDataUrl === "string" ? data.audioDataUrl : "";
  const storagePath =
    typeof data.storagePath === "string"
      ? data.storagePath
      : typeof data.audioStoragePath === "string"
        ? data.audioStoragePath
        : "";

  if (!audioDataUrl && !storagePath) return null;

  const mimeType = typeof data.mimeType === "string" ? data.mimeType : "audio/webm";
  const durationSeconds =
    typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
      ? data.durationSeconds
      : 0;
  const recordedAt =
    typeof data.recordedAt === "number" && Number.isFinite(data.recordedAt)
      ? data.recordedAt
      : Date.now();
  const uploadedAt =
    typeof data.uploadedAt === "number" && Number.isFinite(data.uploadedAt)
      ? data.uploadedAt
      : undefined;
  const sizeBytes =
    typeof data.sizeBytes === "number" && Number.isFinite(data.sizeBytes)
      ? data.sizeBytes
      : undefined;

  return {
    version: 1,
    activityType,
    audioDataUrl: audioDataUrl || undefined,
    storagePath: storagePath || undefined,
    mimeType,
    durationSeconds,
    recordedAt,
    uploadedAt,
    sizeBytes,
    visibility: "teacher",
    retentionPolicy: "review_plus_30_days",
  };
}

export async function resolveStudentAudioForPlayback(
  asset: StudentAudioAsset | null
): Promise<StudentAudioAsset | null> {
  if (!asset) return null;
  if (asset.audioDataUrl) return asset;
  if (!asset.storagePath) return asset;

  const audioDataUrl = await getDownloadURL(storageRef(storage, asset.storagePath));
  return { ...asset, audioDataUrl };
}

export function stripStudentAudioPlaybackUrl(
  asset: StudentAudioAsset
): StudentAudioAsset {
  const { audioDataUrl: _audioDataUrl, ...stored } = asset;
  void _audioDataUrl;
  return stored;
}

function extensionForMimeType(mimeType: string) {
  const clean = mimeType.toLowerCase();
  if (clean.includes("mp4") || clean.includes("m4a")) return "m4a";
  if (clean.includes("ogg")) return "ogg";
  if (clean.includes("wav")) return "wav";
  return "webm";
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export async function uploadStudentAudioAsset({
  spaceId,
  assignmentId,
  submissionId,
  uid,
  activityType,
  asset,
}: {
  spaceId: string;
  assignmentId: string;
  submissionId: string;
  uid: string;
  activityType: StudentAudioActivityType;
  asset: StudentAudioAsset;
}): Promise<StudentAudioAsset> {
  if (!asset.audioDataUrl || !asset.audioDataUrl.startsWith("data:")) {
    return stripStudentAudioPlaybackUrl({ ...asset, activityType });
  }

  const blob = await dataUrlToBlob(asset.audioDataUrl);
  const mimeType = blob.type || asset.mimeType || "audio/webm";
  const maxBytes = 25 * 1024 * 1024;

  if (blob.size > maxBytes) {
    throw new Error("Audio recording is too large.");
  }

  const extension = extensionForMimeType(mimeType);
  const path = [
    "spaces",
    spaceId,
    "assignments",
    assignmentId,
    "submissions",
    uid,
    "audio",
    `${submissionId}-${activityType}.${extension}`,
  ].join("/");

  await uploadBytes(storageRef(storage, path), blob, {
    contentType: mimeType,
    cacheControl: "private,max-age=0,no-store",
    customMetadata: {
      spaceId,
      assignmentId,
      submissionId,
      uid,
      activityType,
      recordedAt: String(asset.recordedAt),
    },
  });

  return {
    version: 1,
    activityType,
    storagePath: path,
    mimeType,
    durationSeconds: asset.durationSeconds,
    sizeBytes: blob.size,
    recordedAt: asset.recordedAt,
    uploadedAt: Date.now(),
    visibility: "teacher",
    retentionPolicy: "review_plus_30_days",
  };
}
