"use client";

import { getAuth, getIdToken } from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";

type Member = { uid?: string | null; displayName?: string | null; email?: string | null; role?: string | null; status?: string | null };
type Room = {
  id: string;
  title: string;
  ownerUid: string;
  isOpen: boolean;
  archived: boolean;
  lessonAiFeedbackDisabled: boolean;
  writingAiDisabled: boolean;
};
type SchoolResponse = { ok?: boolean; error?: string; school?: { name?: string | null }; members?: Member[] };
type SpacesResponse = { ok?: boolean; error?: string; rooms?: Room[]; nextCursor?: string | null };

async function request<T>(url: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok !== true) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function AdminSchoolSpacesPage() {
  const locale = useLocale();
  const params = useParams<{ schoolId: string }>();
  const schoolId = typeof params.schoolId === "string" ? params.schoolId : "";
  const [schoolName, setSchoolName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setRooms([]);
      setNextCursor(null);
      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error("Du må være innlogget som plattformadministrator.");
        const token = await getIdToken(user, true);
        const base = `/api/admin/schools/${encodeURIComponent(schoolId)}`;
        const [school, spaces] = await Promise.all([
          request<SchoolResponse>(base, token, controller.signal),
          request<SpacesResponse>(`${base}/spaces`, token, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setSchoolName(school.school?.name || schoolId);
        setMembers(school.members || []);
        setRooms(spaces.rooms || []);
        setNextCursor(spaces.nextCursor || null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kunne ikke hente rom.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    if (schoolId) void load();
    else { setLoading(false); setError("Manglende skole-ID."); }
    return () => controller.abort();
  }, [schoolId]);

  const memberByUid = useMemo(() => new Map(members.filter((member) => member.uid).map((member) => [member.uid, member])), [members]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Room[]>();
    for (const room of rooms) {
      const owner = room.ownerUid || "unknown";
      const bucket = grouped.get(owner);
      if (bucket) bucket.push(room);
      else grouped.set(owner, [room]);
    }
    return [...grouped].sort(([left], [right]) => {
      const leftName = memberByUid.get(left)?.displayName || left;
      const rightName = memberByUid.get(right)?.displayName || right;
      return leftName.localeCompare(rightName, locale);
    });
  }, [rooms, memberByUid, locale]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Du må være innlogget som plattformadministrator.");
      const token = await getIdToken(user, true);
      const url = `/api/admin/schools/${encodeURIComponent(schoolId)}/spaces?after=${encodeURIComponent(nextCursor)}`;
      const data = await request<SpacesResponse>(url, token);
      setRooms((current) => [...current, ...(data.rooms || [])]);
      setNextCursor(data.nextCursor || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente flere rom.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminSection eyebrow="Skoler" title={`Spaces · ${schoolName || schoolId}`}
        description="Rom som er knyttet til denne skolen. Oversikten viser lærer og status for romstyrte KI-sperrer."
        actionHref={`/${locale}/admin/schools/${encodeURIComponent(schoolId)}`} actionLabel="Til skolen" />

      <AdminCard className="p-4 text-sm text-slate-700">
        Bare rom med bekreftet skolekobling vises. Åpne et rom for å endre KI-valgene som plattformadministrator.
        Rom uten skolekobling må avklares separat.
      </AdminCard>

      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {loading ? <p role="status" className="text-sm text-slate-600">Henter rom …</p> : null}
      {!loading && !error && rooms.length === 0 ? <p className="text-sm text-slate-600">Ingen skoleknyttede rom funnet.</p> : null}

      {groups.map(([ownerUid, ownedRooms]) => {
        const member = memberByUid.get(ownerUid);
        const label = member?.displayName || member?.email || (member ? "Skolemedlem uten navn" : "Eier ikke funnet i skolens medlemsliste");
        return (
          <AdminCard key={ownerUid} className="p-4">
            <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
            <p className="mt-1 text-xs text-slate-600">
              {member ? `${member.role === "school_teacher" ? "Lærer" : "Skolemedlem"} · ${member.status || "ukjent status"}` : "Kontroller skolekoblingen før endring"}
            </p>
            <ul className="mt-4 divide-y divide-slate-200">
              {ownedRooms.map((room) => (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{room.title}</p>
                    <p className="text-sm text-slate-600">
                      {room.archived ? "Arkivert" : room.isOpen ? "Åpent" : "Lukket"} · Lessons KI-sperre: {room.lessonAiFeedbackDisabled ? "på" : "av"} · Skrive-KI-sperre: {room.writingAiDisabled ? "på" : "av"}
                    </p>
                  </div>
                  <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    href={`/${locale}/teacher/spaces/${encodeURIComponent(room.id)}`}>
                    Åpne rom
                  </Link>
                </li>
              ))}
            </ul>
          </AdminCard>
        );
      })}

      {!loading && rooms.length > 0 ? (
        <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
          <span>Viser {rooms.length} rom{nextCursor ? " så langt" : ""}.</span>
          {nextCursor ? <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-900 disabled:opacity-50">
            {loadingMore ? "Henter …" : "Vis flere"}
          </button> : null}
        </div>
      ) : null}
    </div>
  );
}
