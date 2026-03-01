// lib/spacesClient.ts
"use client";

import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { generateSpaceCode, normalizeSpaceCode } from "@/lib/spaceCode";

export type SpaceDoc = {
  // ✅ Standardiser: bruk ownerUid/joinCode fremover
  ownerUid?: string;
  joinCode?: string;

  // ✅ Legacy/back-compat (finnes i eldre data + noen steder i UI)
  ownerId: string;
  code: string;

  title: string;
  isOpen: boolean;

  // ✅ Useful metadata
  createdBy?: string;

  // ✅ Active lesson (for "student sees automatically")
  activeLessonId?: string | null;
  activeLessonTitle?: string | null;
  activeLessonUpdatedAt?: unknown;

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
}) {
  const { ownerId, ownerUid, title, isOpen = true } = params;

  const dbx = requireDb();

  const uid = ownerUid || ownerId;

  // MVP: try a few times to get a unique code
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSpaceCode();

    // sjekk både legacy-felt og nytt felt for sikkerhet
    const q1 = query(collection(dbx, "spaces"), where("code", "==", code), limit(1));
    const s1 = await getDocs(q1);
    if (!s1.empty) continue;

    const q2 = query(collection(dbx, "spaces"), where("joinCode", "==", code), limit(1));
    const s2 = await getDocs(q2);
    if (!s2.empty) continue;

    const ref = await addDoc(collection(dbx, "spaces"), {
      // ✅ NYTT (standard)
      ownerUid: uid,
      joinCode: code,
      createdBy: uid,

      // ✅ Legacy/back-compat
      ownerId: uid,
      code,

      title,
      isOpen,

      // Default: no active lesson yet
      activeLessonId: null,
      activeLessonTitle: null,
      activeLessonUpdatedAt: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies SpaceDoc);

    return { spaceId: ref.id, code };
  }

  throw new Error("Kunne ikke generere unik kode. Prøv igjen.");
}

export async function findSpaceByCode(codeInput: string) {
  const dbx = requireDb();

  const code = normalizeSpaceCode(codeInput);

  // 1) legacy: code
  const q1 = query(collection(dbx, "spaces"), where("code", "==", code), limit(1));
  const s1 = await getDocs(q1);
  if (!s1.empty) {
    const d = s1.docs[0];
    const data = d.data() as DocumentData;
    return { spaceId: d.id, space: data as SpaceDoc };
  }

  // 2) new: joinCode
  const q2 = query(collection(dbx, "spaces"), where("joinCode", "==", code), limit(1));
  const s2 = await getDocs(q2);
  if (!s2.empty) {
    const d = s2.docs[0];
    const data = d.data() as DocumentData;
    return { spaceId: d.id, space: data as SpaceDoc };
  }

  return null;
}

export async function setSpaceOpen(spaceId: string, isOpen: boolean) {
  const dbx = requireDb();

  await updateDoc(doc(dbx, "spaces", spaceId), {
    isOpen,
    updatedAt: serverTimestamp(),
  });
}