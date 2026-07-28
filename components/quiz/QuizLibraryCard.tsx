"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { db } from "@/lib/firebase";

export type QuizLibraryCardData = {
  id: string;
  title: string;
  level: string;
  languageLabel: string;
  categoryLabel: string;
  author: string;
  imageUrl: string;
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

export function QuizLibraryCard({ locale, quiz }: QuizLibraryCardProps) {
  const router = useRouter();
  const href = `/${locale}/321quiz/${quiz.id}`;
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [myRating, setMyRating] = useState<number | undefined>(undefined);
  const [ratingAverage, setRatingAverage] = useState(quiz.ratingAverage);
  const [ratingCount, setRatingCount] = useState(quiz.ratingCount);
  const [shareLabel, setShareLabel] = useState("Del");
  const [saveLabel, setSaveLabel] = useState("Legg til i Mitt innhold");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, setCurrentUser);
  }, []);

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
      setSaveLabel("Lagt til");
    } catch {
      setSaveLabel("Prøv igjen");
      setTimeout(() => setSaveLabel("Legg til i Mitt innhold"), 1600);
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
        {quiz.imageUrl ? (
          <img src={quiz.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-violet-50 text-sm font-black uppercase tracking-[0.18em] text-violet-500">
            321quiz
          </div>
        )}
      </div>

      <div className="flex min-h-40 flex-col p-4">
        <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950 group-hover:text-violet-700">
          {quiz.title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-600">
          {quiz.languageLabel ? <span>{quiz.languageLabel}</span> : null}
          {quiz.languageLabel && quiz.categoryLabel ? <span className="text-slate-400">•</span> : null}
          {quiz.categoryLabel ? <span>{quiz.categoryLabel}</span> : null}
        </div>

        {quiz.author ? <p className="mt-2 text-sm font-semibold text-slate-600">Forfatter: {quiz.author}</p> : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
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
              disabled={saveBusy}
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
