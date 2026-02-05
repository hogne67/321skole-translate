// app/(app)/producer/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

type TaskType = "truefalse" | "mcq" | "open";
type ReleaseMode = "ALL_AT_ONCE" | "TEXT_FIRST";
type AnswerSpace = "short" | "medium" | "long";
type CoverFormat = "16:9" | "4:3";
type LessonStatus = "draft" | "published";

type Task = {
  id: string;
  order?: number;
  type: TaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string;

  // ✅ PDF: per open task
  answerSpace?: AnswerSpace;
};

type Lesson = {
  ownerId?: string;
  title?: string;
  level?: string;
  sourceText?: string;
  status?: LessonStatus;
  tasks?: Task[];
  updatedAt?: Timestamp | Date | null;

  // ✅ METADATA v1
  tags?: string[];
  topic?: string;
  language?: string;
  estimatedMinutes?: number;
  releaseMode?: ReleaseMode;

  // ✅ PDF/branding
  producerName?: string;
  coverImageUrl?: string;
  coverImageFormat?: CoverFormat;

  // ✅ pointer (nyttig + fjerner TS-støy)
  activePublishedId?: string | null;
};

function uidNow() {
  return getAuth().currentUser?.uid ?? null;
}

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
}

function parseTags(text: string) {
  return text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function countWords(text: string) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countCharsWithSpaces(text: string) {
  return (text ?? "").length;
}

function countCharsNoSpaces(text: string) {
  return (text ?? "").replace(/\s+/g, "").length;
}

function normalizeStatus(s: unknown): LessonStatus {
  return s === "published" ? "published" : "draft";
}

function normalizeReleaseMode(v: unknown): ReleaseMode {
  return v === "TEXT_FIRST" ? "TEXT_FIRST" : "ALL_AT_ONCE";
}

function normalizeCoverFormat(v: unknown): CoverFormat {
  return v === "4:3" ? "4:3" : "16:9";
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

export default function ProducerLessonEditorPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // Editable state
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [sourceText, setSourceText] = useState("");

  const [status, setStatus] = useState<LessonStatus>("draft");
  const [tasks, setTasks] = useState<Task[]>([]);

  // ✅ METADATA state
  const [topic, setTopic] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [language, setLanguage] = useState("English");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(20);
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("ALL_AT_ONCE");

  // ✅ PDF/branding state
  const [producerName, setProducerName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageFormat, setCoverImageFormat] = useState<CoverFormat>("16:9");
  const [uploadingCover, setUploadingCover] = useState(false);

  const sortedTasks = useMemo(() => {
    const t = [...tasks];
    t.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return t;
  }, [tasks]);

  // ✅ Word/char counts
  const wordCount = useMemo(() => countWords(sourceText), [sourceText]);
  const charCountWithSpaces = useMemo(() => countCharsWithSpaces(sourceText), [sourceText]);
  const charCountNoSpaces = useMemo(() => countCharsNoSpaces(sourceText), [sourceText]);

  // ✅ Preview sizing
  const previewW = 560;
  const previewH =
    coverImageFormat === "4:3"
      ? Math.round((previewW * 3) / 4)
      : Math.round((previewW * 9) / 16);

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
          setLoading(false);
          return;
        }

        const data = (snap.data() as Lesson) ?? {};

        // Owner-sjekk
        if (data.ownerId && data.ownerId !== u) {
          setErr("Du har ikke tilgang til denne lesson (ownerId mismatch).");
          setLoading(false);
          return;
        }

        setTitle(typeof data.title === "string" ? data.title : "");
        setLevel(typeof data.level === "string" ? data.level : "");
        setSourceText(typeof data.sourceText === "string" ? data.sourceText : "");
        setStatus(normalizeStatus(data.status));

        // tasks
        setTasks(Array.isArray(data.tasks) ? (data.tasks as Task[]) : []);

        // ✅ fyll metadata
        setTopic(typeof data.topic === "string" ? data.topic : "");
        setTagsText(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        setLanguage(typeof data.language === "string" ? data.language : "English");
        setEstimatedMinutes(typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : 20);
        setReleaseMode(normalizeReleaseMode(data.releaseMode));

        // ✅ PDF/branding
        setProducerName(typeof data.producerName === "string" ? data.producerName : "");
        setCoverImageUrl(typeof data.coverImageUrl === "string" ? data.coverImageUrl : "");
        setCoverImageFormat(normalizeCoverFormat(data.coverImageFormat));

        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(getErrorMessage(e) || "Kunne ikke laste lesson.");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId]);

  async function uploadCover(file: File) {
    setErr(null);
    setUploadingCover(true);

    try {
      await ensureAnonymousUser();
      const u = uidNow();
      if (!u) throw new Error("No auth uid.");

      if (!file.type.startsWith("image/")) {
        throw new Error("Velg en bildefil (jpg/png/webp).");
      }

      const maxBytes = 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error("Filen er for stor. Maks 8MB.");
      }

      const safeName = file.name.replaceAll(" ", "_");
      const path = `covers/${u}/${lessonId}/${Date.now()}-${safeName}`;
      const r = ref(storage, path);

      await uploadBytes(r, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });

      const url = await getDownloadURL(r);
      setCoverImageUrl(url);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || "Upload feilet.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      await ensureAnonymousUser();
      const u = uidNow();
      if (!u) throw new Error("No auth uid.");

      const tags = parseTags(tagsText);

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
        estimatedMinutes: Number.isFinite(estimatedMinutes) ? Number(estimatedMinutes) : 20,
        releaseMode,

        // ✅ PDF/branding
        producerName: producerName.trim(),
        coverImageUrl: coverImageUrl.trim(),
        coverImageFormat,

        updatedAt: serverTimestamp(),
      });

      setTasks(normalized);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || "Lagring feilet.");
    } finally {
      setSaving(false);
    }
  }

  function addTask(type: TaskType) {
    const id = newId();
    const nextOrder = (sortedTasks[sortedTasks.length - 1]?.order ?? sortedTasks.length) + 1;

    const base: Task = {
      id,
      order: nextOrder,
      type,
      prompt: "",
    };

    if (type === "truefalse") base.correctAnswer = "true";
    if (type === "mcq") {
      base.options = ["Option A", "Option B", "Option C", "Option D"];
      base.correctAnswer = "Option A";
    }
    if (type === "open") base.answerSpace = "medium";

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
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  if (loading) return <main style={{ padding: 20 }}>Laster…</main>;

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Producer editor</h1>
        <div style={{ marginTop: 12, border: "1px solid #f3b4b4", borderRadius: 12, padding: 12 }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <Link href="/producer">← Tilbake</Link>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>Producer editor</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            id: {lessonId} · uid: {uid ?? "—"} · status: {status}
          </div>
        </div>

        {/* ✅ Editor actions (kun Lagre) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving} style={{ padding: "8px 12px" }}>
            {saving ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </div>

      {/* Lesson meta */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
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

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Produsent (vises i PDF)</div>
            <input
              value={producerName}
              onChange={(e) => setProducerName(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder="F.eks. 321skole / Hogne / GuideToGo"
            />
          </label>

          {/* Banner */}
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Banner image (cover)</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  cursor: uploadingCover ? "not-allowed" : "pointer",
                  opacity: uploadingCover ? 0.6 : 1,
                  display: "inline-block",
                }}
              >
                {uploadingCover ? "Uploader…" : "Last opp bilde"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={uploadingCover}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => setCoverImageUrl("")}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  background: "#fff",
                }}
                disabled={uploadingCover || !coverImageUrl}
                title="Fjerner URL (sletter ikke fra Storage i denne MVP-en)"
              >
                Fjern bilde
              </button>

              <label style={{ display: "grid", gap: 6, maxWidth: 240 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Format</div>
                <select
                  value={coverImageFormat}
                  onChange={(e) => setCoverImageFormat(normalizeCoverFormat(e.target.value))}
                  style={{ padding: "10px 12px" }}
                >
                  <option value="16:9">16:9 (banner)</option>
                  <option value="4:3">4:3 (klassisk)</option>
                </select>
              </label>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              (Låst) Bildet kommer fra opplasting til Firebase Storage. URL + format lagres i lesson når du trykker{" "}
              <b>Lagre</b>.
            </div>

            {coverImageUrl?.trim() ? (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImageUrl}
                  alt="Banner preview"
                  style={{
                    width: "100%",
                    maxWidth: previewW,
                    height: previewH,
                    objectFit: "cover",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    display: "block",
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  Preview: {coverImageFormat} (croppes med cover)
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 10,
                  width: "100%",
                  maxWidth: previewW,
                  height: previewH,
                  border: "1px dashed #bbb",
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  color: "#777",
                  fontSize: 12,
                }}
              >
                Ingen banner valgt ({coverImageFormat})
              </div>
            )}
          </div>

          {/* Metadata */}
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
            <div style={{ fontSize: 12, opacity: 0.7 }}>Lagres som array i Firestore.</div>
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
              onChange={(e) => setReleaseMode(normalizeReleaseMode(e.target.value))}
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
              onChange={(e) => setStatus(normalizeStatus(e.target.value))}
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              <b>{wordCount}</b> ord · <b>{charCountNoSpaces}</b> tegn (uten mellomrom) ·{" "}
              <b>{charCountWithSpaces}</b> tegn (med mellomrom)
            </div>
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
            <button onClick={() => addTask("truefalse")} style={{ padding: "8px 10px" }}>
              + True/False
            </button>
            <button onClick={() => addTask("mcq")} style={{ padding: "8px 10px" }}>
              + MCQ
            </button>
            <button onClick={() => addTask("open")} style={{ padding: "8px 10px" }}>
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
                style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}
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
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => moveTask(t.id, -1)} disabled={idx === 0}>
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
                      onChange={(e) => updateTask(t.id, { type: e.target.value as TaskType })}
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
                      <div style={{ fontWeight: 800 }}>Correct answer (må matche et alternativ)</div>
                      <input
                        value={typeof t.correctAnswer === "string" ? t.correctAnswer : ""}
                        onChange={(e) => updateTask(t.id, { correctAnswer: e.target.value })}
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
                        onChange={(e) => updateTask(t.id, { correctAnswer: e.target.value })}
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
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
                      <div style={{ fontWeight: 800 }}>Skriveplass i PDF</div>
                      <select
                        value={t.answerSpace ?? "medium"}
                        onChange={(e) =>
                          updateTask(t.id, { answerSpace: e.target.value as AnswerSpace })
                        }
                        style={{ padding: "10px 12px" }}
                      >
                        <option value="short">Short</option>
                        <option value="medium">Medium</option>
                        <option value="long">Long</option>
                      </select>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Lagres per oppgave (brukes i Printable PDF).
                      </div>
                    </label>

                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      Open tasks har ingen fasit her. Learner får AI-feedback når de leverer.
                    </div>
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
