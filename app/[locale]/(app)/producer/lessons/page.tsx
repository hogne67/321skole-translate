// app/(app)/producer/lessons/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";

type LessonRow = {
  id: string;
  title?: string;
  status?: string;
};

type LessonDoc = {
  ownerId?: string;
  title?: string;
  status?: string;
};

type QuotaInfo = {
  feature: string;
  limit: number;
  used: number;
  remaining: number;
  period: string; // YYYY-MM
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function getQuota(feature: string): Promise<QuotaInfo | null> {
  const user = getAuth().currentUser;
  if (!user) return null;

  const token = await user.getIdToken();

  const res = await fetch(`/api/quota?feature=${encodeURIComponent(feature)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) return null;

  if (
    isRecord(data) &&
    typeof data.feature === "string" &&
    typeof data.limit === "number" &&
    typeof data.used === "number" &&
    typeof data.remaining === "number" &&
    typeof data.period === "string"
  ) {
    return data as QuotaInfo;
  }

  return null;
}

export default function ProducerLessonsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      await ensureAnonymousUser();
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error("No auth user");

      // Read-only: egne lessons
      const qy = query(collection(db, "lessons"), where("ownerId", "==", uid));
      const snap = await getDocs(qy);

      const data: LessonRow[] = snap.docs.map((d) => {
        const raw = d.data() as LessonDoc;
        return { id: d.id, title: raw.title, status: raw.status };
      });

      setLessons(data);

      // Optional: quota banner
      const q = await getQuota("producer_create_lesson");
      setQuota(q);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function createLesson() {
    // ✅ All creation happens in the new producer editor (server checks quota there)
    router.push("/producer/texts/new");
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Producer – Lessons</h1>
          {quota ? (
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              This month: <b>{quota.used}</b> / <b>{quota.limit}</b> used (remaining {quota.remaining}) · {quota.period}
            </div>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>Quota: —</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={createLesson} style={{ padding: "8px 12px", fontWeight: 800 }}>
            + New lesson
          </button>
          <button onClick={load} disabled={loading} style={{ padding: "8px 12px", opacity: loading ? 0.7 : 1 }}>
            Refresh
          </button>
        </div>
      </div>

      {err && <p style={{ marginTop: 12, color: "crimson" }}>{err}</p>}

      {loading ? (
        <p style={{ marginTop: 12 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {lessons.map((l) => (
            <div key={l.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{l.title ?? "Untitled"}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Status: {l.status ?? "—"}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <Link href={`/producer/texts/${l.id}`}>Edit</Link>
                <Link href={`/producer/${l.id}/preview`}>Preview</Link>
              </div>
            </div>
          ))}

          {lessons.length === 0 && <p style={{ opacity: 0.8 }}>No lessons yet.</p>}
        </div>
      )}
    </div>
  );
}