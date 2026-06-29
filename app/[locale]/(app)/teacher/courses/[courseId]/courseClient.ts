"use client";

import type { User } from "firebase/auth";
import { normalizeCourse, type Course } from "@/lib/courses/types";

export async function fetchTeacherCourse(user: User, courseId: string): Promise<Course> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/teacher/courses/${encodeURIComponent(courseId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    course?: Record<string, unknown> & { id?: string };
    error?: string;
  };

  if (!res.ok || !data.course) {
    throw new Error(data.error || "Could not load course");
  }

  return normalizeCourse(typeof data.course.id === "string" ? data.course.id : courseId, data.course);
}
