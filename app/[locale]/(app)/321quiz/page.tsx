import Link from "next/link";
import { getAdmin } from "@/lib/firebaseAdmin";
import { QuizLibraryCard, type QuizLibraryCardData } from "@/components/quiz/QuizLibraryCard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ q?: string; language?: string; level?: string; category?: string }>;
};

type QuizCard = {
  id: string;
  title: string;
  description: string;
  level: string;
  language: string;
  category: string;
  author: string;
  imageUrl: string;
  questionCount: number;
  publishedAt: Date | null;
  ratingAverage: number;
  ratingCount: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => asString(item)).filter(Boolean);
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

function cleanLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function languageLabel(value: string, locale: string): string {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  const nbLabels: Record<string, string> = {
    nb: "Norsk Bokmål",
    no: "Norsk Bokmål",
    nn: "Norsk Nynorsk",
    en: "Engelsk",
    pt: "Portugisisk",
    "pt-br": "Portugisisk (Brasil)",
  };
  const enLabels: Record<string, string> = {
    nb: "Norwegian Bokmal",
    no: "Norwegian Bokmal",
    nn: "Norwegian Nynorsk",
    en: "English",
    pt: "Portuguese",
    "pt-br": "Portuguese (Brazil)",
  };
  const labels = locale.startsWith("en") ? enLabels : nbLabels;
  return labels[v] || cleanLabel(value);
}

function categoryLabel(value: string): string {
  return cleanLabel(value || "Quiz");
}

function categoryFrom(data: Record<string, unknown>, quiz: Record<string, unknown>): string {
  const direct = asString(data.category || data.quizCategory || quiz.category);
  if (direct) return direct;
  const topic = asString(data.topic || quiz.topic);
  if (topic) return topic;
  const tags = asStringArray(data.tags || quiz.tags);
  return tags[0] || "Quiz";
}

function coerceQuiz(id: string, raw: unknown): QuizCard | null {
  const data = isRecord(raw) ? raw : {};
  const visibility = asString(data.publishVisibility || data.visibility, "public").toLowerCase();
  const lessonType = asString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  const isQuiz = lessonType === "quiz" || Array.isArray(quiz.questions);

  if (!isQuiz) return null;
  if (data.isActive === false) return null;
  if (visibility !== "public") return null;

  const signedBy = isRecord(data.signedBy) ? data.signedBy : {};

  return {
    id,
    title: asString(data.title || quiz.title, "Quiz uten tittel"),
    description: asString(data.description || quiz.description, ""),
    level: asString(data.level || quiz.level, ""),
    language: asString(data.language || quiz.language, ""),
    category: categoryFrom(data, quiz),
    author: asString(data.authorName || data.producerName || signedBy.nameSnapshot, ""),
    imageUrl: asString(data.coverImageUrl || data.imageUrl, ""),
    questionCount: questionCountFrom(data),
    publishedAt: asDate(data.publishedAt),
    ratingAverage: asNumber(data.ratingAverage),
    ratingCount: asNumber(data.ratingCount),
  };
}

function matchesFilter(value: string, filter: string | undefined): boolean {
  if (!filter || filter === "all") return true;
  return value.trim().toLowerCase() === filter.trim().toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "nb")
  );
}

export default async function QuizLibraryPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  const q = asString(sp?.q).toLowerCase();
  const languageFilter = asString(sp?.language, "all");
  const levelFilter = asString(sp?.level, "all");
  const categoryFilter = asString(sp?.category, "all");
  const { db } = getAdmin();

  const snap = await db
    .collection("published_lessons")
    .where("lessonType", "==", "quiz")
    .where("isActive", "==", true)
    .limit(120)
    .get();

  const allQuizzes = snap.docs
    .map((doc) => coerceQuiz(doc.id, doc.data()))
    .filter((quiz): quiz is QuizCard => Boolean(quiz))
    .sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));

  const languages = uniqueSorted(allQuizzes.map((quiz) => quiz.language));
  const levels = uniqueSorted(allQuizzes.map((quiz) => quiz.level));
  const categories = uniqueSorted(allQuizzes.map((quiz) => quiz.category));

  const quizzes = allQuizzes.filter((quiz) => {
    const searchable = [
      quiz.title,
      quiz.description,
      quiz.level,
      quiz.language,
      quiz.category,
      quiz.author,
      `${quiz.questionCount} spørsmål`,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!q || searchable.includes(q)) &&
      matchesFilter(quiz.language, languageFilter) &&
      matchesFilter(quiz.level, levelFilter) &&
      matchesFilter(quiz.category, categoryFilter)
    );
  });

  const resetDisabled = !q && languageFilter === "all" && levelFilter === "all" && categoryFilter === "all";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700">321quiz</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Quizbibliotek</h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                Publiserte quizer som kan brukes videre i undervisning, på tavla eller som åpen quiz med kode.
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

        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_170px_170px_190px_auto]">
          <input
            name="q"
            defaultValue={sp?.q || ""}
            placeholder="Søk: tittel, kategori, forfatter..."
            className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          />
          <select
            name="language"
            defaultValue={languageFilter}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Språk</option>
            {languages.map((language) => (
              <option key={language} value={language}>
                {languageLabel(language, locale)}
              </option>
            ))}
          </select>
          <select
            name="level"
            defaultValue={levelFilter}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Nivå</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          >
            <option value="all">Kategori</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
            >
              Søk
            </button>
            <Link
              href={`/${locale}/321quiz`}
              aria-disabled={resetDisabled}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-black ${
                resetDisabled
                  ? "pointer-events-none border-slate-200 bg-slate-50 text-slate-300"
                  : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              Nullstill
            </Link>
          </div>
        </form>

        <section className="text-sm font-semibold text-slate-600">
          Viser {quizzes.length} av {allQuizzes.length}
        </section>

        {quizzes.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => {
              const card: QuizLibraryCardData = {
                id: quiz.id,
                title: quiz.title,
                level: quiz.level,
                languageLabel: languageLabel(quiz.language, locale),
                categoryLabel: categoryLabel(quiz.category),
                author: quiz.author,
                imageUrl: quiz.imageUrl,
                ratingAverage: quiz.ratingAverage,
                ratingCount: quiz.ratingCount,
              };

              return <QuizLibraryCard key={quiz.id} locale={locale} quiz={card} />;
            })}
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
