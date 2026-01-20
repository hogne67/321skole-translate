// lib/types.ts

export type Lesson = {
  title?: string;
  level?: string;
  topic?: string;
  sourceText?: string;
  tasks?: any; // array eller JSON-string
  language?: string;

  // published_lessons
  isActive?: boolean;
};

export type Submission = {
  uid: string;
  publishedLessonId: string;
  answers?: Record<string, any>;
  status?: "draft" | "submitted";

  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;

  createdAt?: any;
  updatedAt?: any;

  feedback?: string;
};
