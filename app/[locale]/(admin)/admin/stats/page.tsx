"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Stats = {
  usersTotal: number;
  students: number;
  teachers: number;
  admins: number;
  parents: number;
  creators: number;
  lessonsTotal: number;
  pendingModeration: number;
  trashItems: number;
  spacesTotal: number;
  submissionsTotal: number;
};

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "white",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900 }}>{value}</div>
      {hint ? <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{hint}</div> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "white",
      }}
    >
      <h3 style={{ margin: "0 0 12px" }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ opacity: 0.8 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function getErrorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") {
    return e.message;
  }
  if (typeof e === "string") return e;
  return String(e);
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<Stats>({
    usersTotal: 0,
    students: 0,
    teachers: 0,
    admins: 0,
    parents: 0,
    creators: 0,
    lessonsTotal: 0,
    pendingModeration: 0,
    trashItems: 0,
    spacesTotal: 0,
    submissionsTotal: 0,
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!db) {
      setErr("Firestore db is null.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const usersRef = collection(db, "users");
      const lessonsRef = collection(db, "lessons");
      const spacesRef = collection(db, "spaces");
      const submissionsRef = collection(db, "submissions");

      const [
        usersTotalSnap,
        studentsSnap,
        teachersSnap,
        adminsSnap,
        parentsSnap,
        creatorsSnap,
        lessonsTotalSnap,
        pendingModerationSnap,
        trashItemsSnap,
        spacesTotalSnap,
        submissionsTotalSnap,
      ] = await Promise.all([
        getCountFromServer(usersRef),
        getCountFromServer(query(usersRef, where("role", "==", "student"))),
        getCountFromServer(query(usersRef, where("role", "==", "teacher"))),
        getCountFromServer(query(usersRef, where("role", "==", "admin"))),
        getCountFromServer(query(usersRef, where("role", "==", "parent"))),
        getCountFromServer(query(usersRef, where("role", "==", "creator"))),
        getCountFromServer(lessonsRef),
        getCountFromServer(query(lessonsRef, where("publish.state", "==", "pending"))),
        getCountFromServer(query(lessonsRef, where("deletedAt", "!=", null))),
        getCountFromServer(spacesRef),
        getCountFromServer(submissionsRef),
      ]);

      setStats({
        usersTotal: usersTotalSnap.data().count,
        students: studentsSnap.data().count,
        teachers: teachersSnap.data().count,
        admins: adminsSnap.data().count,
        parents: parentsSnap.data().count,
        creators: creatorsSnap.data().count,
        lessonsTotal: lessonsTotalSnap.data().count,
        pendingModeration: pendingModerationSnap.data().count,
        trashItems: trashItemsSnap.data().count,
        spacesTotal: spacesTotalSnap.data().count,
        submissionsTotal: submissionsTotalSnap.data().count,
      });
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>ADMIN</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 24 }}>Stats</h2>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              Plattformoversikt for brukere, innhold og aktivitet.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Laster…" : "Oppdater"}
          </button>
        </div>
      </section>

      {err ? (
        <section
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(239,68,68,0.20)",
            background: "rgba(239,68,68,0.05)",
          }}
        >
          <b>Feil:</b> {err}
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Hvis dette gjelder pending moderation eller trash, kan det mangle Firestore-indekser.
          </div>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard title="Brukere totalt" value={loading ? "…" : stats.usersTotal} />
        <StatCard title="Studenter" value={loading ? "…" : stats.students} />
        <StatCard title="Lærere" value={loading ? "…" : stats.teachers} />
        <StatCard title="Admins" value={loading ? "…" : stats.admins} />
        <StatCard title="Lessons" value={loading ? "…" : stats.lessonsTotal} />
        <StatCard title="Submissions" value={loading ? "…" : stats.submissionsTotal} />
        <StatCard title="Spaces" value={loading ? "…" : stats.spacesTotal} />
        <StatCard title="Til moderering" value={loading ? "…" : stats.pendingModeration} />
        <StatCard title="Trash" value={loading ? "…" : stats.trashItems} />
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <Section title="Brukerfordeling">
          <Row label="Students" value={loading ? "…" : stats.students} />
          <Row label="Teachers" value={loading ? "…" : stats.teachers} />
          <Row label="Admins" value={loading ? "…" : stats.admins} />
          <Row label="Parents" value={loading ? "…" : stats.parents} />
          <Row label="Creators" value={loading ? "…" : stats.creators} />
          <Row label="Totalt" value={loading ? "…" : stats.usersTotal} />
        </Section>

        <Section title="Innhold og drift">
          <Row label="Lessons totalt" value={loading ? "…" : stats.lessonsTotal} />
          <Row label="Pending moderation" value={loading ? "…" : stats.pendingModeration} />
          <Row label="Trash items" value={loading ? "…" : stats.trashItems} />
          <Row label="Spaces" value={loading ? "…" : stats.spacesTotal} />
          <Row label="Submissions" value={loading ? "…" : stats.submissionsTotal} />
        </Section>
      </div>
    </main>
  );
}