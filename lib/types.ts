// lib/types.ts

export type Lesson = {
  title?: string;
  level?: string;
  topic?: string;
  sourceText?: string;

  // kan være array (runtime) eller JSON-string (lagret)
  tasks?: unknown[] | string;

  language?: string;

  // published_lessons
  isActive?: boolean;
};

export type Submission = {
  uid: string;
  publishedLessonId: string;

  // svarstruktur er fri (taskId -> svar)
  answers?: Record<string, unknown>;

  status?: "draft" | "submitted";

  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;

  createdAt?: unknown;
  updatedAt?: unknown;

  feedback?: string;
};
