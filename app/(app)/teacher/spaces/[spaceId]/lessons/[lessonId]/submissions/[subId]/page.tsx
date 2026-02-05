// app/(app)/teacher/spaces/[spaceId]/lessons/[lessonId]/submissions/[subId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";

type ReviewStatus = "reviewed" | "needs_work";

type TeacherFeedback = {
  text?: string;
  updatedAt?: unknown;
  teacherUid?: string | null;
};

type SubmissionDoc = {
  createdAt?: unknown;
  status?: ReviewStatus | string;
  answers?: unknown;
  auth?: { isAnon?: boolean; uid?: string | null } | unknown;
  teacherFeedback?: TeacherFeedback | unknown;
};

function getErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "string") return { message: err };
  if (err && typeof err === "object") {
    const code = "code" in err ? (err as { code?: unknown }).code : undefined;
    const message = "message" in err ? (err as { message?: unknown }).message : undefined;
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : JSON.stringify(err),
    };
  }
  return { message: String(err) };
}

function formatMaybeDate(v: unknown) {
  try {
    if (!v) return "";
    const d: Date | null =
      v instanceof Date
        ? v
        : typeof (v as { toDate?: unknown })?.toDate === "function"
          ? (v as { toDate: () => Date }).toDate()
          : v instanceof Timestamp
            ? v.toDate()
            : null;
    return d ? d.toLocaleString() : "";
  } catch {
    return "";
  }
}

function readTeacherFeedbackText(sub: SubmissionDoc): string {
  const tf = sub.teacherFeedback;
  if (!tf || typeof tf !== "object") return "";
  const t = (tf as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

function readStatus(sub: SubmissionDoc): ReviewStatus {
  const s = sub.status;
  return s === "needs_work" || s === "reviewed" ? s : "reviewed";
}

function readAuth(sub: SubmissionDoc): { isAnon: boolean; uid: string | null } {
  const a = sub.auth;
  if (!a || typeof a !== "object") return { isAnon: false, uid: null };
  const isAnon = (a as { isAnon?: unknown }).isAnon === true;
  const uidRaw = (a as { uid?: unknown }).uid;
  return { isAnon, uid: typeof uidRaw === "string" ? uidRaw : null };
}

export default function TeacherSubmissionPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const params = useParams<{ spaceId: string; lessonId: string; subId: string }>();
  const spaceId = params.spaceId;
  const lessonId = params.lessonId;
  const subId = params.subId;

  const { user } = useUserProfile();

  const [sub, setSub] = useState<SubmissionDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("reviewed");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const docRef = useMemo(() => doc(db, "spaces", spaceId, "lessons", lessonId, "submissions", subId), [
    spaceId,
    lessonId,
    subId,
  ]);

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

        const data = snap.data() as SubmissionDoc;
        setSub(data);

        // preload feedback if exists
        setText(readTeacherFeedbackText(data));
        setStatus(readStatus(data));
      },
      (err) => {
        setLoading(false);
        const info = getErrorInfo(err as unknown);
        console.log("[TEACHER] read submission ERROR =>", info.code, info.message, err);
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
          <code>
            spaces/{spaceId}/lessons/{lessonId}/submissions/{subId}
          </code>
        </p>
        <Link href={backLink}>← Tilbake</Link>
      </div>
    );
  }

  const createdAt = formatMaybeDate(sub.createdAt);
  const authInfo = readAuth(sub);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Innlevering</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            {createdAt ? (
              <>
                Levert: <b>{createdAt}</b>
              </>
            ) : (
              "Levert: (ukjent)"
            )}{" "}
            · Status: <b>{String(sub.status ?? "—")}</b>
          </div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            {authInfo.isAnon ? (
              <>Gjest (uinnlogget)</>
            ) : (
              <>
                Innlogget · uid: <code>{authInfo.uid ?? "—"}</code>
              </>
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
                onChange={(e) => setStatus(e.target.value as ReviewStatus)}
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
                } catch (e: unknown) {
                  const info = getErrorInfo(e);
                  console.log("[TEACHER] save feedback ERROR =>", info.code, info.message, e);
                  setSaveMsg(`Kunne ikke lagre: ${info.message || "ukjent feil"}`);
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
