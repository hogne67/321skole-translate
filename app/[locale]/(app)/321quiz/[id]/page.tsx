import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

type PublicQuestion = {
  prompt: string;
  options: string[];
  type: string;
};

type PublicQuiz = {
  id: string;
  title: string;
  description: string;
  level: string;
  language: string;
  author: string;
  imageUrl: string;
  questions: PublicQuestion[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => asString(item)).filter(Boolean);
}

function questionFrom(raw: unknown): PublicQuestion | null {
  const q = isRecord(raw) ? raw : {};
  const prompt = asString(q.prompt || q.question);
  if (!prompt) return null;

  return {
    prompt,
    options: asStringArray(q.options),
    type: asString(q.type, "multiple_choice"),
  };
}

function coerceQuiz(id: string, raw: unknown): PublicQuiz | null {
  const data = isRecord(raw) ? raw : {};
  const visibility = asString(data.publishVisibility || data.visibility, "public").toLowerCase();
  const lessonType = asString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const signedBy = isRecord(data.signedBy) ? data.signedBy : {};
  const isQuiz = lessonType === "quiz" || Array.isArray(quiz.questions);

  if (!isQuiz) return null;
  if (data.isActive === false) return null;
  if (visibility === "private") return null;

  const questions = (Array.isArray(quiz.questions) ? quiz.questions : Array.isArray(data.tasks) ? data.tasks : [])
    .map(questionFrom)
    .filter((question): question is PublicQuestion => Boolean(question));

  return {
    id,
    title: asString(data.title || quiz.title, "Quiz uten tittel"),
    description: asString(data.description || quiz.description, ""),
    level: asString(data.level || quiz.level, ""),
    language: asString(data.language || quiz.language, ""),
    author: asString(data.producerName || signedBy.nameSnapshot, ""),
    imageUrl: asString(data.coverImageUrl || data.imageUrl, ""),
    questions,
  };
}

async function loadQuiz(id: string): Promise<PublicQuiz | null> {
  const { db } = getAdmin();
  const direct = await db.collection("published_lessons").doc(id).get();
  if (direct.exists) return coerceQuiz(direct.id, direct.data());

  const byLessonId = await db.collection("published_lessons").where("lessonId", "==", id).limit(1).get();
  if (byLessonId.empty) return null;
  const doc = byLessonId.docs[0];
  return coerceQuiz(doc.id, doc.data());
}

export default async function PublicQuizPage({ params }: PageProps) {
  const { locale, id } = await params;
  const quiz = await loadQuiz(id);
  if (!quiz) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/${locale}/321quiz`} className="font-black text-violet-700 hover:text-violet-900">
          Til 321quiz
        </Link>

        <section className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-8 md:p-10">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700">321quiz</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{quiz.title}</h1>
              {quiz.description ? <p className="mt-4 text-lg text-slate-600">{quiz.description}</p> : null}

              <div className="mt-6 flex flex-wrap gap-2 text-sm font-black text-slate-700">
                <span className="rounded-full bg-violet-50 px-4 py-2 text-violet-700">
                  {quiz.questions.length} spørsmål
                </span>
                {quiz.level ? <span className="rounded-full bg-slate-100 px-4 py-2">{quiz.level}</span> : null}
                {quiz.language ? <span className="rounded-full bg-slate-100 px-4 py-2">{quiz.language}</span> : null}
              </div>

              {quiz.author ? <p className="mt-5 text-sm font-bold text-slate-500">Laget av {quiz.author}</p> : null}
            </div>

            <div className="bg-slate-100">
              {quiz.imageUrl ? (
                <img src={quiz.imageUrl} alt="" className="h-full min-h-72 w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-72 items-center justify-center bg-violet-50 text-sm font-black uppercase tracking-[0.2em] text-violet-500">
                  321quiz
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Forhåndsvisning</p>
              <h2 className="mt-1 text-2xl font-black">Spørsmål i quizen</h2>
            </div>
            <Link
              href={`/${locale}/tools/quiz`}
              className="inline-flex items-center justify-center rounded-2xl border border-violet-200 px-4 py-2 font-black text-violet-800 hover:bg-violet-50"
            >
              Lag egen quiz
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {quiz.questions.slice(0, 8).map((question, index) => (
              <article key={`${question.prompt}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                  Spørsmål {index + 1}
                </div>
                <h3 className="mt-2 text-lg font-black">{question.prompt}</h3>
                {question.options.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.options.map((option) => (
                      <span key={option} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700">
                        {option}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
