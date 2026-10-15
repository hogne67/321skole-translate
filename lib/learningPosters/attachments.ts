import { normalizedText, POSTER_PURPOSES, type PosterPurpose } from "./model";

export type PosterAttachment = { posterId: string; title: string; imageUrl: string; sourceHash: string; planHash: string; purpose: PosterPurpose };
export const sourceFingerprintPayload = (text: string) => JSON.stringify(normalizedText(text));
export function readPosterAttachments(value: unknown): PosterAttachment[] {
  if (!Array.isArray(value)) return [];
  const result: PosterAttachment[] = [];
  for (const item of value.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.posterId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(p.posterId) || result.some(old => old.posterId === p.posterId)
      || typeof p.title !== "string" || !p.title.trim() || p.title.length > 120
      || typeof p.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(p.sourceHash)
      || typeof p.planHash !== "string" || !/^[a-f0-9]{64}$/.test(p.planHash)
      || !POSTER_PURPOSES.includes(p.purpose as PosterPurpose) || typeof p.imageUrl !== "string") continue;
    try {
      const url = new URL(p.imageUrl);
      const asset = decodeURIComponent(url.pathname.split("/o/")[1] || "");
      if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" || !asset.startsWith("learning-posters/")
        || !asset.includes("/attachments/") || url.searchParams.get("alt") !== "media" || !url.searchParams.get("token")) continue;
    } catch { continue; }
    result.push({ posterId: p.posterId, title: p.title.trim(), imageUrl: p.imageUrl, sourceHash: p.sourceHash, planHash: p.planHash, purpose: p.purpose as PosterPurpose });
  }
  return result;
}
export async function browserSourceFingerprint(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceFingerprintPayload(text)));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
