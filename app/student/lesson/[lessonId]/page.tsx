// app/student/lesson/[lessonId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  setDoc,
} from "firebase/firestore";

type Lesson = {
  title: string;
  level?: string;
  topic?: string;
  sourceText?: string;
  tasks?: any; // expected array or JSON string
  status?: "draft" | "published";
  language?: string;
};

type AnswersMap = Record<string, any>;

type TranslatedTask = {
  stableId: string;
  translatedPrompt?: string;
  translatedOptions?: string[];
};

async function translateOne(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  const raw = await res.text();

  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Translate API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  if (data?.error) throw new Error(`Translate API error (HTTP ${res.status}): ${data.error}`);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);

  const out = (data?.translatedText ?? data?.translation ?? data?.text ?? "").toString().trim();
  if (!out) {
    throw new Error(
      `Translate returned empty (HTTP ${res.status}). Keys: ${Object.keys(data).join(", ") || "(no keys)"}`
    );
  }
  return out;
}

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

function getStableTaskId(t: any, idx: number): string {
  if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

  const orderPart = t?.order != null ? String(t.order) : "x";
  const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
  if (promptPart) return `${orderPart}__${promptPart}`;

  return `${orderPart}__idx${idx}`;
}

export default function StudentLessonPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetLang, setTargetLang] = useState("no");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<TranslatedTask[] | null>(null);

  const [translating, setTranslating] = useState<null | "text" | "tasks">(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);

  // UI toggles
  const [showTextTranslation, setShowTextTranslation] = useState(true);
  const [showTaskTranslations, setShowTaskTranslations] = useState(true);
  const [taskTranslationOpen, setTaskTranslationOpen] = useState<Record<string, boolean>>({});

  const hasAnswers = useMemo(() => Object.keys(answers).length > 0, [answers]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      if (!lessonId) {
        setError("Mangler lessonId i URL.");
        setLoading(false);
        return;
      }

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;
        setUid(user.uid);

        // Lesson is read from published_lessons (matches your rules)
        const lessonSnap = await getDoc(doc(db, "published_lessons", lessonId));
        if (!alive) return;

        if (!lessonSnap.exists()) {
          setLesson(null);
          setError("Denne oppgaven er ikke publisert (eller finnes ikke).");
          return;
        }

        const lessonData = lessonSnap.data() as Lesson;
        setLesson(lessonData);

        // ✅ Deterministic submission id to avoid query/index/rules issues
        const stableSubId = `${user.uid}_${lessonId}`;
        const subRef = doc(db, "submissions", stableSubId);
        const subDoc = await getDoc(subRef);
        if (!alive) return;

        if (subDoc.exists()) {
          const data = subDoc.data() as any;

          setSubmissionId(subDoc.id);

          if (data?.answers && typeof data.answers === "object") setAnswers(data.answers);
          if (typeof data?.feedback === "string") setFeedback(data.feedback);
        } else {
          setSubmissionId(null);
          setAnswers({});
          setFeedback(null);
        }

        // reset translations per lesson load
        setTranslatedText(null);
        setTranslatedTasks(null);
        setTranslateErr(null);

        // reset per-task toggles
        setTaskTranslationOpen({});
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Noe gikk galt");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [lessonId]);

  useEffect(() => {
    setTranslateErr(null);
  }, [targetLang]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  function setAnswer(taskId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  function toggleTaskTranslation(stableId: string) {
    setTaskTranslationOpen((prev) => {
      const current = prev[stableId];
      return { ...prev, [stableId]: current === undefined ? false : !current };
    });
  }

  function isTaskTranslationVisible(stableId: string) {
    const v = taskTranslationOpen[stableId];
    if (v === undefined) return showTaskTranslations;
    return v;
  }

  async function saveDraft() {
    if (!lessonId || !uid) return;

    setSaving(true);
    setMsg(null);

    try {
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "submissions", stableId);

      await setDoc(
        ref,
        {
          uid,
          publishedLessonId: lessonId,
          answers,
          status: "draft",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSubmissionId(stableId);
      flash("Saved ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function buildOppgaveString(lesson: Lesson) {
    const parts = [
      "You are a language teacher. Give short, helpful feedback adapted to the learner's CEFR level.",
      "Use simple language.",
      "Provide: (1) overall feedback, (2) 3 concrete improvements, (3) a corrected version.",
      "Keep it concise.",
    ];
    if (lesson.level) parts.push(`CEFR: ${lesson.level}.`);
    return parts.join(" ");
  }

  function buildSvarString(lesson: Lesson, answers: AnswersMap) {
    const tasksArr = safeTasksArray(lesson.tasks);
    const sorted = [...tasksArr].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
    const lines: string[] = [];

    if (sorted.length > 0) {
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const stableId = getStableTaskId(t, i);

        const order = t?.order ?? "";
        const prompt = t?.prompt ?? "";
        const type = t?.type ?? "";
        const ans = answers[stableId];

        if (ans === undefined || ans === null || ans === "") continue;

        lines.push(`Task ${order} (${type}): ${prompt}`);
        lines.push(`Answer: ${typeof ans === "string" ? ans : JSON.stringify(ans)}`);
        lines.push("");
      }
    } else {
      for (const [k, v] of Object.entries(answers)) {
        lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
    }

    return lines.join("\n").trim();
  }

  async function submitForFeedback() {
    if (!lessonId || !uid || !lesson) return;
    if (!hasAnswers) {
      flash("Answer at least one task first");
      return;
    }

    setSubmitting(true);
    setMsg(null);

    try {
      const stableId = `${uid}_${lessonId}`;
      const ref = doc(db, "submissions", stableId);

      await setDoc(
        ref,
        {
          uid,
          publishedLessonId: lessonId,
          answers,
          status: "submitted",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSubmissionId(stableId);

      const lesetekst = (lesson.sourceText ?? "").trim();
      const oppgave = buildOppgaveString(lesson);
      const svar = buildSvarString(lesson, answers);

      if (!svar) throw new Error("Svar-teksten ble tom. Sjekk at task.id matcher key i answers.");

      const nivå = (lesson.level ?? "A2").toString();
      const payload = { lesetekst, oppgave, svar, nivå };

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Feedback API error (${res.status}): ${t}`);
      }

      const data = await res.json();
      const fb = typeof data?.feedback === "string" ? data.feedback : JSON.stringify(data);

      setFeedback(fb);

      await updateDoc(ref, {
        feedback: fb,
        feedbackUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      flash("Submitted ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTranslateText() {
    if (!lesson?.sourceText) return;
    setTranslateErr(null);
    setTranslating("text");

    try {
      const out = await translateOne(lesson.sourceText, targetLang);
      setTranslatedText(out);
      setShowTextTranslation(true);
    } catch (e: any) {
      setTranslateErr(e?.message ?? "Translate failed");
      setTranslatedText(null);
    } finally {
      setTranslating(null);
    }
  }

  async function onTranslateTasks() {
    if (!lesson) return;
    const tasksArr = safeTasksArray(lesson.tasks);
    if (tasksArr.length === 0) return;

    setTranslateErr(null);
    setTranslating("tasks");

    try {
      const sorted = tasksArr
        .slice()
        .sort((a: any, b: any) => (a?.order ?? 999) - (b?.order ?? 999));

      const out: TranslatedTask[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const stableId = getStableTaskId(t, i);

        const promptOrig = typeof t?.prompt === "string" ? t.prompt : "";
        const optionsOrig = Array.isArray(t?.options) ? t.options : [];

        let translatedPrompt = "";
        if (promptOrig) {
          try {
            translatedPrompt = await translateOne(promptOrig, targetLang);
          } catch (e: any) {
            setTranslateErr((prev) => prev ?? e?.message ?? "Translate failed");
          }
        }

        let translatedOptions: string[] = [];
        if (optionsOrig.length > 0) {
          translatedOptions = await Promise.all(
            optionsOrig.map(async (o: any) => {
              try {
                return await translateOne(String(o), targetLang);
              } catch (e: any) {
                setTranslateErr((prev) => prev ?? e?.message ?? "Translate failed");
                return "";
              }
            })
          );
        }

        out.push({
          stableId,
          translatedPrompt: translatedPrompt || undefined,
          translatedOptions: translatedOptions.length > 0 ? translatedOptions : undefined,
        });
      }

      setTranslatedTasks(out);
      setShowTaskTranslations(true);
      setTaskTranslationOpen({});
    } catch (e: any) {
      setTranslateErr(e?.message ?? "Translate failed");
    } finally {
      setTranslating(null);
    }
  }

  const tMap = useMemo(() => {
    const m = new Map<string, TranslatedTask>();
    (translatedTasks ?? []).forEach((t) => m.set(t.stableId, t));
    return m;
  }, [translatedTasks]);

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "crimson" }}>{error}</p>
        <Link href="/student">← Back to dashboard</Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ padding: 16 }}>
        <p>Ingen data.</p>
        <Link href="/student">← Back to dashboard</Link>
      </div>
    );
  }

  const tasksOriginal = safeTasksArray(lesson.tasks)
    .slice()
    .sort((a: any, b: any) => (a?.order ?? 999) - (b?.order ?? 999));

  const hasTaskTranslations = (translatedTasks ?? []).length > 0;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>{lesson.title}</h1>
          <div style={{ opacity: 0.75 }}>
            {lesson.level ? <span>{lesson.level}</span> : null}
            {lesson.language ? <span> • {lesson.language.toUpperCase()}</span> : null}
            {lesson.topic ? <span> • {lesson.topic}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/student" style={{ textDecoration: "none" }}>
            Dashboard
          </Link>
          <Link href="/student/browse" style={{ textDecoration: "none" }}>
            Browse
          </Link>
        </div>
      </header>

      {msg ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12 }}>
          {msg}
        </div>
      ) : null}

      {/* ACTIONS + TRANSLATE */}
      <section style={{ marginTop: 14, padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}>
        {/* actions row (right aligned) */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button onClick={saveDraft} disabled={saving || !uid} style={{ ...btnStyle, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save draft"}
          </button>

          <button
            onClick={submitForFeedback}
            disabled={submitting || !uid}
            style={{ ...btnStyle, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Submitting…" : "Submit for feedback"}
          </button>

          <button
            onClick={() => {
              setAnswers({});
              flash("Cleared answers");
            }}
            style={btnStyle}
          >
            Clear answers
          </button>
        </div>

        {/* translate row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.75 }}>Translate to</span>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
            >
              <option value="no">Norsk</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
              <option value="es">Español</option>
              <option value="uk">Українська</option>
              <option value="ar">العربية</option>
            </select>
          </label>

          <button
            onClick={onTranslateText}
            disabled={translating === "text" || !lesson.sourceText}
            style={{ ...btnStyle, opacity: translating === "text" ? 0.6 : 1 }}
          >
            {translating === "text" ? "Translating…" : "Translate text"}
          </button>

          <button
            onClick={onTranslateTasks}
            disabled={translating === "tasks" || tasksOriginal.length === 0}
            style={{ ...btnStyle, opacity: translating === "tasks" ? 0.6 : 1 }}
          >
            {translating === "tasks" ? "Translating…" : "Translate tasks"}
          </button>

          <button
            onClick={() => {
              setTranslatedText(null);
              setTranslatedTasks(null);
              setTranslateErr(null);
              setTaskTranslationOpen({});
            }}
            style={btnStyle}
          >
            Reset translation
          </button>
        </div>

        {translateErr ? <p style={{ marginTop: 10, color: "crimson" }}>{translateErr}</p> : null}
      </section>

      {/* TEXT */}
      <section style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ marginBottom: 8 }}>Text</h2>

          {translatedText ? (
            <button type="button" style={btnStyle} onClick={() => setShowTextTranslation((v) => !v)}>
              {showTextTranslation ? "Hide translation" : "Show translation"}
            </button>
          ) : null}
        </div>

        <div
          style={{
            padding: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
          }}
        >
          {lesson.sourceText ?? <span style={{ opacity: 0.6 }}>No text</span>}
        </div>

        {translatedText && showTextTranslation ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Translated</div>
            {translatedText}
          </div>
        ) : null}
      </section>

      {/* TASKS */}
      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Tasks</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ opacity: 0.75 }}>Submission: {submissionId ?? "—"}</div>

            {hasTaskTranslations ? (
              <button type="button" style={btnStyle} onClick={() => setShowTaskTranslations((v) => !v)}>
                {showTaskTranslations ? "Hide all translations" : "Show all translations"}
              </button>
            ) : null}
          </div>
        </div>

        {tasksOriginal.length === 0 ? (
          <p style={{ opacity: 0.7, marginTop: 8 }}>No tasks in this lesson.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            {tasksOriginal.map((t: any, idx: number) => {
              const stableId = getStableTaskId(t, idx);
              const tr = tMap.get(stableId);

              const type = String(t?.type ?? "open");
              const prompt = String(t?.prompt ?? "");
              const options = Array.isArray(t?.options) ? t.options : [];
              const val = answers[stableId];

              const hasThisTranslation = !!tr?.translatedPrompt || (tr?.translatedOptions?.length ?? 0) > 0;
              const showThisTranslation = hasThisTranslation ? isTaskTranslationVisible(stableId) : false;

              return (
                <div
                  key={stableId}
                  style={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 8,
                      opacity: 0.85,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9 }}>
                      <span>Task {t?.order ?? idx + 1}</span>
                      <span>• {type}</span>
                    </div>

                    {hasThisTranslation ? (
                      <button type="button" style={btnStyle} onClick={() => toggleTaskTranslation(stableId)}>
                        {showThisTranslation ? "Hide translation" : "Show translation"}
                      </button>
                    ) : null}
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: 10 }}>{prompt}</div>

                  {showThisTranslation && tr?.translatedPrompt ? (
                    <div
                      style={{
                        marginTop: -4,
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.10)",
                        background: "rgba(0,0,0,0.02)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Translated</div>
                      {tr.translatedPrompt}
                    </div>
                  ) : null}

                  {type === "mcq" && options.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {options.map((o: any, i: number) => {
                        const opt = String(o);
                        const checked = val === opt;
                        const optT = tr?.translatedOptions?.[i] || "";

                        return (
                          <label
                            key={i}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                              padding: "8px 10px",
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: 10,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name={stableId}
                              checked={checked}
                              onChange={() => setAnswer(stableId, opt)}
                              style={{ marginTop: 3 }}
                            />
                            <div>
                              <div>{opt}</div>
                              {showThisTranslation && optT ? (
                                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{optT}</div>
                              ) : null}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {type === "truefalse" ? (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        style={{ ...btnStyle, opacity: val === true ? 1 : 0.75 }}
                        onClick={() => setAnswer(stableId, true)}
                      >
                        True
                      </button>
                      <button
                        type="button"
                        style={{ ...btnStyle, opacity: val === false ? 1 : 0.75 }}
                        onClick={() => setAnswer(stableId, false)}
                      >
                        False
                      </button>
                    </div>
                  ) : null}

                  {type === "open" || (!["mcq", "truefalse"].includes(type)) ? (
                    <textarea
                      value={typeof val === "string" ? val : val ?? ""}
                      onChange={(e) => setAnswer(stableId, e.target.value)}
                      placeholder="Write your answer…"
                      rows={4}
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.2)",
                        resize: "vertical",
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Feedback</h2>
        <div
          style={{
            padding: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            minHeight: 80,
          }}
        >
          {feedback ? feedback : <span style={{ opacity: 0.6 }}>No feedback yet. Submit when ready.</span>}
        </div>
      </section>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "8px 12px",
  background: "white",
  cursor: "pointer",
};
