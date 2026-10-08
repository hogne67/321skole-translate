"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import type { AnonymousDirectoryRow } from "@/lib/anonymousUsers";

const copy = {
  nb: {
    title: "Anonyme UID-er", back: "Tilbake til brukere", intro: "Finn gjestetilganger og se navn, rom og andre UID-er som deler elevkode eller elevkobling.",
    explanation: "Listen viser Firebase-brukere uten innloggingsleverandør, e-post eller telefon. Dette er normalt anonyme brukere. Navn kommer fra romregistreringer og bekrefter ikke hvem personen er. UID-er uten romtilknytning kan derfor mangle navn.",
    search: "Søk i innlastede UID-er, navn eller rom…", lookup: "Slå opp UID", uid: "Skriv eller lim inn en UID", more: "Last flere", all: "Last alle", stop: "Stopp innlasting", loading: "Laster…", loaded: "UID-er innlastet", scanned: "Firebase-brukere sjekket", complete: "Alle Firebase-brukere er gjennomgått.",
    empty: "Ingen treff i de innlastede UID-ene.", noRooms: "Ingen romtilknytning funnet.", unnamed: "Navn ikke registrert", created: "Opprettet", lastSignIn: "Sist innlogget", disabled: "Deaktivert", candidate: "Gjestetilgang", account: "Innloggingskonto", linked: "Andre UID-er med samme elevkobling", code: "Elevkode", archived: "Inaktiv registrering", active: "Aktiv registrering", anonymousAtJoin: "Registrert som anonym i rommet", accountAtJoin: "Registrert med konto i rommet", copied: "UID kopiert", copy: "Kopier UID", failed: "Kunne ikke hente oversikten. Prøv igjen.", forbidden: "Denne oversikten er bare tilgjengelig for administratorer.", notFound: "UID-en finnes ikke i Firebase Authentication.", result: "UID-oppslag", close: "Lukk oppslag", datesNote: "Sist innlogget gjelder Firebase-innlogging, ikke siste aktivitet i rommet.",
    total: "Gjestetilganger", withRooms: "Med romtilknytning", withoutRooms: "Uten romtilknytning", withName: "Med registrert navn", withoutName: "Navn ikke registrert", roomsOnly: "Bare med romtilknytning", showing: "Viser", countsNote: "Hver UID telles én gang. Samme person kan ha flere UID-er. Romtilknytning inkluderer også inaktive registreringer.", partialCounts: "Foreløpige tall for innlastede UID-er. Velg «Last alle» for å telle hele listen.", completeCounts: "Tall for hele listen av gjestetilganger.",
  },
  en: {
    title: "Anonymous UIDs", back: "Back to users", intro: "Inspect guest access, room names and other UIDs sharing a student code or participant identity.",
    explanation: "This list shows Firebase users without a sign-in provider, email or phone. These are usually anonymous users. Names come from room memberships and do not verify a person's identity. UIDs without room memberships may have no name.",
    search: "Search loaded UIDs, names or rooms…", lookup: "Look up UID", uid: "Enter or paste a UID", more: "Load more", all: "Load all", stop: "Stop loading", loading: "Loading…", loaded: "UIDs loaded", scanned: "Firebase users checked", complete: "All Firebase users have been checked.",
    empty: "No matches in the loaded UIDs.", noRooms: "No room membership found.", unnamed: "Name not recorded", created: "Created", lastSignIn: "Last sign-in", disabled: "Disabled", candidate: "Guest access", account: "Sign-in account", linked: "Other UIDs sharing the student identity", code: "Student code", archived: "Inactive membership", active: "Active membership", anonymousAtJoin: "Recorded as anonymous in this room", accountAtJoin: "Recorded with an account in this room", copied: "UID copied", copy: "Copy UID", failed: "Could not load the directory. Please try again.", forbidden: "This directory is available to administrators only.", notFound: "The UID was not found in Firebase Authentication.", result: "UID lookup", close: "Close lookup", datesNote: "Last sign-in refers to Firebase authentication, not the last activity in the room.",
    total: "Guest access UIDs", withRooms: "With room membership", withoutRooms: "Without room membership", withName: "With recorded name", withoutName: "Name not recorded", roomsOnly: "Only with room membership", showing: "Showing", countsNote: "Each UID is counted once. One person may have multiple UIDs. Room membership includes inactive records.", partialCounts: "Partial counts for loaded UIDs. Choose “Load all” to count the entire list.", completeCounts: "Counts for the complete guest access list.",
  },
  pt: {
    title: "UIDs anônimos", back: "Voltar aos usuários", intro: "Veja acessos de convidados, salas e outros UIDs com o mesmo código de aluno ou identidade de participante.",
    explanation: "A lista mostra usuários do Firebase sem provedor de login, e-mail ou telefone. Normalmente são usuários anônimos. Os nomes vêm dos registros nas salas e não confirmam a identidade da pessoa. UIDs sem sala podem não ter nome.",
    search: "Buscar nos UIDs carregados, nomes ou salas…", lookup: "Consultar UID", uid: "Digite ou cole um UID", more: "Carregar mais", all: "Carregar todos", stop: "Parar carregamento", loading: "Carregando…", loaded: "UIDs carregados", scanned: "Usuários do Firebase verificados", complete: "Todos os usuários do Firebase foram verificados.",
    empty: "Nenhum resultado nos UIDs carregados.", noRooms: "Nenhuma sala encontrada.", unnamed: "Nome não registrado", created: "Criado", lastSignIn: "Último login", disabled: "Desativado", candidate: "Acesso de convidado", account: "Conta de login", linked: "Outros UIDs com a mesma identidade de aluno", code: "Código do aluno", archived: "Registro inativo", active: "Registro ativo", anonymousAtJoin: "Registrado como anônimo nesta sala", accountAtJoin: "Registrado com conta nesta sala", copied: "UID copiado", copy: "Copiar UID", failed: "Não foi possível carregar a lista. Tente novamente.", forbidden: "Esta lista está disponível somente para administradores.", notFound: "UID não encontrado no Firebase Authentication.", result: "Consulta de UID", close: "Fechar consulta", datesNote: "O último login se refere ao Firebase, não à última atividade na sala.",
    total: "UIDs de convidados", withRooms: "Com sala vinculada", withoutRooms: "Sem sala vinculada", withName: "Com nome registrado", withoutName: "Nome não registrado", roomsOnly: "Somente com sala vinculada", showing: "Mostrando", countsNote: "Cada UID é contado uma vez. Uma pessoa pode ter vários UIDs. O vínculo com salas inclui registros inativos.", partialCounts: "Contagem parcial dos UIDs carregados. Selecione “Carregar todos” para contar a lista inteira.", completeCounts: "Contagem da lista completa de acessos de convidados.",
  },
};
type Copy = typeof copy.nb;
type Page = { rows: AnonymousDirectoryRow[]; nextPageToken: string | null; scanned: number };
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 no-underline hover:bg-slate-50 disabled:opacity-50";

async function requestPage(params: URLSearchParams, signal: AbortSignal): Promise<Page> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("unauthorized");
  const response = await fetch(`/api/admin/users/anonymous?${params}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store", signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "lookup_failed");
  return data;
}

function DirectoryRow({ row, text, locale, onLookup }: { row: AnonymousDirectoryRow; text: Copy; locale: string; onLookup: (uid: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const date = (value: string | null) => value ? new Date(value).toLocaleString(locale === "no" ? "nb" : locale) : "—";
  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer break-words text-sm text-slate-900">
      <span className="font-semibold">{row.displayName.trim() || text.unnamed}</span>
      <span className="ml-2 text-xs text-slate-500">{row.anonymousCandidate ? text.candidate : text.account}{row.disabled ? ` · ${text.disabled}` : ""}</span>
      <span className="mt-1 block break-all font-mono text-xs text-slate-600">{row.uid}</span>
    </summary>
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
      <button type="button" className={buttonClass} onClick={async () => {
        try { await navigator.clipboard.writeText(row.uid); setCopied(true); setCopyFailed(false); }
        catch { setCopyFailed(true); }
      }}>{copied ? text.copied : text.copy}</button>
      {copyFailed ? <p role="alert" className="text-sm text-red-700">{text.failed}</p> : null}
      <div className="text-xs text-slate-600">{text.created}: {date(row.createdAt)} · {text.lastSignIn}: {date(row.lastSignInAt)}</div>
      {row.memberships.length === 0 ? <p className="text-sm text-slate-500">{text.noRooms}</p> : row.memberships.map(member => (
        <div key={member.id} className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <Link href={`/${locale}/teacher/spaces/${encodeURIComponent(member.spaceId)}/members`} className="font-semibold text-blue-700 underline">{member.spaceTitle || member.spaceId}</Link>
          <div>{member.displayName || text.unnamed} · {member.roomCode || "—"} · {text.code}: <span className="font-mono">{member.studentCode || "—"}</span></div>
          <div className="text-xs text-slate-500">{member.active ? text.active : text.archived} · {member.anonymousAtJoin ? text.anonymousAtJoin : text.accountAtJoin}</div>
          {member.participantId ? <div className="break-all font-mono text-xs text-slate-500">participantId: {member.participantId}</div> : null}
          {member.linkedUids.length ? <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">{text.linked}</div>
            {member.linkedUids.map(uid => <button key={uid} type="button" onClick={() => onLookup(uid)} className="mr-2 break-all text-left font-mono text-xs text-blue-700 underline">{uid}</button>)}
          </div> : null}
        </div>
      ))}
    </div>
  </details>;
}

export default function AnonymousUsersPage() {
  const locale = useLocale();
  const text = locale === "pt" ? copy.pt : locale === "en" ? copy.en : copy.nb;
  const { user } = useUserProfile();
  const [rows, setRows] = useState<AnonymousDirectoryRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roomsOnly, setRoomsOnly] = useState(false);
  const [uid, setUid] = useState("");
  const [lookup, setLookup] = useState<AnonymousDirectoryRow | null>(null);
  const [refresh, setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setReady(false); setRows([]); setScanned(0); setNext(null); setLookup(null); setError(null);
    requestPage(new URLSearchParams(), abort.signal).then(page => {
      if (abort.signal.aborted) return;
      setRows(page.rows); setNext(page.nextPageToken); setScanned(page.scanned); setReady(true);
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "lookup_failed"); })
      .finally(() => { if (controller.current === abort) setBusy(false); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [user?.uid, refresh]);

  async function load(all: boolean) {
    if (busy || !next) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(null);
    let cursor: string | null = next;
    try {
      do {
        const page = await requestPage(new URLSearchParams({ pageToken: cursor }), abort.signal);
        if (abort.signal.aborted) break;
        setRows(previous => [...new Map([...previous, ...page.rows].map(row => [row.uid, row])).values()]);
        setScanned(previous => previous + page.scanned); setNext(page.nextPageToken);
        cursor = page.nextPageToken;
      } while (all && cursor && !abort.signal.aborted);
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "lookup_failed"); }
    finally { if (controller.current === abort) setBusy(false); }
  }

  async function lookUp(value: string) {
    if (busy || !value.trim()) return;
    const abort = new AbortController(); controller.current = abort;
    setUid(value.trim()); setBusy(true); setError(null); setLookup(null);
    try {
      const page = await requestPage(new URLSearchParams({ uid: value.trim() }), abort.signal);
      if (!abort.signal.aborted) setLookup(page.rows[0] || null);
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "lookup_failed"); }
    finally { if (controller.current === abort) setBusy(false); }
  }

  const query = search.trim().toLowerCase();
  const withRooms = rows.filter(row => row.memberships.length > 0).length;
  const withName = rows.filter(row => row.displayName.trim()).length;
  const counts = [
    { label: text.total, value: rows.length },
    { label: text.withRooms, value: withRooms },
    { label: text.withoutRooms, value: rows.length - withRooms },
    { label: text.withName, value: withName },
    { label: text.withoutName, value: rows.length - withName },
  ];
  const filtered = rows.filter(row => (!roomsOnly || row.memberships.length > 0) &&
    [row.uid, row.displayName, ...row.memberships.flatMap(member =>
      [member.spaceTitle, member.roomCode, member.displayName, member.studentCode, ...member.linkedUids])].some(value => value.toLowerCase().includes(query)));
  const errorText = error === "admin_required" || error === "unauthorized" ? text.forbidden : error === "uid_not_found" ? text.notFound : text.failed;

  return <div className="min-w-0 space-y-4">
    <Link href={`/${locale}/admin/users`} className="text-sm text-blue-700 underline">← {text.back}</Link>
    <h1 className="text-2xl font-bold">{text.title}</h1>
    <p className="text-sm text-slate-600">{text.intro}</p>
    <p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-600">{text.explanation}</p>
    <section aria-label={text.total} className="space-y-2">
      <p className="text-sm font-medium text-slate-600">{ready && !next ? text.completeCounts : text.partialCounts}</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {counts.map(count => <div key={count.label} className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <dt className="text-xs font-medium text-slate-600">{count.label}</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{ready ? count.value.toLocaleString(locale === "no" ? "nb" : locale) : "—"}</dd>
        </div>)}
      </dl>
      <p className="text-xs text-slate-500">{text.countsNote}</p>
    </section>
    <form onSubmit={event => { event.preventDefault(); void lookUp(uid); }} className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="anonymous-uid">{text.uid}</label>
      <input id="anonymous-uid" value={uid} onChange={event => setUid(event.target.value)} placeholder={text.uid} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm" />
      <button type="submit" disabled={busy || !uid.trim()} className={buttonClass}>{text.lookup}</button>
    </form>
    {error ? <p role="alert" className="text-sm text-red-700">{errorText}</p> : null}
    {lookup ? <section className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-base font-semibold">{text.result}</h2><button type="button" onClick={() => setLookup(null)} className={buttonClass}>{text.close}</button></div>
      <DirectoryRow key={lookup.uid} row={lookup} text={text} locale={locale} onLookup={value => void lookUp(value)} />
    </section> : null}
    <label className="sr-only" htmlFor="anonymous-search">{text.search}</label>
    <input id="anonymous-search" value={search} onChange={event => setSearch(event.target.value)} placeholder={text.search} className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
    <button type="button" aria-pressed={roomsOnly} onClick={() => setRoomsOnly(previous => !previous)}
      className={`${buttonClass} ${roomsOnly ? "!border-emerald-300 !bg-emerald-100 !text-emerald-900" : ""}`}>{text.roomsOnly}</button>
    <div role="status" className="text-sm text-slate-600">{text.showing} {filtered.length} / {rows.length} {text.loaded} · {scanned} {text.scanned}{ready && !next ? ` · ${text.complete}` : ""}{busy ? ` · ${text.loading}` : ""}</div>
    <p className="text-xs text-slate-500">{text.datesNote}</p>
    <div className="space-y-3">{filtered.map(row => <DirectoryRow key={row.uid} row={row} text={text} locale={locale} onLookup={value => void lookUp(value)} />)}</div>
    {ready && !busy && !filtered.length ? <p className="text-sm text-slate-500">{text.empty}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={buttonClass} onClick={() => setRefresh(previous => previous + 1)}>{locale === "pt" ? "Atualizar" : locale === "en" ? "Refresh" : "Oppdater"}</button>
      {next ? <><button type="button" disabled={busy} className={buttonClass} onClick={() => void load(false)}>{text.more}</button><button type="button" disabled={busy} className={buttonClass} onClick={() => void load(true)}>{text.all}</button></> : null}
      {busy ? <button type="button" className={buttonClass} onClick={() => controller.current?.abort()}>{text.stop}</button> : null}
    </div>
  </div>;
}
