// app/[locale]/share/lesson/[lessonId]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  const url = `${getBaseUrl()}/${locale}/share/lesson/${lessonId}`;

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
  const lesson = await getPublishedLessonByEitherIdOrField(lessonId);

  if (!lesson) notFound();

  const image = pickPublishedLessonImage(lesson);
  const topics = getPublishedLessonTopics(lesson);
  const openHref = `/${locale}/lesson/${lessonId}`;
  const startHref = `/${locale}/student/lesson/${lessonId}`;

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: 20,
      }}
    >
      <section
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 20,
          overflow: "hidden",
          background: "white",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 8",
            background: "rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={lesson.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ opacity: 0.6, fontWeight: 700 }}>321 Skole</div>
          )}
        </div>

        <div style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {lesson.level ? <Pill>{lesson.level}</Pill> : null}
            {lesson.language ? <Pill>{lesson.language.toUpperCase()}</Pill> : null}
            {topics.slice(0, 3).map((topic) => (
              <Pill key={topic}>{topic}</Pill>
            ))}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: 1.1,
              fontWeight: 900,
            }}
          >
            {lesson.title}
          </h1>

          {lesson.description ? (
            <p
              style={{
                marginTop: 14,
                marginBottom: 0,
                fontSize: 16,
                lineHeight: 1.55,
                opacity: 0.85,
                maxWidth: 780,
              }}
            >
              {lesson.description}
            </p>
          ) : null}

          <div
            style={{
              marginTop: 20,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <Link href={openHref} style={primaryBtn}>
              Open lesson
            </Link>

            <Link href={startHref} style={secondaryBtn}>
              Start task
            </Link>

            <Link href={`/${locale}/321lessons`} style={ghostBtn}>
              Open library
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(0,0,0,0.04)",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "rgba(190,247,192,1)",
  color: "black",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "rgba(234,243,182,1)",
  color: "black",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "white",
  color: "black",
};