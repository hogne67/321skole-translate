"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import FractionWorksheetView, {
  type FractionAnswersByTaskId,
} from "@/components/generators/math/fractions/FractionWorksheetView";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

type FractionAuto = {
  totalAuto: number;
  correctAuto: number;
  wrongAuto: number;
  unansweredAuto: number;
  percentAuto: number | null;
};

type AttemptDoc = {
  worksheet?: FractionWorksheet;
  answersByTaskId?: FractionAnswersByTaskId;
  auto?: FractionAuto | null;
};

function normalizeFractionText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(",", ".")
    .replace(/\s+/g, "")
    .replace(/:/g, "/")
    .replace("÷", "/");
}

function fractionNumber(value: unknown): number | null {
  const text = normalizeFractionText(value);
  const match = text.match(/^(-?\d+)\/(-?\d+)$/);
  if (!match) return null;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function selectedPartsCount(value: unknown, denominator: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const selectedParts = (value as { selectedParts?: unknown }).selectedParts;
  if (!Array.isArray(selectedParts)) return 0;

  return new Set(
    selectedParts
      .map((part) => Number(part))
      .filter((part) => Number.isInteger(part) && part >= 0 && part < denominator)
  ).size;
}

function gradeWorksheet(
  worksheet: FractionWorksheet,
  answers: FractionAnswersByTaskId
): FractionAuto {
  let correctAuto = 0;
  let wrongAuto = 0;
  let unansweredAuto = 0;

  worksheet.tasks.forEach((task, idx) => {
    const taskId = task.id || `task-${idx}`;
    const answer = answers[taskId];

    if (task.type === "shade_fraction") {
      const count = selectedPartsCount(answer, task.fraction.denominator);
      if (count === 0) unansweredAuto += 1;
      else if (count === task.fraction.numerator) correctAuto += 1;
      else wrongAuto += 1;
      return;
    }

    const text = normalizeFractionText(answer);
    if (!text) {
      unansweredAuto += 1;
      return;
    }

    const expected = task.answer || `${task.fraction.numerator}/${task.fraction.denominator}`;
    const answerValue = fractionNumber(text);
    const expectedValue = fractionNumber(expected);
    const isCorrect =
      text === normalizeFractionText(expected) ||
      (answerValue != null &&
        expectedValue != null &&
        Math.abs(answerValue - expectedValue) < 0.000001);

    if (isCorrect) correctAuto += 1;
    else wrongAuto += 1;
  });

  const totalAuto = worksheet.tasks.length;
  return {
    totalAuto,
    correctAuto,
    wrongAuto,
    unansweredAuto,
    percentAuto: totalAuto > 0 ? Math.round((correctAuto / totalAuto) * 100) : null,
  };
}

export default function FractionAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params?.attemptId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worksheet, setWorksheet] = useState<FractionWorksheet | null>(null);
  const [answers, setAnswers] = useState<FractionAnswersByTaskId>({});
  const [auto, setAuto] = useState<FractionAuto | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [saving, setSaving] = useState(false);

  async function resolveUser(): Promise<User> {
    if (auth.currentUser) return auth.currentUser;

    const existingUser = await new Promise<User | null>((resolve) => {
      let done = false;
      let unsub: (() => void) | null = null;
      const finish = (u: User | null) => {
        if (done) return;
        done = true;
        if (unsub) unsub();
        resolve(u);
      };

      unsub = onAuthStateChanged(auth, (u) => finish(u ?? null), () => finish(null));
      setTimeout(() => finish(auth.currentUser ?? null), 1500);
    });

    if (existingUser) return existingUser;
    return await ensureAnonymousUser();
  }

  useEffect(() => {
    if (!attemptId) return;
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const user = await resolveUser();
        if (!alive) return;

        const ref = doc(db, "users", user.uid, "fractionAttempts", attemptId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Attempt not found");
          return;
        }

        const data = (snap.data() as AttemptDoc) ?? {};
        if (!data.worksheet) {
          setError("Invalid attempt");
          return;
        }

        setWorksheet(data.worksheet);
        setAnswers(data.answersByTaskId ?? {});
        setAuto(data.auto ?? null);
        setShowFeedback(!!data.auto);
      } catch (e: unknown) {
        const message = (e as { message?: unknown })?.message;
        setError(typeof message === "string" ? message : "Failed to load fraction attempt");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [attemptId]);

  const summary = useMemo(() => {
    if (!auto) return "";
    return `${auto.correctAuto} riktige, ${auto.wrongAuto} feil og ${auto.unansweredAuto} ubesvarte. Score: ${auto.percentAuto ?? 0} %.`;
  }, [auto]);

  async function saveAttempt(nextAuto: FractionAuto | null) {
    if (!worksheet || !attemptId) return;
    const currentUser = auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : null;
    if (!idToken) throw new Error("Missing auth token");

    const response = await fetch("/api/math/fractions/save-attempt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        attemptId,
        worksheet,
        answersByTaskId: answers,
        auto: nextAuto,
      }),
    });

    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to save attempt");
    }
  }

  async function handleCheck() {
    if (!worksheet) return;
    setSaving(true);
    setError(null);

    try {
      const nextAuto = gradeWorksheet(worksheet, answers);
      setAuto(nextAuto);
      setShowFeedback(true);
      await saveAttempt(nextAuto);
    } catch (e: unknown) {
      const message = (e as { message?: unknown })?.message;
      setError(typeof message === "string" ? message : "Failed to check answers");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: "crimson" }}>{error}</div>;
  if (!worksheet) return <div style={{ padding: 16 }}>No worksheet found.</div>;

  return (
    <main className="mx-auto max-w-[980px] p-4">
      <div className="grid gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCheck}
            disabled={saving}
            className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Sjekker..." : "Sjekk svar"}
          </button>
        </div>

        {showFeedback && auto ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <div className="font-bold">Autokorrekt</div>
            <div className="mt-1">{summary}</div>
          </section>
        ) : null}

        <FractionWorksheetView
          worksheet={worksheet}
          answersByTaskId={answers}
          onAnswerChange={(taskId, value) =>
            setAnswers((prev) => ({ ...prev, [taskId]: value }))
          }
          showIdentityFields={false}
          showAutoCheck={showFeedback}
          variant="embedded"
        />
      </div>
    </main>
  );
}
