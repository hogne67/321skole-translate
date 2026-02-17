// lib/spacesActiveLesson.ts
import { doc, updateDoc, serverTimestamp, type Firestore } from "firebase/firestore";

export async function setActiveLessonForSpace(
  db: Firestore,
  spaceId: string,
  lessonId: string | null,
  lessonTitle?: string | null
) {
  const ref = doc(db, "spaces", spaceId);

  await updateDoc(ref, {
    activeLessonId: lessonId ?? null,
    activeLessonTitle: lessonTitle ?? null,
    activeLessonUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(), // ✅ keep space "fresh" in lists
  });
}