"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  lessonId?: string;
  taskId?: string;
  taskType?: string;
  answer?: any;
  isCorrect?: boolean | null;
  feedback?: string | null;
  level?: string | null;
  targetLang?: string | null;
  createdAt?: string | null;
};

export default function AdminSubmissionsPage() {
  const [token, setToken] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [taskType, setTaskType] = useState("");
const [onlyIncorrect, setOnlyIncorrect] = useState(false);
const [qText, setQText] = useState("");
const [limit, setLimit] = useState("50");


  async function load() {
    try {
      setLoading(true);
      setErr(null);

     const qs = new URLSearchParams();
if (lessonId.trim()) qs.set("lessonId", lessonId.trim());
if (taskType) qs.set("taskType", taskType);
if (onlyIncorrect) qs.set("onlyIncorrect", "1");
qs.set("limit", limit);


      const res = await fetch(`/api/admin/submissions?${qs.toString()}`, {
        headers: { "x-admin-token": token },
      });

      const raw = await res.text().catch(() => "");
      if (!res.ok) throw new Error(raw || `HTTP ${res.status}`);

      const data = raw ? JSON.parse(raw) : {};
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // ikke auto-load uten token
  }, []);
const filtered = rows.filter((r) => {
  if (!qText.trim()) return true;
  const hay =
    (typeof r.answer === "string" ? r.answer : JSON.stringify(r.answer ?? ""))
      .toLowerCase() +
    " " +
    String(r.feedback ?? "").toLowerCase();
  return hay.includes(qText.toLowerCase());
});

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Admin: Submissions</h1>

 <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
  <input
    value={token}
    onChange={(e) => setToken(e.target.value)}
    placeholder="Admin token"
    style={{ padding: 8, width: 220 }}
  />

  <input
    value={lessonId}
    onChange={(e) => setLessonId(e.target.value)}
    placeholder="Filter by lessonId (optional)"
    style={{ padding: 8, width: 320 }}
  />

  <select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={{ padding: 8 }}>
    <option value="">All types</option>
    <option value="truefalse">truefalse</option>
    <option value="mcq">mcq</option>
    <option value="open">open</option>
  </select>

  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, opacity: 0.9 }}>
    <input
      type="checkbox"
      checked={onlyIncorrect}
      onChange={(e) => setOnlyIncorrect(e.target.checked)}
    />
    Only incorrect
  </label>

  <select value={limit} onChange={(e) => setLimit(e.target.value)} style={{ padding: 8 }}>
    <option value="50">Limit 50</option>
    <option value="100">Limit 100</option>
    <option value="200">Limit 200</option>
  </select>

  <input
    value={qText}
    onChange={(e) => setQText(e.target.value)}
    placeholder="Search in answer/feedback"
    style={{ padding: 8, width: 260 }}
  />

  <button onClick={load} disabled={!token || loading}>
    {loading ? "Loading..." : "Load"}
  </button>
</div>


      {err && <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>}

      <div style={{ marginTop: 16, opacity: 0.7, fontSize: 12 }}>
       Rows: {filtered.length} (loaded {rows.length})

      </div>

      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f7f7f7" }}>
              <th style={th}>Time</th>
              <th style={th}>Lesson</th>
              <th style={th}>Task</th>
              <th style={th}>Type</th>
              <th style={th}>Answer</th>
              <th style={th}>Correct</th>
              <th style={th}>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.createdAt ?? "-"}</td>
                <td style={td}><code>{r.lessonId ?? "-"}</code></td>
                <td style={td}><code>{r.taskId ?? "-"}</code></td>
                <td style={td}>{r.taskType ?? "-"}</td>
                <td style={td}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {typeof r.answer === "string" ? r.answer : JSON.stringify(r.answer, null, 2)}
                  </pre>
                </td>
                <td style={td}>{r.isCorrect === null || r.isCorrect === undefined ? "-" : r.isCorrect ? "✅" : "❌"}</td>
                <td style={td}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.feedback ?? "-"}</pre>
                </td>
              </tr>
            ))}

            {!rows.length && !loading && (
              <tr>
                <td style={td} colSpan={7}>
                  No rows loaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Tip: Use the lessonId from the learner page header to filter.
      </p>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #ddd",
  fontSize: 13,
};

const td: React.CSSProperties = {
  verticalAlign: "top",
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 13,
};
