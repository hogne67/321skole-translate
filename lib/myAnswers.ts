// lib/myAnswers.ts
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  type DocumentData,
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

function safeTasksArray(tasks: unknown): unknown[] {
  if (Array.isArray(tasks)) return tasks;

  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

export async function getMyLessonSummaries(uid: string): Promise<MyLessonSummary[]> {
  // Firebase kan være null under build / server
  if (!db) return [];
  const dbx = db; // låser non-null for callbacks

  // 1) hent mine submissions
  const subsQ = query(collection(dbx, "submissions"), where("uid", "==", uid));
  const subsSnap = await getDocs(subsQ);

  const subs: Submission[] = subsSnap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return data as Submission; // MVP: formen matcher
  });

  // unike publishedLessonIds
  const ids = Array.from(
    new Set(subs.map((s) => s.publishedLessonId).filter(Boolean))
  );

  if (ids.length === 0) return [];

  // 2) hent published_lessons + taskCount
  const summaries = await Promise.all(
    ids.map(async (publishedLessonId) => {
      const lessonSnap = await getDoc(
        doc(dbx, "published_lessons", publishedLessonId)
      );
      if (!lessonSnap.exists()) return null;

      const data = lessonSnap.data() as Lesson;

      const title = (data.title ?? "Lesson").toString();

      const tasksUnknown =
        (data as unknown as Record<string, unknown>).tasks;

      const tasks = safeTasksArray(tasksUnknown);
      const taskCount = tasks.length;

      // finn submission med flest svar (enkelt MVP)
      const forLesson = subs.filter(
        (s) => s.publishedLessonId === publishedLessonId
      );

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

  return summaries.filter(
    (x): x is MyLessonSummary => x !== null
  );
}
