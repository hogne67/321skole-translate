"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getMathEditorCopy } from "@/lib/math/editorCopy";

/** Load only the owner's original worksheet; never generate replacement tasks. */
export function useSavedMathWorksheet(language: string, restore: (data: Record<string, unknown>, id: string) => boolean) {
  const params = useSearchParams();
  const id = params.get("edit")?.trim() || "";
  const [state, setState] = useState({ id: "", loading: false, error: "" });
  const onRestore = useEffectEvent(restore);
  const copy = getMathEditorCopy(language);
  useEffect(() => {
    if (!id) return;
    let active = true;
    async function load() {
      try {
        await auth.authStateReady();
        if (!active) return;
        setState({ id, loading: true, error: "" });
        const user = auth.currentUser;
        if (!user) throw new Error("Unauthorized");
        const snapshot = await getDoc(doc(db, "lessons", id));
        if (!active || auth.currentUser?.uid !== user.uid) return;
        if (!snapshot.exists()) throw new Error("Not found");
        const data = snapshot.data();
        if ((data.ownerId ?? data.uid) !== user.uid || !onRestore(data, id)) throw new Error("Invalid worksheet");
      } catch {
        if (active) setState({ id, loading: false, error: copy.loadFailed });
      } finally {
        if (active) setState(current => ({ ...current, loading: false }));
      }
    }
    void load();
    return () => { active = false; };
  }, [id, copy.loadFailed]);
  return { loading: !!id && (state.id !== id || state.loading), error: state.id === id ? state.error : "" };
}
