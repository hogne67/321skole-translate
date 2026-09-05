// app/[locale]/(app)/producer/[id]/print/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { useLocale, useTranslations } from "next-intl";
import { logUsageEvent } from "@/lib/usageClient";

type TaskType = "truefalse" | "mcq" | "open";
type AnswerSpace = "short" | "medium" | "long";
type TextSize = "normal" | "large" | "xlarge";

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
  highFrequencyWord?: string;
  highFrequencyReadingSentences?: string;
  highFrequencyExplanation?: string;
  status?: "draft" | "published";
  tasks?: Task[];

  producerName?: string;
  coverImageUrl?: string;

  topic?: string;
  language?: string;
  tags?: string[];
  estimatedMinutes?: number;
  textSize?: TextSize;
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
  if (space === "short") return 5;
  if (space === "long") return 14;
  return 9;
}

function isTruthyString(v: unknown) {
  return String(v).toLowerCase() === "true";
}

function normalizeTextSize(value: unknown): TextSize {
  if (value === "large" || value === "xlarge") return value;
  return "normal";
}

function highFrequencyWordFromLesson(lesson?: Lesson | null): string {
  const stored = safeText(lesson?.highFrequencyWord).trim();
  if (stored) return stored;
  const title = safeText(lesson?.title);
  const dashParts = title.split(/[–-]/);
  return dashParts.length > 1 ? dashParts.at(-1)?.trim() || "" : "";
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
  const t = useTranslations("lessonPrint");
  const locale = useLocale();

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
      if (m === "Du har ikke tilgang til denne lesson (ownerId mismatch).") {
        return t("errors.noAccessOwnerMismatch");
      }
      if (m === "Kunne ikke laste lesson.") return t("errors.loadFailed");
      return m || t("errors.unknown");
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

        let loadedLesson: Lesson | null = null;

        // 1. Prøv egen/original lesson først
        try {
          const ownSnap = await getDoc(doc(db, "lessons", lessonId));

          if (ownSnap.exists()) {
            const data = ownSnap.data() as Lesson;

            const isOwner = !data.ownerId || data.ownerId === u;
            const isPublished = data.status === "published";

            if (isOwner || isPublished) {
              loadedLesson = data;
            }
          }
        } catch {
          // ignore - prøver published_lessons under
        }

        // 2. Hvis ikke tilgang/funnet: prøv published_lessons
        if (!loadedLesson) {
          const publishedSnap = await getDoc(doc(db, "published_lessons", lessonId));

          if (publishedSnap.exists()) {
            loadedLesson = publishedSnap.data() as Lesson;
          }
        }

        if (!alive) return;

        if (!loadedLesson) {
          setErr(t("errors.notFound"));
          setLesson(null);
          setLoading(false);
          return;
        }

        setLesson(loadedLesson);
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

  useEffect(() => {
    if (!lesson) return;

    let alive = true;

    (async () => {
      try {
        await logUsageEvent({
          feature: "pdf_download",
          contentId: lessonId,
          contentType: "lesson",
          source: lesson.status === "published" ? "library" : "own",
          path: window.location.pathname,
        });
      } catch (error) {
        if (!alive) return;
        console.error("PDF quota check failed:", error);
        setErr(error instanceof Error ? error.message : t("errors.loadFailed"));
        setLesson(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lesson, lessonId, t]);

  const tasks = useMemo(() => {
    const t0 = Array.isArray(lesson?.tasks) ? (lesson?.tasks ?? []) : [];
    return sortTasks(t0).filter((x) => safeText(x.prompt).trim().length > 0);
  }, [lesson]);

  const textSize = normalizeTextSize(lesson?.textSize);
  const highFrequencyWord = highFrequencyWordFromLesson(lesson);
  const highFrequencyReadingSentences = safeText(lesson?.highFrequencyReadingSentences).trim();
  const highFrequencyExplanation = safeText(lesson?.highFrequencyExplanation).trim();

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
          <Link href={`/${locale}/producer/${lessonId}`}>{t("nav.backToEditor")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pdf-print-root">
      <div className="pdf-shell">
        <div className="no-print topbar">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href={`/${locale}/producer/${lessonId}`} className="btn-lite">
              {t("nav.backToEditor")}
            </Link>

            <button className="btn" onClick={() => window.print()}>
              {t("actions.print")}
            </button>

            {!teacherMode ? (
              <Link href={`/${locale}/producer/${lessonId}/print?teacher=1`} className="btn-lite">
                {t("actions.teacherVersion")}
              </Link>
            ) : (
              <Link href={`/${locale}/producer/${lessonId}/print`} className="btn-lite">
                {t("actions.studentVersion")}
              </Link>
            )}
          </div>

          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>{t("tips.saveAsPdf")}</div>
        </div>

        <div className="pdf-page">
          <div className="pdf-topline" />

          <div className="pdf-header">
            <div className="pdf-headerMain">
              <div className="pdf-kicker">321school {t("labels.kicker")}</div>
              <div className="pdf-title">{lesson.title ?? t("defaults.worksheetTitle")}</div>

              <div className="pdf-metaRow">
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
            </div>

            <div className="pdf-brandBlock">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo321ny.png"
                alt="321school"
                className="pdf-logo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className="pdf-brandText">321school.com</div>
            </div>
          </div>

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

          {lesson.coverImageUrl?.trim() ? (
            <div className="pdf-banner is-16x9">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lesson.coverImageUrl.trim()} alt={t("labels.bannerAlt")} />
            </div>
          ) : null}

          <section className="pdf-section">
            <h2 className="pdf-h2">{t("sections.readingText")}</h2>
            <div className={`pdf-reading is-${textSize}`}>
              {safeText(lesson.sourceText)
                .split("\n")
                .map((p, i) => (
                  <p key={i}>{p.trim() ? p : "\u00A0"}</p>
                ))}
            </div>
          </section>

          {highFrequencyReadingSentences ? (
            <section className="pdf-section pdf-reading-extra">
              <h2 className="pdf-h2">
                {t("sections.highFrequencyReadingSentences", { word: highFrequencyWord })}
              </h2>
              <div className={`pdf-reading is-${textSize}`}>
                {highFrequencyReadingSentences
                  .split("\n")
                  .map((p, i) => (
                    <p key={i}>{p.trim() ? p : "\u00A0"}</p>
                  ))}
              </div>
            </section>
          ) : null}

          {highFrequencyExplanation ? (
            <section className="pdf-section pdf-teacher-note">
              <h2 className="pdf-h2">{t("sections.highFrequencyExplanation")}</h2>
              <div className="pdf-explanation">
                {highFrequencyExplanation
                  .split("\n")
                  .map((p, i) => (
                    <p key={i}>{p.trim() ? p : "\u00A0"}</p>
                  ))}
              </div>
            </section>
          ) : null}

          <div className="page-break" />

          <section className="pdf-section">
            <h2 className="pdf-h2">{t("sections.tasks")}</h2>

            {tasks.length === 0 ? (
              <div style={{ opacity: 0.7 }}>{t("tasksEmpty")}</div>
            ) : (
              <ol className="pdf-tasks">
                {tasks.map((task) => (
                  <li key={task.id} className="pdf-task">
                    <div className="task-prompt">{task.prompt}</div>

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
                            {typeof task.correctAnswer === "string"
                              ? task.correctAnswer
                              : t("teacher.dash")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

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
                            {isTruthyString(task.correctAnswer)
                              ? t("answers.true")
                              : t("answers.false")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {task.type === "open" ? (
                      <div className="task-box">
                        <div className="write-lines">
                          {Array.from({ length: lineCountFor(task.answerSpace) }).map((_, i) => (
                            <div className="write-line" key={i} />
                          ))}
                        </div>

                        {teacherMode &&
                          typeof task.correctAnswer === "string" &&
                          task.correctAnswer.trim() ? (
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
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 15mm;
        }

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

        .pdf-page {
          max-width: 980px;
          margin: 0 auto;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          color: #111;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 18mm 16mm;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }

        .pdf-topline {
          height: 5px;
          width: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #111827 0%, #374151 45%, #9ca3af 100%);
          margin: 0 0 8mm 0;
        }

        .pdf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .pdf-headerMain {
          flex: 1;
          min-width: 0;
        }

        .pdf-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 2mm;
        }

        .pdf-title {
          font-size: 24px;
          font-weight: 900;
          line-height: 1.08;
        }

        .pdf-metaRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 3mm;
        }

        .pdf-producer,
        .pdf-meta {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 11px;
          color: #374151;
          background: #f9fafb;
        }

        .pdf-brandBlock {
          width: 120px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .pdf-logo {
          width: 72px;
          height: auto;
          object-fit: contain;
        }

        .pdf-brandText {
          font-size: 9px;
          font-weight: 700;
          color: #6b7280;
        }

        .pdf-identity {
          margin-top: 9mm;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8mm;
          font-size: 12px;
        }

        .pdf-identity .line {
          display: flex;
          gap: 6px;
          align-items: baseline;
          padding: 6px 8px 4px 8px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fcfcfc;
        }

        .pdf-identity .blank {
          flex: 1;
          border-bottom: 1px solid #111;
          transform: translateY(-1px);
        }

        .pdf-banner {
          margin: 8mm 0 7mm 0;
          width: 100%;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          aspect-ratio: 16 / 9;
          background: #f3f4f6;
        }

        .pdf-banner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .pdf-section {
          margin-top: 7mm;
        }

        .pdf-h2 {
          font-size: 15px;
          font-weight: 900;
          margin: 0 0 4mm 0;
          padding-bottom: 2mm;
          border-bottom: 2px solid #111827;
        }

        .pdf-reading {
          font-size: 14px;
          line-height: 1.68;
        }

        .pdf-reading.is-large {
          font-size: 16px;
          line-height: 1.72;
        }

        .pdf-reading.is-xlarge {
          font-size: 18px;
          line-height: 1.75;
        }

        .pdf-reading p {
          margin: 0 0 3.2mm 0;
          white-space: pre-wrap;
        }

        .pdf-reading-extra {
          padding: 5mm;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          background: #eff6ff;
        }

        .pdf-teacher-note {
          padding: 5mm;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #f8fafc;
          color: #475569;
        }

        .pdf-explanation {
          font-size: 11px;
          line-height: 1.45;
        }

        .pdf-explanation p {
          margin: 0 0 2.2mm 0;
          white-space: pre-wrap;
        }

        .pdf-tasks {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 7mm;
        }

        .pdf-task {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .task-prompt {
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 3mm;
        }

        .task-box {
          border: 1px solid #dbe3ea;
          border-radius: 12px;
          padding: 12px;
          background: #ffffff;
        }

        .choices {
          display: grid;
          gap: 7px;
        }

        .choices.tf {
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          max-width: 280px;
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
          border-radius: 4px;
          display: inline-block;
        }

        .write-lines {
          display: grid;
          gap: 8mm;
          padding: 2mm 0 1mm 0;
        }

        .write-line {
          height: 0;
          border-bottom: 1px solid #111;
          opacity: 0.6;
        }

        .answer {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.95;
          border-top: 1px dashed #cbd5e1;
          padding-top: 8px;
          color: #374151;
        }

        .page-break {
          break-before: page;
          page-break-before: always;
          height: 0;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .pdf-print-root,
          .pdf-print-root * {
            visibility: visible !important;
          }

          .pdf-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .pdf-shell {
            padding: 0 !important;
          }

          .pdf-page {
            max-width: unset !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>
    </main>
  );
}
