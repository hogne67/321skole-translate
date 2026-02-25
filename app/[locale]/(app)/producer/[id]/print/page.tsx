// app/[locale]/(app)/producer/[id]/print/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { useTranslations } from "next-intl";

type TaskType = "truefalse" | "mcq" | "open";
type AnswerSpace = "short" | "medium" | "long";
type CoverFormat = "16:9" | "4:3";

type Task = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
  answerSpace?: AnswerSpace;
};

type Lesson = {
  ownerId?: string;
  title: string;
  level?: string;
  sourceText: string;
  status?: "draft" | "published";
  tasks?: Task[];

  // PDF/branding
  producerName?: string;
  coverImageUrl?: string;
  coverImageFormat?: CoverFormat;

  // metadata (ikke nødvendig her, men ok å ha)
  topic?: string;
  language?: string;
  tags?: string[];
  estimatedMinutes?: number;
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function sortTasks(tasks: Task[]) {
  const t = [...tasks];
  t.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return t;
}

function safeText(s: unknown) {
  return typeof s === "string" ? s : "";
}

function lineCountFor(space?: AnswerSpace) {
  // ca antall linjer i A4-print (passelig)
  if (space === "short") return 5;
  if (space === "long") return 14;
  return 9; // medium
}

function isTruthyString(v: unknown) {
  return String(v).toLowerCase() === "true";
}

function normalizeCoverFormat(v: unknown): CoverFormat {
  return v === "4:3" ? "4:3" : "16:9";
}

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

export default function ProducerPrintPage() {
  const t = useTranslations("producer.print");

  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const searchParams = useSearchParams();
  const teacherMode = searchParams.get("teacher") === "1";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const localizeError = useCallback(
    (message: string): string => {
      const m = message || "";
      if (m === "No auth uid.") return t("errors.noAuthUid");
      if (m === "Fant ikke lesson.") return t("errors.notFound");
      if (m === "Du har ikke tilgang til denne lesson (ownerId mismatch).") return t("errors.noAccessOwnerMismatch");
      if (m === "Kunne ikke laste lesson.") return t("errors.loadFailed");
      return m;
    },
    [t]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid.");

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr(t("errors.notFound"));
          setLesson(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as Lesson;

        // Owner-sjekk (print er producer-verktøy)
        if (data.ownerId && data.ownerId !== u) {
          setErr(t("errors.noAccessOwnerMismatch"));
          setLesson(null);
          setLoading(false);
          return;
        }

        setLesson(data);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        console.error("PRINT LOAD FAILED:", e);
        setErr(localizeError(getErrorMessage(e) || t("errors.loadFailed")));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, t, localizeError]);

  const tasks = useMemo(() => {
    const t0 = Array.isArray(lesson?.tasks) ? (lesson?.tasks ?? []) : [];
    // skjul tomme tasks i print
    return sortTasks(t0).filter((x) => safeText(x.prompt).trim().length > 0);
  }, [lesson]);

  const coverFmt: CoverFormat = normalizeCoverFormat(lesson?.coverImageFormat);

  if (loading) {
    return <main style={{ padding: 20 }}>{t("states.loading")}</main>;
  }

  if (err || !lesson) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{t("pageTitle")}</h1>
        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>{t("errors.title")}</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err ?? t("errors.unknown")}</pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href={`/producer/${lessonId}`}>{t("nav.backToEditor")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pdf-shell">
      {/* Top bar (ikke print) */}
      <div className="no-print topbar">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href={`/producer/${lessonId}`} className="btn-lite">
            {t("nav.backToEditor")}
          </Link>

          <button className="btn" onClick={() => window.print()}>
            {t("actions.print")}
          </button>

          {!teacherMode ? (
            <Link href={`/producer/${lessonId}/print?teacher=1`} className="btn-lite">
              {t("actions.teacherVersion")}
            </Link>
          ) : (
            <Link href={`/producer/${lessonId}/print`} className="btn-lite">
              {t("actions.studentVersion")}
            </Link>
          )}
        </div>

        <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>{t("tips.saveAsPdf")}</div>
      </div>

      {/* Printable content */}
      <div className="pdf-page">
        {/* Header */}
        <div className="pdf-header">
          <div>
            <div className="pdf-title">{lesson.title ?? t("defaults.worksheetTitle")}</div>

            {lesson.producerName?.trim() ? (
              <div className="pdf-producer">
                {t("labels.producer")}: {lesson.producerName.trim()}
              </div>
            ) : null}

            {lesson.level?.trim() ? (
              <div className="pdf-meta">
                {t("labels.level")}: {lesson.level.trim()}
              </div>
            ) : null}
          </div>

          {/* 321skole logo (legg filen i /public) */}
          <div className="pdf-logoWrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/321skole-logo.png"
              alt="321skole"
              className="pdf-logo"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        </div>

        {/* Name / Date / Class */}
        <div className="pdf-identity">
          <div className="line">
            <span>{t("identity.name")}:</span> <span className="blank" />
          </div>
          <div className="line">
            <span>{t("identity.date")}:</span> <span className="blank" />
          </div>
          <div className="line">
            <span>{t("identity.class")}:</span> <span className="blank" />
          </div>
        </div>

        {/* Banner image (formatstyrt) */}
        {lesson.coverImageUrl?.trim() ? (
          <div className={`pdf-banner ${coverFmt === "4:3" ? "is-4x3" : "is-16x9"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lesson.coverImageUrl.trim()} alt={t("labels.bannerAlt")} />
          </div>
        ) : null}

        {/* PAGE 1: Reading text */}
        <section className="pdf-section">
          <h2 className="pdf-h2">{t("sections.readingText")}</h2>
          <div className="pdf-reading">
            {safeText(lesson.sourceText)
              .split("\n")
              .map((p, i) => (
                <p key={i}>{p.trim() ? p : "\u00A0"}</p>
              ))}
          </div>
        </section>

        {/* Force page break before tasks */}
        <div className="page-break" />

        {/* PAGE 2+: Tasks */}
        <section className="pdf-section">
          <h2 className="pdf-h2">{t("sections.tasks")}</h2>

          {tasks.length === 0 ? (
            <div style={{ opacity: 0.7 }}>{t("tasksEmpty")}</div>
          ) : (
            <ol className="pdf-tasks">
              {tasks.map((task) => (
                <li key={task.id} className="pdf-task">
                  <div className="task-prompt">{task.prompt}</div>

                  {/* MCQ */}
                  {task.type === "mcq" ? (
                    <div className="task-box">
                      <div className="choices">
                        {(Array.isArray(task.options) ? task.options : []).map((opt, i) => (
                          <div className="choice" key={i}>
                            <span className="checkbox" />
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>

                      {teacherMode ? (
                        <div className="answer">
                          <b>{t("teacher.answerKey")}:</b>{" "}
                          {typeof task.correctAnswer === "string" ? task.correctAnswer : t("teacher.dash")}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* True/False */}
                  {task.type === "truefalse" ? (
                    <div className="task-box">
                      <div className="choices tf">
                        <div className="choice">
                          <span className="checkbox" />
                          <span>{t("answers.true")}</span>
                        </div>
                        <div className="choice">
                          <span className="checkbox" />
                          <span>{t("answers.false")}</span>
                        </div>
                      </div>

                      {teacherMode ? (
                        <div className="answer">
                          <b>{t("teacher.answerKey")}:</b>{" "}
                          {isTruthyString(task.correctAnswer) ? t("answers.true") : t("answers.false")}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Open */}
                  {task.type === "open" ? (
                    <div className="task-box">
                      <div className="write-lines">
                        {Array.from({ length: lineCountFor(task.answerSpace) }).map((_, i) => (
                          <div className="write-line" key={i} />
                        ))}
                      </div>

                      {teacherMode && typeof task.correctAnswer === "string" && task.correctAnswer.trim() ? (
                        <div className="answer">
                          <b>{t("teacher.suggestionNote")}:</b> {task.correctAnswer}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Global print styles */}
      <style jsx global>{`
        /* Paper */
        @page {
          size: A4;
          margin: 15mm;
        }

        /* Screen shell */
        .pdf-shell {
          padding: 16px;
        }
        .topbar {
          max-width: 980px;
          margin: 0 auto 12px auto;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
        }
        .btn {
          padding: 10px 14px;
          border: 1px solid #111;
          border-radius: 10px;
          background: #111;
          color: #fff;
          cursor: pointer;
        }
        .btn-lite {
          padding: 10px 14px;
          border: 1px solid #ddd;
          border-radius: 10px;
          background: #fff;
          text-decoration: none;
          color: inherit;
          display: inline-block;
        }

        /* Printable page container */
        .pdf-page {
          max-width: 980px;
          margin: 0 auto;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          color: #111;
        }

        .pdf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .pdf-title {
          font-size: 22px;
          font-weight: 900;
          line-height: 1.15;
        }
        .pdf-producer {
          margin-top: 6px;
          font-size: 13px;
          opacity: 0.85;
        }
        .pdf-meta {
          margin-top: 2px;
          font-size: 12px;
          opacity: 0.75;
        }

        .pdf-logoWrap {
          width: 120px;
          display: flex;
          justify-content: flex-end;
        }
        .pdf-logo {
          width: 110px;
          height: auto;
          object-fit: contain;
        }

        /* Name/Date/Class */
        .pdf-identity {
          margin-top: 10mm;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10mm;
          font-size: 12px;
        }
        .pdf-identity .line {
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .pdf-identity .blank {
          flex: 1;
          border-bottom: 1px solid #111;
          transform: translateY(-2px);
        }

        /* Banner: formatstyrt */
        .pdf-banner {
          margin: 8mm 0 6mm 0;
          width: 100%;
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
        }
        .pdf-banner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* 16:9 = lavere banner (mer header) */
        .pdf-banner.is-16x9 {
          height: 45mm;
        }

        /* 4:3 = høyere banner (mer klassisk bildeflate) */
        .pdf-banner.is-4x3 {
          height: 60mm;
        }

        /* Sections */
        .pdf-section {
          margin-top: 6mm;
        }
        .pdf-h2 {
          font-size: 15px;
          font-weight: 900;
          margin: 0 0 4mm 0;
        }

        /* Reading text */
        .pdf-reading {
          font-size: 12.5px;
          line-height: 1.55;
        }
        .pdf-reading p {
          margin: 0 0 3mm 0;
          white-space: pre-wrap;
        }

        /* Tasks */
        .pdf-tasks {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6mm;
        }
        .pdf-task {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .task-prompt {
          font-size: 12.5px;
          font-weight: 700;
          margin-bottom: 3mm;
        }
        .task-box {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px;
        }

        .choices {
          display: grid;
          gap: 6px;
        }
        .choices.tf {
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          max-width: 260px;
        }
        .choice {
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: 12.5px;
        }
        .checkbox {
          width: 14px;
          height: 14px;
          border: 1.5px solid #111;
          border-radius: 3px;
          display: inline-block;
        }

        /* Writing lines */
        .write-lines {
          display: grid;
          gap: 6mm;
          padding: 2mm 0 1mm 0;
        }
        .write-line {
          height: 0;
          border-bottom: 1px solid #111;
          opacity: 0.55;
        }

        .answer {
          margin-top: 8px;
          font-size: 12px;
          opacity: 0.9;
          border-top: 1px dashed #cbd5e1;
          padding-top: 8px;
        }

        /* Page break between reading and tasks */
        .page-break {
          break-before: page;
          page-break-before: always;
          height: 0;
        }

        /* Print: hide topbar */
        @media print {
          .no-print {
            display: none !important;
          }
          .pdf-shell {
            padding: 0;
          }
          .pdf-page {
            max-width: unset;
            margin: 0;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
        }
      `}</style>
    </main>
  );
}