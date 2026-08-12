import "server-only";

import type { Firestore } from "firebase-admin/firestore";

export type ImageSessionDoc = {
  ownerId?: string;
  code?: string;
  status?: "lobby" | "active" | "finished";
  prompt?: string;
  imageUrl?: string;
  timerSeconds?: number | null;
  endsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ImageSubmission = {
  text?: string;
  displayName?: string;
  participantId?: string;
  createdAt?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function safeImageUrl(value: unknown): string {
  const url = safeString(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function safeTimerSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const seconds = Math.trunc(Number(value));
  if (!Number.isFinite(seconds) || seconds < 5) return null;
  return Math.min(60 * 60, seconds);
}

export function makeImageCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function makeUniqueImageCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const code = makeImageCode();
    const snap = await db.collection("imageSessions").where("code", "==", code).limit(1).get();
    if (snap.empty) return code;
  }
  return makeImageCode();
}
