import type { Course } from "./types";

export function isPublicCourse(course: Pick<Course, "status">): boolean {
  return course.status === "published" || course.status === "active";
}

// Build links for the current site and language, rather than a saved preview/localhost URL.
export function coursePublicLink(
  course: Pick<Course, "status" | "slug">,
  locale: string,
  origin: string
): string {
  if (!isPublicCourse(course) || !course.slug || !origin) return "";
  return `${origin}/${encodeURIComponent(locale)}/courses/${encodeURIComponent(course.slug)}`;
}
