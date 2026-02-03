// app/(public)/space/[spaceId]/lesson/[lessonId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { submitToSpace } from "@/lib/spaceSubmissionsClient";

// 👉 tilpass dette til din published_lesson type
type PublishedLesson = {
  title?: string;
  level?: string;
  text?: string;
  tasks?: any; // du har dette fra før
};

export default function SpaceLessonPage() {
  const { spaceId, lessonId } = useParams<{ spaceId: string; lessonId: string }>();
  const [lesson, setLesson] = useState<PublishedLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [user, setUser] = useState<ReturnType<typeof getAuth>["currentUser"] | null>(null);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
  const auth = getAuth();
  return onAuthStateChanged(auth, (u) => {
    console.log("AUTH:", {
      hasUser: !!u,
      uid: u?.uid,
      isAnonymous: (u as any)?.isAnonymous,
      providerId: u?.providerData?.[0]?.providerId,
    });
    setUser(u);
  });
}, []);


  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ref = doc(db, "published_lessons", lessonId);
        const snap = await getDoc(ref);
        setLesson(snap.exists() ? (snap.data() as PublishedLesson) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  // 👇 Dette er bare et eksempel på "answers".
  // I din faktiske lesson-view har du allerede state for svar.
  const [answers, setAnswers] = useState<any>({});

  async function onSubmit() {
    setMsg(null);
    setSaving(true);
    try {
      await submitToSpace({ spaceId, lessonId, answers, user: user ?? null });
      setMsg("✅ Levert! Du kan lukke siden, eller vente på feedback fra læreren.");
    } catch (e: any) {
      setMsg(`❌ Kunne ikke levere: ${e?.message ?? "ukjent feil"}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;
  if (!lesson) return <div style={{ padding: 16 }}>Fant ikke lesson.</div>;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ opacity: 0.75, marginBottom: 8 }}>
        Space: <code>{spaceId}</code>
      </div>

      <h1 style={{ marginBottom: 6 }}>{lesson.title ?? "Lesson"}</h1>

      {/* ✅ HER: bruk din eksisterende lesson-komponent.
          Det eneste du trenger er å mappe "answers" state + submit-knapp */}
      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
        <div style={{ opacity: 0.8, marginBottom: 10 }}>
          (Bytt denne boksen med eksisterende lesson-visning din)
        </div>

        <textarea
          placeholder="MVP: skriv noe her som 'answer' (kun demo)"
          value={answers?.freeText ?? ""}
          onChange={(e) => setAnswers({ ...answers, freeText: e.target.value })}
          style={{ width: "100%", minHeight: 120, padding: "10px 12px", borderRadius: 10 }}
        />

        <button
          onClick={onSubmit}
          disabled={saving}
          style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10 }}
        >
          {saving ? "Leverer..." : "Lever"}
        </button>

        {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div style={{ marginTop: 12, opacity: 0.75 }}>
        Innlogging gir merverdi (historikk/feedback på tvers av enheter), men er ikke påkrevd.
      </div>
    </div>
  );
}
