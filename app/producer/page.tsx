"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  getDoc,
  updateDoc,
  doc,
  serverTimestamp,
  addDoc,
  deleteDoc,
} from "firebase/firestore";

// 🔧 IMPORTANT: set this to the route that actually exists in your project.
// If dashboard Edit gives 404, change this to match the working editor route.
const EDIT_BASE = "/producer/lessons"; // e.g. "/producer/lesson" or "/producer/texts"

type Lesson = {
  id: string;
  title?: string;
  description?: string;
  level?: string;
  language?: string;
  topics?: string[];
  ownerId?: string;
  createdAt?: any;
  updatedAt?: any;

  activePublishedId?: string | null;
  publishedAt?: any;
};

export default function ProducerDashboardPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLessons(userId: string) {
    setLoading(true);
    setError(null);

    try {
      const q = query(collection(db, "lessons"), where("ownerId", "==", userId));
      const snap = await getDocs(q);

      const rows: Lesson[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // Local sort (avoids composite index headaches)
      rows.sort((a: any, b: any) => {
        const at = a?.updatedAt?.seconds ?? a?.createdAt?.seconds ?? 0;
        const bt = b?.updatedAt?.seconds ?? b?.createdAt?.seconds ?? 0;
        return bt - at;
      });

      setLessons(rows);
    } catch (e: any) {
      setError(e?.message || "Kunne ikke hente lessons.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await ensureAnonymousUser();
      const user = auth.currentUser;

      if (!user) {
        setError("Ingen bruker funnet etter innlogging.");
        setLoading(false);
        return;
      }

      // Useful debug if you suspect wrong Firebase project
      // console.log("PROJECT:", db.app.options.projectId);
      // console.log("UID:", user.uid);

      setUid(user.uid);
      await loadLessons(user.uid);
    })();
  }, []);

  async function publishSnapshot(lessonId: string) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setError("Ikke innlogget. Prøv å refreshe siden.");
      return;
    }

    setBusyId(lessonId);
    setError(null);

    let createdPubId: string | null = null;

    try {
      // 1) load draft
      const draftRef = doc(db, "lessons", lessonId);
      const snap = await getDoc(draftRef);
      if (!snap.exists()) throw new Error("Fant ikke draft-lesson.");

      const draft = snap.data() as any;

      // ownership guard
      if (draft?.ownerId && draft.ownerId !== currentUid) {
        throw new Error("Du kan ikke publisere en lesson du ikke eier.");
      }

      // 2) best-effort deactivate previous published (if any)
      const prevPubId = draft?.activePublishedId;
      if (prevPubId) {
        try {
          await updateDoc(doc(db, "published_lessons", prevPubId), {
            isActive: false,
            deactivatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore; not critical
        }
      }

      // 3) create new published snapshot
      const publishedDoc = {
        ownerId: currentUid,
        sourceLessonId: lessonId,
        isActive: true,
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: draft.title ?? "(Uten tittel)",
        description: draft.description ?? "",
        level: draft.level ?? "",
        language: draft.language ?? "",
        topics: Array.isArray(draft.topics) ? draft.topics : [],
        sourceText: draft.sourceText ?? "",
        tasks: Array.isArray(draft.tasks) ? draft.tasks : [],
        searchText: (
          `${draft.title ?? ""} ${draft.description ?? ""} ${(draft.topics || []).join(" ")}`
        ).toLowerCase(),
      };

      const pubRef = await addDoc(collection(db, "published_lessons"), publishedDoc);
      createdPubId = pubRef.id;

      // 4) critical: update draft pointer
      await updateDoc(draftRef, {
        ownerId: currentUid, // ensure
        status: "draft", // ensure legacy docs become consistent
        activePublishedId: pubRef.id,
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 5) re-fetch (more robust than local patching after earlier data chaos)
      await loadLessons(currentUid);
    } catch (e: any) {
      // ✅ rollback: if snapshot created but draft pointer failed, deactivate that snapshot
      if (createdPubId) {
        try {
          await updateDoc(doc(db, "published_lessons", createdPubId), {
            isActive: false,
            deactivatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore rollback failure
        }
      }
      setError(e?.message || "Publisering feilet.");
    } finally {
      setBusyId(null);
    }
  }

  async function unpublish(lessonId: string) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setError("Ikke innlogget. Prøv å refreshe siden.");
      return;
    }

    setBusyId(lessonId);
    setError(null);

    try {
      const draftRef = doc(db, "lessons", lessonId);
      const snap = await getDoc(draftRef);
      if (!snap.exists()) throw new Error("Fant ikke draft-lesson.");
      const draft = snap.data() as any;

      if (draft?.ownerId && draft.ownerId !== currentUid) {
        throw new Error("Du kan ikke avpublisere en lesson du ikke eier.");
      }

      const pubId = draft?.activePublishedId;
      if (pubId) {
        await updateDoc(doc(db, "published_lessons", pubId), {
          isActive: false,
          deactivatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(draftRef, {
        ownerId: currentUid,
        status: "draft",
        activePublishedId: null,
        updatedAt: serverTimestamp(),
      });

      await loadLessons(currentUid);
    } catch (e: any) {
      setError(e?.message || "Avpublisering feilet.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDraft(lessonId: string) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setError("Ikke innlogget. Prøv å refreshe siden.");
      return;
    }

    const lesson = lessons.find((x) => x.id === lessonId);
    const isPublished = !!lesson?.activePublishedId;

    if (isPublished) {
      setError("Denne er publisert (snapshot). Avpubliser først hvis du vil fjerne den fra 321lessons.");
      return;
    }

    const ok = confirm("Slette denne draften? Dette kan ikke angres.");
    if (!ok) return;

    setBusyId(lessonId);
    setError(null);

    try {
      const ref = doc(db, "lessons", lessonId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Fant ikke draft-lesson.");

      const data = snap.data() as any;
      if (data?.ownerId && data.ownerId !== currentUid) {
        throw new Error("Du kan ikke slette en lesson du ikke eier.");
      }

      await deleteDoc(ref);
      await loadLessons(currentUid);
    } catch (e: any) {
      setError(e?.message || "Sletting feilet.");
    } finally {
      setBusyId(null);
    }
  }

  const publishedCount = useMemo(
    () => lessons.filter((l) => !!l.activePublishedId).length,
    [lessons]
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Producer</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            Mine lessons: {lessons.length} (publisert: {publishedCount})
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/321lessons" style={{ textDecoration: "none" }}>
            321lessons
          </Link>
          <Link href="/producer/new" style={{ textDecoration: "none" }}>
            New lesson
          </Link>
        </div>
      </header>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(200,0,0,0.35)",
            borderRadius: 12,
          }}
        >
          <strong>Feil:</strong> <span style={{ opacity: 0.85 }}>{error}</span>
        </div>
      ) : null}

      <section style={{ marginTop: 16 }}>
        {loading ? (
          <p>Laster…</p>
        ) : lessons.length === 0 ? (
          <p>Ingen lessons ennå. Trykk “New lesson”.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {lessons.map((l) => {
              const isPublished = !!l.activePublishedId;
              const isBusy = busyId === l.id;

              return (
                <div
                  key={l.id}
                  style={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 14,
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 260 }}>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                      {isPublished ? "✅ Published (snapshot)" : "📝 Draft"}
                      {l.level ? ` • ${l.level}` : ""}
                      {l.language ? ` • ${String(l.language).toUpperCase()}` : ""}
                    </div>

                    <div style={{ fontSize: 18, marginTop: 6 }}>
                      <strong>{l.title || "(Uten tittel)"}</strong>
                    </div>

                    {l.description ? (
                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        {l.description.length > 140 ? l.description.slice(0, 140) + "…" : l.description}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <Link href={`${EDIT_BASE}/${l.id}`} style={{ textDecoration: "none" }}>
                      Edit
                    </Link>

                    {!isPublished ? (
                      <button
                        onClick={() => publishSnapshot(l.id)}
                        disabled={isBusy}
                        style={{ padding: "8px 12px", borderRadius: 10 }}
                      >
                        {isBusy ? "Publiserer…" : "Publiser"}
                      </button>
                    ) : (
                      <button
                        onClick={() => unpublish(l.id)}
                        disabled={isBusy}
                        style={{ padding: "8px 12px", borderRadius: 10 }}
                      >
                        {isBusy ? "Avpubliserer…" : "Avpubliser"}
                      </button>
                    )}

                    {isPublished ? (
                      <Link href={`/student/lesson/${l.activePublishedId}`} style={{ textDecoration: "none" }}>
                        View
                      </Link>
                    ) : null}

                    {!isPublished ? (
                      <button
                        onClick={() => deleteDraft(l.id)}
                        disabled={isBusy}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(200,0,0,0.35)",
                          background: "white",
                        }}
                        title="Slett draft"
                      >
                        {isBusy ? "Sletter…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
