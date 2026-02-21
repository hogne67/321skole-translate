// app/(app)/producer/[id]/preview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";

type TaskType = "truefalse" | "mcq" | "open";

type Task = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
};

type Lesson = {
  title: string;
  level?: string;
  sourceText: string;
  status?: "draft" | "published";
  tasks?: Task[];
  ownerId?: string;
};

type AnswersMap = Record<string, unknown>;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default function ProducerLessonPreviewPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // preview local state (ingen lagring)
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [showKey, setShowKey] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        // Sørg for auth
        await ensureAnonymousUser();
        const currentUid = getAuth().currentUser?.uid ?? null;
        if (alive) setUid(currentUid);

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setLesson(null);
          setErr("Fant ikke lesson.");
          setLoading(false);
          return;
        }

        setLesson(snap.data() as Lesson);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(getErrorMessage(e) || "Kunne ikke laste preview.");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId]);

  const tasks = useMemo(() => {
    const arr = [...(lesson?.tasks ?? [])];
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return arr;
  }, [lesson?.tasks]);

  if (loading) return <div style={{ padding: 16 }}>Laster preview…</div>;

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontWeight: 700 }}>Feil</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
        <Link href={`/producer/${lessonId}`}>← Tilbake</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>Fant ikke lesson.</p>
        <Link href="/producer">Tilbake</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <Link href={`/producer/${lessonId}`}>← Tilbake</Link>

          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>
            {lesson.title}{" "}
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>(PREVIEW)</span>
          </h1>

          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Status: {lesson.status ?? "—"}
            {lesson.level ? ` · Level: ${lesson.level}` : ""}
          </div>

          {/* Debug (kan fjernes senere) */}
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
            UID: {uid ?? "—"} · ownerId: {lesson.ownerId ?? "—"}
          </div>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showKey}
            onChange={(e) => setShowKey(e.target.checked)}
          />
          Vis fasit
        </label>
      </div>

      {/* Source text */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Tekst</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{lesson.sourceText}</div>
      </div>

      {/* Tasks */}
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Oppgaver</h2>

        {tasks.length === 0 ? (
          <p style={{ opacity: 0.8 }}>Ingen oppgaver enda.</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {tasks.map((t) => (
              <div
                key={t.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>{t.type.toUpperCase()}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{t.prompt}</div>

                {/* Answer input */}
                <div style={{ marginTop: 10 }}>
                  {t.type === "truefalse" && (
                    <select
                      value={typeof answers[t.id] === "string" ? (answers[t.id] as string) : ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [t.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Velg…</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  )}

                  {t.type === "mcq" && (
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {(t.options ?? []).map((opt, idx) => (
                        <label key={idx} style={{ display: "flex", gap: 8 }}>
                          <input
                            type="radio"
                            name={`mcq-${t.id}`}
                            checked={answers[t.id] === opt}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [t.id]: opt }))
                            }
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {t.type === "open" && (
                    <textarea
                      rows={4}
                      style={{ width: "100%", marginTop: 8 }}
                      value={typeof answers[t.id] === "string" ? (answers[t.id] as string) : ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [t.id]: e.target.value,
                        }))
                      }
                      placeholder="Skriv et eksempel-svar (lagres ikke)…"
                    />
                  )}
                </div>

                {/* Key */}
                {showKey && (t.type === "truefalse" || t.type === "mcq") && (
                  <div style={{ marginTop: 12, fontSize: 14 }}>
                    <div style={{ fontWeight: 800 }}>Fasit</div>
                    <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
                      {JSON.stringify(t.correctAnswer)}
                    </div>
                  </div>
                )}

                {/* Local evaluation */}
                {(t.type === "truefalse" || t.type === "mcq") && (
                  <div style={{ marginTop: 10, fontSize: 14 }}>
                    <div style={{ fontWeight: 700 }}>Preview-sjekk</div>
                    <div style={{ opacity: 0.9 }}>
                      {answers[t.id] === undefined || answers[t.id] === ""
                        ? "Ikke besvart"
                        : JSON.stringify(answers[t.id]) === JSON.stringify(t.correctAnswer)
                          ? "✅ Riktig"
                          : "❌ Feil"}
                    </div>
                  </div>
                )}

                {t.type === "open" && (
                  <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
                    (Open tasks: i preview lagres ikke submissions, og AI-feedback er av som standard.)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, opacity: 0.7, fontSize: 13 }}>
        Preview lagrer ingenting i Firestore.
      </div>
    </div>
  );
}
