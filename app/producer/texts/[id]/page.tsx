"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type MCQ = { q: string; options: [string, string, string, string]; answerIndex: 0 | 1 | 2 | 3 };
type TF = { statement: string; answer: boolean };

type Tasks = {
  multipleChoice?: MCQ[];
  trueFalse?: TF[];
  writeFacts?: string[];
  reflectionQuestions?: string[];
};

type ContentPack = {
  title?: string;
  level?: string;
  language?: string;
  topic?: string;
  text?: string;
  status?: string;
  tasks?: Tasks;
};

function safeClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function normalizeTasks(t: any): Tasks {
  const tasks: Tasks = typeof t === "object" && t ? t : {};

  // ensure arrays exist
  if (!Array.isArray(tasks.multipleChoice)) tasks.multipleChoice = [];
  if (!Array.isArray(tasks.trueFalse)) tasks.trueFalse = [];
  if (!Array.isArray(tasks.writeFacts)) tasks.writeFacts = [];
  if (!Array.isArray(tasks.reflectionQuestions)) tasks.reflectionQuestions = [];

  // ensure MCQ structure
  tasks.multipleChoice = tasks.multipleChoice.map((x: any) => ({
    q: String(x?.q ?? ""),
    options: [
      String(x?.options?.[0] ?? ""),
      String(x?.options?.[1] ?? ""),
      String(x?.options?.[2] ?? ""),
      String(x?.options?.[3] ?? ""),
    ] as [string, string, string, string],
    answerIndex: (Number(x?.answerIndex ?? 0) as 0 | 1 | 2 | 3) ?? 0,
  }));

  // ensure TF structure
  tasks.trueFalse = tasks.trueFalse.map((x: any) => ({
    statement: String(x?.statement ?? ""),
    answer: Boolean(x?.answer),
  }));

  // strings
  tasks.writeFacts = tasks.writeFacts.map((x: any) => String(x ?? ""));
  tasks.reflectionQuestions = tasks.reflectionQuestions.map((x: any) => String(x ?? ""));

  return tasks;
}

export default function ProducerTextDetailPage() {
  const params = useParams();
  const id =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pack, setPack] = useState<ContentPack | null>(null);
  const [showRawTasks, setShowRawTasks] = useState(false);
  const [rawTasksDraft, setRawTasksDraft] = useState<string>("");

  const tasks = useMemo(() => normalizeTasks(pack?.tasks), [pack?.tasks]);

  async function load() {
    if (!id) {
      setError("Missing document id in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ref = doc(db, "contentPacks", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError("Document not found.");
        setPack(null);
        return;
      }

      const data = snap.data() as ContentPack;
      const normalized = normalizeTasks(data.tasks);

      setPack({ ...data, tasks: normalized });
      setRawTasksDraft(JSON.stringify(normalized, null, 2));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!id || !pack) return;

    setSaving(true);
    setError(null);

    try {
      const ref = doc(db, "contentPacks", id);

      // always normalize before saving
      const normalized = normalizeTasks(pack.tasks);

      await updateDoc(ref, {
        title: pack.title || "",
        level: pack.level || "",
        language: pack.language || "",
        topic: pack.topic || "",
        text: pack.text || "",
        status: pack.status || "draft",
        tasks: normalized,
        updatedAt: serverTimestamp(),
      });

      // refresh raw view text
      setRawTasksDraft(JSON.stringify(normalized, null, 2));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function updateTasks(next: Tasks) {
    if (!pack) return;
    const normalized = normalizeTasks(next);
    setPack({ ...pack, tasks: normalized });
    setRawTasksDraft(JSON.stringify(normalized, null, 2));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main style={{ maxWidth: 980, paddingBottom: 60 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Link href="/producer/texts">← Back to list</Link>
        <span style={{ opacity: 0.7 }}>ID: {id || "(missing)"}</span>
      </div>

      <h1 style={{ marginBottom: 6 }}>Edit content pack</h1>

      {loading ? <p>Loading…</p> : null}

      {error ? (
        <div style={{ padding: 12, background: "#ffe6e6", borderRadius: 8, marginBottom: 12 }}>
          <b>Feil:</b> {error}
        </div>
      ) : null}

      {!loading && pack && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              Title
              <input
                value={pack.title ?? ""}
                onChange={(e) => setPack({ ...pack, title: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Status
              <select
                value={pack.status ?? "draft"}
                onChange={(e) => setPack({ ...pack, status: e.target.value })}
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
                value={pack.level ?? ""}
                onChange={(e) => setPack({ ...pack, level: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label>
              Language
              <input
                value={pack.language ?? ""}
                onChange={(e) => setPack({ ...pack, language: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Topic
              <input
                value={pack.topic ?? ""}
                onChange={(e) => setPack({ ...pack, topic: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Text
              <textarea
                value={pack.text ?? ""}
                onChange={(e) => setPack({ ...pack, text: e.target.value })}
                rows={10}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </label>
          </section>

          {/* TASKS UI */}
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

            {/* Multiple choice */}
            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Multiple choice</h3>

              <button
                type="button"
                onClick={() => {
                  const next = safeClone(tasks);
                  next.multipleChoice!.push({
                    q: "",
                    options: ["", "", "", ""],
                    answerIndex: 0,
                  });
                  updateTasks(next);
                }}
                style={{ padding: "8px 12px" }}
              >
                + Add MCQ
              </button>

              <div style={{ marginTop: 10 }}>
                {tasks.multipleChoice!.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>No multiple choice tasks.</p>
                ) : (
                  tasks.multipleChoice!.map((q, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        border: "1px solid #eee",
                        borderRadius: 10,
                        marginTop: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>Q{idx + 1}</div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = safeClone(tasks);
                            next.multipleChoice!.splice(idx, 1);
                            updateTasks(next);
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      <input
                        value={q.q}
                        onChange={(e) => {
                          const next = safeClone(tasks);
                          next.multipleChoice![idx].q = e.target.value;
                          updateTasks(next);
                        }}
                        placeholder="Question"
                        style={{ width: "100%", padding: 8, marginTop: 10 }}
                      />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                        {q.options.map((opt, oIdx) => (
                          <input
                            key={oIdx}
                            value={opt}
                            onChange={(e) => {
                              const next = safeClone(tasks);
                              next.multipleChoice![idx].options[oIdx] = e.target.value as any;
                              updateTasks(next);
                            }}
                            placeholder={`Option ${oIdx + 1}`}
                            style={{ width: "100%", padding: 8 }}
                          />
                        ))}
                      </div>

                      <label style={{ display: "block", marginTop: 10 }}>
                        Correct answer (1–4)
                        <select
                          value={String(q.answerIndex)}
                          onChange={(e) => {
                            const next = safeClone(tasks);
                            next.multipleChoice![idx].answerIndex = Number(e.target.value) as any;
                            updateTasks(next);
                          }}
                          style={{ padding: 8, marginLeft: 8 }}
                        >
                          <option value="0">1</option>
                          <option value="1">2</option>
                          <option value="2">3</option>
                          <option value="3">4</option>
                        </select>
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* True/False */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>True / False</h3>

              <button
                type="button"
                onClick={() => {
                  const next = safeClone(tasks);
                  next.trueFalse!.push({ statement: "", answer: true });
                  updateTasks(next);
                }}
                style={{ padding: "8px 12px" }}
              >
                + Add True/False
              </button>

              <div style={{ marginTop: 10 }}>
                {tasks.trueFalse!.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>No true/false tasks.</p>
                ) : (
                  tasks.trueFalse!.map((t, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                      <input
                        value={t.statement}
                        onChange={(e) => {
                          const next = safeClone(tasks);
                          next.trueFalse![idx].statement = e.target.value;
                          updateTasks(next);
                        }}
                        placeholder={`Statement ${idx + 1}`}
                        style={{ flex: 1, padding: 8 }}
                      />
                      <select
                        value={String(t.answer)}
                        onChange={(e) => {
                          const next = safeClone(tasks);
                          next.trueFalse![idx].answer = e.target.value === "true";
                          updateTasks(next);
                        }}
                        style={{ padding: 8 }}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const next = safeClone(tasks);
                          next.trueFalse!.splice(idx, 1);
                          updateTasks(next);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Write facts */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>Write facts</h3>

              <button
                type="button"
                onClick={() => {
                  const next = safeClone(tasks);
                  next.writeFacts!.push("");
                  updateTasks(next);
                }}
                style={{ padding: "8px 12px" }}
              >
                + Add fact prompt
              </button>

              <div style={{ marginTop: 10 }}>
                {tasks.writeFacts!.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>No facts tasks.</p>
                ) : (
                  tasks.writeFacts!.map((f, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <input
                        value={f}
                        onChange={(e) => {
                          const next = safeClone(tasks);
                          next.writeFacts![idx] = e.target.value;
                          updateTasks(next);
                        }}
                        placeholder={`Fact prompt ${idx + 1}`}
                        style={{ flex: 1, padding: 8 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = safeClone(tasks);
                          next.writeFacts!.splice(idx, 1);
                          updateTasks(next);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reflection questions */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>Reflection questions</h3>

              <button
                type="button"
                onClick={() => {
                  const next = safeClone(tasks);
                  next.reflectionQuestions!.push("");
                  updateTasks(next);
                }}
                style={{ padding: "8px 12px" }}
              >
                + Add reflection question
              </button>

              <div style={{ marginTop: 10 }}>
                {tasks.reflectionQuestions!.length === 0 ? (
                  <p style={{ opacity: 0.7 }}>No reflection questions.</p>
                ) : (
                  tasks.reflectionQuestions!.map((q, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <input
                        value={q}
                        onChange={(e) => {
                          const next = safeClone(tasks);
                          next.reflectionQuestions![idx] = e.target.value;
                          updateTasks(next);
                        }}
                        placeholder={`Reflection question ${idx + 1}`}
                        style={{ flex: 1, padding: 8 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = safeClone(tasks);
                          next.reflectionQuestions!.splice(idx, 1);
                          updateTasks(next);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Raw JSON toggle */}
            {showRawTasks && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 8 }}>Tasks (raw JSON)</h3>
                <textarea
                  value={rawTasksDraft}
                  onChange={(e) => setRawTasksDraft(e.target.value)}
                  rows={14}
                  style={{ width: "100%", padding: 8, fontFamily: "monospace" }}
                />
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
                  Lim inn gyldig JSON for tasks. Trykk “Apply raw JSON” for å oppdatere feltene.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(rawTasksDraft);
                      updateTasks(parsed);
                      setError(null);
                    } catch (e: any) {
                      setError("Invalid JSON in raw tasks. Fix it before applying.");
                    }
                  }}
                  style={{ padding: "8px 12px", marginTop: 8 }}
                >
                  Apply raw JSON
                </button>
              </div>
            )}
          </section>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button onClick={load} disabled={loading || saving} style={{ padding: "10px 14px" }}>
              Reload
            </button>
          </div>
        </>
      )}
    </main>
  );
}
