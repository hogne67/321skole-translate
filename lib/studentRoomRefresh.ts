"use client";

import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function refreshSchoolStudentRooms(user: User, signal: AbortSignal) {
  const token = await user.getIdToken();
  if (signal.aborted || auth.currentUser !== user) return;
  await fetch("/api/spaces/join", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ refreshRooms: true }),
    signal,
  });
}

export function onStudentRoomReturn(refresh: () => void) {
  const onVisible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
