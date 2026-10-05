"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getMeasurementCopy } from "@/lib/math/measurement/worksheet";
import "./length/length.css";

export default function MathSpacePicker({ worksheetId, title, language, onClose, onShared }: { worksheetId: string; title: string; language: string; onClose: () => void; onShared: () => void }) {
  const copy = getMeasurementCopy(language);
  const dialog = useRef<HTMLDivElement>(null);
  const [spaces, setSpaces] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(query(collection(db, "spaces"), where("ownerId", "==", uid)), snapshot => {
      setSpaces(snapshot.docs.map(doc => ({ id: doc.id, title: String(doc.data().title || doc.id) })).sort((a, b) => a.title.localeCompare(b.title)));
      setLoading(false);
    }, () => { setError(copy.failed); setLoading(false); });
  }, [copy.failed]);
  async function assign(spaceId: string) {
    setBusy(true); setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error(copy.login);
      const response = await fetch(`/api/teacher/spaces/${spaceId}/assign`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sourceType: "myContent", sourceId: worksheetId, title, language }) });
      if (!response.ok) throw new Error(copy.failed);
      onShared();
    } catch (error) { setError(error instanceof Error ? error.message : copy.failed); }
    finally { setBusy(false); }
  }
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
      {loading ? <p>{copy.busy}</p> : spaces.filter(space => space.title.toLowerCase().includes(search.toLowerCase())).map(space => <div className="length-space" key={space.id}><span>{space.title}</span><button type="button" disabled={busy} onClick={() => { void assign(space.id); }}>{copy.shareHere}</button></div>)}
      {!loading && !spaces.length ? <p>{copy.noSpaces}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </div>;
}


