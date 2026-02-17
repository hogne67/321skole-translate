// app/(app)/teacher/spaces/[spaceId]/members/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type MemberData = {
  userId?: string;
  uid?: string;
  displayName?: string;
  role?: string;
  archived?: boolean;
  isAnon?: boolean;
  createdAt?: unknown;
};

type MemberRow = {
  id: string;
  data: MemberData;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasToDate(v: unknown): v is { toDate: () => Date } {
  return isRecord(v) && typeof v.toDate === "function";
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (hasToDate(v)) return v.toDate();
  return null;
}

function fmt(d: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default function TeacherSpaceMembersPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;
  const { user, loading } = useUserProfile();

  const [spaceTitle, setSpaceTitle] = useState<string>("Space");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!spaceId) return;

    // optional: show title
    getDoc(doc(db, "spaces", spaceId))
      .then((snap) => {
        const data = snap.data();
        const title = data && isRecord(data) ? safeString(data.title) : null;
        if (title) setSpaceTitle(title);
      })
      .catch(() => {
        /* ignore */
      });
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId || !user?.uid) return;

    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "==", spaceId),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(qy, (snap) => {
      const next: MemberRow[] = snap.docs.map((d) => {
        const raw = d.data();
        const data: MemberData = isRecord(raw) ? (raw as MemberData) : {};
        return { id: d.id, data };
      });
      setRows(next);
    });
  }, [spaceId, user?.uid]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const name = String(r.data.displayName ?? "").toLowerCase();
      const role = String(r.data.role ?? "").toLowerCase();
      const uid = String(r.data.userId ?? r.data.uid ?? "").toLowerCase();
      return name.includes(s) || role.includes(s) || uid.includes(s);
    });
  }, [rows, search]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!spaceId) {
    return (
      <div className="mx-auto max-w-4xl p-4 text-sm text-red-600">
        Missing spaceId
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {spaceTitle} · SpaceId:{" "}
            <span className="font-mono text-xs">{spaceId}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/teacher/spaces/${spaceId}`}
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            Back to space
          </Link>
          <Link
            href="/teacher/spaces"
            className="rounded-xl border px-3 py-2 text-sm no-underline hover:shadow-sm"
          >
            All spaces
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Showing: <b>{filtered.length}</b>
          </div>
          <div className="w-full sm:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / role / uid…"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">UID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const name = String(r.data.displayName ?? "—");
                const role = String(r.data.role ?? "member");
                const joined = fmt(asDate(r.data.createdAt));
                const isAnon = Boolean(r.data.isAnon);
                const uid = String(r.data.userId ?? r.data.uid ?? "—");

                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{name}</td>
                    <td className="py-2 pr-3">{role}</td>
                    <td className="py-2 pr-3">{joined}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          isAnon ? "bg-slate-100" : "bg-emerald-50"
                        }`}
                      >
                        {isAnon ? "Anon" : "Signed-in"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{uid}</td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 text-xs text-muted-foreground">
            Tip: If you don’t see names yet, it means join-flow hasn’t stored{" "}
            <b>displayName</b> on members.
          </div>
        </div>
      </div>
    </div>
  );
}