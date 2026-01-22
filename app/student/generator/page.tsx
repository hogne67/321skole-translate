// app/student/generator/page.tsx
"use client";

import { useMemo, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";

type GenTask = {
  id: string;
  type: "truefalse" | "mcq" | "open";
  order: number;
  prompt: string;
  options?: string[];
  correctAnswer?: any;
};

type GeneratedLesson = {
  title: string;
  level: string;
  topic: string;
  sourceText: string;
  tasks: GenTask[];
};

async function generateLesson(args: { topic: string; level: string; length: string }) {
  const res = await fetch("/api/generate-lesson", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Generate API error (${res.status}): ${t}`);
  }

  return (await res.json()) as GeneratedLesson;
}

export default function StudentGeneratorPage() {
  const router = useRouter();

  const [topic, setTopic] = useState("Daily life");
  const [level, setLevel] = useState("A2");
  const [length, setLength] = useState<"short" | "normal" | "long">("normal");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [draft, setDraft] = useState<GeneratedLesson | null>(null);
  const [saving, setSaving] = useState(false);

  const canGenerate = useMemo(() => topic.trim().length > 0, [topic]);

  const navLinkStyle: React.CSSProperties = {
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 600,
    color: "inherit",
  };

  async function onGenerate() {
    setErr(null);
    setBusy(true);
    setDraft(null);

    try {
      const out = await generateLesson({ topic, level, length });
      setDraft(out);
    } catch (e: any) {
      setErr(e?.message ?? "Could not generate");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAndOpen() {
    if (!draft) return;

    setErr(null);
    setSaving(true);

    try {
      const user = await ensureAnonymousUser();

      // Save as a private draft lesson for this student
      const docRef = await addDoc(collection(db, "lessons"), {
        ownerId: user.uid,
        status: "draft",
        title: draft.title,
        level: draft.level,
        topic: draft.topic,
        sourceText: draft.sourceText,
        tasks: draft.tasks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        generator: "student-guided-v1",
      });

      router.push(`/student/lesson/${docRef.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "10px auto", padding: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>My generator</h1>

      {/* ✅ Student navigation (samme som Dashboard/Browse) */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <Link href="/student" style={navLinkStyle}>
          Dashboard
        </Link>
        <Link href="/student/browse" style={navLinkStyle}>
          Library
        </Link>
        <Link href="/student/generator" style={navLinkStyle}>
          Textgenerator
        </Link>
        <Link href="/student/translate" style={navLinkStyle}>
          Translator
        </Link>
        <Link href="/student/vocab" style={navLinkStyle}>
          Glossary
        </Link>
      </div>

      <hr style={{ margin: "10px 0 14px" }} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>Topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px", width: 260 }}
            placeholder="e.g., Winter, Food, Work…"
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>CEFR</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.75, fontSize: 13 }}>Length</span>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as any)}
            style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="short">Short</option>
            <option value="normal">Normal</option>
            <option value="long">Long</option>
          </select>
        </label>

        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || !canGenerate}
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            background: "white",
            cursor: "pointer",
            opacity: busy || !canGenerate ? 0.6 : 1,
          }}
        >
          {busy ? "Generating…" : "Generate"}
        </button>

        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      {draft && (
        <>
          <div style={{ height: 12 }} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={onSaveAndOpen}
              disabled={saving}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "8px 12px",
                background: "black",
                color: "white",
                cursor: "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save & Open"}
            </button>

            <span style={{ opacity: 0.75, fontSize: 13 }}>Saves as a private draft (not published).</span>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800 }}>{draft.title}</div>
            <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
              Level: {draft.level} • Topic: {draft.topic}
            </div>

            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 600, marginBottom: 6 }}>Text</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{draft.sourceText}</div>

            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 600, marginBottom: 6 }}>Tasks</div>
            <div style={{ display: "grid", gap: 10 }}>
              {draft.tasks
                .slice()
                .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
                .map((t) => (
                  <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>
                      Task {t.order} <span style={{ opacity: 0.6, fontWeight: 600 }}>({t.type})</span>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{t.prompt}</div>

                    {t.type === "mcq" && Array.isArray(t.options) && (
                      <ul style={{ marginTop: 8, marginBottom: 0 }}>
                        {t.options.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

