"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type LessonDraft = {
  title?: string;
  description?: string;
  level?: string;
  language?: string;

  // du har brukt topic/prompt litt om hverandre
  topic?: string;
  prompt?: string;

  // text type (nytt)
  textType?: string;
  texttype?: string; // legacy

  sourceText?: string;
  text?: string;

  tasks?: any; // array (LessonTask[]) eller stringified json
  coverImageUrl?: string;
  imageUrl?: string;

  status?: "draft" | "review" | "published";
  isActive?: boolean;
};

function safeTasksArray(tasks: any): any[] {
  if (Array.isArray(tasks)) return tasks;
  if (typeof tasks === "string") {
    try {
      const parsed = JSON.parse(tasks);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function pickImageUrl(l: LessonDraft): string | null {
  const a = String(l.coverImageUrl || "").trim();
  if (a) return a;
  const b = String(l.imageUrl || "").trim();
  if (b) return b;
  return null;
}

function normalizeTextType(l: LessonDraft): string {
  // tåler at noen har skrevet `"Biography"` med anførselstegn i strengen
  const raw = String(l.textType ?? l.texttype ?? "").trim();
  return raw.replace(/^"+|"+$/g, "").trim();
}

export default function ProducerTextDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState<LessonDraft | null>(null);

  // raw tasks JSON editor (valgfritt)
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
      // ✅ RIKTIG: lessons
      const ref = doc(db, "lessons", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError("Document not found.");
        setDraft(null);
        return;
      }

      const data = snap.data() as LessonDraft;

      // normaliser sourceText
      const normalized: LessonDraft = {
        ...data,
        sourceText: String(data.sourceText ?? data.text ?? ""),
        textType: normalizeTextType(data) || undefined,
      };

      setDraft(normalized);
      setRawTasksDraft(JSON.stringify(data.tasks ?? [], null, 2));
    } catch (e: any) {
      setError(String(e?.message ?? e));
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

      await updateDoc(ref, {
        title: draft.title ?? "",
        description: draft.description ?? "",
        level: draft.level ?? "",
        language: draft.language ?? "",

        // behold begge for kompatibilitet (du rydder senere)
        topic: draft.topic ?? draft.prompt ?? "",
        prompt: draft.prompt ?? draft.topic ?? "",

        // ✅ lagre textType riktig
        textType: textType || "",
        texttype: textType || "",

        sourceText: draft.sourceText ?? "",
        tasks: draft.tasks ?? [],

        coverImageUrl: draft.coverImageUrl ?? "",
        imageUrl: draft.imageUrl ?? "",

        status: draft.status ?? "draft",
        updatedAt: serverTimestamp(),
      });

      setMsg("Saved ✅");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!id || !draft) return;

    setPublishing(true);
    setError(null);
    setMsg(null);

    try {
      const textType = normalizeTextType(draft);

      const sourceText = String(draft.sourceText ?? draft.text ?? "").trim();
      if (!String(draft.title ?? "").trim()) throw new Error("Title is required before publish.");
      if (!sourceText) throw new Error("Source text is empty.");

      const img = pickImageUrl(draft);
      const topic = String(draft.topic ?? draft.prompt ?? "").trim();

      // ✅ skriv til published_lessons med merge
      await setDoc(
        doc(db, "published_lessons", id),
        {
          title: String(draft.title ?? "").trim(),
          description: String(draft.description ?? "").trim() || "",
          level: String(draft.level ?? "").trim() || "",
          language: String(draft.language ?? "").trim() || "",

          // topic brukes i published (men IKKE prompt-innhold i søkefeltet ditt fremover)
          topic: topic || "",
          topics: topic ? [topic] : [],

          // ✅ NYTT: textType følger med til published
          textType: textType || "",
          texttype: textType || "",

          sourceText,
          tasks: draft.tasks ?? [],

          coverImageUrl: draft.coverImageUrl ?? "",
          imageUrl: draft.imageUrl ?? "",

          isActive: true,
          status: "published",
          publishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // (valgfritt) oppdater også draft-status
      await updateDoc(doc(db, "lessons", id), {
        status: "published",
        updatedAt: serverTimestamp(),
      });

      setMsg("Published ✅");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function applyRawTasks() {
    if (!draft) return;
    try {
      const parsed = JSON.parse(rawTasksDraft);
      setDraft({ ...draft, tasks: parsed });
      setError(null);
      setMsg("Tasks updated (not saved yet)");
    } catch {
      setError("Invalid JSON in raw tasks. Fix it before applying.");
    }
  }

  return (
    <main style={{ maxWidth: 980, paddingBottom: 60 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Link href="/producer/texts">← Back to list</Link>
        <span style={{ opacity: 0.7 }}>ID: {id || "(missing)"}</span>
      </div>

      <h1 style={{ marginBottom: 6 }}>Producer: Edit lesson</h1>

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
              Status
              <select
                value={draft.status ?? "draft"}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as any })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="draft">draft</option>
                <option value="review">review</option>
                <option value="published">published</option>
              </select>
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

            <div style={{ marginTop: 10, opacity: 0.75 }}>
              Current tasks: {tasksArr.length}
            </div>

            {showRawTasks ? (
              <div style={{ marginTop: 12 }}>
                <textarea
                  value={rawTasksDraft}
                  onChange={(e) => setRawTasksDraft(e.target.value)}
                  rows={16}
                  style={{ width: "100%", padding: 8, fontFamily: "monospace" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={applyRawTasks} style={{ padding: "8px 12px" }}>
                    Apply raw JSON
                  </button>
                  <span style={{ opacity: 0.7 }}>
                    (Apply = updates state. Remember to Save.)
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
              {saving ? "Saving..." : "Save changes"}
            </button>

            <button onClick={publish} disabled={publishing} style={{ padding: "10px 14px" }}>
              {publishing ? "Publishing..." : "Publish to library"}
            </button>

            <button onClick={load} disabled={loading || saving || publishing} style={{ padding: "10px 14px" }}>
              Reload
            </button>
          </div>
        </>
      )}
    </main>
  );
}
