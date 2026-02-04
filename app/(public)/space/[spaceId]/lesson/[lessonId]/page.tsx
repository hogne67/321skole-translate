// app/(public)/space/[spaceId]/lesson/[lessonId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { submitToSpace } from "@/lib/spaceSubmissionsClient";

// 👉 tilpass dette til din published_lesson type
type PublishedLesson = {
  title?: string;
  level?: string;
  text?: string;
  tasks?: any;
};

export default function SpaceLessonPage() {
  const params = useParams<{ spaceId: string; lessonId: string }>();
  const spaceId = params?.spaceId ?? "";
  const lessonId = params?.lessonId ?? "";

  const [lesson, setLesson] = useState<PublishedLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [user, setUser] = useState<ReturnType<typeof getAuth>["currentUser"] | null>(null);

  // Auth: logg hva vi faktisk har (anon / innlogget)
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

  // Last published lesson robust (doc-id uavhengig)
  useEffect(() => {
    if (!lessonId) return;

    (async () => {
      setLoading(true);
      setLoadErr(null);
      try {
        console.log("LOAD published lesson by lessonId:", { lessonId });

        // ⚠️ Sjekk at collection-navnet matcher Firestore.
        // Hvis din heter "publishedLessons" el.l. – endre her.
        const col = collection(db, "published_lessons");

        const q = query(col, where("lessonId", "==", lessonId), limit(1));
        const qs = await getDocs(q);

        if (qs.empty) {
          console.warn("No published lesson found for lessonId:", lessonId);
          setLesson(null);
        } else {
          const data = qs.docs[0].data() as PublishedLesson;
          setLesson(data);
        }
      } catch (e: any) {
        console.error("LOAD PUBLISHED LESSON FAILED:", e);
        setLesson(null);

        // Gi et brukervennlig hint (ofte rules)
        const message = e?.message ?? "Ukjent feil ved lasting.";
        setLoadErr(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  // 👇 MVP state for svar (byttes senere mot din ekte lesson-view)
  const [answers, setAnswers] = useState<any>({});

  async function onSubmit() {
    setMsg(null);
    setSaving(true);
    try {
      if (!spaceId || !lessonId) {
        setMsg("❌ Mangler spaceId eller lessonId i URL-en.");
        return;
      }

      await submitToSpace({ spaceId, lessonId, answers, user: user ?? null });
      setMsg("✅ Levert! Du kan lukke siden, eller vente på feedback fra læreren.");
    } catch (e: any) {
      console.error("SUBMIT FAILED:", e);
      setMsg(`❌ Kunne ikke levere: ${e?.message ?? "ukjent feil"}`);
    } finally {
      setSaving(false);
    }
  }

  if (!spaceId || !lessonId) {
    return <div style={{ padding: 16 }}>Ugyldig lenke (mangler spaceId/lessonId).</div>;
  }

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 8 }}>Fant ikke lesson.</div>
        {loadErr && (
          <div style={{ opacity: 0.8 }}>
            <div style={{ marginBottom: 6 }}>
              Teknisk feilmelding (ofte pga. Firestore rules):
            </div>
            <code style={{ display: "block", whiteSpace: "pre-wrap" }}>{loadErr}</code>
          </div>
        )}
      </div>
    );
  }

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
