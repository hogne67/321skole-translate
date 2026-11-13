"use client";
import { watchOwnedSpaceSnapshots } from "@/lib/security/ownedSpaces.client";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { X } from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import { getMathEditorCopy } from "@/lib/math/editorCopy";
import { isSpaceOpenForSharing } from "@/lib/spaceSharing";
import "./length/length.css";

export default function MathSpacePicker({ worksheetId, title, language, onClose, onShared }: { worksheetId: string; title: string; language: string; onClose: () => void; onShared: () => void }) {
  const copy = getMeasurementCopy(language);
  const editorCopy = getMathEditorCopy(language);
  const dialog = useRef<HTMLDivElement>(null);
  const [spaces, setSpaces] = useState<{ id: string; title: string; code: string; open: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let unsubscribeSpaces: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeSpaces?.();
      setSpaces([]); setError("");
      if (!user) { setError(copy.login); setLoading(false); return; }
      setLoading(true);
      unsubscribeSpaces = watchOwnedSpaceSnapshots(db, user.uid, snapshot => {
        setSpaces(snapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, title: String(data.title || doc.id), code: String(data.code || data.joinCode || ""), open: isSpaceOpenForSharing(data) };
        }).sort((a, b) => a.title.localeCompare(b.title)));
        setLoading(false);
      }, () => { setError(copy.failed); setLoading(false); });
    });
    return () => { unsubscribeAuth(); unsubscribeSpaces?.(); };
  }, [copy.failed, copy.login]);
  async function assign(spaceId: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(copy.login);
      const response = await fetch(`/api/teacher/spaces/${spaceId}/assign`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sourceType: "myContent", sourceId: worksheetId, title, language }) });
      if (!response.ok) throw new Error(response.status === 409 ? editorCopy.closed : copy.failed);
      onShared();
    } catch (error) { setError(error instanceof Error ? error.message : copy.failed); }
    finally { pending.current = false; setBusy(false); }
  }
  const filteredSpaces = spaces.filter(space => `${space.title} ${space.code}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="length-modal" onClick={() => { if (!busy) onClose(); }}>
    <div ref={dialog} className="length-dialog" role="dialog" aria-modal="true" aria-label={copy.selectSpace} onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const elements = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input");
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <header><h2>{copy.selectSpace}</h2><button type="button" aria-label={copy.close} title={copy.close} disabled={busy} onClick={onClose}><X size={18} /></button></header>
      <input aria-label={copy.searchSpaces} placeholder={copy.searchSpaces} value={search} onChange={e => setSearch(e.target.value)} />
      {loading ? <p role="status">{copy.busy}</p> : filteredSpaces.map(space => <div className="length-space" key={space.id}><span>{space.title}{space.code ? <small className="block">{space.code}</small> : null}{!space.open ? <small className="block">{editorCopy.closed}</small> : null}</span><button type="button" disabled={busy || !space.open} onClick={() => { void assign(space.id); }}>{copy.shareHere}</button></div>)}
      {!loading && !spaces.length ? <p>{copy.noSpaces}</p> : null}
      {!loading && spaces.length > 0 && !filteredSpaces.length ? <p role="status">{editorCopy.noMatches}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </div>;
}


