// app/(app)/producer/[id]/preview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { useLocale, useTranslations } from "next-intl";

type TaskType = "truefalse" | "mcq" | "open";
type TextSize = "normal" | "large" | "xlarge";

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
  textSize?: TextSize;
  coverImageUrl?: string;
  tasks?: Task[];
};

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

function normalizeTextSize(value: unknown): TextSize {
  if (value === "large" || value === "xlarge") return value;
  return "normal";
}

function getReadingTextStyle(textSize: TextSize): React.CSSProperties {
  if (textSize === "xlarge") return { fontSize: 21, lineHeight: 1.75 };
  if (textSize === "large") return { fontSize: 18, lineHeight: 1.7 };
  return { fontSize: 16, lineHeight: 1.65 };
}

function getTaskTypeLabel(type: TaskType, t: ReturnType<typeof useTranslations>) {
  if (type === "truefalse") return t("previewPage.taskTypes.truefalse");
  if (type === "mcq") return t("previewPage.taskTypes.mcq");
  return t("previewPage.taskTypes.open");
}

function formatAnswer(answer: unknown): string {
  if (answer === null || answer === undefined || answer === "") return "";
  if (typeof answer === "string") return answer;
  if (typeof answer === "number" || typeof answer === "boolean") return String(answer);
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

export default function ProducerLessonPreviewPage() {
  const t = useTranslations("editorNewText");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setLesson(null);
          setErr(t("previewPage.errors.notFound"));
          setLoading(false);
          return;
        }

        setLesson(snap.data() as Lesson);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(getErrorMessage(e) || t("previewPage.errors.loadFailed"));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, t]);

  const tasks = useMemo(() => {
    const arr = [...(lesson?.tasks ?? [])];
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return arr;
  }, [lesson?.tasks]);

  if (loading) return <div style={{ padding: 16 }}>{t("previewPage.loading")}</div>;

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontWeight: 700 }}>{t("previewPage.errors.title")}</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
        <Link href={`/${locale}/producer/${lessonId}`}>{t("nav.back")}</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>{t("previewPage.errors.notFound")}</p>
        <Link href={`/${locale}/producer`}>{t("nav.back")}</Link>
      </div>
    );
  }

  const textSize = normalizeTextSize(lesson.textSize);
  const readingTextStyle = getReadingTextStyle(textSize);
  const coverImageUrl = typeof lesson.coverImageUrl === "string" ? lesson.coverImageUrl.trim() : "";

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 16px 112px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "flex-start",
          gap: 16,
          alignItems: "stretch",
          flexWrap: "wrap",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#dbeafe",
          borderRadius: 24,
          background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 56%, #eef6ff 100%)",
          padding: 22,
          boxShadow: "0 18px 45px rgba(15,23,42,0.07)",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div
            style={{
              display: "inline-flex",
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#bfdbfe",
              borderRadius: 999,
              padding: "5px 9px",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: 12,
              fontWeight: 950,
            }}
          >
            {t("previewPage.badge")}
          </div>

          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.08,
              fontWeight: 950,
              margin: "10px 0 0",
              color: "#0f172a",
            }}
          >
            {lesson.title}
          </h1>

          <div style={{ fontSize: 14, color: "#475569", marginTop: 8 }}>
            {t("summary.status")}: {t(`statuses.${lesson.status ?? "draft"}`)}
            {lesson.level ? ` · ${t("fields.levelOptional")}: ${lesson.level}` : ""}
            {` · ${t("fields.textSize")}: ${t(`textSizes.${textSize}`)}`}
          </div>
        </div>
      </header>

      <section
        style={{
          marginTop: 18,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#dbe3f0",
          borderRadius: 20,
          padding: 18,
          background: "#ffffff",
          boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
        }}
      >
        {coverImageUrl ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{t("previewPage.coverTitle")}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt={t("previewPage.coverAlt")}
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "cover",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#dbe3f0",
                borderRadius: 16,
                background: "#f8fafc",
              }}
            />
          </div>
        ) : null}

        <div>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>{t("fields.text")}</div>
          <div style={{ whiteSpace: "pre-wrap", color: "#0f172a", ...readingTextStyle }}>
            {lesson.sourceText}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 950, margin: 0 }}>{t("tasks.title")}</h2>
            <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
              {t("previewPage.tasksHelp")}
            </div>
          </div>
          <div
            style={{
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#cbd5e1",
              borderRadius: 999,
              padding: "7px 11px",
              background: "#ffffff",
              color: "#475569",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {t("summary.tasks")}: {tasks.length}
          </div>
        </div>

        {tasks.length === 0 ? (
          <p style={{ opacity: 0.8 }}>{t("tasks.empty")}</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tasks.map((task, index) => {
              const answer = formatAnswer(task.correctAnswer);

              return (
                <article
                  key={task.id}
                  style={{
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "#dbe3f0",
                    borderRadius: 18,
                    padding: 16,
                    background: "#ffffff",
                    boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 32,
                          height: 32,
                          borderRadius: 999,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 13,
                          fontWeight: 950,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span
                        style={{
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: "#cbd5e1",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 12,
                          color: "#475569",
                          fontWeight: 900,
                          background: "#f8fafc",
                        }}
                      >
                        {getTaskTypeLabel(task.type, t)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: Math.max(16, readingTextStyle.fontSize as number),
                      lineHeight: 1.45,
                      color: "#0f172a",
                    }}
                  >
                    {task.prompt}
                  </div>

                  {task.type === "truefalse" ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      {["true", "false"].map((value) => (
                        <div
                          key={value}
                          style={{
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: "#cbd5e1",
                            borderRadius: 12,
                            padding: "8px 10px",
                            background: "#f8fafc",
                            fontWeight: 800,
                          }}
                        >
                          {value === "true" ? "True" : "False"}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {task.type === "mcq" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {(task.options ?? []).map((opt, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: "#dbe3f0",
                            borderRadius: 12,
                            padding: "9px 10px",
                            background: "#f8fafc",
                          }}
                        >
                          <span style={{ fontWeight: 950, color: "#64748b" }}>
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {task.type === "open" ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: "#cbd5e1",
                        borderRadius: 14,
                        minHeight: 86,
                        background: "#f8fafc",
                      }}
                    />
                  ) : null}

                  {answer ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: "#bbf7d0",
                        borderRadius: 14,
                        padding: "10px 12px",
                        background: "#f0fdf4",
                        color: "#14532d",
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 950, marginBottom: 3 }}>{t("previewPage.answerKey")}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{answer}</div>
                    </div>
                  ) : task.type === "open" ? (
                    <div style={{ marginTop: 10, fontSize: 13, color: "#64748b" }}>
                      {t("previewPage.openNote")}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          borderTopWidth: 1,
          borderTopStyle: "solid",
          borderTopColor: "#bfdbfe",
          background: "rgba(255,255,255,0.96)",
          padding: "12px 16px",
          boxShadow: "0 -10px 30px rgba(15,23,42,0.12)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 260, flex: "1 1 520px" }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: "#0f172a" }}>
              {t("previewPage.noticeTitle")}
            </div>
            <div style={{ marginTop: 2, fontSize: 13, fontWeight: 650, color: "#475569", lineHeight: 1.35 }}>
              {t("previewPage.noticeBody")}
            </div>
          </div>

          <Link
            href={`/${locale}/producer/${lessonId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 42,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#0f172a",
              borderRadius: 12,
              background: "#0f172a",
              color: "#ffffff",
              padding: "10px 14px",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 950,
              whiteSpace: "nowrap",
              boxShadow: "0 10px 24px rgba(15,23,42,0.22)",
            }}
          >
            {t("previewPage.backToEditor")}
          </Link>
        </div>
      </div>
    </div>
  );
}
