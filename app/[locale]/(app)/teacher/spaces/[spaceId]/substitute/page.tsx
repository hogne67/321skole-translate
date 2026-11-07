"use client";

import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "@/lib/firebase";
import { isCurrentSpaceSubstitute, spaceSubstituteExpiry } from "@/lib/security/spaceAccess";
import { useUserProfile } from "@/lib/useUserProfile";

type Lesson = { id: string; title: string };
type Submission = { id: string; studentName: string; status: string; answers: unknown; feedback: string };
type RoomPage = { title: string; expiresAt: number; next: string | null; lessons?: Lesson[];
  assignment?: { title: string; prompts: { id: string; prompt: string }[] }; submissions?: Submission[] };

export default function SubstituteRoomPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { user, loading } = useUserProfile();
  const t = useTranslations("schoolAdmin.substitutes");
  if (loading) return <main className="p-6"><p role="status">{t("loading")}</p></main>;
  if (!user || user.isAnonymous) return <main className="p-6"><p>{t("unauthorized")}</p></main>;
  return <SubstituteRoom key={`${spaceId}:${user.uid}`} spaceId={spaceId} user={user} />;
}

function SubstituteRoom({ spaceId, user }: { spaceId: string; user: User }) {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin.substitutes");
  const url = `/api/teacher/spaces/${encodeURIComponent(spaceId)}/substitute`;
  const [expiry, setExpiry] = useState<number | null>();
  const [assignmentId, setAssignmentId] = useState("");
  const [after, setAfter] = useState("");
  const [page, setPage] = useState<RoomPage>();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const params = new URLSearchParams();
  if (assignmentId) params.set("assignmentId", assignmentId);
  if (after) params.set("after", after);
  const pageUrl = `${url}?${params}`;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function close() { setExpiry(null); setPage(undefined); }
    function track(end: number) {
      const left = end - Date.now();
      if (left <= 0) close();
      else timer = setTimeout(() => track(end), Math.min(left, 2_147_483_647));
    }
    const stop = onSnapshot(doc(db, "spaceMembers", `${spaceId}_${user.uid}`), snapshot => {
      clearTimeout(timer);
      const member = snapshot.data();
      const end = isCurrentSpaceSubstitute(member) ? spaceSubstituteExpiry(member) : null;
      if (end === null) close();
      else { setExpiry(end); track(end); }
    }, close);
    return () => { stop(); clearTimeout(timer); };
  }, [spaceId, user]);

  useEffect(() => {
    if (!expiry) return;
    const controller = new AbortController();
    const signedIn = user;
    async function load() {
      const token = await signedIn.getIdToken();
      const response = await fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Substitute access unavailable");
      const result: RoomPage = await response.json();
      if (!controller.signal.aborted) setPage(result);
    }
    void load().catch(() => {
      if (!controller.signal.aborted) { setPage(undefined); setError(true); }
    });
    return () => controller.abort();
  }, [expiry, pageUrl, revision, user]);

  function select(id: string, cursor = "") {
    setPage(undefined);
    setError(false);
    setSaved(false);
    setAssignmentId(id);
    setAfter(cursor);
  }

  async function save(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    if (!expiry || saving) return;
    const feedback = new FormData(event.currentTarget).get("feedback");
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, submissionId, feedback }) });
      if (!response.ok) throw new Error("Feedback unavailable");
      setSaved(true);
      setRevision(current => current + 1);
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
    <Link className="underline" href={`/${locale}/teacher/spaces`}>{t("myRooms")}</Link>
    <h1 className="text-2xl font-semibold">{expiry && page?.title ? page.title : t("title")}</h1>
    {expiry === null ? <p role="status">{t("grantUnavailable")}</p> : null}
    {error ? <p role="alert" className="text-red-700">{t("unavailable")}</p> : null}
    {expiry && saved ? <p role="status">{t("feedbackSaved")}</p> : null}
    {expiry && !page && !error ? <p role="status">{t("loading")}</p> : null}
    {expiry && page ? <>
      {page.lessons ? <ul className="space-y-2">{page.lessons.map(lesson => <li key={lesson.id}>
        <button type="button" className="underline" onClick={() => select(lesson.id)}>{lesson.title || lesson.id}</button>
      </li>)}</ul> : null}
      {page.assignment ? <section className="space-y-3">
        <button type="button" className="underline" onClick={() => select("")}>{t("lessons")}</button>
        <h2 className="text-xl font-semibold">{page.assignment.title}</h2>
        <ol className="list-decimal pl-6">{page.assignment.prompts.map((task, index) => <li key={`${index}:${task.id}`}>{task.prompt}</li>)}</ol>
        {page.submissions?.map(submission => <article key={submission.id} className="space-y-2 rounded-lg border border-slate-300 p-4">
          <h3 className="font-semibold">{submission.studentName || t("answer")}</h3>
          <SubmissionAnswers answers={submission.answers} prompts={page.assignment?.prompts ?? []} />
          <form className="space-y-2" onSubmit={event => void save(event, submission.id)}>
            <label className="block">{t("feedback")}<textarea name="feedback" className="block w-full rounded border border-slate-300 p-2"
              defaultValue={submission.feedback} maxLength={5000} required /></label>
            <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={saving}>{t("saveFeedback")}</button>
          </form>
        </article>)}
        {page.submissions?.length === 0 ? <p>{t("noAnswers")}</p> : null}
      </section> : null}
      {page.next ? <button type="button" className="underline" onClick={() => select(assignmentId, page.next ?? "")}>{t("nextPage")}</button> : null}
    </> : null}
  </main>;
}

function SubmissionAnswers({ answers, prompts }: { answers: unknown; prompts: { id: string; prompt: string }[] }) {
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    return <dl className="space-y-2">{Object.entries(answers).map(([id, answer]) => <div key={id}>
      <dt className="font-medium">{prompts.find(task => task.id === id)?.prompt || id}</dt>
      <dd className="whitespace-pre-wrap break-words">{typeof answer === "string" ? answer : JSON.stringify(answer, null, 2)}</dd>
    </div>)}</dl>;
  }
  return <p className="whitespace-pre-wrap break-words">{typeof answers === "string" ? answers : JSON.stringify(answers, null, 2)}</p>;
}
