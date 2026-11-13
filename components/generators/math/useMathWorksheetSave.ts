"use client";

import { useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { getMathEditorCopy } from "@/lib/math/editorCopy";

type SavedWorksheet = { id: string; json: string; uid: string };

export function useMathWorksheetSave<T extends { title: string; language: string; tasks: unknown[] }>({ worksheet, endpoint, language, source }: {
  worksheet: T | null;
  endpoint: string; language: string; source?: string;
}) {
  const copy = getMathEditorCopy(language);
  const [saved, setSaved] = useState<SavedWorksheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef(false);
  const json = worksheet ? JSON.stringify(worksheet) : "";
  const savedId = saved?.json === json ? saved.id : null;

  function rememberSaved(id: string, value: unknown) {
    setSaved({ id, json: JSON.stringify(value), uid: auth.currentUser?.uid ?? "" });
  }
  async function save(share = false) {
    if (!worksheet?.tasks.length || pending.current) return;
    pending.current = true;
    setSaving(true); setError(""); setSuccess("");
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error(copy.login);
      let id = saved?.json === json && saved.uid === user.uid ? saved.id : null;
      if (!id) {
        const token = await user.getIdToken();
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ worksheet, source }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok || typeof result.id !== "string") throw new Error(copy.failed);
        const newId: string = result.id;
        id = newId;
        setSaved({ id: newId, json, uid: user.uid });
      }
      setSuccess(copy.saved);
      if (share) setSharing(true);
    } catch (error) { setError(error instanceof Error ? error.message : copy.failed); }
    finally { pending.current = false; setSaving(false); }
  }
  function shared() { setSharing(false); setSuccess(copy.shared); }
  return { save, saving, savedId, sharing, setSharing, shared, error, success: savedId ? success : "", rememberSaved };
}
