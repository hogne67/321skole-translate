import { auth } from "@/lib/firebase";
import { fetchAuthenticatedFileBlob, uploadPrivateSpaceFile } from "@/lib/spaceFiles.client";
import { privateSpaceFileId, privateSpaceFileUrl } from "@/lib/spaceFiles";

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
  const user = auth.currentUser;
  const blob = await readStudentAudioBlob(asset);
  const audioDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read student audio"));
    reader.readAsDataURL(blob);
  });
  if (asset.storagePath && auth.currentUser !== user) throw new Error("Audio session changed");
  return { ...asset, audioDataUrl };
}

/** One transport for playback, segment downloads and full exports. Stored files
 * always use current authorization, even if an earlier preview is in memory. */
export async function readStudentAudioBlob(asset: StudentAudioAsset): Promise<Blob> {
  if (asset.storagePath) {
    const id = privateSpaceFileId(asset.storagePath);
    if (id) return fetchAuthenticatedFileBlob(privateSpaceFileUrl(id));
    const parts = asset.storagePath.split("/");
    if (parts.length !== 8 || parts.some(part => !part || part === "." || part === ".." || part.includes("\\"))
      || parts[0] !== "spaces" || parts[2] !== "assignments" || parts[4] !== "submissions" || parts[6] !== "audio") {
      throw new Error("Invalid student audio reference");
    }
    return fetchAuthenticatedFileBlob("/api/teacher/audio-url", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: asset.storagePath, mode: "bytes" }) });
  }
  if (!asset.audioDataUrl?.startsWith("data:audio/")) throw new Error("Missing student audio");
  const response = await fetch(asset.audioDataUrl);
  if (!response.ok) throw new Error("Audio could not be read");
  const blob = await response.blob();
  if (blob.size === 0 || blob.size > 25 * 1024 * 1024) throw new Error("Invalid audio size");
  return blob;
}

export function studentAudioFilename(asset: StudentAudioAsset, label = "321skole-opptak") {
  const extensions: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
    "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3" };
  const name = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "321skole-opptak";
  return `${name}.${extensions[asset.mimeType.split(";")[0].toLowerCase()] || "webm"}`;
}

export function stripStudentAudioPlaybackUrl(
  asset: StudentAudioAsset
): StudentAudioAsset {
  const { audioDataUrl: _audioDataUrl, ...stored } = asset;
  void _audioDataUrl;
  return stored;
}

function storageContentType(mimeType: string) {
  const clean = mimeType.split(";")[0]?.trim().toLowerCase();
  return clean && clean.startsWith("audio/") ? clean : "audio/webm";
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
  assetId,
  asset,
}: {
  spaceId: string;
  assignmentId: string;
  submissionId: string;
  uid: string;
  activityType: StudentAudioActivityType;
  assetId?: string;
  asset: StudentAudioAsset;
}): Promise<StudentAudioAsset> {
  if (!asset.audioDataUrl || !asset.audioDataUrl.startsWith("data:")) {
    return stripStudentAudioPlaybackUrl({ ...asset, activityType });
  }

  const blob = await dataUrlToBlob(asset.audioDataUrl);
  const mimeType = storageContentType(blob.type || asset.mimeType || "audio/webm");
  const maxBytes = 25 * 1024 * 1024;

  if (blob.size > maxBytes) {
    throw new Error("Audio recording is too large.");
  }

  if (!auth.currentUser || !uid) throw new Error("Sign in to upload audio");
  const saved = await uploadPrivateSpaceFile({ spaceId, activityId: assignmentId, submissionId,
    purpose: activityType === "podcast" ? "podcast" : "audio_reading", ...(assetId ? { segmentId: assetId } : {}) }, new Blob([blob], { type: mimeType }));

  return {
    version: 1,
    activityType,
    storagePath: saved.storagePath,
    mimeType,
    durationSeconds: asset.durationSeconds,
    sizeBytes: blob.size,
    recordedAt: asset.recordedAt,
    uploadedAt: Date.now(),
    visibility: "teacher",
    retentionPolicy: "review_plus_30_days",
  };
}

export async function deleteStudentAudioAsset(
  asset: StudentAudioAsset | null
): Promise<void> {
  if (!asset?.storagePath) return;
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to delete student audio");
  const id = privateSpaceFileId(asset.storagePath);
  const response = await fetch(id ? privateSpaceFileUrl(id) : "/api/teacher/audio-url", { method: id ? "DELETE" : "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath: asset.storagePath, mode: "delete" }),
  });
  if (!response.ok) throw new Error("Could not delete student audio");
}
