"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";

type LessonRow = { id: string; title?: string; status?: string };

export default function ProducerLessonsPage() {
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      await ensureAnonymousUser();
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error("No auth user");

      // Vis egne lessons (draft + published)
      const q = query(collection(db, "lessons"), where("ownerId", "==", uid));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setLessons(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function createLesson() {
    setErr(null);
    try {
      await ensureAnonymousUser();
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error("No auth user");

      const ref = await addDoc(collection(db, "lessons"), {
        ownerId: uid,
        title: "New lesson",
        sourceText: "",
        status: "draft",
        tasks: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // reload list
      await load();

      // gå til edit-side hvis du har den:
      // router.push(`/producer/lessons/${ref.id}`);
      alert(`Created: ${ref.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create lesson");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Producer – Lessons</h1>
        <button onClick={createLesson} style={{ padding: "8px 12px" }}>
          + New lesson
        </button>
      </div>

      {err && <p style={{ marginTop: 12 }}>{err}</p>}
      {loading ? (
        <p style={{ marginTop: 12 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {lessons.map((l) => (
            <div key={l.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{l.title ?? "Untitled"}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Status: {l.status ?? "—"}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <Link href={`/producer/lessons/${l.id}`}>Edit</Link>
                <Link href={`/producer/lessons/${l.id}/preview`}>Preview</Link>
              </div>
            </div>
          ))}
          {lessons.length === 0 && <p style={{ opacity: 0.8 }}>No lessons yet.</p>}
        </div>
      )}
    </div>
  );
}
