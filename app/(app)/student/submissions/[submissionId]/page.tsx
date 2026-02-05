// app/(app)/student/submissions/[submissionId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export default function StudentSubmissionEditPage() {
  const router = useRouter();
  const params = useParams<{ submissionId: string }>();
  const submissionId = params?.submissionId;

  const { user } = useUserProfile();
  const uid = user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [docData, setDocData] = useState<Record<string, unknown> | null>(null);
  const [text, setText] = useState<string>("");

  const locked = useMemo(() => {
    if (!docData) return false;
    const reviewedAt = (docData as Record<string, unknown>).reviewedAt;
    const status = String((docData as Record<string, unknown>).status ?? "").toLowerCase();
    return !!reviewedAt || status === "reviewed";
  }, [docData]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!submissionId) return;
      setLoading(true);
      setErr(null);

      try {
        const snap = await getDoc(doc(db, "submissions", submissionId));
        if (!snap.exists()) throw new Error("Submission not found");

        const dUnknown = snap.data() as unknown;
        const d = isRecord(dUnknown) ? dUnknown : {};

        // simple ownership check (client-side UX; rules should enforce too)
        const ownerUid = typeof d.uid === "string" ? d.uid : null;
        if (ownerUid && uid && ownerUid !== uid) {
          throw new Error("You do not have access to edit this submission.");
        }

        const answers = isRecord(d.answers) ? d.answers : {};
        const pretty = JSON.stringify(answers, null, 2);

        if (!alive) return;
        setDocData(d);
        setText(pretty);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load submission");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [submissionId, uid]);

  async function save() {
    if (!submissionId) return;
    setErr(null);

    try {
      if (locked) throw new Error("This submission is locked (reviewed).");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON. Fix formatting before saving.");
      }

      if (!isRecord(parsed)) throw new Error("Answers must be a JSON object.");

      await updateDoc(doc(db, "submissions", submissionId), {
        answers: parsed,
        updatedAt: serverTimestamp(),
      });

      router.back();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Edit submission</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>ID: {submissionId}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => router.back()} style={btnSecondary}>
            Back
          </button>
          <button onClick={save} disabled={loading || locked} style={btnPrimary}>
            {locked ? "Locked" : "Save"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 14, opacity: 0.7 }}>Loading…</div>
      ) : err ? (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,0,0,0.25)", background: "rgba(255,0,0,0.05)" }}>
          <div style={{ fontWeight: 900 }}>Error</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : (
        <>
          {locked && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,165,0,0.35)", background: "rgba(255,165,0,0.08)" }}>
              Denne besvarelsen er markert som <strong>reviewed</strong> og kan ikke endres.
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Answers (JSON)</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={locked}
              style={{
                width: "100%",
                minHeight: 420,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                padding: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 13,
              }}
            />
            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              (Foreløpig editor som JSON. Neste steg kan være “ordentlig” skjema basert på task-typen.)
            </div>
          </div>
        </>
      )}
    </main>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  fontWeight: 900,
  cursor: "pointer",
};