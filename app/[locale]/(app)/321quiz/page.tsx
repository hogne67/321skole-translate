import Link from "next/link";
import { getAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ q?: string }>;
};

type QuizCard = {
  id: string;
  title: string;
  description: string;
  level: string;
  language: string;
  author: string;
  imageUrl: string;
  questionCount: number;
  publishedAt: Date | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asDate(v: unknown): Date | null {
  if (isRecord(v) && typeof v.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d : null;
  }
  if (isRecord(v) && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
}

function questionCountFrom(raw: Record<string, unknown>): number {
  const quiz = isRecord(raw.quiz) ? raw.quiz : {};
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (questions.length) return questions.length;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return tasks.length;
}

function coerceQuiz(id: string, raw: unknown): QuizCard | null {
  const data = isRecord(raw) ? raw : {};
  const visibility = asString(data.publishVisibility || data.visibility, "public").toLowerCase();
  const lessonType = asString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const isQuiz = lessonType === "quiz" || Array.isArray(isRecord(data.quiz) ? data.quiz.questions : undefined);

  if (!isQuiz) return null;
  if (data.isActive === false) return null;
  if (visibility !== "public") return null;

  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const signedBy = isRecord(data.signedBy) ? data.signedBy : {};

  return {
    id,
    title: asString(data.title || quiz.title, "Quiz uten tittel"),
    description: asString(data.description || quiz.description, ""),
    level: asString(data.level || quiz.level, ""),
    language: asString(data.language || quiz.language, ""),
    author: asString(data.producerName || signedBy.nameSnapshot, ""),
    imageUrl: asString(data.coverImageUrl || data.imageUrl, ""),
    questionCount: questionCountFrom(data),
    publishedAt: asDate(data.publishedAt),
  };
}

function formatDate(date: Date | null, locale: string): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export default async function QuizLibraryPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  const q = asString(sp?.q).toLowerCase();
  const { db } = getAdmin();

  const snap = await db
    .collection("published_lessons")
    .where("lessonType", "==", "quiz")
    .where("isActive", "==", true)
    .limit(80)
    .get();

  let quizzes = snap.docs
    .map((doc) => coerceQuiz(doc.id, doc.data()))
    .filter((quiz): quiz is QuizCard => Boolean(quiz));

  if (q) {
    quizzes = quizzes.filter((quiz) =>
      [quiz.title, quiz.description, quiz.level, quiz.language, quiz.author].join(" ").toLowerCase().includes(q)
    );
  }

  quizzes.sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border border-violet-100 bg-white p-8 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700">321quiz</p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">Quizbibliotek</h1>
              <p className="mt-3 max-w-2xl text-lg text-slate-600">
                Publiserte quizer som kan brukes videre i undervisning og på tavla.
              </p>
            </div>
            <Link
              href={`/${locale}/tools/quiz`}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-700 px-5 py-3 font-black text-white shadow-sm hover:bg-violet-800"
            >
              Lag ny quiz
            </Link>
          </div>
        </section>

        <form className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            name="q"
            defaultValue={sp?.q || ""}
            placeholder="Søk i 321quiz..."
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />
        </form>

        {quizzes.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => (
              <Link
                key={quiz.id}
                href={`/${locale}/321quiz/${quiz.id}`}
                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="aspect-video bg-slate-100">
                  {quiz.imageUrl ? (
                    <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-violet-50 text-sm font-black uppercase tracking-[0.18em] text-violet-500">
                      321quiz
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap gap-2 text-xs font-black text-slate-600">
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
                      {quiz.questionCount} spørsmål
                    </span>
                    {quiz.level ? <span className="rounded-full bg-slate-100 px-3 py-1">{quiz.level}</span> : null}
                    {quiz.language ? <span className="rounded-full bg-slate-100 px-3 py-1">{quiz.language}</span> : null}
                  </div>
                  <h2 className="text-2xl font-black tracking-tight group-hover:text-violet-700">{quiz.title}</h2>
                  {quiz.description ? <p className="line-clamp-3 text-sm text-slate-600">{quiz.description}</p> : null}
                  <div className="flex items-center justify-between gap-3 pt-2 text-xs font-bold text-slate-500">
                    <span>{quiz.author || "321skole"}</span>
                    <span>{formatDate(quiz.publishedAt, locale)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-2xl font-black">Ingen quizer funnet</h2>
            <p className="mt-2 text-slate-600">Publiser en quiz fra Mitt innhold, så dukker den opp her.</p>
          </section>
        )}
      </div>
    </main>
  );
}
