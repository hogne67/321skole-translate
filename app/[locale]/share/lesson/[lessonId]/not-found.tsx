// app/[locale]/share/lesson/[lessonId]/not-found.tsx
import Link from "next/link";

export default async function ShareLessonNotFound({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: 20,
          background: "white",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Lesson not found</h1>
        <p style={{ opacity: 0.8 }}>
          This lesson is not available anymore, or the link is incorrect.
        </p>
        <Link href={`/${locale}/321lessons`} style={{ fontWeight: 800 }}>
          Go to library
        </Link>
      </div>
    </main>
  );
}