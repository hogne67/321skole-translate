import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/firebaseAdmin";
import QuizDetailActionPanel from "@/components/quiz/QuizDetailActionPanel";

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
    <main className="min-h-screen bg-slate-50 px-4 pb-32 pt-3 text-slate-950">
      <div className="mx-auto max-w-[980px] space-y-4">
        <Link href={`/${locale}/321quiz`} className="inline-flex font-black text-slate-700 no-underline hover:text-slate-950">
          Til 321quiz
        </Link>

        <header className="rounded-[18px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-4 shadow-sm">
          <h1 className="m-0 text-[clamp(1.5rem,3.5vw,2.2rem)] font-black leading-[1.1] text-slate-950">
            {quiz.title}
          </h1>

          {quiz.description ? <p className="m-0 mt-3 max-w-3xl text-base leading-7 text-slate-600">{quiz.description}</p> : null}

          <div className="mt-3 flex flex-wrap gap-2 text-sm font-black text-slate-700">
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-950">
              {quiz.questions.length} spørsmål
            </span>
            {quiz.level ? <span className="rounded-full bg-slate-100 px-3 py-1.5">{quiz.level}</span> : null}
            {quiz.language ? <span className="rounded-full bg-slate-100 px-3 py-1.5">{quiz.language}</span> : null}
          </div>

          {quiz.author ? <p className="m-0 mt-3 text-sm font-bold text-slate-500">Laget av {quiz.author}</p> : null}
        </header>

        <section>
          <div className="rounded-2xl border border-slate-200 bg-white p-[clamp(10px,2.8vw,14px)] shadow-sm">
            <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-[14px] border border-dashed border-slate-200 bg-white">
              {quiz.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-violet-50 text-sm font-black uppercase tracking-[0.2em] text-violet-500">
                  321quiz
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-slate-500">Forhåndsvisning</p>
              <h2 className="m-0 mt-1 text-2xl font-black">Spørsmål i quizen</h2>
            </div>
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
      <QuizDetailActionPanel locale={locale} quizId={quiz.id} />
    </main>
  );
}
