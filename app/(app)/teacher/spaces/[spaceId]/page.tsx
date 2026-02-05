// app/(app)/teacher/spaces/[spaceId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, orderBy, query, limit, Timestamp } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import { setSpaceOpen } from "@/lib/spacesClient";

type SubmissionData = {
  createdAt?: unknown;
  status?: unknown;
  auth?: unknown;
  answers?: unknown;
};

type SubmissionRow = {
  id: string;
  data: SubmissionData;
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

function readAuth(data: SubmissionData): { isAnon: boolean; uid: string | null } {
  const a = data.auth;
  if (!a || typeof a !== "object") return { isAnon: false, uid: null };
  const isAnon = (a as { isAnon?: unknown }).isAnon === true;
  const uidRaw = (a as { uid?: unknown }).uid;
  return { isAnon, uid: typeof uidRaw === "string" ? uidRaw : null };
}

function readAnswersKeys(data: SubmissionData): string[] {
  const ans = data.answers;
  if (!ans || typeof ans !== "object") return [];
  return Object.keys(ans as Record<string, unknown>);
}

function readStatus(data: SubmissionData): string {
  const s = data.status;
  return typeof s === "string" ? s : "";
}

export default function TeacherSpaceDetailPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;

  const [space, setSpace] = useState<SpaceDoc | null>(null);
  const [saving, setSaving] = useState(false);

  // MVP: teacher limer inn lessonId for å se innleveringer
  const [lessonId, setLessonId] = useState("");
  const [lessonIdDraft, setLessonIdDraft] = useState("");

  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);

  useEffect(() => {
    const ref = doc(db, "spaces", spaceId);
    return onSnapshot(ref, (snap) => {
      setSpace(snap.exists() ? (snap.data() as SpaceDoc) : null);
    });
  }, [spaceId]);

  // Live subscribe to submissions when we have a lessonId
  useEffect(() => {
    setSubs([]);
    setSubsError(null);

    if (!lessonId) return;

    setSubsLoading(true);

    const q = query(
      collection(db, "spaces", spaceId, "lessons", lessonId, "submissions"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: SubmissionRow[] = snap.docs.map((d) => ({
          id: d.id,
          data: (d.data() as SubmissionData) ?? {},
        }));
        setSubs(next);
        setSubsLoading(false);
      },
      (err: unknown) => {
        setSubsLoading(false);
        const info = getErrorInfo(err);
        setSubsError(info.message || "Kunne ikke lese submissions.");
        console.log("[TEACHER] submissions read ERROR =>", info.code, info.message, err);
      }
    );

    return () => unsub();
  }, [spaceId, lessonId]);

  const joinLink = useMemo(() => {
    if (!space) return "/join";
    return `/join?code=${encodeURIComponent(space.code)}`;
  }, [space]);

  const lessonLink = lessonId ? `/space/${spaceId}/lesson/${lessonId}` : null;

  if (!space) return <div style={{ padding: 16 }}>Laster…</div>;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{space.title}</h1>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>
            Kode: <b>{space.code}</b> · Åpen: {space.isOpen ? "Ja" : "Nei"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/teacher/spaces">← Back</Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {/* Deling + open/close */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Deling</div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ opacity: 0.8 }}>Elever kan gå inn via:</div>
            <ul style={{ margin: "6px 0 0 18px" }}>
              <li>
                <Link href={joinLink}>{joinLink}</Link>
              </li>
              <li>
                Kode: <b>{space.code}</b>
              </li>
            </ul>
          </div>

          <button
            onClick={async () => {
              setSaving(true);
              try {
                await setSpaceOpen(spaceId, !space.isOpen);
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={{ padding: "8px 12px", borderRadius: 10 }}
          >
            {space.isOpen ? "Steng for anon" : "Åpne for anon"}
          </button>
        </div>

        {/* MVP: submissions viewer */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Innleveringer (MVP)</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={lessonIdDraft}
              onChange={(e) => setLessonIdDraft(e.target.value)}
              placeholder="Lim inn lessonId (f.eks. CgdvijTHd3hkzUHySZ01)"
              style={{
                flex: "1 1 420px",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
              }}
            />
            <button
              onClick={() => setLessonId(lessonIdDraft.trim())}
              style={{ padding: "10px 12px", borderRadius: 10 }}
            >
              Vis submissions
            </button>

            {lessonId && (
              <button
                onClick={() => {
                  setLessonId("");
                  setLessonIdDraft("");
                  setSubs([]);
                  setSubsError(null);
                }}
                style={{ padding: "10px 12px", borderRadius: 10 }}
              >
                Nullstill
              </button>
            )}
          </div>

          {lessonLink && (
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              Lesson-lenke (for elever): <Link href={lessonLink}>{lessonLink}</Link>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            {subsLoading && <div style={{ opacity: 0.75 }}>Laster submissions…</div>}

            {subsError && (
              <div style={{ color: "crimson" }}>Feil ved lesing av submissions: {subsError}</div>
            )}

            {!subsLoading && !subsError && lessonId && subs.length === 0 && (
              <div style={{ opacity: 0.75 }}>Ingen submissions funnet for denne lessonId-en (enda).</div>
            )}

            {!subsLoading && !subsError && subs.length > 0 && (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {subs.map((s) => {
                  const createdAt = formatMaybeDate(s.data.createdAt);
                  const status = readStatus(s.data);
                  const auth = readAuth(s.data);
                  const answersKeys = readAnswersKeys(s.data);

                  return (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700 }}>{createdAt ? createdAt : "Ukjent tidspunkt"}</div>
                        <div style={{ opacity: 0.8 }}>
                          Status: <b>{status || "—"}</b>
                        </div>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.85 }}>
                        {auth.isAnon ? (
                          <span>Gjest (uinnlogget)</span>
                        ) : (
                          <span>
                            Innlogget · uid: <code>{auth.uid ?? "—"}</code>
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.85 }}>
                        Svarfelt: {answersKeys.length ? answersKeys.join(", ") : "(ingen keys)"}
                      </div>

                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer" }}>Se rådata</summary>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>
                          {JSON.stringify(s.data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Neste steg</div>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            I MVP velger du en lesson ved å sende elevene direkte til:
            <br />
            <code>/space/{spaceId}/lesson/{`{lessonId}`}</code>
          </p>
          <p style={{ marginTop: 0, opacity: 0.8 }}>(Senere kan vi lage “Legg til lesson i space”-liste her.)</p>
        </div>
      </div>
    </div>
  );
}
