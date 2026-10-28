export function parseLegacySpaceImagePath(value: unknown): { path: string; spaceId: string; pupilId: string | null; activityId: string | null } | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.includes("\\") || [...part].some(character => character.charCodeAt(0) < 32))) return null;
  if (parts[0] === "writing-print-images" && parts.length === 5) return { path: value, pupilId: parts[1], spaceId: parts[2], activityId: parts[3] };
  if (parts[0] === "board-images" && parts.length === 4) return { path: value, pupilId: null, spaceId: parts[2], activityId: null };
  return null;
}
export function legacySpaceImageProxyUrl(source: unknown, bucket: string): string | null {
  if (typeof source !== "string" || !bucket) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" || url.username || url.password || url.port) return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || decodeURIComponent(match[1]) !== bucket) return null;
    const parsed = parseLegacySpaceImagePath(decodeURIComponent(match[2]));
    return parsed ? `/api/space-files/legacy-image?path=${encodeURIComponent(parsed.path)}` : null;
  } catch { return null; }
}
