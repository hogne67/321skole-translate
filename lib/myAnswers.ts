// lib/myAnswers.ts
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lesson, Submission } from "@/lib/types";

export type MyLessonSummary = {
  publishedLessonId: string;
  title: string;
  answeredCount: number;
  taskCount: number;
  completed: boolean;
};

function safeTasksArray(tasks: any): any[] {
  if (Array.isArray(tasks)) return tasks;
  if (typeof tasks === "string") {
    try {
      const parsed = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getMyLessonSummaries(uid: string): Promise<MyLessonSummary[]> {
  // 1) hent mine submissions
  const subsQ = query(collection(db, "submissions"), where("uid", "==", uid));
  const subsSnap = await getDocs(subsQ);

  const subs: Submission[] = subsSnap.docs.map((d) => ({
    ...(d.data() as any),
  }));

  // unike lessonIds
  const ids = Array.from(
    new Set(subs.map((s) => s.publishedLessonId).filter(Boolean))
  );

  if (ids.length === 0) return [];

  // 2) hent published_lessons metadata + taskCount
  const summaries = await Promise.all(
    ids.map(async (publishedLessonId) => {
      const lessonSnap = await getDoc(doc(db, "published_lessons", publishedLessonId));
      if (!lessonSnap.exists()) return null;

      const data = lessonSnap.data() as Lesson;

      const title = (data.title ?? "Lesson").toString();
      const tasks = safeTasksArray((data as any).tasks);
      const taskCount = tasks.length;

      // finn submission for denne lesson (ta den med flest svar, enkelt MVP)
      const forLesson = subs.filter((s) => s.publishedLessonId === publishedLessonId);
      const best = forLesson.sort((a, b) => {
        const ca = Object.keys(a.answers ?? {}).length;
        const cb = Object.keys(b.answers ?? {}).length;
        return cb - ca;
      })[0];

      const answeredCount = Object.keys(best?.answers ?? {}).length;
      const completed = taskCount > 0 && answeredCount >= taskCount;

      const out: MyLessonSummary = {
        publishedLessonId,
        title,
        answeredCount,
        taskCount,
        completed,
      };

      return out;
    })
  );

  return summaries.filter(Boolean) as MyLessonSummary[];
}
