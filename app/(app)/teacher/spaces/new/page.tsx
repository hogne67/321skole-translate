// app/(app)/teacher/spaces/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { createSpaceForTeacher } from "@/lib/spacesClient";

export default function NewSpacePage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <NewSpaceInner />
    </AuthGate>
  );
}

function NewSpaceInner() {
  const { user } = useUserProfile();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setErr(null);
    if (!user?.uid) return setErr("Mangler user.");
    if (!title.trim()) return setErr("Gi space et navn.");

    setSaving(true);
    try {
      const res = await createSpaceForTeacher({ ownerId: user.uid, title: title.trim(), isOpen });
      router.push(`/teacher/spaces/${res.spaceId}`);
    } catch (e: any) {
      setErr(e?.message ?? "Ukjent feil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>New Teacher Space</h1>

      <label style={{ display: "block", marginBottom: 6 }}>Navn</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="F.eks. Norsk A2 – Gruppe 1"
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
      />

      <label style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
        Space er åpen for anonyme innleveringer (anbefalt i MVP)
      </label>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <button
        onClick={onCreate}
        disabled={saving}
        style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10 }}
      >
        {saving ? "Creating..." : "Create"}
      </button>
    </div>
  );
}
