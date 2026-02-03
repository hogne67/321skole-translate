// app/(app)/teacher/spaces/[spaceId]/lessons/[lessonId]/submissions/[subId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";

function formatMaybeDate(v: any) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : typeof v?.toDate === "function"
          ? v.toDate()
          : v instanceof Timestamp
            ? v.toDate()
            : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

export default function TeacherSubmissionPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const params = useParams<{
    spaceId: string;
    lessonId: string;
    subId: string;
  }>();

  const spaceId = params.spaceId;
  const lessonId = params.lessonId;
  const subId = params.subId;

  const { user } = useUserProfile();

  const [sub, setSub] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<"reviewed" | "needs_work">("reviewed");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const docRef = useMemo(() => {
    return doc(db, "spaces", spaceId, "lessons", lessonId, "submissions", subId);
  }, [spaceId, lessonId, subId]);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(
      docRef,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setSub(null);
          return;
        }
        const data = snap.data();
        setSub(data);

        // preload feedback if exists
        const existing = data?.teacherFeedback?.text;
        setText(typeof existing === "string" ? existing : "");
        const existingStatus = data?.status;
        if (existingStatus === "needs_work" || existingStatus === "reviewed") {
          setStatus(existingStatus);
        }
      },
      (err) => {
        setLoading(false);
        console.log("[TEACHER] read submission ERROR =>", err?.code, err?.message, err);
        setSub(null);
      }
    );
  }, [docRef]);

  const backLink = `/teacher/spaces/${spaceId}`;

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;

  if (!sub) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Fant ikke innleveringen</h1>
        <p style={{ opacity: 0.8 }}>
          <code>spaces/{spaceId}/lessons/{lessonId}/submissions/{subId}</code>
        </p>
        <Link href={backLink}>← Tilbake</Link>
      </div>
    );
  }

  const createdAt = formatMaybeDate(sub.createdAt);
  const isAnon = sub?.auth?.isAnon === true;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Innlevering</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            {createdAt ? <>Levert: <b>{createdAt}</b></> : "Levert: (ukjent)"} · Status:{" "}
            <b>{sub.status}</b>
          </div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            {isAnon ? (
              <>Gjest (uinnlogget)</>
            ) : (
              <>Innlogget · uid: <code>{sub?.auth?.uid}</code></>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={backLink}>← Back</Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {/* Answers */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Svar</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 13 }}>
            {JSON.stringify(sub.answers ?? {}, null, 2)}
          </pre>
        </div>

        {/* Feedback */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tilbakemelding</div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.85 }}>Ny status:</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ padding: "8px 10px", borderRadius: 10 }}
              >
                <option value="reviewed">reviewed</option>
                <option value="needs_work">needs_work</option>
              </select>
            </label>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Skriv en kort tilbakemelding…"
            rows={5}
            style={{
              width: "100%",
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setSaveMsg(null);
                try {
                  await updateDoc(docRef, {
                    status,
                    teacherFeedback: {
                      text,
                      updatedAt: serverTimestamp(),
                      teacherUid: user?.uid ?? null,
                    },
                  });
                  setSaveMsg("Lagret ✅");
                } catch (e: any) {
                  console.log("[TEACHER] save feedback ERROR =>", e?.code, e?.message, e);
                  setSaveMsg(`Kunne ikke lagre: ${e?.message || "ukjent feil"}`);
                } finally {
                  setSaving(false);
                  setTimeout(() => setSaveMsg(null), 2000);
                }
              }}
              style={{ padding: "10px 12px", borderRadius: 10 }}
            >
              {saving ? "Lagrer…" : "Lagre tilbakemelding"}
            </button>

            {saveMsg && <div style={{ opacity: 0.85, alignSelf: "center" }}>{saveMsg}</div>}
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            (Rules: teacher/owner kan bare endre feedback/status — answers/auth/createdAt må være uendret.)
          </div>
        </div>

        {/* Raw */}
        <details style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Se rådata</summary>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 12 }}>
            {JSON.stringify(sub, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
