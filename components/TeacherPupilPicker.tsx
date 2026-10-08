"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";

type Pupil = { id: string; sourceMemberId: string; displayName: string; spaces: { spaceId: string; title: string; displayName: string }[] };
export default function TeacherPupilPicker({ spaceId, targetMemberId, targetName }: { spaceId: string; targetMemberId?: string; targetName?: string }) {
  const t = useTranslations("teacherMembers.roster");
  const [open, setOpen] = useState(false);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/teacher/spaces/${encodeURIComponent(spaceId)}/members/create-student`;
  async function load() {
    setOpen(true); setBusy(true); setError(""); setMessage(""); setSelected([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(t("failed"));
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("failed"));
      setPupils(data.students.filter((pupil: Pupil) => !pupil.spaces.some(s => s.spaceId === spaceId)));
    } catch (e) { setError(e instanceof Error ? e.message : t("failed")); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError(""); setMessage("");
    let completed = 0;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(t("failed"));
      for (const sourceMemberId of selected) {
        const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ sourceMemberId, ...(targetMemberId ? { targetMemberId } : {}) }) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || t("failed"));
        completed++;
      }
      setMessage(targetMemberId ? t("linked") : t("added", { count: completed }));
      setPupils(current => current.filter(p => !selected.includes(p.sourceMemberId)));
      setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : t("failed")); setMessage(completed ? t("added", { count: completed }) : ""); }
    finally { setBusy(false); }
  }
  const rooms = [...new Map(pupils.flatMap(p => p.spaces).map(s => [s.spaceId, s.title])).entries()];
  const visible = pupils.filter(p => (!room || p.spaces.some(s => s.spaceId === room)) && `${p.displayName} ${p.spaces.map(s => `${s.title} ${s.displayName}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
    <button type="button" disabled={busy} onClick={() => open ? setOpen(false) : void load()} className="rounded-lg border border-sky-300 bg-white px-3 py-2 font-semibold">{t(targetMemberId ? "linkTitle" : "title")}</button>
    {open ? <div className="mt-3 space-y-3">
      <p>{targetMemberId ? t("linkDescription", { name: targetName ?? "" }) : t("description")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={t("search")} placeholder={t("search")} value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border bg-white p-2" />
        <select aria-label={t("room")} value={room} onChange={e => setRoom(e.target.value)} className="rounded-lg border bg-white p-2">
          <option value="">{t("allRooms")}</option>
          {rooms.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </div>
      {!targetMemberId && visible.length ? <button type="button" disabled={busy} onClick={() => setSelected([...new Set([...selected, ...visible.map(p => p.sourceMemberId)])])} className="rounded-lg border bg-white px-3 py-2">{t("selectAll")}</button> : null}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {visible.map(p => <label key={p.id} className="flex items-start gap-2 rounded-lg border bg-white p-2">
          <input type={targetMemberId ? "radio" : "checkbox"} name={targetMemberId ? `link-${targetMemberId}` : undefined} disabled={busy} checked={selected.includes(p.sourceMemberId)} onChange={e => setSelected(targetMemberId ? [p.sourceMemberId] : e.target.checked ? [...selected, p.sourceMemberId] : selected.filter(id => id !== p.sourceMemberId))} />
          <span><strong>{p.displayName}</strong><span className="block text-xs text-slate-600">{p.spaces.map(s => `${s.title}: ${s.displayName}`).join(" · ")}</span></span>
        </label>)}
        {!busy && !visible.length ? <p>{t("empty")}</p> : null}
      </div>
      <button type="button" disabled={busy || !selected.length} onClick={() => void apply()} className="rounded-lg bg-sky-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{t(busy ? "working" : targetMemberId ? "confirmLink" : "add")}</button>
    </div> : null}
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : null}
    {message ? <p role="status" className="mt-2 text-emerald-800">{message}</p> : null}
  </div>;
}
