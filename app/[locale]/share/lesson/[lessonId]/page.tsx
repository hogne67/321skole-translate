// app/[locale]/share/lesson/[lessonId]/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getPublishedLessonByEitherIdOrField,
  getPublishedLessonTopics,
  pickPublishedLessonImage,
} from "@/lib/publishedLessons.server";

type PageProps = {
  params: Promise<{
    locale: string;
    lessonId: string;
  }>;
};

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.321skole.no"
  );
}

function buildDescription(
  title: string,
  description?: string,
  level?: string,
  language?: string,
  topics?: string[]
) {
  if (description?.trim()) return description.trim();

  const bits = [level, language?.toUpperCase(), ...(topics ?? []).slice(0, 3)].filter(Boolean);
  if (bits.length) return `${title} · ${bits.join(" · ")}`;

  return title;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, lessonId } = await params;
  const lesson = await getPublishedLessonByEitherIdOrField(lessonId);

  if (!lesson) {
    return {
      title: "Lesson not found",
      description: "This lesson is not available.",
    };
  }

  const image = pickPublishedLessonImage(lesson);
  const topics = getPublishedLessonTopics(lesson);
  const title = lesson.title || "Untitled";
  const description = buildDescription(title, lesson.description, lesson.level, lesson.language, topics);
  const url = `${getBaseUrl()}/${locale}/student/lesson/${lessonId}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images: image ? [{ url: image, alt: title }] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function ShareLessonPage({ params }: PageProps) {
  const { locale, lessonId } = await params;
  redirect(`/${locale}/student/lesson/${lessonId}`);
}
