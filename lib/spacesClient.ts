// lib/spacesClient.ts
"use client";

import { auth, db } from "@/lib/firebase";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export type SpaceDoc = {
  // Both explicit owner fields must agree; single-field legacy rooms remain readable.
  ownerUid?: string;
  joinCode?: string;

  // ✅ Legacy/back-compat (finnes i eldre data + noen steder i UI)
  ownerId: string;
  code: string;

  title: string;
  isOpen: boolean;
  allowRoomCodeOnly?: boolean;

  // ✅ Useful metadata
  createdBy?: string;
  schoolId?: string | null;

  // ✅ Active lesson (for "student sees automatically")
  activeLessonId?: string | null;
  activeLessonTitle?: string | null;
  activeLessonUpdatedAt?: unknown;

  // Active parent-controlled goal for child mode
  activeGoalId?: string | null;
  activeGoalTitle?: string | null;

  createdAt: unknown;
  updatedAt: unknown;
};

function requireDb() {
  if (!db) {
    throw new Error(
      "Firestore is not initialized (db is null). Check NEXT_PUBLIC_FIREBASE_* env."
    );
  }
  return db;
}

export async function createSpaceForTeacher(params: {
  ownerId: string;
  // (optional) hvis du vil sende inn ownerUid fra UI etter hvert
  ownerUid?: string;
  title: string;
  isOpen?: boolean;
  schoolId?: string | null;
}) {
  const { ownerId, ownerUid, title, isOpen = true, schoolId = null } = params;

  const user = auth.currentUser;
  if (!user || getSpaceOwnerUid({ ownerId, ...(ownerUid === undefined ? {} : { ownerUid }) }) !== user.uid) throw new Error("Unauthorized");
  const response = await fetch("/api/teacher/spaces/create", {
    method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, isOpen, schoolId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not create Space");
  return result as { spaceId: string; code: string };
}
export async function setSpaceOpen(spaceId: string, isOpen: boolean) {
  const dbx = requireDb();

  await updateDoc(doc(dbx, "spaces", spaceId), {
    isOpen,
    updatedAt: serverTimestamp(),
  });
}
