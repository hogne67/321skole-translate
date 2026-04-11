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

function isLikelyMathLesson(title?: string, topics?: string[], description?: string) {
  const haystack = `${title ?? ""} ${description ?? ""} ${(topics ?? []).join(" ")}`.toLowerCase();

  return [
    "math",
    "matte",
    "matematikk",
    "geometry",
    "geometri",
    "area",
    "areal",
    "perimeter",
    "omkrets",
    "fraction",
    "brøk",
    "algebra",
    "tall",
    "numbers",
    "måling",
    "measurement",
  ].some((word) => haystack.includes(word));
}

function inferMathHighlights(topics: string[], title?: string, description?: string) {
  const haystack = `${title ?? ""} ${description ?? ""} ${topics.join(" ")}`.toLowerCase();
  const highlights: string[] = [];

  if (
    haystack.includes("geometry") ||
    haystack.includes("geometri") ||
    haystack.includes("shape") ||
    haystack.includes("figur")
  ) {
    highlights.push("Geometry");
  }

  if (haystack.includes("area") || haystack.includes("areal")) {
    highlights.push("Area");
  }

  if (haystack.includes("perimeter") || haystack.includes("omkrets")) {
    highlights.push("Perimeter");
  }

  if (haystack.includes("fraction") || haystack.includes("brøk")) {
    highlights.push("Fractions");
  }

  if (haystack.includes("algebra")) {
    highlights.push("Algebra");
  }

  if (highlights.length === 0) {
    highlights.push(...topics.slice(0, 3));
  }

  return highlights.slice(0, 4);
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
  const libraryHref = `/${locale}/321lessons`;

  const isMath = isLikelyMathLesson(lesson.title, topics, lesson.description);
  const mathHighlights = inferMathHighlights(topics, lesson.title, lesson.description);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, rgba(247,248,250,1) 0%, rgba(255,255,255,1) 280px)",
        padding: "28px 20px 48px",
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.88)",
              border: "1px solid rgba(0,0,0,0.08)",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.2,
            }}
          >
            321skole
          </span>

          <span
            style={{
              fontSize: 13,
              color: "rgba(0,0,0,0.6)",
              fontWeight: 600,
            }}
          >
            Shared lesson preview
          </span>
        </div>

        <section
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 28,
            overflow: "hidden",
            background: "white",
            boxShadow: "0 18px 50px rgba(0,0,0,0.07)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 0.85fr",
            }}
          >
            <div
              style={{
                minHeight: 420,
                background: image
                  ? "rgba(0,0,0,0.04)"
                  : isMath
                  ? "linear-gradient(135deg, rgba(244,250,255,1) 0%, rgba(255,255,255,1) 100%)"
                  : "linear-gradient(135deg, rgba(248,248,248,1) 0%, rgba(255,255,255,1) 100%)",
                display: "flex",
                alignItems: "stretch",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={lesson.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : isMath ? (
                <MathPreviewCard />
              ) : (
                <FallbackPreview />
              )}
            </div>

            <div
              style={{
                padding: 28,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 20,
                borderLeft: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 16,
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
                    fontSize: 36,
                    lineHeight: 1.06,
                    fontWeight: 900,
                    letterSpacing: -0.6,
                  }}
                >
                  {lesson.title}
                </h1>

                {lesson.description ? (
                  <p
                    style={{
                      marginTop: 16,
                      marginBottom: 0,
                      fontSize: 16,
                      lineHeight: 1.65,
                      color: "rgba(0,0,0,0.76)",
                    }}
                  >
                    {lesson.description}
                  </p>
                ) : (
                  <p
                    style={{
                      marginTop: 16,
                      marginBottom: 0,
                      fontSize: 16,
                      lineHeight: 1.65,
                      color: "rgba(0,0,0,0.62)",
                    }}
                  >
                    Ready to open in 321skole.
                  </p>
                )}

                {isMath ? (
                  <div
                    style={{
                      marginTop: 20,
                      padding: 16,
                      borderRadius: 18,
                      background: "rgba(244,248,255,1)",
                      border: "1px solid rgba(46,91,255,0.10)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "rgba(0,0,0,0.58)",
                        marginBottom: 10,
                      }}
                    >
                      Highlights
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {mathHighlights.map((item) => (
                        <Highlight key={item}>{item}</Highlight>
                      ))}
                      <Highlight>Ready to use</Highlight>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <Link href={openHref} style={primaryBtn}>
                    Open lesson
                  </Link>

                  <Link href={startHref} style={secondaryBtn}>
                    Start task
                  </Link>

                  <Link href={libraryHref} style={ghostBtn}>
                    Open library
                  </Link>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "rgba(0,0,0,0.58)",
                  }}
                >
                  Created with <strong>321skole</strong> – lessons, tasks and AI feedback in one place.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
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
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 999,
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function FallbackPreview() {
  return (
    <div
      style={{
        width: "100%",
        minHeight: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 24,
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          padding: 28,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            color: "rgba(0,0,0,0.52)",
          }}
        >
          321skole
        </div>

        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            lineHeight: 1.1,
            fontWeight: 900,
          }}
        >
          Shared lesson
        </div>

        <p
          style={{
            marginTop: 14,
            marginBottom: 0,
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(0,0,0,0.64)",
          }}
        >
          Open the lesson in 321skole to view content, tasks and learning activities.
        </p>
      </div>
    </div>
  );
}

function MathPreviewCard() {
  return (
    <div
      style={{
        width: "100%",
        minHeight: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 24,
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 12px 34px rgba(0,0,0,0.07)",
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "rgba(0,0,0,0.5)",
              }}
            >
              Math worksheet
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 1.1,
              }}
            >
              Area &amp; Perimeter
            </div>
          </div>

          <span
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(190,247,192,1)",
              border: "1px solid rgba(0,0,0,0.08)",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            Ready to use
          </span>
        </div>

        <div
          style={{
            position: "relative",
            height: 220,
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "linear-gradient(180deg, rgba(250,250,252,1) 0%, rgba(255,255,255,1) 100%)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 24,
              top: 30,
              width: 110,
              height: 78,
              border: "2px solid rgba(0,0,0,0.7)",
              borderRadius: 8,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 58,
              top: 114,
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            8 cm
          </div>

          <div
            style={{
              position: "absolute",
              right: 38,
              top: 38,
              width: 0,
              height: 0,
              borderLeft: "48px solid transparent",
              borderRight: "48px solid transparent",
              borderBottom: "82px solid rgba(226,232,240,1)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 62,
              top: 126,
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            6 cm
          </div>

          <div
            style={{
              position: "absolute",
              left: 28,
              bottom: 22,
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "2px solid rgba(0,0,0,0.7)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 118,
              bottom: 56,
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            r = 4 cm
          </div>

          <div
            style={{
              position: "absolute",
              right: 34,
              bottom: 28,
              width: 120,
              height: 76,
              transform: "skewX(-18deg)",
              border: "2px solid rgba(0,0,0,0.7)",
              borderRadius: 6,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 64,
              bottom: 12,
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(0,0,0,0.55)",
            }}
          >
            10 cm
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <MiniTag>Geometry</MiniTag>
          <MiniTag>Area</MiniTag>
          <MiniTag>Perimeter</MiniTag>
          <MiniTag>Print or solve online</MiniTag>
        </div>
      </div>
    </div>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 10px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.045)",
        border: "1px solid rgba(0,0,0,0.06)",
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
  padding: "14px 18px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(190,247,192,1)",
  color: "black",
  minHeight: 52,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 18px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(234,243,182,1)",
  color: "black",
  minHeight: 52,
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 18px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "white",
  color: "black",
  minHeight: 52,
};