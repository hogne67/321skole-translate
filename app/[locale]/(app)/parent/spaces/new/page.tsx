// app\[locale]\(app)\parent\spaces\new\page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeDisplayName(profile: unknown, authDisplayName: unknown): string {
  const fromProfile = isRecord(profile) ? safeString(profile.displayName).trim() : "";
  if (fromProfile) return fromProfile;

  const fromAuth = safeString(authDisplayName).trim();
  if (fromAuth) return fromAuth;

  return "Parent";
}

function getErrMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function ParentNewSpacePage() {
  const t = useTranslations("parent.newSpace");
  const locale = useLocale();
  const router = useRouter();
  const { user, profile, loading } = useUserProfile();

  const tx = (key: string, fallback: string) => {
    try {
      return t(key as never);
    } catch {
      return fallback;
    }
  };

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = title.trim().length > 0 && !!user && !user.isAnonymous && !saving;

  async function handleCreate() {
    if (!user || user.isAnonymous) {
      setErr(tx("errors.mustBeLoggedIn", "You must be logged in to create a room."));
      return;
    }

    const trimmed = title.trim();
    if (!trimmed) {
      setErr(tx("errors.missingTitle", "Please enter a title."));
      return;
    }

    setErr(null);
    setSaving(true);

    try {
      const dbx = requireDb(db);

      let createdSpaceId = "";

      try {
        const spaceRef = await addDoc(collection(dbx, "spaces"), {
          title: trimmed,
          ownerId: user.uid,
          kind: "family",
          createdByRole: "parent",
          isOpen: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        createdSpaceId = spaceRef.id;
      } catch (e: unknown) {
        setErr(`spaces create failed: ${getErrMessage(e, "unknown error")}`);
        return;
      }

      try {
        const memberId = `${createdSpaceId}_${user.uid}`;

        await setDoc(doc(dbx, "spaceMembers", memberId), {
          spaceId: createdSpaceId,
          uid: user.uid,
          displayName: safeDisplayName(profile, user.displayName),
          role: "parent",
          createdAt: serverTimestamp(),
        });
      } catch (e: unknown) {
        setErr(`spaceMembers create failed: ${getErrMessage(e, "unknown error")}`);
        return;
      }

      router.push(`/${locale}/parent/spaces/${createdSpaceId}`);
    } catch (e: unknown) {
      setErr(getErrMessage(e, tx("errors.createFailed", "Could not create room.")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 16 }}>{tx("loading", "Loading…")}</div>;
  }

  return (
    <main style={{ maxWidth: 760, margin: "14px auto", padding: 12 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/parent/spaces">{tx("actions.back", "Back")}</Link>
      </div>

      <section
        style={{
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          background: "white",
          padding: 18,
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 8, fontSize: 28 }}>
          {tx("title", "Lag nytt rom")}
        </h1>

        <p style={{ opacity: 0.78, margin: 0, lineHeight: 1.55 }}>
          {tx("subtitle", "Her kan du lage et rom for barnet ditt eller familien.")}
        </p>

        {err ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(220,38,38,0.22)",
              background: "rgba(220,38,38,0.06)",
              color: "#991b1b",
              whiteSpace: "pre-wrap",
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          <label htmlFor="space-title" style={{ fontWeight: 800 }}>
            {tx("fields.title", "Navn på rom")}
          </label>

          <input
            id="space-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tx("fields.placeholder", "For eksempel: Hjemmearbeid")}
            style={{
              width: "100%",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 15,
            }}
          />

          <div style={{ fontSize: 13, opacity: 0.72 }}>
            {tx("fields.help", "Velg et kort og tydelig navn på rommet.")}
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              border: "1px solid rgba(0,0,0,0.14)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "#111",
              color: "white",
              cursor: canCreate ? "pointer" : "not-allowed",
              opacity: canCreate ? 1 : 0.6,
              fontWeight: 800,
            }}
          >
            {saving ? tx("actions.creating", "Oppretter…") : tx("actions.create", "Opprett rom")}
          </button>

          <Link
            href="/parent/spaces"
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid rgba(0,0,0,0.14)",
              borderRadius: 12,
              padding: "10px 14px",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 700,
            }}
          >
            {tx("actions.cancel", "Avbryt")}
          </Link>
        </div>
      </section>
    </main>
  );
}