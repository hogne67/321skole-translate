// app/[locale]/(app)/producer/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("producer.editor");

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
  const [language, setLanguage] = useState(t("defaults.language"));
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

  const localizeError = useCallback(
    (message: string): string => {
      const m = message || "";

      if (m === "No auth uid (anonymous auth not ready).") return t("errors.noAuthUidNotReady");
      if (m === "No auth uid.") return t("errors.noAuthUid");
      if (m === "Fant ikke lesson.") return t("errors.notFound");
      if (m === "Du har ikke tilgang til denne lesson (ownerId mismatch).") return t("errors.noAccessOwnerMismatch");
      if (m === "Kunne ikke laste lesson.") return t("errors.loadFailed");
      if (m === "Velg en bildefil (jpg/png/webp).") return t("errors.chooseImageFile");
      if (m === "Filen er for stor. Maks 8MB.") return t("errors.fileTooLarge");
      if (m === "Upload feilet.") return t("errors.uploadFailed");
      if (m === "Lagring feilet.") return t("errors.saveFailed");

      // fall back to raw message (dev-friendly)
      return m;
    },
    [t]
  );

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
          setErr(t("errors.notFound"));
          setLoading(false);
          return;
        }

        const data = (snap.data() as Lesson) ?? {};

        // Owner-sjekk
        if (data.ownerId && data.ownerId !== u) {
          setErr(t("errors.noAccessOwnerMismatch"));
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
        setLanguage(typeof data.language === "string" ? data.language : t("defaults.language"));
        setEstimatedMinutes(typeof data.estimatedMinutes === "number" ? data.estimatedMinutes : 20);
        setReleaseMode(normalizeReleaseMode(data.releaseMode));

        // ✅ PDF/branding
        setProducerName(typeof data.producerName === "string" ? data.producerName : "");
        setCoverImageUrl(typeof data.coverImageUrl === "string" ? data.coverImageUrl : "");
        setCoverImageFormat(normalizeCoverFormat(data.coverImageFormat));

        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(localizeError(getErrorMessage(e) || t("errors.loadFailed")));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, t, localizeError]);

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
      setErr(localizeError(getErrorMessage(e) || t("errors.uploadFailed")));
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
      setErr(localizeError(getErrorMessage(e) || t("errors.saveFailed")));
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
      base.options = [
        t("tasks.defaults.optionA"),
        t("tasks.defaults.optionB"),
        t("tasks.defaults.optionC"),
        t("tasks.defaults.optionD"),
      ];
      base.correctAnswer = t("tasks.defaults.optionA");
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

  if (loading) return <main style={{ padding: 20 }}>{t("states.loading")}</main>;

  if (err) {
    return (
      <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{t("pageTitle")}</h1>
        <div style={{ marginTop: 12, border: "1px solid #f3b4b4", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>{t("errors.title")}</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{err}</pre>
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/producer">{t("nav.back")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <Link href="/producer">{t("nav.back")}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>{t("pageTitle")}</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t("metaLine", { id: lessonId, uid: uid ?? "—", status })}
          </div>
        </div>

        {/* ✅ Editor actions (kun Lagre) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving} style={{ padding: "8px 12px" }}>
            {saving ? t("buttons.saving") : t("buttons.save")}
          </button>
        </div>
      </div>

      {/* Lesson meta */}
      <section style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.title")}</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder={t("placeholders.title")}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.levelOptional")}</div>
            <input
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder={t("placeholders.level")}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.producerName")}</div>
            <input
              value={producerName}
              onChange={(e) => setProducerName(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder={t("placeholders.producerName")}
            />
          </label>

          {/* Banner */}
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.cover.title")}</div>

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
                {uploadingCover ? t("fields.cover.uploading") : t("fields.cover.upload")}
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
                title={t("fields.cover.removeTitle")}
              >
                {t("fields.cover.remove")}
              </button>

              <label style={{ display: "grid", gap: 6, maxWidth: 240 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{t("fields.cover.formatLabel")}</div>
                <select
                  value={coverImageFormat}
                  onChange={(e) => setCoverImageFormat(normalizeCoverFormat(e.target.value))}
                  style={{ padding: "10px 12px" }}
                >
                  <option value="16:9">{t("fields.cover.format16x9")}</option>
                  <option value="4:3">{t("fields.cover.format4x3")}</option>
                </select>
              </label>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {t("fields.cover.help")} <b>{t("buttons.save")}</b>.
            </div>

            {coverImageUrl?.trim() ? (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImageUrl}
                  alt={t("fields.cover.previewAlt")}
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
                  {t("fields.cover.previewHint", { format: coverImageFormat })}
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
                {t("fields.cover.noneSelected", { format: coverImageFormat })}
              </div>
            )}
          </div>

          {/* Metadata */}
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.topic")}</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder={t("placeholders.topic")}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.tags")}</div>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              style={{ padding: "10px 12px" }}
              placeholder={t("placeholders.tags")}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>{t("fields.tagsHelp")}</div>
          </label>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.language")}</div>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: "10px 12px" }}
                placeholder={t("placeholders.language")}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{t("fields.estimatedMinutes")}</div>
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
            <div style={{ fontWeight: 800 }}>{t("fields.releaseMode")}</div>
            <select
              value={releaseMode}
              onChange={(e) => setReleaseMode(normalizeReleaseMode(e.target.value))}
              style={{ padding: "10px 12px" }}
            >
              <option value="ALL_AT_ONCE">{t("releaseModes.allAtOnce")}</option>
              <option value="TEXT_FIRST">{t("releaseModes.textFirst")}</option>
            </select>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{t("fields.releaseModeHelp")}</div>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.status")}</div>
            <select
              value={status}
              onChange={(e) => setStatus(normalizeStatus(e.target.value))}
              style={{ padding: "10px 12px" }}
            >
              <option value="draft">{t("statuses.draft")}</option>
              <option value="published">{t("statuses.published")}</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>{t("fields.text")}</div>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={10}
              style={{ padding: "10px 12px", width: "100%" }}
              placeholder={t("placeholders.sourceText")}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {t("counts", {
                words: wordCount,
                charsNoSpaces: charCountNoSpaces,
                charsWithSpaces: charCountWithSpaces,
              })}
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
          <h2 style={{ fontSize: 18, fontWeight: 900 }}>{t("tasks.title")}</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => addTask("truefalse")} style={{ padding: "8px 10px" }}>
              {t("tasks.add.trueFalse")}
            </button>
            <button onClick={() => addTask("mcq")} style={{ padding: "8px 10px" }}>
              {t("tasks.add.mcq")}
            </button>
            <button onClick={() => addTask("open")} style={{ padding: "8px 10px" }}>
              {t("tasks.add.open")}
            </button>
          </div>
        </div>

        {sortedTasks.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>{t("tasks.empty")}</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {sortedTasks.map((task, idx) => (
              <div key={task.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
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
                      {t("tasks.headerLine", { n: idx + 1, type: task.type.toUpperCase(), id: task.id })}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => moveTask(task.id, -1)} disabled={idx === 0}>
                        ↑
                      </button>
                      <button onClick={() => moveTask(task.id, +1)} disabled={idx === sortedTasks.length - 1}>
                        ↓
                      </button>
                      <button onClick={() => removeTask(task.id)} title={t("tasks.deleteTitle")}>
                        {t("tasks.delete")}
                      </button>
                    </div>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{t("tasks.type")}</div>
                    <select
                      value={task.type}
                      onChange={(e) => updateTask(task.id, { type: e.target.value as TaskType })}
                    >
                      <option value="truefalse">{t("taskTypes.truefalse")}</option>
                      <option value="mcq">{t("taskTypes.mcq")}</option>
                      <option value="open">{t("taskTypes.open")}</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  <div style={{ fontWeight: 800 }}>{t("tasks.prompt")}</div>
                  <textarea
                    value={task.prompt}
                    onChange={(e) => updateTask(task.id, { prompt: e.target.value })}
                    rows={3}
                    style={{ padding: "10px 12px", width: "100%" }}
                    placeholder={t("placeholders.taskPrompt")}
                  />
                </label>

                {task.type === "mcq" && (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>{t("mcq.optionsOnePerLine")}</div>
                      <textarea
                        value={(task.options ?? []).join("\n")}
                        onChange={(e) =>
                          updateTask(task.id, {
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
                      <div style={{ fontWeight: 800 }}>{t("mcq.correctAnswer")}</div>
                      <input
                        value={typeof task.correctAnswer === "string" ? task.correctAnswer : ""}
                        onChange={(e) => updateTask(task.id, { correctAnswer: e.target.value })}
                        style={{ padding: "10px 12px" }}
                        placeholder={t("placeholders.mcqCorrectAnswer")}
                      />
                    </label>
                  </div>
                )}

                {task.type === "truefalse" && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>{t("tf.correctAnswer")}</div>
                      <select
                        value={task.correctAnswer ?? "true"}
                        onChange={(e) => updateTask(task.id, { correctAnswer: e.target.value })}
                        style={{ padding: "10px 12px" }}
                      >
                        <option value="true">{t("answers.true")}</option>
                        <option value="false">{t("answers.false")}</option>
                      </select>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{t("tf.tip")}</div>
                    </label>
                  </div>
                )}

                {task.type === "open" && (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
                      <div style={{ fontWeight: 800 }}>{t("open.answerSpace")}</div>
                      <select
                        value={task.answerSpace ?? "medium"}
                        onChange={(e) => updateTask(task.id, { answerSpace: e.target.value as AnswerSpace })}
                        style={{ padding: "10px 12px" }}
                      >
                        <option value="short">{t("answerSpace.short")}</option>
                        <option value="medium">{t("answerSpace.medium")}</option>
                        <option value="long">{t("answerSpace.long")}</option>
                      </select>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{t("open.answerSpaceHelp")}</div>
                    </label>

                    <div style={{ fontSize: 13, opacity: 0.75 }}>{t("open.hint")}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.75 }}>
          {t("footerRemember")} <b>{t("buttons.save")}</b>.
        </div>
      </section>
    </main>
  );
}