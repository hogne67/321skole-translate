// app/[locale]/(app)/teacher/spaces/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { createSpaceForTeacher } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default function NewSpacePage() {
  return (
    <AuthGate>
      <NewSpaceInner />
    </AuthGate>
  );
}

function NewSpaceInner() {
  const t = useTranslations("spacesNew");
  const tCommon = useTranslations("common");
  const { user, loading } = useUserProfile();
  const router = useRouter();
  const locale = useLocale();

  const canCreateSpace = Boolean(user?.uid);

  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setErr(null);

    if (!user?.uid) return setErr(t("errors.missingUser"));
    if (!canCreateSpace) return setErr(t("errors.cannotCreate"));
    if (!title.trim()) return setErr(t("errors.missingTitle"));

    setSaving(true);
    try {
      const res = await createSpaceForTeacher({
        ownerId: user.uid,
        title: title.trim(),
        isOpen,
      });

      router.push(`/${locale}/teacher/spaces/${res.spaceId}`);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || t("errors.unknown"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>{t("title")}</h1>

      <label style={{ display: "block", marginBottom: 6 }}>
        {t("fields.name.label")}
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("fields.name.placeholder")}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.2)",
        }}
      />

      <label style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
        />
        {t("fields.isOpen.label")}
      </label>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <button
        onClick={onCreate}
        disabled={saving}
        style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10 }}
      >
        {saving ? t("actions.creating") : t("actions.create")}
      </button>
    </div>
  );
}