"use client";

import type { User } from "firebase/auth";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

type Room = { id: string; title: string };
type Teacher = { uid: string; displayName?: string; email?: string; status: string };
type Grant = { uid: string; grantId: string; displayName: string; expiresAt: number };
type Change = { action: "grant"; teacherUid: string; expiresAt: number } |
  { action: "revoke"; teacherUid: string; grantId: string };

async function schoolRequest<T>(user: User, url: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "unavailable");
  return body as T;
}

const field = "w-full rounded-md border border-slate-300 bg-white px-3 py-2";

export default function SpaceSubstitutes({ user, schoolId }: { user: User; schoolId: string }) {
  const t = useTranslations("schoolAdmin.substitutes");
  const format = useFormatter();
  const base = `/api/schools/${encodeURIComponent(schoolId)}`;
  const url = `${base}/substitutes`;
  const [choices, setChoices] = useState<{ rooms: Room[]; teachers: Teacher[] }>();
  const [grants, setGrants] = useState<Grant[]>();
  const [spaceId, setSpaceId] = useState("");
  const [teacherUid, setTeacherUid] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ key: string; error: boolean }>();
  const grantUrl = `${url}?spaceId=${encodeURIComponent(spaceId)}`;

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    void Promise.all([schoolRequest<{ rooms: Room[] }>(user, url, options), schoolRequest<{ teachers: Teacher[] }>(user, `${base}/teachers`, options)])
      .then(([{ rooms }, { teachers }]) => {
        if (!controller.signal.aborted) setChoices({ rooms, teachers: teachers.filter(teacher => teacher.status === "active") });
      }).catch(() => {
        if (!controller.signal.aborted) setFeedback({ key: "unavailable", error: true });
      });
    return () => controller.abort();
  }, [base, url, user]);

  useEffect(() => {
    if (!spaceId) return;
    const controller = new AbortController();
    void schoolRequest<{ grants: Grant[] }>(user, grantUrl, { signal: controller.signal }).then(({ grants }) => {
      if (!controller.signal.aborted) setGrants(grants);
    }).catch(() => {
      if (!controller.signal.aborted) setFeedback({ key: "unavailable", error: true });
    });
    return () => controller.abort();
  }, [grantUrl, spaceId, user]);

  async function change(request: Change) {
    setBusy(true);
    setFeedback(undefined);
    try {
      await schoolRequest(user, url, { method: "POST", body: JSON.stringify({ ...request, spaceId }) });
      const result = await schoolRequest<{ grants: Grant[] }>(user, grantUrl);
      setGrants(result.grants);
      setFeedback({ key: request.action === "grant" ? "granted" : "revoked", error: false });
    } catch (error) {
      const key = error instanceof Error ? error.message : "unavailable";
      setFeedback({ key: t.has(key) ? key : "unavailable", error: true });
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (spaceId && teacherUid && until) {
      void change({ action: "grant", teacherUid, expiresAt: new Date(`${until}T23:59:59.999`).getTime() });
    }
  }

  return <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="space-substitutes-heading">
    <h2 id="space-substitutes-heading" className="text-xl font-semibold">{t("title")}</h2>
    <p className="mt-2 text-slate-600">{t("description")}</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
      <label>{t("room")}<select className={field} value={spaceId} disabled={busy || !choices} required onChange={event => {
        setSpaceId(event.target.value); setGrants(undefined); setFeedback(undefined);
      }}>
        <option value="">{t("chooseRoom")}</option>
        {choices?.rooms.map(room => <option key={room.id} value={room.id}>{room.title || room.id}</option>)}
      </select></label>
      <label>{t("teacher")}<select className={field} value={teacherUid} disabled={busy || !choices} required onChange={event => setTeacherUid(event.target.value)}>
        <option value="">{t("chooseTeacher")}</option>
        {choices?.teachers.map(teacher => <option key={teacher.uid} value={teacher.uid}>{teacher.displayName || teacher.email || teacher.uid}</option>)}
      </select></label>
      <label>{t("until")}<input className={field} type="date" value={until} disabled={busy} required onChange={event => setUntil(event.target.value)} /></label>
      <button className="w-fit rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !spaceId || !teacherUid || !until}>{t("grant")}</button>
    </form>
    {feedback ? <p className={`mt-3 ${feedback.error ? "text-red-700" : "text-green-800"}`} role={feedback.error ? "alert" : "status"}>{t(feedback.key)}</p> : null}
    {spaceId ? <div className="mt-5">
      <h3 className="font-semibold">{t("active")}</h3>
      {grants?.length ? <ul className="divide-y">
        {grants.map(grant => <li key={grant.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{grant.displayName || grant.uid} · {format.dateTime(grant.expiresAt, { dateStyle: "medium", timeStyle: "short" })}</span>
          <button type="button" className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={busy}
            onClick={() => void change({ action: "revoke", teacherUid: grant.uid, grantId: grant.grantId })}>{t("revoke")}</button>
        </li>)}
      </ul> : <p className="mt-2 text-slate-600">{t(grants ? "none" : "loading")}</p>}
    </div> : null}
  </section>;
}
