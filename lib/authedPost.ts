// lib/authedPost.ts
"use client";

import { getAuth } from "firebase/auth";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function authedPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const msg = isRecord(data) && typeof data.error === "string" ? data.error : raw || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
