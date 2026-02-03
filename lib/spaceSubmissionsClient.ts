// lib/spaceSubmissionsClient.ts
"use client";

import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";

export type SpaceSubmission = {
  spaceId: string;
  lessonId: string;
  createdAt: any;

  answers: any;

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
    updatedAt?: any;
    teacherUid?: string;
  };
};

export async function submitToSpace(params: {
  spaceId: string;
  lessonId: string;
  answers: any;
  user: User | null;
}) {
  const { spaceId, lessonId, answers, user } = params;

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

  const sub: Omit<SpaceSubmission, "createdAt"> & { createdAt: any } = {
    spaceId,
    lessonId,
    createdAt: serverTimestamp(),
    answers,
    auth,
    status: "new",
    // ⚠️ Ikke legg teacherFeedback her (heller ikke null)
  };

  // ✅ Debug (midlertidig)
  const colRef = collection(db, "spaces", spaceId, "lessons", lessonId, "submissions");

  console.log("SUBMIT path =>", { spaceId, lessonId });
  console.log("SUBMIT firestore collection path =>", colRef.path);

  const safeJson = JSON.parse(JSON.stringify(sub));
  console.log("SUBMIT payload JSON =>", safeJson);

  console.log("SUBMIT payload keys =>", Object.keys(sub));
  console.log("SUBMIT payload.status =>", (sub as any).status);

  console.log(
    "SUBMIT has teacherFeedback key =>",
    Object.prototype.hasOwnProperty.call(sub, "teacherFeedback")
  );
  console.log("SUBMIT teacherFeedback =>", (sub as any).teacherFeedback);

  console.log("SUBMIT auth =>", sub.auth);

  try {
    const ref = await addDoc(colRef, sub);
    console.log("SUBMIT created =>", ref.id);
    return ref.id;
  } catch (e: any) {
    console.log("SUBMIT ERROR code =>", e?.code);
    console.log("SUBMIT ERROR message =>", e?.message);
    console.log("SUBMIT ERROR full =>", e);
    throw e;
  }
}
