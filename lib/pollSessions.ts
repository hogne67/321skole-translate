import "server-only";

import type { Firestore } from "firebase-admin/firestore";

export type PollSessionDoc = {
  ownerId?: string;
  code?: string;
  status?: "ready" | "active" | "finished";
  question?: string;
  options?: string[];
  timerSeconds?: number | null;
  endsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PollVote = {
  choice?: string;
  participantId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizePollOptions(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/)
      : [];
  const seen = new Set<string>();
  const options: string[] = [];

  for (const item of raw) {
    const option = safeString(item).replace(/\s+/g, " ").trim().slice(0, 80);
    const key = option.toLocaleLowerCase("nb");
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }

  return options.slice(0, 8);
}

export function safeTimerSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const seconds = Math.trunc(Number(value));
  if (!Number.isFinite(seconds) || seconds < 5) return null;
  return Math.min(60 * 60, seconds);
}

export function makePollCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function makeUniquePollCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const code = makePollCode();
    const snap = await db.collection("pollSessions").where("code", "==", code).limit(1).get();
    if (snap.empty) return code;
  }
  return makePollCode();
}
