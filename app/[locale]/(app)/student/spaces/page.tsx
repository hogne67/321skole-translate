// app/(app)/student/spaces/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
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

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function StudentSpacesPage() {
  const t = useTranslations("student.spaces");
  const locale = useLocale(); // brukes bare til sort locale, ikke URL

  const [user, setUser] = useState<User | null>(null);

  const [spaces, setSpaces] = useState<Array<{ id: string; data: SpaceDoc }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const collatorLocale = useMemo(() => (locale === "no" ? "nb" : "en"), [locale]);

  function titleOfSpace(s: SpaceDoc): string {
    const title = safeString(getKey(s, "title"));
    return title ?? t("defaultTitle");
  }

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
        items.sort((a, b) =>
          titleOfSpace(a.data).localeCompare(titleOfSpace(b.data), collatorLocale)
        );

        if (alive) setSpaces(items);
      } catch (e: unknown) {
        if (alive) setErr(errMessage(e, t("errors.loadFailed")));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, collatorLocale]);

  if (loading) return <div style={{ padding: 16 }}>{t("loading")}</div>;

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
          <h1 style={{ marginBottom: 6 }}>{t("title")}</h1>
          <div style={{ opacity: 0.75 }}>{t("subtitle")}</div>
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
          {t("actions.joinSpace")}
        </Link>
      </div>

      {err ? (
        <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {spaces.length === 0 ? (
          <div style={{ opacity: 0.7 }}>
            {t.rich("empty", {
              b: (chunks) => <b>{chunks}</b>,
            })}
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    {code ? (
                      <div style={{ opacity: 0.75 }}>
                        {t("meta.code")}: <b>{code}</b>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 6 }}>{t("actions.openSpace")}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}