// app/(app)/lesson/[lessonId]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

type Lesson = {
  title: string;
  description?: string;
  level?: string;

  topic?: string;
  topics?: string[];

  language?: string;

  sourceText?: string;
  text?: string;

  tasks?: unknown;

  coverImageUrl?: string;
  imageUrl?: string;

  isActive?: boolean;
  lessonId?: string;
  visibility?: string;
};

type Task = {
  id?: string;
  order?: number;
  type?: string;
  prompt?: string;
  options?: unknown;
};

function getErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "string") return { message: err };

  if (err && typeof err === "object") {
    const code = "code" in err ? (err as { code?: unknown }).code : undefined;
    const message = "message" in err ? (err as { message?: unknown }).message : undefined;

    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : JSON.stringify(err),
    };
  }

  return { message: String(err) };
}

function isPermissionDenied(e: unknown) {
  const info = getErrorInfo(e);
  const code = String(info.code || "").toLowerCase();
  const msg = String(info.message || "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

function safeTasksArray(tasks: unknown): Task[] {
  if (Array.isArray(tasks)) return tasks as Task[];

  if (typeof tasks === "string") {
    try {
      const parsed: unknown = JSON.parse(tasks);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getStableTaskId(t: Task, idx: number): string {
  if (t.id != null && String(t.id).trim()) return String(t.id).trim();
  const orderPart = t.order != null ? String(t.order) : "x";
  const promptPart = typeof t.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;
  return `${orderPart}__idx${idx}`;
}

function coerceTopics(l: Lesson): string[] {
  const out: string[] = [];
  if (Array.isArray(l.topics)) {
    for (const t of l.topics) {
      const v = String(t || "").trim();
      if (v) out.push(v);
    }
  }
  const single = String(l.topic || "").trim();
  if (single && !out.includes(single)) out.push(single);
  return out;
}

function pickImageUrl(l: Lesson): string | null {
  const a = String(l.coverImageUrl || "").trim();
  if (a) return a;
  const b = String(l.imageUrl || "").trim();
  if (b) return b;
  return null;
}

function toStringOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sortTasksByOrder(a: Task, b: Task) {
  const ao = typeof a.order === "number" ? a.order : 999;
  const bo = typeof b.order === "number" ? b.order : 999;
  return ao - bo;
}

type PublishedLessonResult =
  | { via: "docId"; data: Record<string, unknown> }
  | { via: "fieldQuery"; data: Record<string, unknown> }
  | { via: "none"; data: null };

/**
 * Hent published lesson på to måter:
 * 1) DocId === lessonId
 * 2) Fallback: query where(lessonId == param) hvis publisering har auto-ID
 */
async function fetchPublishedLessonByEitherIdOrField(lessonId: string): Promise<PublishedLessonResult> {
  // 1) DocId
  try {
    const directSnap = await getDoc(doc(db, "published_lessons", lessonId));
    if (directSnap.exists()) {
      return { via: "docId", data: (directSnap.data() as Record<string, unknown>) ?? {} };
    }
  } catch (e: unknown) {
    // Hvis permission-denied, prøv likevel fallback-query
    if (!isPermissionDenied(e)) throw e;
  }

  // 2) Fallback query på feltet lessonId
  const q = query(collection(db, "published_lessons"), where("lessonId", "==", lessonId), limit(1));
  const qsnap = await getDocs(q);
  if (qsnap.empty) return { via: "none", data: null };

  return { via: "fieldQuery", data: (qsnap.docs[0].data() as Record<string, unknown>) ?? {} };
}

export default function LessonPreviewPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      if (!lessonId) {
        if (alive) {
          setError("Mangler lessonId i URL.");
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetchPublishedLessonByEitherIdOrField(lessonId);
        if (!alive) return;

        if (!res.data) {
          setLesson(null);
          setError("Denne oppgaven er ikke publisert (eller finnes ikke).");
          return;
        }

        const raw = res.data as Partial<Lesson>;

        // Hard filter: må være aktiv
        if (raw?.isActive === false) {
          setLesson(null);
          setError("Denne oppgaven er ikke publisert (eller er avpublisert).");
          return;
        }

        const sourceText = toStringOrEmpty(raw?.sourceText) || toStringOrEmpty(raw?.text) || "";

        const data: Lesson = {
          title: toStringOrEmpty(raw?.title) || "(Uten tittel)",
          description: toStringOrEmpty(raw?.description) || undefined,
          level: toStringOrEmpty(raw?.level) || undefined,
          topic: toStringOrEmpty(raw?.topic) || undefined,
          topics: Array.isArray(raw?.topics) ? (raw?.topics as string[]) : undefined,
          language: toStringOrEmpty(raw?.language) || undefined,
          text: toStringOrEmpty(raw?.text) || undefined,
          sourceText,
          tasks: raw?.tasks,
          coverImageUrl: toStringOrEmpty(raw?.coverImageUrl) || undefined,
          imageUrl: toStringOrEmpty(raw?.imageUrl) || undefined,
          isActive: raw?.isActive,
          lessonId: toStringOrEmpty(raw?.lessonId) || undefined,
          visibility: toStringOrEmpty(raw?.visibility) || undefined,
        };

        setLesson(data);
      } catch (e: unknown) {
        if (!alive) return;
        if (isPermissionDenied(e)) {
          setError("Denne oppgaven er ikke publisert (eller du har ikke tilgang).");
        } else {
          setError(getErrorInfo(e).message || "Noe gikk galt");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [lessonId]);

  const sourceTextSafe = useMemo(
    () => (lesson?.sourceText ?? lesson?.text ?? "").toString().trim(),
    [lesson]
  );

  const tasksOriginal = useMemo(() => {
    const arr = safeTasksArray(lesson?.tasks);
    return arr.slice().sort(sortTasksByOrder);
  }, [lesson?.tasks]);

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  if (error) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <p style={{ color: "crimson" }}>{error}</p>
        <Link href="/321lessons">← Tilbake til bibliotek</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <p>Ingen data.</p>
        <Link href="/321lessons">← Tilbake til bibliotek</Link>
      </div>
    );
  }

  const topics = coerceTopics(lesson);
  const img = pickImageUrl(lesson);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>{lesson.title}</h1>

          <div style={{ opacity: 0.75, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {lesson.level ? <span>{lesson.level}</span> : null}
            {lesson.language ? <span>• {lesson.language.toUpperCase()}</span> : null}
            {topics.length ? <span>• {topics.slice(0, 3).join(" • ")}</span> : null}
          </div>

          {lesson.description ? (
            <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.85, lineHeight: 1.45 }}>
              {lesson.description}
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link href={`/student/lesson/${lessonId}`} style={startBtn}>
            START OPPGAVE
          </Link>

          <Link href="/321lessons" style={secondaryBtn}>
            Tilbake
          </Link>
        </div>
      </header>

      {/* IMAGE */}
      <section style={{ marginTop: 14 }}>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            overflow: "hidden",
            background: "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={lesson.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ opacity: 0.65 }}>Ingen cover</div>
          )}
        </div>
      </section>

      {/* TEXT */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Text</h2>
        <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, lineHeight: 1.55 }}>
          {sourceTextSafe ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{sourceTextSafe}</div>
          ) : (
            <span style={{ opacity: 0.6 }}>No text</span>
          )}
        </div>
      </section>

      {/* TASKS (read-only) */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Tasks</h2>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No tasks in this lesson.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tasksOriginal.map((t, idx) => {
              const stableId = getStableTaskId(t, idx);
              const type = typeof t.type === "string" ? t.type : "open";
              const prompt = typeof t.prompt === "string" ? t.prompt : "";
              const options = Array.isArray(t.options) ? t.options : [];

              return (
                <div
                  key={stableId}
                  style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}
                >
                  <div style={{ opacity: 0.8, marginBottom: 8 }}>
                    <strong>Oppgave {typeof t.order === "number" ? t.order : idx + 1}</strong>{" "}
                    <span style={{ marginLeft: 8 }}>• {type}</span>
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10 }}>
                    {prompt}
                  </div>

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {options.map((o, i) => (
                        <div key={i} style={optionCard}>
                          {String(o)}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {type === "truefalse" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={pill}>True</span>
                      <span style={pill}>False</span>
                    </div>
                  ) : null}

                  {type === "open" || !["mcq", "truefalse"].includes(type) ? (
                    <div style={{ marginTop: 8, opacity: 0.65, fontSize: 13 }}>
                      (Svarfelt vises når du trykker “Start oppgave”)
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Link href={`/student/lesson/${lessonId}`} style={startBtn}>
          START OPPGAVE
        </Link>
      </section>
    </main>
  );
}

const startBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "rgba(190,247,192,1)",
  color: "black",
  fontWeight: 800,
  letterSpacing: 0.2,
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "white",
  color: "black",
};

const optionCard: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 10,
  background: "white",
  opacity: 0.95,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(0,0,0,0.04)",
};
