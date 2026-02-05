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
  ownerId: string;
  title: string;
  code: string;
  isOpen: boolean;
  createdAt: unknown; // ✅ was any
  updatedAt: unknown; // ✅ was any
};

function requireDb() {
  if (!db) throw new Error("Firestore is not initialized (db is null). Check NEXT_PUBLIC_FIREBASE_* env.");
  return db;
}

export async function createSpaceForTeacher(params: {
  ownerId: string;
  title: string;
  isOpen?: boolean;
}) {
  const { ownerId, title, isOpen = true } = params;

  const dbx = requireDb();

  // Vi prøver noen ganger å finne en unik kode (godt nok for MVP).
  // (Hvis du vil 100% unik: lag egen collection spaceCodes/{code} og "reserve" først.)
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSpaceCode();
    const q = query(collection(dbx, "spaces"), where("code", "==", code), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) continue;

    const ref = await addDoc(collection(dbx, "spaces"), {
      ownerId,
      title,
      code,
      isOpen,
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
  const q = query(collection(dbx, "spaces"), where("code", "==", code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  const data = d.data() as DocumentData;

  return { spaceId: d.id, space: data as SpaceDoc };
}

export async function setSpaceOpen(spaceId: string, isOpen: boolean) {
  const dbx = requireDb();

  await updateDoc(doc(dbx, "spaces", spaceId), {
    isOpen,
    updatedAt: serverTimestamp(),
  });
}
