"use client";
import { ensureAnonymousUser } from "@/lib/anonAuth";


import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Lesson = {
  title: string;
  level?: string;
  sourceText: string;
  releaseMode?: "ALL_AT_ONCE" | "TEXT_FIRST";
  status?: "draft" | "published";
};

type Task = {
  id: string;
  order?: number;
  type: "truefalse" | "mcq" | "open";
  prompt: string;
  options?: string[];
  correctAnswer?: any;
};

async function translateText(text: string, targetLang: string) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  const raw = await res.text().catch(() => "");
  if (!res.ok) throw new Error(raw || `Translate failed (${res.status})`);

  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Translate returned non-JSON response");
  }

  const translated =
    data.translatedText ??
    data.translation ??
    data.translated ??
    data.text ??
    data.result ??
    data.output;

  if (!translated || typeof translated !== "string") {
    throw new Error("Translate response missing translated text");
  }

  return translated;
}

function OpenTask({
  taskId,
  prompt,
  level,
  lesetekst,
  onSave,
}: {
  taskId: string;
  prompt: string;
  level: string;
  lesetekst: string;
  onSave: (answer: string, feedback: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function getFeedback() {
    try {
      setLoading(true);
      setErr(null);
      setFeedback(null);

      const payload = {
        lesetekst,
        oppgave: prompt,
        svar: text,
        nivå: level,
        taskId,
      };

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text().catch(() => "");
      if (!res.ok) throw new Error(raw || `Feedback failed (${res.status})`);

      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // if endpoint returns plain text
        setFeedback(raw);
        await onSave(text, raw);
        return;
      }

      const fb = String(data.feedback ?? data.text ?? data.result ?? data.output ?? "");
      setFeedback(fb);
      await onSave(text, fb);
    } catch (e: any) {
      setErr(e?.message ?? "Feedback failed");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your answer here..."
        rows={6}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
      />

      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={getFeedback} disabled={!text.trim() || loading}>
          {loading ? "Checking..." : "Get feedback"}
        </button>
        <span style={{ opacity: 0.7, fontSize: 12 }}>
          lesetekst length: {lesetekst?.length ?? 0}
        </span>
        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      {feedback && (
        <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Feedback</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{feedback}</div>
        </div>
      )}
    </div>
  );
}

export default function LessonPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tasksUnlocked, setTasksUnlocked] = useState(false);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Record<string, "correct" | "wrong" | null>>({});

  const [targetLang, setTargetLang] = useState("no");
  const [translatedLesson, setTranslatedLesson] = useState<string | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<Record<string, string>>({});
  const [uid, setUid] = useState<string | null>(null);
useEffect(() => {
  (async () => {
    try {
      const user = await ensureAnonymousUser();
      setUid(user.uid);
    } catch (e) {
      console.error("Anonymous auth failed:", e);
    }
  })();
}, []);


async function saveSubmission(data: {
  taskId: string;
  taskType: "truefalse" | "mcq" | "open";
  answer: any;
  isCorrect?: boolean;
  feedback?: string;
}) {
  if (!lessonId) return;

  // Anbefalt: ikke lagre før vi har uid
  if (!uid) {
    console.warn("No uid yet — skipping saveSubmission");
    return;
  }

  await addDoc(collection(db, "submissions"), {
    lessonId,
    taskId: data.taskId,
    taskType: data.taskType,
    answer: data.answer,
    isCorrect: data.isCorrect ?? null,
    feedback: data.feedback ?? null,
    level: lesson?.level ?? null,
    targetLang: targetLang ?? null,
    userId: uid,                 // ✅ HER
    createdAt: serverTimestamp(),
  });
}


  useEffect(() => {
    if (!lessonId) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        setTranslatedLesson(null);
        setTranslatedTasks({});
        setAnswers({});
        setResults({});
        setTasksUnlocked(false);

        const lessonRef = doc(db, "lessons", lessonId);
        const lessonSnap = await getDoc(lessonRef);

        if (!lessonSnap.exists()) {
          setErr("Lesson not found in Firestore.");
          setLesson(null);
          setTasks([]);
          return;
        }

        const lessonData = lessonSnap.data() as Lesson;
        if (lessonData.status && lessonData.status !== "published") {
          setErr("This lesson is not published.");
          setLesson(lessonData);
          setTasks([]);
          return;
        }

        setLesson(lessonData);

        const tasksRef = collection(db, "lessons", lessonId, "tasks");
        const q = query(tasksRef, orderBy("order", "asc"));
        const snap = await getDocs(q);

        const taskData: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setTasks(taskData);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load lesson/tasks");
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  async function onTranslateLesson() {
    try {
      if (!lesson?.sourceText) return;
      const t = await translateText(lesson.sourceText, targetLang);
      setTranslatedLesson(t);
    } catch (e: any) {
      setErr(e?.message ?? "Translate failed");
    }
  }

  async function onTranslateTasks() {
    try {
      if (!tasks.length) return;
      const updates: Record<string, string> = {};
      for (const t of tasks) {
        updates[t.id] = await translateText(t.prompt, targetLang);
      }
      setTranslatedTasks((prev) => ({ ...prev, ...updates }));
    } catch (e: any) {
      setErr(e?.message ?? "Translate failed");
    }
  }

  if (!lessonId) return <main style={{ padding: 24 }}>Missing lessonId…</main>;
  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;

  const releaseMode = lesson?.releaseMode ?? "ALL_AT_ONCE";
  const showTasks = releaseMode === "ALL_AT_ONCE" ? true : tasksUnlocked;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>{lesson?.title ?? "Lesson"}</h1>
      <div style={{ opacity: 0.75, marginTop: 4 }}>
        Level: {lesson?.level ?? "-"} • Mode: {releaseMode} • ID: {lessonId}
      </div>
      <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
  User: <code>{uid ?? "loading..."}</code>
</div>


      {err && <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>}

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
          <option value="no">Norwegian</option>
          <option value="uk">Ukrainian</option>
          <option value="ar">Arabic</option>
          <option value="en">English</option>
          <option value="pt-br">Portuguese (BR)</option>
        </select>
        <button onClick={onTranslateLesson} disabled={!lesson?.sourceText}>Translate text</button>
        <button onClick={onTranslateTasks} disabled={!tasks.length}>Translate tasks</button>
      </div>

      <section style={{ marginTop: 18, border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
        <h2>Text</h2>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{lesson?.sourceText}</p>

        {translatedLesson && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #ddd" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Translation</div>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{translatedLesson}</p>
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
        <h2>Tasks</h2>
        <div style={{ opacity: 0.7, fontSize: 12 }}>Tasks loaded: {tasks.length}</div>

        {releaseMode === "TEXT_FIRST" && !tasksUnlocked && (
          <button onClick={() => setTasksUnlocked(true)} style={{ marginTop: 10 }}>
            Start tasks
          </button>
        )}

        {!showTasks && (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Tasks are locked. Click <b>Start tasks</b> when you are ready.
          </div>
        )}

        {showTasks && (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {tasks.map((t) => (
              <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 800 }}>
                  {t.order ?? "-"} • {t.type.toUpperCase()}
                </div>

                <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{t.prompt}</div>

                {translatedTasks[t.id] && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
                    <div style={{ fontWeight: 800, fontSize: 13, opacity: 0.9 }}>Translation</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{translatedTasks[t.id]}</div>
                  </div>
                )}

                {t.type === "truefalse" && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setAnswers((p) => ({ ...p, [t.id]: true }))}>True</button>
                    <button onClick={() => setAnswers((p) => ({ ...p, [t.id]: false }))}>False</button>

                    <button
                      disabled={answers[t.id] === undefined}
                      onClick={async () => {
                        const ok = answers[t.id] === t.correctAnswer;
                        setResults((p) => ({ ...p, [t.id]: ok ? "correct" : "wrong" }));
                        await saveSubmission({
                          taskId: t.id,
                          taskType: "truefalse",
                          answer: answers[t.id],
                          isCorrect: ok,
                        });
                      }}
                    >
                      Check answer
                    </button>

                    {results[t.id] === "correct" && <span>✅ Correct</span>}
                    {results[t.id] === "wrong" && (
                      <span>❌ Wrong (correct: {String(t.correctAnswer)})</span>
                    )}
                  </div>
                )}

                {t.type === "mcq" && t.options && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={answers[t.id] ?? ""}
                      onChange={(e) => setAnswers((p) => ({ ...p, [t.id]: e.target.value }))}
                    >
                      <option value="" disabled>Select an answer</option>
                      {t.options.map((o, idx) => (
                        <option key={idx} value={o}>{o}</option>
                      ))}
                    </select>

                    <button
                      disabled={!answers[t.id]}
                      onClick={async () => {
                        const ok = answers[t.id] === t.correctAnswer;
                        setResults((p) => ({ ...p, [t.id]: ok ? "correct" : "wrong" }));
                        await saveSubmission({
                          taskId: t.id,
                          taskType: "mcq",
                          answer: answers[t.id],
                          isCorrect: ok,
                        });
                      }}
                    >
                      Check answer
                    </button>

                    {results[t.id] === "correct" && <span>✅ Correct</span>}
                    {results[t.id] === "wrong" && (
                      <span>❌ Wrong (correct: {String(t.correctAnswer)})</span>
                    )}
                  </div>
                )}

                {t.type === "open" && (
                  <OpenTask
                    taskId={t.id}
                    prompt={t.prompt}
                    level={lesson?.level ?? "A2"}
                    lesetekst={lesson?.sourceText ?? ""}
                    onSave={async (answer, feedback) => {
                      await saveSubmission({
                        taskId: t.id,
                        taskType: "open",
                        answer,
                        feedback,
                      });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
