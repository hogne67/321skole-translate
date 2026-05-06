"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AuthGate from "@/components/AuthGate";

type AnalyticsEvent = {
    id: string;
    uid?: string; // 👈 legg til denne
    event?: string;
    path?: string;
    source?: string;
    type?: string;
    method?: string;
    level?: string;
    language?: string;
    createdAt?: {
        seconds?: number;
    };
};

export default function AdminAnalyticsPage() {
    const [events, setEvents] = useState<AnalyticsEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<"24h" | "7d" | "all">("7d");

    useEffect(() => {
        async function loadEvents() {
            try {
                const q = query(
                    collection(db, "analyticsEvents"),
                    orderBy("createdAt", "desc"),
                    limit(300)
                );

                const snap = await getDocs(q);

                setEvents(
                    snap.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() as Omit<AnalyticsEvent, "id">),
                    }))
                );
            } finally {
                setLoading(false);
            }
        }

        loadEvents();
    }, []);

    const filteredEvents = useMemo(() => {
        if (range === "all") return events;

        const now = Date.now();
        const cutoff =
            range === "24h"
                ? now - 24 * 60 * 60 * 1000
                : now - 7 * 24 * 60 * 60 * 1000;

        return events.filter((e) => {
            if (!e.createdAt?.seconds) return false;
            return e.createdAt.seconds * 1000 >= cutoff;
        });
    }, [events, range]);

    const counts = useMemo(() => {
        return filteredEvents.reduce<Record<string, number>>((acc, e) => {
            const key = e.event || "unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }, [filteredEvents]);

    const funnel = useMemo(() => {
        const get = (name: string) => counts[name] || 0;

        return [
            { name: "Besøk", value: get("page_view") },
            { name: "Login", value: get("login") },
            { name: "Generate", value: get("ai_generate_text") },
            { name: "Create", value: get("lesson_created") },
            { name: "Feedback", value: get("teacher_ai_feedback") },
        ];
    }, [counts]);

    const userStats = useMemo(() => {
        const map: Record<
            string,
            {
                uid: string;
                score: number;
                events: number;
                creates: number;
                feedbacks: number;
            }
        > = {};

        for (const e of filteredEvents) {
            const uid = e.uid;
            if (!uid) continue;

            if (!map[uid]) {
                map[uid] = {
                    uid,
                    score: 0,
                    events: 0,
                    creates: 0,
                    feedbacks: 0,
                };
            }

            map[uid].events += 1;

            if (e.event === "lesson_created") {
                map[uid].creates += 1;
                map[uid].score += 5;
            }

            if (e.event === "teacher_ai_feedback") {
                map[uid].feedbacks += 1;
                map[uid].score += 3;
            }

            if (e.event === "ai_generate_text") {
                map[uid].score += 1;
            }
        }

        return Object.values(map)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    }, [filteredEvents]);

    return (
        <AuthGate requireRole="admin">
            <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
                <h1>Analytics</h1>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {[
                        { key: "24h", label: "Siste 24 timer" },
                        { key: "7d", label: "Siste 7 dager" },
                        { key: "all", label: "Alt" },
                    ].map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setRange(item.key as "24h" | "7d" | "all")}
                            style={{
                                padding: "8px 12px",
                                borderRadius: 999,
                                border: "1px solid #cbd5e1",
                                background: range === item.key ? "#0f172a" : "white",
                                color: range === item.key ? "white" : "#0f172a",
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <section
                    style={{
                        marginTop: 20,
                        padding: 16,
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        background: "white",
                    }}
                >
                    <h2 style={{ marginBottom: 12 }}>Funnel</h2>

                    <div style={{ display: "grid", gap: 10 }}>
                        {funnel.map((step, i) => {
                            const prev = i > 0 ? funnel[i - 1].value : step.value;
                            const percent =
                                i === 0 || prev === 0
                                    ? 100
                                    : Math.round((step.value / prev) * 100);

                            return (
                                <div key={step.name}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <strong>{step.name}</strong>
                                        <span>
                                            {step.value} ({percent}%)
                                        </span>
                                    </div>

                                    <div
                                        style={{
                                            height: 8,
                                            background: "#e2e8f0",
                                            borderRadius: 6,
                                            overflow: "hidden",
                                            marginTop: 4,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${percent}%`,
                                                height: "100%",
                                                background: "#22c55e",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {loading ? <p>Laster...</p> : null}

                <section
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 12,
                        marginTop: 20,
                    }}
                >
                    {Object.entries(counts).map(([name, count]) => (
                        <div
                            key={name}
                            style={{
                                padding: 16,
                                border: "1px solid #e2e8f0",
                                borderRadius: 16,
                                background: "white",
                            }}
                        >
                            <div style={{ fontSize: 13, color: "#64748b" }}>{name}</div>
                            <div style={{ fontSize: 30, fontWeight: 900 }}>{count}</div>
                        </div>
                    ))}
                </section>

                <section
                    style={{
                        marginTop: 20,
                        padding: 16,
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        background: "white",
                    }}
                >
                    <h2 style={{ marginBottom: 12 }}>🔥 Hot Users</h2>

                    <div style={{ display: "grid", gap: 10 }}>
                        {userStats.map((u) => (
                            <div
                                key={u.uid}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: 10,
                                    border: "1px solid #f1f5f9",
                                    borderRadius: 10,
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 800 }}>{u.uid}</div>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>
                                        Events: {u.events} · Creates: {u.creates} · Feedback: {u.feedbacks}
                                    </div>
                                </div>

                                <div style={{ fontWeight: 900, fontSize: 18 }}>
                                    {u.score}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <h2 style={{ marginTop: 32 }}>Siste hendelser</h2>

                <div style={{ overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            marginTop: 12,
                            background: "white",
                        }}
                    >
                        <thead>
                            <tr>
                                <th style={th}>Tid</th>
                                <th style={th}>Event</th>
                                <th style={th}>Path</th>
                                <th style={th}>Type</th>
                                <th style={th}>Metode</th>
                                <th style={th}>Nivå</th>
                                <th style={th}>Språk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEvents.map((e) => (
                                <tr key={e.id}>
                                    <td style={td}>
                                        {e.createdAt?.seconds
                                            ? new Date(e.createdAt.seconds * 1000).toLocaleString()
                                            : ""}
                                    </td>
                                    <td style={td}>{e.event || ""}</td>
                                    <td style={td}>{e.path || ""}</td>
                                    <td style={td}>{e.type || e.source || ""}</td>
                                    <td style={td}>{e.method || ""}</td>
                                    <td style={td}>{e.level || ""}</td>
                                    <td style={td}>{e.language || ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </AuthGate>
    );

}


const th: React.CSSProperties = {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 13,
};

const td: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #f1f5f9",
    fontSize: 13,
};