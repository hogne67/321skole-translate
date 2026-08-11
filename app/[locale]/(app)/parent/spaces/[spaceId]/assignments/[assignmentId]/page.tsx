// app/[locale]/(app)/parent/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import type { SpaceDoc } from "@/lib/spacesClient";

import {
  buildAutoResultatForParent,
  buildOppgaveStringForParent,
  buildParentSubmissionId,
  buildSvarStringForParent,
  childMessageFromParentAi,
  coerceTopics,
  errMessage,
  evaluateAnswers,
  firstLongText,
  getStableTaskId,
  hasChildSelfReport,
  isAnswered,
  isRecord,
  kindLabel,
  looksLikeLibraryAssignment,
  pickImageUrl,
  renderAutoSummary,
  requireDb,
  safeNumber,
  safeString,
  safeTasksArray,
  sortTasksByOrder,
  starsLabel,
  taskOptions,
  taskPrompt,
  taskType,
  type AssignmentDoc,
  type ParentReviewDoc,
  type SubmissionDoc,
} from "./assignmentDetailUtils";

export default function ParentAssignmentDetailPage() {
  const { spaceId, assignmentId } = useParams<{ spaceId: string; assignmentId: string }>();
  const t = useTranslations("parentAssignmentDetail");

  const [user, setUser] = useState<User | null>(null);

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);

  const [spaceMissing, setSpaceMissing] = useState(false);
  const [assignmentMissing, setAssignmentMissing] = useState(false);

  const [spaceErr, setSpaceErr] = useState<string | null>(null);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);

  const [review, setReview] = useState<ParentReviewDoc | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  const [submission, setSubmission] = useState<SubmissionDoc | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const [parentAiSuggestion, setParentAiSuggestion] = useState<string | null>(null);
  const [parentAiBusy, setParentAiBusy] = useState(false);
  const [parentAiMsg, setParentAiMsg] = useState<string | null>(null);

  const backHref = `/parent/spaces/${spaceId}`;
  const parentAiRequiresEmailVerification =
    !!user &&
    !user.emailVerified &&
    user.providerData.some((provider) => provider.providerId === "password");

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    setSpaceErr(null);
    setSpaceMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId),
        (snap) => {
          if (!snap.exists()) {
            setSpace(null);
            setSpaceMissing(true);
            return;
          }

          setSpaceMissing(false);
          setSpace(snap.data() as SpaceDoc);
        },
        (e: unknown) => setSpaceErr(errMessage(e, t("errors.readSpace")))
      );
    } catch (e: unknown) {
      setSpaceErr(errMessage(e, t("errors.listenSpaceStart")));
    }

    return () => unsub?.();
  }, [spaceId, t]);

  useEffect(() => {
    setAssignmentErr(null);
    setAssignmentMissing(false);

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId),
        (snap) => {
          if (!snap.exists()) {
            setAssignment(null);
            setAssignmentMissing(true);
            return;
          }

          setAssignmentMissing(false);
          setAssignment(snap.data() as AssignmentDoc);
        },
        (e: unknown) => setAssignmentErr(errMessage(e, t("errors.readAssignment")))
      );
    } catch (e: unknown) {
      setAssignmentErr(errMessage(e, t("errors.listenAssignmentStart")));
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, t]);

  useEffect(() => {
    if (!user?.uid) return;

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        (snap) => {
          if (!snap.exists()) {
            setReview(null);
            setReviewComment("");
            setReviewStars(0);
            return;
          }

          const data = snap.data() as ParentReviewDoc;
          setReview(data);
          setReviewComment(safeString(data.comment) ?? "");
          setReviewStars(safeNumber(data.stars) ?? 0);
        }
      );
    } catch {
      // Parent review is optional. Ignore listener start errors here.
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let unsub: (() => void) | null = null;

    try {
      const dbx = requireDb(db);
      const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

      unsub = onSnapshot(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
        (snap) => {
          if (!snap.exists()) {
            setSubmission(null);
            setAiFeedback(null);
            return;
          }

          const data = snap.data() as SubmissionDoc;
          setSubmission(data);

          if (isRecord(data.answers)) {
            const next: Record<string, string | boolean> = {};
            for (const [k, v] of Object.entries(data.answers)) {
              if (typeof v === "string" || typeof v === "boolean") next[k] = v;
            }
            setAnswers(next);
          }

          setAiFeedback(safeString(data.aiFeedback));
        }
      );
    } catch {
      // Parent submission is optional. Ignore listener start errors here.
    }

    return () => unsub?.();
  }, [spaceId, assignmentId, user?.uid]);

  const spaceRec: Record<string, unknown> = isRecord(space) ? (space as Record<string, unknown>) : {};
  const spaceTitle = safeString(spaceRec.title) ?? t("header.defaultSpaceTitle");
  const spaceKind = safeString(spaceRec.kind);

  const assignmentTitle = safeString(assignment?.title) ?? t("header.defaultAssignmentTitle");

  const topics = useMemo(() => (assignment ? coerceTopics(assignment) : []), [assignment]);
  const img = useMemo(() => (assignment ? pickImageUrl(assignment) : null), [assignment]);
  const sourceTextSafe = useMemo(() => (assignment ? firstLongText(assignment) ?? "" : ""), [assignment]);

  const tasksOriginal = useMemo(() => {
    const arr = safeTasksArray(assignment?.tasks);
    return arr.slice().sort(sortTasksByOrder);
  }, [assignment?.tasks]);

  const level = safeString(assignment?.level);
  const language = safeString(assignment?.language);
  const archived =
    assignment?.archived === true || String(assignment?.status ?? "").toLowerCase() === "archived";

  const libraryAssignment = looksLikeLibraryAssignment(assignment);
  const autoSummary = renderAutoSummary(submission?.auto);
  const childSelfReport = submission?.childSelfReport ?? null;
  const showChildSelfReport = hasChildSelfReport(childSelfReport);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => isAnswered(v)).length,
    [answers]
  );

  function setAnswer(taskId: string, value: string | boolean) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  async function generateParentFeedbackSuggestion() {
    if (!assignment) return;
    if (parentAiRequiresEmailVerification) {
      setParentAiMsg(t("parentAi.verifyRequired"));
      return;
    }

    setParentAiBusy(true);
    setParentAiMsg(null);

    try {
      const selfReportLines: string[] = [];

      if (childSelfReport?.readSilently) selfReportLines.push(t("childSelfReport.readSilently"));
      if (childSelfReport?.readAloud) selfReportLines.push(t("childSelfReport.readAloud"));
      if (childSelfReport?.completedTasks) selfReportLines.push(t("childSelfReport.completedTasks"));
      if (childSelfReport?.feltEasy) selfReportLines.push(t("childSelfReport.feltEasy"));
      if (childSelfReport?.feltHard) selfReportLines.push(t("childSelfReport.feltHard"));

      const childComment = safeString(childSelfReport?.comment);

      const workStatus = [
        tasksOriginal.length > 0
          ? `Barnet har svart på ${answeredCount} av ${tasksOriginal.length} oppgaver.`
          : "",
        autoSummary ? `Autokorrekt resultat: ${autoSummary}.` : "",
        "Ikke skriv at barnet ikke har levert arbeid hvis noen oppgaver er besvart.",
        "Hvis åpne svar er svært korte, skriv heller at barnet kan utvikle svaret mer neste gang.",
      ]
        .filter(Boolean)
        .join("\n");

      const answerLines = tasksOriginal.map((task, idx) => {
        const stableId = getStableTaskId(task, idx);
        const type = taskType(task);
        const prompt = taskPrompt(task);
        const answer = answers[stableId];

        const answerText =
          typeof answer === "boolean"
            ? answer
              ? "Sant"
              : "Usant"
            : typeof answer === "string"
              ? answer.trim()
              : "";

        return [
          `Oppgave ${task.order ?? idx + 1}`,
          `Type: ${type}`,
          prompt ? `Spørsmål: ${prompt}` : "",
          answerText ? `Barnets svar: ${answerText}` : "Barnets svar: ikke svart",
        ]
          .filter(Boolean)
          .join("\n");
      });

      const answersDetail = answerLines.join("\n\n");

      const response = await fetch("/api/parent-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentTitle,
          sourceText: sourceTextSafe,
          autoSummary: autoSummary ?? "",
          aiFeedback: aiFeedback ?? "",
          childComment: childComment ?? "",
          childSelfReport: selfReportLines,
          answersSummary: `${workStatus}\n\nFaktiske svar fra barnet:\n${answersDetail}`,
          parentGoal: "",
        }),
      });

      if (!response.ok) throw new Error(t("parentAi.error"));

      const data: unknown = await response.json();
      const d = data as {
        parentMessage?: unknown;
        childMessage?: unknown;
        nextStep?: unknown;
      };

      const parentMessage = typeof d.parentMessage === "string" ? d.parentMessage.trim() : "";
      const childMessage = typeof d.childMessage === "string" ? d.childMessage.trim() : "";
      const nextStep = typeof d.nextStep === "string" ? d.nextStep.trim() : "";

      const combined = [
        parentMessage ? `👨‍👩‍👧 Til forelderen\n\n${parentMessage}` : "",
        childMessage ? `💬 Forslag til melding til barnet\n\n${childMessage}` : "",
        nextStep ? `🎯 Neste steg hjemme\n\n${nextStep}` : "",
      ]
        .filter(Boolean)
        .join("\n\n--------------------\n\n");

      if (!combined.trim()) throw new Error(t("parentAi.empty"));

      setParentAiSuggestion(combined);
    } catch (e: unknown) {
      setParentAiMsg(e instanceof Error ? e.message : t("parentAi.error"));
    } finally {
      setParentAiBusy(false);
    }
  }

  async function saveParentReview() {
    if (!user?.uid) {
      setReviewMsg(t("errors.saveReviewLogin"));
      return;
    }

    setSavingReview(true);
    setReviewMsg(null);

    try {
      const dbx = requireDb(db);
      await setDoc(
        doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
        {
          uid: user.uid,
          comment: reviewComment.trim(),
          stars: reviewStars,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setReviewMsg(t("review.saved"));
    } catch (e: unknown) {
      setReviewMsg(errMessage(e, t("errors.saveReviewFailed")));
    } finally {
      setSavingReview(false);
    }
  }

  async function submitAssignment() {
    if (!assignment || !user?.uid) {
      setSubmitMsg(t("errors.submitLogin"));
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    try {
      const dbx = requireDb(db);
      const auto = evaluateAnswers(tasksOriginal, answers);

      let nextAiFeedback: string | null = null;

      if (libraryAssignment) {
        try {
          const lesetekst = (assignment.sourceText ?? assignment.text ?? assignment.description ?? "").trim();
          const oppgave = buildOppgaveStringForParent(assignment, t);
          const svar = buildSvarStringForParent(assignment, answers, t);
          const autoResultat = buildAutoResultatForParent(assignment, answers, t);
          const nivå = `${String(assignment.level ?? "A2")} (mål: C1)`;

          if (svar || autoResultat) {
            const response = await fetch("/api/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lesetekst,
                oppgave,
                svar,
                nivå,
                autoResultat,
                locale: "no",
              }),
            });

            if (response.ok) {
              const data: unknown = await response.json();
              const d = data as { feedback?: unknown };
              nextAiFeedback = typeof d?.feedback === "string" ? d.feedback : null;
            }
          }
        } catch {
          nextAiFeedback = null;
        }
      }

      const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

      const nestedRef = doc(
        dbx,
        "spaces",
        spaceId,
        "lessons",
        assignmentId,
        "submissions",
        submissionId
      );

      const indexRef = doc(dbx, "spaceSubmissions", submissionId);

      const payload = {
        spaceId,
        assignmentId,
        uid: user.uid,

        status: "submitted",
        title: assignmentTitle,

        answers,
        auto,
        aiFeedback: nextAiFeedback,

        sourceType: assignment.sourceType ?? null,
        sourceId: assignment.sourceId ?? null,
        level: assignment.level ?? null,
        language: assignment.language ?? null,

        role: "parent",
        isParentFlow: true,

        parentCommentSnapshot: reviewComment.trim(),
        parentStarsSnapshot: reviewStars,

        submittedAt: Date.now(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      const batch = writeBatch(dbx);
      batch.set(nestedRef, payload, { merge: true });
      batch.set(indexRef, payload, { merge: true });
      await batch.commit();

      setAiFeedback(nextAiFeedback);
      setSubmitMsg(t("submission.saved"));

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e: unknown) {
      setSubmitMsg(errMessage(e, t("errors.submitFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  if (spaceMissing || assignmentMissing) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("missing.title")}</h1>
        <div style={{ opacity: 0.75 }}>{t("missing.subtitle")}</div>
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{t("actions.backToSpace")}</Link>
        </div>
      </div>
    );
  }

  if (spaceErr || assignmentErr) {
    return (
      <div style={{ padding: 16 }}>
        <h1>{t("error.title")}</h1>
        {spaceErr ? <div style={{ color: "crimson", marginTop: 8 }}>{spaceErr}</div> : null}
        {assignmentErr ? <div style={{ color: "crimson", marginTop: 8 }}>{assignmentErr}</div> : null}
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{t("actions.backToSpace")}</Link>
        </div>
      </div>
    );
  }

  if (!space || !assignment) {
    return <div style={{ padding: 16 }}>{t("loading")}</div>;
  }

  return (
    <main style={pageWrap}>
      <header style={topHeader}>
        <div>
          <div style={{ opacity: 0.72, marginBottom: 6 }}>
            {spaceTitle} • {kindLabel(spaceKind, t)}
          </div>

          <h1 style={{ margin: "0 0 6px", fontSize: "clamp(1.7rem, 3vw, 2.4rem)", lineHeight: 1.08 }}>
            {assignmentTitle}
          </h1>

          <div style={{ opacity: 0.75, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {level ? <span>{level}</span> : null}
            {language ? <span>• {language.toUpperCase()}</span> : null}
            {topics.length ? <span>• {topics.slice(0, 3).join(" • ")}</span> : null}
            {libraryAssignment ? <span>• {t("task.library")}</span> : null}
            {archived ? <span>• {t("task.archived")}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link href={backHref} style={secondaryBtn}>
            {t("actions.backToSpace")}
          </Link>
        </div>
      </header>

      <div style={mainGrid}>
        <div style={leftColumn}>
          <section style={card}>
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 18,
                border: "1px solid rgba(15,23,42,0.10)",
                overflow: "hidden",
                background: "rgba(15,23,42,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={assignmentTitle}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ opacity: 0.65 }}>{t("content.noCover")}</div>
              )}
            </div>

            {assignment.description ? (
              <p style={{ marginTop: 14, marginBottom: 0, opacity: 0.85, lineHeight: 1.55 }}>
                {assignment.description}
              </p>
            ) : null}
          </section>

          <section style={card}>
            <h2 style={sectionTitle}>{t("sections.text")}</h2>

            <div style={textPanel}>
              {sourceTextSafe.trim() ? (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{sourceTextSafe}</div>
              ) : (
                <span style={{ opacity: 0.6 }}>{t("content.none")}</span>
              )}
            </div>
          </section>

          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={sectionTitle}>{t("sections.tasks")}</h2>
              <div style={smallMuted}>
                {answeredCount} / {tasksOriginal.length}
              </div>
            </div>

            {tasksOriginal.length === 0 ? (
              <p style={{ opacity: 0.7 }}>{t("content.noTasks")}</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {tasksOriginal.map((task, idx) => {
                  const stableId = getStableTaskId(task, idx);
                  const type = taskType(task);
                  const prompt = taskPrompt(task);
                  const options = taskOptions(task);
                  const current = answers[stableId];
                  const taskAuto = submission?.auto?.byTask?.[stableId];
                  const hasAnswer = isAnswered(current);

                  return (
                    <div key={stableId} style={taskCard}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          opacity: 0.82,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <strong>
                            {t("task.label")} {typeof task.order === "number" ? task.order : idx + 1}
                          </strong>
                          <span style={{ marginLeft: 8 }}>• {type}</span>
                        </div>

                        {typeof taskAuto?.correct === "boolean" ? (
                          <span style={taskAuto.correct ? correctBadge : wrongBadge}>
                            {taskAuto.correct ? t("task.correct") : t("task.incorrect")}
                          </span>
                        ) : hasAnswer ? (
                          <span style={neutralBadge}>{t("task.answerRegistered")}</span>
                        ) : (
                          <span style={emptyBadge}>{t("task.notAnsweredYet")}</span>
                        )}
                      </div>

                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: 10 }}>
                        {prompt}
                      </div>

                      {type === "mcq" && options.length > 0 ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          {options.map((opt, i) => {
                            const checked = current === opt;

                            return (
                              <label
                                key={`${stableId}-${i}`}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 8,
                                  padding: "9px 10px",
                                  border: "1px solid rgba(15,23,42,0.10)",
                                  borderRadius: 12,
                                  background: checked ? "rgba(239,246,255,1)" : "white",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={stableId}
                                  checked={checked}
                                  onChange={() => setAnswer(stableId, opt)}
                                />
                                <div>{opt}</div>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}

                      {type === "truefalse" ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setAnswer(stableId, true)}
                            style={{
                              ...pillButton,
                              background: current === true ? "#111" : "rgba(15,23,42,0.04)",
                              color: current === true ? "#fff" : "#111",
                            }}
                          >
                            {t("answers.true")}
                          </button>

                          <button
                            type="button"
                            onClick={() => setAnswer(stableId, false)}
                            style={{
                              ...pillButton,
                              background: current === false ? "#111" : "rgba(15,23,42,0.04)",
                              color: current === false ? "#fff" : "#111",
                            }}
                          >
                            {t("answers.false")}
                          </button>
                        </div>
                      ) : null}

                      {type === "open" ? (
                        <textarea
                          value={typeof current === "string" ? current : ""}
                          onChange={(e) => setAnswer(stableId, e.target.value)}
                          rows={4}
                          placeholder={t("task.answerHere")}
                          style={textareaStyle}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {submitMsg ? <div style={submitStatusText}>{submitMsg}</div> : null}

              <button type="button" onClick={submitAssignment} disabled={submitting} style={startBtn}>
                {submitting ? t("actions.submitting") : t("actions.submit")}
              </button>

              <Link href={backHref} style={secondaryBtn}>
                {t("actions.backToSpace")}
              </Link>
            </div>
          </section>
        </div>

        <aside style={rightColumn}>
          {autoSummary ? (
            <section style={feedbackBanner}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{t("feedback.autoResult")}</div>
              <div style={{ opacity: 0.84 }}>{autoSummary}</div>
            </section>
          ) : null}

          {showChildSelfReport ? (
            <section style={selfReportCard}>
              <div style={{ fontWeight: 900, marginBottom: 8, color: "rgba(6,95,70,1)" }}>
                {t("childSelfReport.title")}
              </div>

              <div style={{ opacity: 0.82, lineHeight: 1.5, marginBottom: 12 }}>
                {t("childSelfReport.intro")}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {childSelfReport?.readSilently ? <div style={selfReportLine}>✓ {t("childSelfReport.readSilently")}</div> : null}
                {childSelfReport?.readAloud ? <div style={selfReportLine}>✓ {t("childSelfReport.readAloud")}</div> : null}
                {childSelfReport?.completedTasks ? <div style={selfReportLine}>✓ {t("childSelfReport.completedTasks")}</div> : null}
                {childSelfReport?.feltEasy ? <div style={selfReportLine}>✓ {t("childSelfReport.feltEasy")}</div> : null}
                {childSelfReport?.feltHard ? <div style={selfReportLine}>✓ {t("childSelfReport.feltHard")}</div> : null}
              </div>

              {safeString(childSelfReport?.comment) ? (
                <div style={innerWhiteBox}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(6,95,70,1)", marginBottom: 6 }}>
                    {t("childSelfReport.commentFromChild")}
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                    {safeString(childSelfReport?.comment)}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section style={aiCard}>
            <div style={{ fontWeight: 900, marginBottom: 8, color: "rgba(30,64,175,1)" }}>
              {t("parentAi.title")}
            </div>

            <div style={{ opacity: 0.82, lineHeight: 1.5, marginBottom: 12 }}>
              {t("parentAi.intro")}
            </div>

            <button
              type="button"
              onClick={generateParentFeedbackSuggestion}
              disabled={parentAiBusy || parentAiRequiresEmailVerification}
              style={{
                ...darkBtn,
                width: "100%",
                background:
                  parentAiBusy || parentAiRequiresEmailVerification
                    ? "rgba(30,64,175,0.55)"
                    : "rgba(30,64,175,1)",
              }}
            >
              {parentAiBusy ? t("parentAi.generating") : t("parentAi.button")}
            </button>

            {parentAiMsg ? <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{parentAiMsg}</div> : null}

            {parentAiSuggestion ? (
              <div style={innerWhiteBox}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(30,64,175,1)", marginBottom: 6 }}>
                  {t("parentAi.suggestion")}
                </div>

                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{parentAiSuggestion}</div>

                <button
                  type="button"
                  onClick={() => setReviewComment(childMessageFromParentAi(parentAiSuggestion))}
                  style={{ ...btnStyle, marginTop: 12 }}
                >
                  {t("parentAi.useAsComment")}
                </button>
              </div>
            ) : null}
          </section>

          <section style={card}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>{t("review.title")}</div>

            <div style={{ opacity: 0.8, lineHeight: 1.5, marginBottom: 12 }}>{t("review.intro")}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = n <= reviewStars;

                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewStars(n)}
                    style={{
                      border: "1px solid rgba(0,0,0,0.12)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      background: active ? "#111" : "#fff",
                      color: active ? "#fff" : "#111",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    ★ {n}
                  </button>
                );
              })}
            </div>

            {reviewStars > 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 10 }}>{starsLabel(reviewStars, t)}</div>
            ) : null}

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={5}
              placeholder={t("review.placeholder")}
              style={textareaStyle}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <button type="button" onClick={saveParentReview} disabled={savingReview} style={darkBtn}>
                {savingReview ? t("review.saving") : t("actions.saveComment")}
              </button>

              {review ? <span style={{ opacity: 0.7, fontSize: 13 }}>{t("review.existing")}</span> : null}
              {reviewMsg ? <span style={{ opacity: 0.8, fontSize: 13 }}>{reviewMsg}</span> : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

const pageWrap: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: 16,
};

const topHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const mainGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.75fr)",
  gap: 18,
  alignItems: "start",
  marginTop: 18,
};

const leftColumn: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const rightColumn: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const card: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 18,
  background: "white",
  padding: 16,
  boxShadow: "0 10px 30px rgba(15,23,42,0.04)",
};

const aiCard: React.CSSProperties = {
  border: "1px solid rgba(59,130,246,0.22)",
  borderRadius: 18,
  background: "rgba(239,246,255,1)",
  padding: 16,
  boxShadow: "0 10px 30px rgba(30,64,175,0.05)",
};

const selfReportCard: React.CSSProperties = {
  border: "1px solid rgba(16,185,129,0.28)",
  borderRadius: 18,
  background: "rgba(236,253,245,1)",
  padding: 16,
  boxShadow: "0 10px 30px rgba(6,95,70,0.05)",
};

const feedbackBanner: React.CSSProperties = {
  border: "1px solid rgba(59,130,246,0.20)",
  borderRadius: 18,
  background: "rgba(239,246,255,1)",
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 12px",
};

const textPanel: React.CSSProperties = {
  padding: 14,
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 14,
  lineHeight: 1.55,
  background: "rgba(248,250,252,1)",
};

const taskCard: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(248,250,252,0.75)",
};

const innerWhiteBox: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 14,
  background: "white",
  padding: 12,
};

const btnStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  cursor: "pointer",
};

const startBtn: React.CSSProperties = {
  border: "1px solid rgba(34,197,94,0.45)",
  borderRadius: 12,
  padding: "11px 16px",
  textDecoration: "none",
  background: "rgba(187,247,208,1)",
  color: "rgba(20,83,45,1)",
  fontWeight: 900,
  letterSpacing: 0.2,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  background: "white",
  color: "black",
};

const darkBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const pillButton: React.CSSProperties = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.14)",
  cursor: "pointer",
  fontWeight: 700,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(15,23,42,0.14)",
  borderRadius: 12,
  padding: 12,
  resize: "vertical",
  font: "inherit",
  background: "white",
};

const selfReportLine: React.CSSProperties = {
  border: "1px solid rgba(16,185,129,0.20)",
  borderRadius: 12,
  background: "white",
  padding: "10px 12px",
  fontWeight: 700,
  color: "rgba(15,23,42,1)",
};

const smallMuted: React.CSSProperties = {
  opacity: 0.68,
  fontSize: 13,
  fontWeight: 800,
};

const submitStatusText: React.CSSProperties = {
  flex: "1 1 220px",
  alignSelf: "center",
  opacity: 0.78,
  fontSize: 13,
};

const neutralBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  border: "1px solid rgba(59,130,246,0.22)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(239,246,255,1)",
  color: "rgba(30,64,175,1)",
};

const emptyBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(248,250,252,1)",
  color: "rgba(100,116,139,1)",
};

const correctBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid rgba(22,163,74,0.35)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(220,252,231,1)",
  color: "rgba(22,101,52,1)",
};

const wrongBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid rgba(234,179,8,0.40)",
  borderRadius: 999,
  padding: "4px 8px",
  background: "rgba(254,249,195,1)",
  color: "rgba(113,63,18,1)",
};
