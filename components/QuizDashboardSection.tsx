"use client";

import Link from "next/link";

type QuizDashboardSectionProps = {
  locale: string;
};

const copy = {
  nb: {
    eyebrow: "321quiz",
    title: "Lag og bruk quiz",
    text: "Lag quiz med AI, finn publiserte quizer i biblioteket, og bruk dem på tavla eller som egen quiz med kode.",
    create: "Lag quiz",
    library: "Bibliotek",
  },
  en: {
    eyebrow: "321quiz",
    title: "Create and use quizzes",
    text: "Create quizzes with AI, find published quizzes in the library, and use them on the board or as a standalone quiz with a code.",
    create: "Create quiz",
    library: "Library",
  },
  pt: {
    eyebrow: "321quiz",
    title: "Criar e usar quizzes",
    text: "Crie quizzes com IA, encontre quizzes publicados na biblioteca e use-os no quadro ou como quiz com codigo.",
    create: "Criar quiz",
    library: "Biblioteca",
  },
};

function getCopy(locale: string) {
  if (locale.startsWith("en")) return copy.en;
  if (locale.startsWith("pt")) return copy.pt;
  return copy.nb;
}

export function QuizDashboardSection({ locale }: QuizDashboardSectionProps) {
  const c = getCopy(locale);

  return (
    <section
      style={{
        marginTop: 22,
        border: "1px solid rgba(124,58,237,0.22)",
        borderRadius: 22,
        background: "linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "22px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 420px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#6d28d9",
              marginBottom: 7,
            }}
          >
            {c.eyebrow}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.15,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: 0,
            }}
          >
            {c.title}
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              maxWidth: 720,
              fontSize: 14,
              lineHeight: 1.5,
              color: "#475569",
            }}
          >
            {c.text}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/${locale}/tools/quiz`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 42,
              borderRadius: 12,
              padding: "10px 16px",
              background: "#6d28d9",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 900,
              textDecoration: "none",
              boxShadow: "0 1px 2px rgba(15,23,42,0.12)",
            }}
          >
            {c.create}
          </Link>

          <Link
            href={`/${locale}/321quiz`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 42,
              borderRadius: 12,
              padding: "10px 16px",
              background: "#ffffff",
              color: "#0f172a",
              border: "1px solid #c4b5fd",
              fontSize: 14,
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            {c.library}
          </Link>
        </div>
      </div>
    </section>
  );
}
