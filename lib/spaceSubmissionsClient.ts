// lib/spaceSubmissionsClient.ts
"use client";

import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";

// Bruk "unknown" for frie JSON-strukturer
export type AnswersPayload = Record<string, unknown>;

export type SpaceSubmission = {
  spaceId: string;
  lessonId: string;

  // Firestore serverTimestamp() blir en FieldValue, men ved lesing kan det være Timestamp.
  // Vi bruker unknown i selve dokumenttypen for å unngå "any".
  createdAt: unknown;

  answers: AnswersPayload;

  auth: {
    // "anon" betyr: enten helt uinnlogget (user=null) ELLER Firebase anonymous auth (user.isAnonymous)
    isAnon: boolean;
    uid?: string | null;
    displayName?: string | null;
    email?: string | null;
  };

  status: "new" | "reviewed" | "needs_work";
  teacherFeedback?: {
    text?: string;
    updatedAt?: unknown;
    teacherUid?: string;
  };
};

function getErrorInfo(err: unknown): { code?: string; message?: string } {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : undefined;
    const message = typeof o.message === "string" ? o.message : undefined;
    return { code, message };
  }
  if (typeof err === "string") return { message: err };
  return {};
}

export async function submitToSpace(params: {
  spaceId: string;
  lessonId: string;
  answers: AnswersPayload;
  user: User | null;
}) {
  const { spaceId, lessonId, answers, user } = params;

  if (!db) {
    throw new Error("Firestore is not initialized (db is null). Check NEXT_PUBLIC_FIREBASE_* env.");
  }
  const dbx = db;

  const isAnon = !user || user.isAnonymous === true;

  // ✅ Viktig: “helt uinnlogget” gjest skal sende minst mulig:
  // auth = { isAnon: true }  (ingen uid-felt i det hele tatt)
  // Firebase anonymous auth: auth = { isAnon:true, uid:<uid> }
  // Vanlig innlogget: auth = { isAnon:false, uid:<uid>, ... }
  const auth: SpaceSubmission["auth"] = !user
    ? { isAnon: true }
    : isAnon
      ? { isAnon: true, uid: user.uid }
      : {
          isAnon: false,
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null,
        };

  const sub: Omit<SpaceSubmission, "createdAt"> & { createdAt: unknown } = {
    spaceId,
    lessonId,
    createdAt: serverTimestamp(),
    answers,
    auth,
    status: "new",
    // ⚠️ Ikke legg teacherFeedback her (heller ikke null)
  };

  const colRef = collection(dbx, "spaces", spaceId, "lessons", lessonId, "submissions");

  // ✅ Debug (midlertidig)
  console.log("SUBMIT path =>", { spaceId, lessonId });
  console.log("SUBMIT firestore collection path =>", colRef.path);

  const safeJson = JSON.parse(JSON.stringify(sub)) as Record<string, unknown>;
  console.log("SUBMIT payload JSON =>", safeJson);

  console.log("SUBMIT payload keys =>", Object.keys(sub));
  console.log("SUBMIT payload.status =>", sub.status);

  console.log(
    "SUBMIT has teacherFeedback key =>",
    Object.prototype.hasOwnProperty.call(sub, "teacherFeedback")
  );
  console.log("SUBMIT teacherFeedback =>", (sub as Record<string, unknown>).teacherFeedback);

  console.log("SUBMIT auth =>", sub.auth);

  try {
    const ref = await addDoc(colRef, sub);
    console.log("SUBMIT created =>", ref.id);
    return ref.id;
  } catch (e: unknown) {
    const info = getErrorInfo(e);
    console.log("SUBMIT ERROR code =>", info.code);
    console.log("SUBMIT ERROR message =>", info.message);
    console.log("SUBMIT ERROR full =>", e);
    throw e;
  }
}
