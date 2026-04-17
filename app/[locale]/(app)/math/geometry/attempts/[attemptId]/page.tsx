// app\[locale]\(app)\math\geometry\attempts\[attemptId]\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";

import { db, auth } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";

import GeometryWorksheetPracticeView, {
  type GeometryPracticeAnswersByTaskId,
} from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import GeometryAutoCheckSummary from "@/components/generators/math/geometry/GeometryAutoCheckSummary";
import GeometryAutoCheckTaskList from "@/components/generators/math/geometry/GeometryAutoCheckTaskList";

import type { MathWorksheet } from "@/lib/math/geometry/types";
import { gradeGeometryWorksheet } from "@/lib/math/geometry/autoCheck";
import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";

type AttemptDoc = {
  worksheet?: MathWorksheet;
  answersByTaskId?: GeometryPracticeAnswersByTaskId;
  auto?: GeometryAutoResult | null;
  aiFeedback?: {
    text?: string;
    updatedAt?: unknown;
  } | null;
};

function summarizeAuto(auto: GeometryAutoResult | null) {
  if (!auto) return "";
  return `${auto.correct} riktige, ${auto.partial} delvis riktige, ${auto.wrong} feil og ${auto.unanswered} ubesvarte. Score: ${auto.percent ?? 0} %.`;
}

export default function GeometryAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params?.attemptId;
  const locale = useLocale();

  const tGeometry = useTranslations("mathGeometry");
  const tBrand = useTranslations("brandLogo");

  const tGeometryAny = tGeometry as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const tBrandAny = tBrand as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [worksheet, setWorksheet] = useState<MathWorksheet | null>(null);
  const [answers, setAnswers] = useState<GeometryPracticeAnswersByTaskId>({});

  const [auto, setAuto] = useState<GeometryAutoResult | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  useEffect(() => {
    if (!attemptId) return;

    const scrollNow = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollNow();

    const r1 = requestAnimationFrame(scrollNow);
    const r2 = requestAnimationFrame(() => {
      requestAnimationFrame(scrollNow);
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [attemptId]);

  useEffect(() => {
    if (loading) return;

    const id = window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);

    return () => window.clearTimeout(id);
  }, [loading, attemptId]);

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

      unsub = onAuthStateChanged(
        auth,
        (u) => finish(u ?? null),
        () => finish(null)
      );

      setTimeout(() => finish(auth.currentUser ?? null), 1500);
    });

    if (existingUser) return existingUser;

    return await ensureAnonymousUser();
  }

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!attemptId) {
          setError("Missing attemptId");
          return;
        }

        const user = await resolveUser();
        if (!alive) return;

        const ref = doc(db, "users", user.uid, "geometryAttempts", attemptId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Attempt not found");
          return;
        }

        const data = (snap.data() as AttemptDoc) ?? {};

        if (!data.worksheet) {
          setError("Invalid attempt (missing worksheet)");
          return;
        }

        setWorksheet(data.worksheet);
        setAnswers(data.answersByTaskId ?? {});
        setAuto(data.auto ?? null);
        setAiFeedback(
          data.aiFeedback?.text && data.aiFeedback.text.trim()
            ? data.aiFeedback.text.trim()
            : null
        );
      } catch (e: unknown) {
        const m = (e as { message?: unknown })?.message;
        setError(typeof m === "string" ? m : "Failed to load attempt");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [attemptId]);

  const topSummary = useMemo(() => summarizeAuto(auto), [auto]);

  async function saveAttemptSnapshot(
    nextAuto: GeometryAutoResult | null,
    nextAiFeedback: string | null
  ) {
    if (!worksheet || !attemptId) return;

    const currentUser = auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : null;

    if (!idToken) {
      throw new Error("Missing auth token");
    }

    const response = await fetch("/api/math/geometry/save-attempt", {
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
        aiFeedback: nextAiFeedback ? { text: nextAiFeedback } : null,
      }),
    });

    const rawText = await response.text();

    let data: { ok?: boolean; id?: string; error?: string } | null = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(
        `Save route did not return JSON. Status ${response.status}. Response starts with: ${rawText.slice(
          0,
          180
        )}`
      );
    }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Failed to save attempt (HTTP ${response.status})`);
    }
  }

  async function handleGetFeedback() {
    if (!worksheet || !attemptId) return;

    setFeedbackLoading(true);
    setError(null);

    try {
      const nextAuto = gradeGeometryWorksheet(worksheet, answers);
      setAuto(nextAuto);
      setFeedbackVisible(true);

      await saveAttemptSnapshot(nextAuto, null);

      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      if (!idToken) {
        throw new Error("Missing auth token");
      }

      const response = await fetch("/api/math/geometry/ai-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          attemptId,
          locale,
        }),
      });

      const rawText = await response.text();

      let data: { ok?: boolean; text?: string; error?: string } | null = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(
          `AI route did not return JSON. Status ${response.status}. Response starts with: ${rawText.slice(
            0,
            180
          )}`
        );
      }

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to get AI feedback (HTTP ${response.status})`);
      }

      const nextAi = data.text?.trim() || null;
      setAiFeedback(nextAi);

      await saveAttemptSnapshot(nextAuto, nextAi);
    } catch (e: unknown) {
      const m = (e as { message?: unknown })?.message;
      setError(typeof m === "string" ? m : "Failed to generate feedback");
    } finally {
      setFeedbackLoading(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (error) {
    return <div style={{ padding: 16, color: "crimson" }}>{error}</div>;
  }

  if (!worksheet) {
    return <div style={{ padding: 16 }}>No worksheet found.</div>;
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "grid", gap: 16 }}>
        {feedbackVisible && (auto || aiFeedback) ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">Tilbakemelding</h2>

              <button
                type="button"
                onClick={handleGetFeedback}
                disabled={feedbackLoading}
                style={{
                  border: "1px solid rgba(16,185,129,1)",
                  background: "rgba(16,185,129,1)",
                  color: "white",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: feedbackLoading ? "not-allowed" : "pointer",
                  opacity: feedbackLoading ? 0.7 : 1,
                }}
              >
                {feedbackLoading ? "Oppdaterer..." : "Få tilbakemelding"}
              </button>
            </div>

            {topSummary ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                <div className="font-semibold">Sammendrag av autokorrekt</div>
                <div className="mt-1">{topSummary}</div>
              </div>
            ) : null}

            {aiFeedback ? (
              <div className="mt-4 whitespace-pre-line rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <div className="mb-2 font-semibold text-slate-900">AI-tilbakemelding</div>
                {aiFeedback}
              </div>
            ) : null}
          </section>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleGetFeedback}
              disabled={feedbackLoading}
              style={{
                border: "1px solid rgba(16,185,129,1)",
                background: "rgba(16,185,129,1)",
                color: "white",
                borderRadius: 12,
                padding: "12px 16px",
                fontWeight: 900,
                fontSize: 15,
                cursor: feedbackLoading ? "not-allowed" : "pointer",
                opacity: feedbackLoading ? 0.7 : 1,
              }}
            >
              {feedbackLoading ? "Lager tilbakemelding..." : "Få tilbakemelding"}
            </button>
          </div>
        )}

        <GeometryWorksheetPracticeView
          worksheet={worksheet}
          t={tGeometryAny}
          tBrand={tBrandAny}
          answersByTaskId={answers}
          onAnswerChange={(taskId, patch) => {
            setAnswers((prev) => {
              const current =
                prev[taskId] && typeof prev[taskId] === "object"
                  ? prev[taskId]
                  : { taskId };

              return {
                ...prev,
                [taskId]: {
                  ...current,
                  ...patch,
                },
              };
            });
          }}
          showExpectedAnswers={false}
          showIdentityFields={false}
          showFigureMeta={true}
          includeHints={true}
          auto={auto}
          showInlineFeedback={feedbackVisible}
        />

        {feedbackVisible && auto ? (
          <GeometryAutoCheckSummary auto={auto} t={tGeometryAny} />
        ) : null}

        {feedbackVisible && auto ? (
          <GeometryAutoCheckTaskList
            worksheet={worksheet}
            auto={auto}
            answersByTaskId={answers}
            t={tGeometryAny}
          />
        ) : null}
      </div>
    </main>
  );
}