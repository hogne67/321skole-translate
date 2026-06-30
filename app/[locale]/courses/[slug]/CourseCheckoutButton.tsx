"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type Props = {
  enabled: boolean;
  label?: string;
};

export function CourseCheckoutButton({ enabled, label = "Buy course" }: Props) {
  const params = useParams<{ slug?: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const { user } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function startCheckout() {
    if (!enabled || busy) return;
    if (!user) {
      setMessage("Sign in before buying this course.");
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not start checkout";
      setMessage(text);
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <div className="mt-5 grid gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void startCheckout()}
        className="inline-flex h-11 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? "Opening checkout..." : label}
      </button>
      {message ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          {message}
        </div>
      ) : null}
    </div>
  );
}
