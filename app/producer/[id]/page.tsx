"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";

type TaskType = "truefalse" | "mcq" | "open";
type ReleaseMode = "ALL_AT_ONCE" | "TEXT_FIRST";

type Task = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: any;
};

type Lesson = {
  ownerId?: string;
  title: string;
  level?: string;
  sourceText: string;
  status?: "draft" | "published";
  tasks?: Task[];
  updatedAt?: any;

  // ✅ METADATA v1
  tags?: string[];
  topic?: string;
  language?: string;
  estimatedMinutes?: number;
  releaseMode?: ReleaseMode;
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function newId() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(2, 6)
  );
}

function parseTags(text: string) {
  return text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export default function ProducerLessonEditorPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // Editable state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [tasks, setTasks] = useState<Task[]>([]);

  // ✅ METADATA state
  const [topic, setTopic] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [language, setLanguage] = useState("English");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(20);
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("ALL_AT_ONCE");

  const sortedTasks = useMemo(() => {
    const t = [...tasks];
    t.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return t;
  }, [tasks]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      try {
        await ensureAnonymousUser();
        const u = uidNow();
        if (!u) throw new Error("No auth uid (anonymous auth not ready).");
        if (!alive) return;
        setUid(u);

        const snap = await getDoc(doc(db, "lessons", lessonId));
        if (!alive) return;

        if (!snap.exists()) {
          setErr("Fant ikke lesson.");
          setLesson(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as Lesson;

        // Owner-sjekk
        if (data.ownerId && data.ownerId !== u) {
          setErr("Du har ikke tilgang til denne lesson (ownerId mismatch).");
          setLesson(null);
          setLoading(false);
          return;
        }

        setLesson(data);
        setTitle(data.title ?? "");
        setLevel(data.level ?? "");
        setSourceText(data.sourceText ?? "");
        setStatus((data.status ?? "draft") as any);
        setTasks(Array.isArray(data.tasks) ? (data.tasks as Task[]) : []);

        // ✅ fyll metadata
        setTopic(data.topic ?? "");
        setTagsText(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        setLanguage(data.language ?? "English");
        setEstimatedMinutes(
          typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : 20
        );
        setReleaseMode((data.releaseMode ?? "ALL_AT_ONCE") as ReleaseMode);

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Kunne ikke laste lesson.");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId]);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      await ensureAnonymousUser();
      const u = uidNow();
      if (!u) throw new Error("No auth uid.");

      const tags = parseTags(tagsText);

      // Normaliser order
      const normalized = sortedTasks.map((t, idx) => ({
        ...t,
        order: idx + 1,
      }));

      await updateDoc(doc(db, "lessons", lessonId), {
        title: title.trim(),
        level: level.trim(),
        sourceText,
        status,
        tasks: normalized,

        // ✅ METADATA
        topic: topic.trim(),
        tags,
        language: language.trim(),
        estimatedMinutes: Number.isFinite(estimatedMinutes)
          ? Number(estimatedMinutes)
          : 20,
        releaseMode,

        updatedAt: serverTimestamp(),
      });

      setTasks(normalized);
    } catch (e: any) {
      setErr(e?.message ?? "Lagring feilet.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setErr(null);
    setPublishing(true);
    try {
      // lagre først
      await save();

      await updateDoc(doc(db, "lessons", lessonId), {
        status: "published",
        updatedAt: serverTimestamp(),
      });

      setStatus("published");
    } catch (e: any) {
      setErr(e?.message ?? "Publisering feilet.");
    } finally {
      setPublishing(false);
    }
  }

  function addTask(type: TaskType) {
    const id = newId();
    const nextOrder =
      (sortedTasks[sortedTasks.length - 1]?.order ?? sortedTasks.length) + 1;

    const base: Task = {
      id,
      order: nextOrder,
      type,
      prompt: "",
    };

    if (type === "truefalse") {
      base.correctAnswer = "true";
    }

    if (type === "mcq") {
      base.options = ["Option A", "Option B", "Option C", "Option D"];
      base.correctAnswer = "Option A";
    }

    setTasks((prev) => [...prev, base]);
  }

  function removeTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function moveTask(taskId: string, dir: -1 | 1) {
    const t = [...sortedTasks];
    const idx = t.findIndex((x) => x.id === taskId);
    if (idx === -1) return;
    const j = idx + dir;
    if (j < 0 || j >= t.length) return;
    const tmp = t[idx];
    t[idx] = t[j];
    t[j] = tmp;

    const re = t.map((x, i) => ({ ...x, order: i + 1 }));
    setTasks(re);
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
    );
  }

  if (loading) {
    return <main style={{ padding: 20 }}>Laster…</main>;
  }

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Producer editor</h1>
        <div
          style={{
            marginTop: 12,
            border: "1px solid #f3b4b4",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Feil</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href="/producer">← Tilbake</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <Link href="/producer">← Tilbake</Link>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>
            Producer editor
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            id: {lessonId} · uid: {uid ?? "—"} · status: {status}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/producer/${lessonId}/preview`}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Preview
          </Link>

          <button
            onClick={save}
            disabled={saving}
            style={{ padding: "8px 12px" }}
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>

          <button
            onClick={publish}
            disabled={publishing}
            style={{ padding: "8px 12px" }}
            title="Setter status=published"
          >
            {publishing ? "Publiserer…" : "Publiser"}
          </button>
        </div>
      </div>

      {/* Lesson meta */}
      <section
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Tittel</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder="Lesson title…"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Nivå (valgfritt)</div>
            <input
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder="A1 / A2 / B1 …"
            />
          </label>

          {/* ✅ NY metadata */}
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Tema / topic</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder="Work / Health / Daily life …"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Tags (komma-separert)</div>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder="work, safety, norway"
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Lagres som array i Firestore.
            </div>
          </label>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>Language</div>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder="English"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>Estimert tid (min)</div>
              <input
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                style={{ padding: "10px 12px" }}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Release mode</div>
            <select
              value={releaseMode}
              onChange={(e) => setReleaseMode(e.target.value as ReleaseMode)}
              style={{ padding: "10px 12px" }}
            >
              <option value="ALL_AT_ONCE">ALL_AT_ONCE</option>
              <option value="TEXT_FIRST">TEXT_FIRST</option>
            </select>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              TEXT_FIRST kan brukes senere til å låse opp oppgaver etter tekst.
            </div>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              style={{ padding: "10px 12px" }}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Tekst</div>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={10}
              style={{ padding: "10px 12px", width: "100%" }}
              placeholder="Skriv inn kildetekst…"
            />
          </label>
        </div>
      </section>

      {/* Tasks */}
      <section style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 900 }}>Oppgaver</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => addTask("truefalse")}
              style={{ padding: "8px 10px" }}
            >
              + True/False
            </button>
            <button
              onClick={() => addTask("mcq")}
              style={{ padding: "8px 10px" }}
            >
              + MCQ
            </button>
            <button
              onClick={() => addTask("open")}
              style={{ padding: "8px 10px" }}
            >
              + Open
            </button>
          </div>
        </div>

        {sortedTasks.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>Ingen oppgaver enda.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {sortedTasks.map((t, idx) => (
              <div
                key={t.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      #{idx + 1} · {t.type.toUpperCase()} · id: {t.id}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => moveTask(t.id, -1)}
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveTask(t.id, +1)}
                        disabled={idx === sortedTasks.length - 1}
                      >
                        ↓
                      </button>
                      <button onClick={() => removeTask(t.id)} title="Slett task">
                        Slett
                      </button>
                    </div>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Type</div>
                    <select
                      value={t.type}
                      onChange={(e) =>
                        updateTask(t.id, {
                          type: e.target.value as TaskType,
                        })
                      }
                    >
                      <option value="truefalse">truefalse</option>
                      <option value="mcq">mcq</option>
                      <option value="open">open</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  <div style={{ fontWeight: 800 }}>Prompt</div>
                  <textarea
                    value={t.prompt}
                    onChange={(e) => updateTask(t.id, { prompt: e.target.value })}
                    rows={3}
                    style={{ padding: "10px 12px", width: "100%" }}
                    placeholder="Skriv oppgavetekst…"
                  />
                </label>

                {t.type === "mcq" && (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>Alternativer (én per linje)</div>
                      <textarea
                        value={(t.options ?? []).join("\n")}
                        onChange={(e) =>
                          updateTask(t.id, {
                            options: e.target.value
                              .split("\n")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={5}
                        style={{ padding: "10px 12px", width: "100%" }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>
                        Correct answer (må matche et alternativ)
                      </div>
                      <input
                        value={typeof t.correctAnswer === "string" ? t.correctAnswer : ""}
                        onChange={(e) =>
                          updateTask(t.id, { correctAnswer: e.target.value })
                        }
                        style={{ padding: "10px 12px" }}
                        placeholder="F.eks. Option A"
                      />
                    </label>
                  </div>
                )}

                {t.type === "truefalse" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>Correct answer</div>
                      <select
                        value={t.correctAnswer ?? "true"}
                        onChange={(e) =>
                          updateTask(t.id, { correctAnswer: e.target.value })
                        }
                        style={{ padding: "10px 12px" }}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Tips: Preview-siden din bruker string "true"/"false".
                      </div>
                    </label>
                  </div>
                )}

                {t.type === "open" && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    Open tasks har ingen fasit her. Learner får AI-feedback når de leverer.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.75 }}>
          Husk å trykke <b>Lagre</b> etter endringer.
        </div>
      </section>
    </main>
  );
}

