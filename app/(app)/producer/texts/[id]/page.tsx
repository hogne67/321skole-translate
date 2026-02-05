// app/(app)/producer/texts/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

type PublishState = "draft" | "unlisted" | "pending" | "published" | "rejected";
type ModStatus = "pass" | "review" | "blocked" | "unknown";

type ModerateResult = {
  status: "pass" | "review" | "blocked";
  riskScore: number;
  reasons: string[];
  notes?: string;
};

type LessonDraft = {
  title?: string;
  description?: string;
  level?: string;
  language?: string;

  // legacy/new topic fields
  topic?: string;
  prompt?: string;

  // text type
  textType?: string;
  texttype?: string; // legacy

  sourceText?: string;
  text?: string;

  tasks?: unknown; // array or stringified json
  coverImageUrl?: string;
  imageUrl?: string;

  // legacy
  status?: "draft" | "review" | "published";
  isActive?: boolean;

  publish?: {
    state?: PublishState;
  };

  moderation?: {
    status?: ModStatus;
    riskScore?: number;
    reasons?: string[];
    notes?: string;
    checkedAt?: unknown;
  };
};

type TaskLike = {
  id?: unknown;
  order?: unknown;
  type?: unknown;
  prompt?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
  answerSpace?: unknown;
};

function safeTasksArray(tasks: unknown): TaskLike[] {
  if (Array.isArray(tasks)) return tasks as TaskLike[];
  if (typeof tasks === "string") {
    try {
      const parsed = JSON.parse(tasks) as unknown;
      return Array.isArray(parsed) ? (parsed as TaskLike[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTextType(l: LessonDraft): string {
  const raw = String(l.textType ?? l.texttype ?? "").trim();
  return raw.replace(/^"+|"+$/g, "").trim();
}

function publishStateLabel(s?: PublishState) {
  return s || "draft";
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

async function moderateLesson(input: { title: string; sourceText: string; tasks: unknown }) {
  const res = await fetch("/api/moderate-lesson", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Moderation failed (${res.status})`);

  const data = (await res.json()) as unknown;
  return data as ModerateResult;
}

async function publishViaApi(id: string, visibility: "public" | "unlisted" | "private" = "public") {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();

  const res = await fetch("/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, visibility }),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: unknown };
    throw new Error(typeof d?.error === "string" ? d.error : "Publish failed");
  }

  return data as { publishedLessonId?: string };
}

export default function ProducerTextDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [serverPublishing, setServerPublishing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState<LessonDraft | null>(null);

  // raw tasks JSON editor (optional)
  const [showRawTasks, setShowRawTasks] = useState(false);
  const [rawTasksDraft, setRawTasksDraft] = useState<string>("");

  const tasksArr = useMemo(() => safeTasksArray(draft?.tasks), [draft?.tasks]);

  async function load() {
    if (!id) {
      setError("Missing document id in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ref = doc(db, "lessons", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError("Document not found.");
        setDraft(null);
        return;
      }

      const data = snap.data() as LessonDraft;

      const normalized: LessonDraft = {
        ...data,
        sourceText: String(data.sourceText ?? data.text ?? ""),
        textType: normalizeTextType(data) || undefined,
        publish: { state: (data.publish?.state as PublishState) || "draft" },
        moderation: data.moderation
          ? {
              status: (data.moderation.status as ModStatus) || "unknown",
              riskScore: data.moderation.riskScore,
              reasons: Array.isArray(data.moderation.reasons) ? data.moderation.reasons : [],
              notes: data.moderation.notes,
              checkedAt: data.moderation.checkedAt,
            }
          : undefined,
      };

      setDraft(normalized);
      setRawTasksDraft(JSON.stringify(data.tasks ?? [], null, 2));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!id || !draft) return;

    setSaving(true);
    setError(null);
    setMsg(null);

    try {
      const ref = doc(db, "lessons", id);
      const textType = normalizeTextType(draft);

      // manual state can only be draft/unlisted
      const pState: PublishState = (draft.publish?.state as PublishState) || "draft";
      const safePublishState: PublishState = pState === "unlisted" ? "unlisted" : "draft";

      await updateDoc(ref, {
        title: draft.title ?? "",
        description: draft.description ?? "",
        level: draft.level ?? "",
        language: draft.language ?? "",

        topic: draft.topic ?? draft.prompt ?? "",
        prompt: draft.prompt ?? draft.topic ?? "",

        textType: textType || "",
        texttype: textType || "",

        sourceText: draft.sourceText ?? "",
        tasks: draft.tasks ?? [],

        coverImageUrl: draft.coverImageUrl ?? "",
        imageUrl: draft.imageUrl ?? "",

        "publish.state": safePublishState,
        status: "draft",

        updatedAt: serverTimestamp(),
      });

      setDraft({
        ...draft,
        publish: { ...(draft.publish || {}), state: safePublishState },
        status: "draft",
      });
      setMsg("Saved ✅");
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function setUnlisted() {
    if (!id || !draft) return;

    setSaving(true);
    setError(null);
    setMsg(null);

    try {
      await updateDoc(doc(db, "lessons", id), {
        "publish.state": "unlisted",
        status: "draft",
        updatedAt: serverTimestamp(),
      });

      setDraft({
        ...draft,
        publish: { ...(draft.publish || {}), state: "unlisted" },
        status: "draft",
      });
      setMsg("Set to Unlisted ✅ (share-link only, not in library)");
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitForLibraryReview() {
    if (!id || !draft) return;

    setPublishing(true);
    setError(null);
    setMsg(null);

    try {
      const title = String(draft.title ?? "").trim();
      const sourceText = String(draft.sourceText ?? draft.text ?? "").trim();
      const tasks = draft.tasks ?? [];

      if (!title) throw new Error("Title is required before submit.");
      if (!sourceText) throw new Error("Source text is empty.");

      // 1) run moderation
      const mod = await moderateLesson({ title, sourceText, tasks });

      // 2) write moderation result to draft
      await updateDoc(doc(db, "lessons", id), {
        "moderation.status": mod.status,
        "moderation.riskScore": mod.riskScore,
        "moderation.reasons": mod.reasons ?? [],
        "moderation.notes": mod.notes ?? "",
        "moderation.checkedAt": serverTimestamp(),

        // decision:
        "publish.state": mod.status === "blocked" ? "draft" : "pending",

        // legacy
        status: mod.status === "blocked" ? "draft" : "review",

        updatedAt: serverTimestamp(),
      });

      setDraft({
        ...draft,
        moderation: {
          status: mod.status,
          riskScore: mod.riskScore,
          reasons: mod.reasons ?? [],
          notes: mod.notes ?? "",
          checkedAt: new Date(),
        },
        publish: { ...(draft.publish || {}), state: mod.status === "blocked" ? "draft" : "pending" },
        status: mod.status === "blocked" ? "draft" : "review",
      });

      if (mod.status === "blocked") {
        throw new Error(`Blocked by auto-check: ${mod.reasons.join(", ") || "unknown reason"}`);
      }

      setMsg(`Submitted for review ✅ (auto-check: ${mod.status}, score ${mod.riskScore})`);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setPublishing(false);
    }
  }

  async function publishNowServer() {
    if (!id) return;

    setServerPublishing(true);
    setError(null);
    setMsg(null);

    try {
      // Choose visibility based on your manual draft selection
      const visibility: "public" | "unlisted" =
        draft?.publish?.state === "unlisted" ? "unlisted" : "public";

      const result = await publishViaApi(id, visibility);

      // optionally reflect in draft UI
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              publish: { ...(prev.publish || {}), state: "published" },
              status: "published",
            }
          : prev
      );

      setMsg(`Published ✅ (server). id=${result.publishedLessonId ?? "—"}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setServerPublishing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function applyRawTasks() {
    if (!draft) return;
    try {
      const parsed = JSON.parse(rawTasksDraft) as unknown;
      setDraft({ ...draft, tasks: parsed });
      setError(null);
      setMsg("Tasks updated (not saved yet)");
    } catch {
      setError("Invalid JSON in raw tasks. Fix it before applying.");
    }
  }

  const publishState = publishStateLabel(draft?.publish?.state);
  const modStatus = draft?.moderation?.status;
  const modScore = draft?.moderation?.riskScore;

  return (
    <main style={{ maxWidth: 980, paddingBottom: 60 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Link href="/producer/texts">← Back to list</Link>
        <span style={{ opacity: 0.7 }}>ID: {id || "(missing)"}</span>
      </div>

      <h1 style={{ marginBottom: 6 }}>Producer: Edit lesson</h1>

      {!loading && draft ? (
        <div style={{ marginBottom: 12, opacity: 0.85 }}>
          Publish state: <b>{publishState}</b>
          {modStatus ? (
            <>
              {" "}
              • Moderation: <b>{modStatus}</b>
              {typeof modScore === "number" ? ` (score ${modScore})` : null}
            </>
          ) : null}
        </div>
      ) : null}

      {loading ? <p>Loading…</p> : null}

      {error ? (
        <div style={{ padding: 12, background: "#ffe6e6", borderRadius: 8, marginBottom: 12 }}>
          <b>Feil:</b> {error}
        </div>
      ) : null}

      {msg ? (
        <div style={{ padding: 12, background: "#e9ffe6", borderRadius: 8, marginBottom: 12 }}>
          {msg}
        </div>
      ) : null}

      {!loading && draft && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              Title
              <input
                value={draft.title ?? ""}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Publish state (manual)
              <select
                value={draft.publish?.state === "unlisted" ? "unlisted" : "draft"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    publish: { ...(draft.publish || {}), state: e.target.value as PublishState },
                  })
                }
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="draft">draft</option>
                <option value="unlisted">unlisted (share-link)</option>
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                “Pending/Published” settes av system/admin.
              </div>
            </label>

            <label>
              Level
              <input
                value={draft.level ?? ""}
                onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Language
              <input
                value={draft.language ?? ""}
                onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Text type (for library filters)
              <input
                value={normalizeTextType(draft)}
                onChange={(e) => setDraft({ ...draft, textType: e.target.value })}
                placeholder="Everyday story / Biography / Article ..."
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Topic (short label, NOT prompt)
              <input
                value={draft.topic ?? ""}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Text (sourceText)
              <textarea
                value={draft.sourceText ?? ""}
                onChange={(e) => setDraft({ ...draft, sourceText: e.target.value })}
                rows={10}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>
          </section>

          <section style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Tasks</h2>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={showRawTasks}
                  onChange={(e) => setShowRawTasks(e.target.checked)}
                />
                Show raw JSON
              </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.75 }}>Current tasks: {tasksArr.length}</div>

            {showRawTasks ? (
              <div style={{ marginTop: 12 }}>
                <textarea
                  value={rawTasksDraft}
                  onChange={(e) => setRawTasksDraft(e.target.value)}
                  rows={16}
                  style={{ width: "100%", padding: 8, fontFamily: "monospace" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={applyRawTasks} style={{ padding: "8px 12px" }}>
                    Apply raw JSON
                  </button>
                  <span style={{ opacity: 0.7 }}>(Apply = updates state. Remember to Save.)</span>
                </div>
              </div>
            ) : null}
          </section>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
              {saving ? "Saving..." : "Save changes"}
            </button>

            <button
              onClick={setUnlisted}
              disabled={saving || publishing || serverPublishing}
              style={{ padding: "10px 14px" }}
            >
              Set Unlisted (share-link)
            </button>

            <button
              onClick={submitForLibraryReview}
              disabled={publishing || saving || serverPublishing}
              style={{ padding: "10px 14px" }}
            >
              {publishing ? "Submitting..." : "Submit for review (draft → pending)"}
            </button>

            <button
              onClick={publishNowServer}
              disabled={serverPublishing || saving || publishing}
              style={{ padding: "10px 14px" }}
            >
              {serverPublishing ? "Publishing..." : "Publish now (server → library)"}
            </button>

            <button
              onClick={load}
              disabled={loading || saving || publishing || serverPublishing}
              style={{ padding: "10px 14px" }}
            >
              Reload
            </button>
          </div>
        </>
      )}
    </main>
  );
}
