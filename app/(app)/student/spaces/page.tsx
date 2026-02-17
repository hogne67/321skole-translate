// app/(app)/student/spaces/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { listMySpaceIds } from "@/lib/spaceMembership";
import type { SpaceDoc } from "@/lib/spacesClient";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getKey(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function codeOfSpace(s: SpaceDoc | null | undefined): string | null {
  // støtter både code / joinCode / join.code
  const code = safeString(getKey(s, "code"));
  if (code) return code;

  const joinCode = safeString(getKey(s, "joinCode"));
  if (joinCode) return joinCode;

  const join = getKey(s, "join");
  if (!isRecord(join)) return null;

  const nested = safeString(join["code"]);
  return nested ?? null;
}

function titleOfSpace(s: SpaceDoc): string {
  const title = safeString(getKey(s, "title"));
  return title ?? "Klasse";
}

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function StudentSpacesPage() {
  const [user, setUser] = useState<User | null>(null);

  const [spaces, setSpaces] = useState<Array<{ id: string; data: SpaceDoc }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // load spaces for user
  useEffect(() => {
    let alive = true;

    async function run() {
      setErr(null);

      // Ikke innlogget? Vis tom liste.
      if (!user) {
        if (alive) {
          setSpaces([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const dbx = requireDb(db);

        // 1) hent spaceIds fra medlemskap
        const ids = await listMySpaceIds(dbx, user.uid);

        if (!ids.length) {
          if (alive) setSpaces([]);
          return;
        }

        // 2) hent space docs parallelt
        const docs = await Promise.all(
          ids.map(async (id) => {
            const snap = await getDoc(doc(dbx, "spaces", id));
            if (!snap.exists()) return null;
            return { id, data: snap.data() as SpaceDoc };
          })
        );

        const items = docs.filter((x): x is { id: string; data: SpaceDoc } => x !== null);

        // 3) sorter litt pent: alfabetisk på tittel
        items.sort((a, b) => titleOfSpace(a.data).localeCompare(titleOfSpace(b.data), "no"));

        if (alive) setSpaces(items);
      } catch (e: unknown) {
        if (alive) setErr(errMessage(e, "Kunne ikke laste klasser"));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [user]);

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>Mine klasser</h1>
          <div style={{ opacity: 0.75 }}>Her vises klasser du har blitt medlem av via join.</div>
        </div>

        <Link
          href="/join"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            textDecoration: "none",
            fontWeight: 700,
            color: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          Join klasse
        </Link>
      </div>

      {err ? (
        <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {spaces.length === 0 ? (
          <div style={{ opacity: 0.7 }}>
            Ingen klasser ennå. Trykk <b>Join klasse</b> og skriv inn kode/lenke fra lærer.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {spaces.map((s) => {
              const title = titleOfSpace(s.data);
              const code = codeOfSpace(s.data);

              return (
                <Link
                  key={s.id}
                  href={`/student/spaces/${s.id}`}
                  style={{
                    display: "block",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 12,
                    padding: 12,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    {code ? (
                      <div style={{ opacity: 0.75 }}>
                        Kode: <b>{code}</b>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 6 }}>Åpne klasse</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}