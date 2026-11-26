"use client";
import { ChevronDown, Search } from "lucide-react";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";

type Pupil = { id: string; sourceMemberId: string; fullName?: string; displayName: string; restoreAccount?: boolean; spaces: { spaceId: string; title: string; displayName: string }[] };
export default function TeacherPupilPicker({ spaceId, targetMemberId, targetName, schoolRoom, accountRestoreOnly = false }: {
  spaceId: string; targetMemberId?: string; targetName?: string; schoolRoom?: boolean; accountRestoreOnly?: boolean;
}) {
  const t = useTranslations("teacherMembers.roster");
  const panelId = useId();
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
      setPupils(data.students.filter((pupil: Pupil) => !pupil.spaces.some(s => s.spaceId === spaceId)
        && (!targetMemberId || !pupil.restoreAccount) && (!accountRestoreOnly || pupil.restoreAccount)));
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
        if (!response.ok || !data.ok) throw new Error(data.error === "pupil_account_restore_unavailable"
          ? t("restoreFailed") : data.error || t("failed"));
        completed++;
      }
      setMessage(targetMemberId ? t("linked") : t("added", { count: completed }));
      setPupils(current => current.filter(p => !selected.includes(p.sourceMemberId)));
      setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : t("failed")); setMessage(completed ? t("added", { count: completed }) : ""); }
    finally { setBusy(false); }
  }
  const rooms = [...new Map(pupils.flatMap(p => p.spaces).map(s => [s.spaceId, s.title])).entries()];
  const visible = pupils.filter(p => (!room || p.spaces.some(s => s.spaceId === room)) && `${p.fullName ?? ""} ${p.displayName} ${p.spaces.map(s => `${s.title} ${s.displayName}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const title = t(targetMemberId ? "linkTitle" : accountRestoreOnly ? "restoreTitle" : "title");
  return <div className={`rounded-xl border border-solid text-sm ${targetMemberId ? "border-slate-200 bg-slate-50" : "border-sky-200 bg-sky-50"}`}>
    <button
      type="button"
      disabled={busy}
      onClick={() => open ? setOpen(false) : void load()}
      aria-label={title}
      aria-describedby={!targetMemberId ? `${panelId}-hint` : undefined}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      className={`flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-wait ${targetMemberId ? "min-h-10 text-slate-800 hover:bg-slate-100" : "min-h-14 text-sky-950 hover:bg-sky-100"}`}
    >
      {!targetMemberId ? <Search aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        {!targetMemberId ? (
          <span id={`${panelId}-hint`} className="block text-xs font-normal text-slate-600">
            {t(accountRestoreOnly ? "restoreSummary" : schoolRoom ? "schoolSummary" : "summary")}
          </span>
        ) : null}
      </span>
      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div id={panelId} className="space-y-3 border-0 border-t border-solid border-slate-200 p-3">
      <p className="m-0 text-slate-700">{targetMemberId ? t("linkDescription", { name: targetName ?? "" }) : t(accountRestoreOnly ? "restoreDescription" : schoolRoom ? "schoolDescription" : "description")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={t("search")} placeholder={t("search")} value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 rounded-lg border bg-white p-2" />
        <select aria-label={t("room")} value={room} onChange={e => setRoom(e.target.value)} className="min-w-0 rounded-lg border bg-white p-2">
          <option value="">{t("allRooms")}</option>
          {rooms.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </div>
      {!targetMemberId && visible.length ? <button type="button" disabled={busy} onClick={() => setSelected([...new Set([...selected, ...visible.map(p => p.sourceMemberId)])])} className="rounded-lg border bg-white px-3 py-2">{t("selectAll")}</button> : null}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {visible.map(p => <label key={p.id} className="flex items-start gap-2 rounded-lg border bg-white p-2">
          <input type={targetMemberId ? "radio" : "checkbox"} name={targetMemberId ? `link-${targetMemberId}` : undefined} disabled={busy} checked={selected.includes(p.sourceMemberId)} onChange={e => setSelected(targetMemberId ? [p.sourceMemberId] : e.target.checked ? [...selected, p.sourceMemberId] : selected.filter(id => id !== p.sourceMemberId))} />
          <span>
            <strong>{p.fullName || p.displayName}</strong>
            {p.restoreAccount && !accountRestoreOnly ? <span className="block text-xs text-slate-700">{t("restoreLabel")}</span> : null}
            {p.spaces.length ? <span className="block text-xs text-slate-600">{p.spaces.map(s => `${s.title}: ${s.displayName}`).join(" · ")}</span> : null}
          </span>
        </label>)}
        {!busy && !visible.length ? <p>{t(accountRestoreOnly ? "restoreEmpty" : "empty")}</p> : null}
      </div>
      <button type="button" disabled={busy || !selected.length} onClick={() => void apply()} className="rounded-lg bg-sky-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{t(busy ? "working" : targetMemberId ? "confirmLink" : "add")}</button>
    </div> : null}
    {error ? <p role="alert" className="m-0 px-3 pb-3 text-red-700">{error}</p> : null}
    {message ? <p role="status" className="m-0 px-3 pb-3 text-emerald-800">{message}</p> : null}
  </div>;
}
