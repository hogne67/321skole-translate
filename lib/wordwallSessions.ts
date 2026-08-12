import "server-only";

import type { Firestore } from "firebase-admin/firestore";

export type WordwallMotion = "calm" | "alive" | "energy";

export type WordwallSessionDoc = {
  ownerId?: string;
  code?: string;
  status?: "active" | "finished";
  prompt?: string;
  motion?: WordwallMotion;
  timerSeconds?: number | null;
  endsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function safeTimerSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const seconds = Math.trunc(Number(value));
  if (!Number.isFinite(seconds) || seconds < 5) return null;
  return Math.min(60 * 60, seconds);
}

export type WordwallSubmission = {
  word?: string;
  normalized?: string;
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

export function normalizeWord(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 42);
}

export function wordKey(value: string): string {
  return normalizeWord(value).toLocaleLowerCase("nb").replace(/[^\p{L}\p{N}\s-]/gu, "");
}

export function safeMotion(value: unknown): WordwallMotion {
  if (value === "calm" || value === "alive" || value === "energy") return value;
  return "alive";
}

export function makeWordwallCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function makeUniqueWordwallCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const code = makeWordwallCode();
    const snap = await db.collection("wordwallSessions").where("code", "==", code).limit(1).get();
    if (snap.empty) return code;
  }
  return makeWordwallCode();
}
