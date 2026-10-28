export const SPACE_FILE_CHUNK_BYTES = 1024 * 1024;
export const SPACE_FILE_UPLOAD_LIFETIME_MS = 15 * 60 * 1000;
export type SpaceFilePurpose = "audio_reading" | "podcast" | "writing_image" | "board_image";
export type SpaceFileScope = { spaceId: string; activityId: string; submissionId?: string; purpose: SpaceFilePurpose; segmentId?: string };
export type SpaceFileRecord = SpaceFileScope & { ownerUid: string; participantId: string; storagePath: string; uploadPath: string;
  contentType: string; size: number; createdAt: number; status: "pending" | "ready" | "deleted"; generation?: string;
  sourceGeneration?: string; sourceMetageneration?: string; crc32c?: string; md5Hash?: string;
  submissionCreatedAt?: string };
export function validSpaceFileId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,180}$/.test(value); }
export function privateSpaceFileUrl(id: string) { return `/api/space-files/${id}`; }
export function privateSpaceFileId(path: string) { return /^private-space-files\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)$/.exec(path)?.[1] ?? null; }
export function privateSpaceFileUrlId(url: string) { return /^\/api\/space-files\/([a-zA-Z0-9_-]+)$/.exec(url)?.[1] ?? null; }
export function fileRange(header: string | null, size: number) {
  const match = header ? /^bytes=(\d+)-(\d*)$/.exec(header) : null;
  if (header && !match) throw new Error("invalid_range");
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match?.[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || start < 0 || start >= size || !Number.isSafeInteger(requestedEnd) || requestedEnd < start) throw new Error("invalid_range");
  const end = Math.min(requestedEnd, size - 1, start + SPACE_FILE_CHUNK_BYTES - 1);
  return { start, end, partial: !!header || end < size - 1 };
}
