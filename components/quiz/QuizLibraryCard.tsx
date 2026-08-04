"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { db } from "@/lib/firebase";

export type QuizLibraryCardData = {
  id: string;
  title: string;
  description: string;
  level: string;
  languageLabel: string;
  categoryLabel: string;
  author: string;
  imageUrl: string;
  questionCount: number;
  ratingAverage: number;
  ratingCount: number;
};

type QuizLibraryCardProps = {
  locale: string;
  quiz: QuizLibraryCardData;
};

function StarRating({
  value,
  count,
  myValue,
  busy,
  onRate,
}: {
  value: number;
  count: number;
  myValue?: number;
  busy: boolean;
  onRate: (value: number) => void;
}) {
  const shown = myValue || Math.round(value);

  return (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-500" aria-label={`${value.toFixed(1)} av 5`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRate(star);
            }}
            className={`border-0 bg-transparent p-0 text-base leading-none ${
              star <= shown ? "text-slate-500" : "text-slate-300"
            } ${busy ? "cursor-default opacity-60" : "cursor-pointer"}`}
            aria-label={`Gi ${star} stjerner`}
            title={`Gi ${star} stjerner`}
          >
            ★
          </button>
        ))}
      </div>
      <span>({count})</span>
    </div>
  );
}

function isPromptLikeDescription(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.startsWith("lag en quiz") ||
    normalized.startsWith("lag quiz") ||
    normalized.startsWith("create a quiz") ||
    normalized.startsWith("make a quiz") ||
    normalized.startsWith("generate a quiz") ||
    normalized.startsWith("crie um quiz") ||
    normalized.startsWith("gere um quiz")
  );
}

function questionCountLabel(count: number, locale: string): string {
  if (locale.startsWith("en")) return count === 1 ? "1 question" : `${count} questions`;
  if (locale.startsWith("pt")) return count === 1 ? "1 pergunta" : `${count} perguntas`;
  return count === 1 ? "1 spørsmål" : `${count} spørsmål`;
}

export function QuizLibraryCard({ locale, quiz }: QuizLibraryCardProps) {
  const router = useRouter();
  const href = `/${locale}/321quiz/${quiz.id}`;
  const description = isPromptLikeDescription(quiz.description) ? "" : quiz.description;
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [myRating, setMyRating] = useState<number | undefined>(undefined);
  const [ratingAverage, setRatingAverage] = useState(quiz.ratingAverage);
  const [ratingCount, setRatingCount] = useState(quiz.ratingCount);
  const [shareLabel, setShareLabel] = useState("Del");
  const [saveLabel, setSaveLabel] = useState("Legg til i Mitt innhold");
  const [saveBusy, setSaveBusy] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, setCurrentUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAlreadyAdded() {
      if (!currentUser?.uid || currentUser.isAnonymous) {
        if (!cancelled) {
          setAlreadyAdded(false);
          setSaveLabel("Legg til i Mitt innhold");
        }
        return;
      }

      try {
        const qy = query(
          collection(db, "lessons"),
          where("ownerId", "==", currentUser.uid),
          where("sourcePublishedQuizId", "==", quiz.id),
          limit(1)
        );
        const snap = await getDocs(qy);

        if (!cancelled && !snap.empty) {
          setAlreadyAdded(true);
          setSaveLabel("Lagt til");
        }
      } catch {
        // The add action still works through the server even if this lookup fails.
      }
    }

    void checkAlreadyAdded();

    return () => {
      cancelled = true;
    };
  }, [currentUser, quiz.id]);

  async function shareQuiz() {
    const url = `${window.location.origin}${href}`;
    const text = `Jeg deler en quiz fra 321quiz: ${quiz.title}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: quiz.title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareLabel("Kopiert");
        setTimeout(() => setShareLabel("Del"), 1300);
      }
    } catch {
      // User may cancel the native share sheet.
    }
  }

  async function rateQuiz(nextRating: number) {
    if (!currentUser?.uid) return;

    setRatingBusy(true);
    try {
      const quizRef = doc(db, "published_lessons", quiz.id);
      const ratingRef = doc(db, "published_lessons", quiz.id, "ratings", currentUser.uid);

      await runTransaction(db, async (tx) => {
        const quizSnap = await tx.get(quizRef);
        if (!quizSnap.exists()) throw new Error("Quiz not found.");

        const ratingSnap = await tx.get(ratingRef);
        const data = quizSnap.data() as Record<string, unknown>;
        const previousCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
        const previousSum = typeof data.ratingSum === "number" ? data.ratingSum : 0;

        let nextCount = previousCount;
        let nextSum = previousSum;

        if (ratingSnap.exists()) {
          const oldValue = ratingSnap.data()?.value;
          nextSum = previousSum - (typeof oldValue === "number" ? oldValue : 0) + nextRating;
        } else {
          nextCount = previousCount + 1;
          nextSum = previousSum + nextRating;
        }

        const nextAverage = nextCount > 0 ? Number((nextSum / nextCount).toFixed(2)) : 0;

        tx.set(
          ratingRef,
          {
            uid: currentUser.uid,
            value: nextRating,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        tx.update(quizRef, {
          ratingCount: nextCount,
          ratingSum: nextSum,
          ratingAverage: nextAverage,
        });

        setRatingAverage(nextAverage);
        setRatingCount(nextCount);
      });

      setMyRating(nextRating);
    } finally {
      setRatingBusy(false);
    }
  }

  async function addToMyContent() {
    if (!currentUser) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/321quiz`)}`);
      return;
    }

    setSaveBusy(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/producer/import-published-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publishedId: quiz.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Kunne ikke legge til quiz.");
      setAlreadyAdded(true);
      setSaveLabel("Lagt til");
    } catch {
      setSaveLabel("Prøv igjen");
      setTimeout(() => setSaveLabel(alreadyAdded ? "Lagt til" : "Legg til i Mitt innhold"), 1600);
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => router.push(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      aria-label={quiz.title}
    >
      <div className="relative aspect-video bg-slate-100">
        <div className="absolute left-3 top-3 z-10 rounded-full bg-lime-200/90 px-3 py-2 text-sm font-black text-slate-950 shadow-sm">
          {quiz.level || "Quiz"}
        </div>
        {quiz.questionCount > 0 ? (
          <div className="absolute bottom-3 right-3 z-10 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-950 shadow-sm ring-1 ring-amber-200">
            {questionCountLabel(quiz.questionCount, locale)}
          </div>
        ) : null}
        {quiz.imageUrl ? (
          <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-violet-50 text-sm font-black uppercase tracking-[0.18em] text-violet-500">
            321quiz
          </div>
        )}
      </div>

      <div className="flex min-h-40 flex-col gap-1.5 p-[14px]">
        <h2 className="m-0 text-lg font-black leading-tight text-slate-950 group-hover:text-slate-950">
          {quiz.title}
        </h2>

        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-600">
          {quiz.languageLabel ? <span>{quiz.languageLabel}</span> : null}
          {quiz.languageLabel && quiz.categoryLabel ? <span className="text-slate-400">•</span> : null}
          {quiz.categoryLabel ? <span>{quiz.categoryLabel}</span> : null}
        </div>

        {description ? (
          <p className="m-0 mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{description}</p>
        ) : null}

        {quiz.author ? (
          <p className="m-0 text-sm font-semibold text-slate-600">Forfatter: {quiz.author}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
          <StarRating
            value={ratingAverage}
            count={ratingCount}
            myValue={myRating}
            busy={ratingBusy}
            onRate={rateQuiz}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-50"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void shareQuiz();
              }}
            >
              {shareLabel}
            </button>
            <button
              type="button"
              disabled={saveBusy || alreadyAdded}
              className="inline-flex rounded-lg border border-green-300 bg-green-200 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-green-300 disabled:opacity-60"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void addToMyContent();
              }}
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
