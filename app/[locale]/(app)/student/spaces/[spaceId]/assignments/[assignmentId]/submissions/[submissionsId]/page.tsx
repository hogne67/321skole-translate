// app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/submissions/[submissionsId]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function ownerFromDoc(d: Record<string, unknown>): string | null {
  const uidTop = typeof d.uid === "string" ? d.uid : null;
  if (uidTop) return uidTop;

  const auth = d.auth;
  if (isRecord(auth) && typeof auth.uid === "string") return auth.uid;

  return null;
}

export default function StudentSubmissionPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("studentSubmission");

  // IMPORTANT:
  // Folder name is [submissionsId] -> param key is "submissionsId" (not "submissionId")
  const params = useParams<{
    locale: string;
    spaceId: string;
    assignmentId: string;
    submissionsId: string;
  }>();

  const spaceId = params?.spaceId;
  const assignmentId = params?.assignmentId;
  const submissionsId = params?.submissionsId;

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [docData, setDocData] = useState<Record<string, unknown> | null>(null);
  const [text, setText] = useState<string>("");

  const locked = useMemo(() => {
    if (!docData) return false;
    const reviewedAt = docData.reviewedAt;
    const status = String(docData.status ?? "").toLowerCase().trim();
    return !!reviewedAt || status === "reviewed";
  }, [docData]);

  const teacherFeedbackText = useMemo(() => {
    if (!docData) return "";
    const tf = docData.teacherFeedback;
    if (!isRecord(tf)) return "";
    return typeof tf.text === "string" ? tf.text : "";
  }, [docData]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!spaceId || !assignmentId || !submissionsId) return;
      setLoading(true);
      setErr(null);

      try {
        const ref = doc(
          db,
          "spaces",
          spaceId,
          "lessons",
          assignmentId,
          "submissions",
          submissionsId
        );
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error(t("errors.notFound"));

        const dUnknown = snap.data() as unknown;
        const d = isRecord(dUnknown) ? dUnknown : {};

        // client-side ownership check (rules should enforce too)
        const ownerUid = ownerFromDoc(d);
        if (ownerUid && uid && ownerUid !== uid) {
          throw new Error(t("errors.noAccess"));
        }

        const answers = isRecord(d.answers) ? d.answers : {};
        const pretty = JSON.stringify(answers, null, 2);

        if (!alive) return;
        setDocData(d);
        setText(pretty);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [spaceId, assignmentId, submissionsId, uid, t]);

  async function save() {
    if (!spaceId || !assignmentId || !submissionsId) return;
    setErr(null);

    try {
      if (locked) throw new Error(t("errors.locked"));

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("errors.invalidJson"));
      }

      if (!isRecord(parsed)) throw new Error(t("errors.answersMustBeObject"));

      const ref = doc(
        db,
        "spaces",
        spaceId,
        "lessons",
        assignmentId,
        "submissions",
        submissionsId
      );

      await updateDoc(ref, {
        answers: parsed,
        updatedAt: serverTimestamp(),
      });

      router.back();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.saveFailed"));
    }
  }

  const assignmentHref =
    spaceId && assignmentId
      ? `/${locale}/student/spaces/${spaceId}/assignments/${assignmentId}`
      : `/${locale}/student/spaces`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-black">{t("title")}</h1>
          <div className="mt-1 text-xs opacity-70">
            {t("submissionIdLabel")}{" "}
            <code className="rounded bg-muted px-1 py-0.5">{submissionsId}</code>
          </div>
          <div className="mt-1 text-xs opacity-70">
            {t("spaceLabel")}{" "}
            <code className="rounded bg-muted px-1 py-0.5">{spaceId}</code>{" "}
            <span className="opacity-60">•</span> {t("assignmentLabel")}{" "}
            <code className="rounded bg-muted px-1 py-0.5">{assignmentId}</code>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={assignmentHref}
            className="rounded-xl border bg-background px-4 py-2 text-sm font-extrabold"
          >
            {t("toAssignment")}
          </Link>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border bg-background px-4 py-2 text-sm font-extrabold"
          >
            {t("back")}
          </button>

          <button
            type="button"
            onClick={save}
            disabled={loading || locked}
            className="rounded-xl border border-foreground bg-foreground px-4 py-2 text-sm font-extrabold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locked ? t("locked") : t("save")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm opacity-70">{t("loading")}</div>
      ) : err ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-sm font-extrabold">{t("errorTitle")}</div>
          <div className="mt-1 whitespace-pre-wrap text-sm">{err}</div>
        </div>
      ) : (
        <>
          {teacherFeedbackText ? (
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div className="mb-1 text-sm font-extrabold">
                {t("teacherFeedbackTitle")}
              </div>
              <div className="whitespace-pre-wrap text-sm">
                {teacherFeedbackText}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm opacity-70">{t("noFeedback")}</div>
          )}

          {locked && (
            <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
              {t.rich("lockedNotice", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
          )}

          <div className="mt-4">
            <div className="mb-2 text-sm font-extrabold">{t("answersTitle")}</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={locked}
              className="min-h-[420px] w-full rounded-xl border bg-background p-3 font-mono text-xs"
            />
            <div className="mt-2 text-xs opacity-70">{t("helper")}</div>
          </div>
        </>
      )}
    </main>
  );
}