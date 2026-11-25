"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { authedPost } from "@/lib/authedPost";
import { useUserProfile } from "@/lib/useUserProfile";

export default function ParentNewSpacePage() {
  const t = useTranslations("parentNewSpace");
  const router = useRouter();
  const { user, loading } = useUserProfile();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<{ title: string; roomId: string } | null>(null);
  const creating = useRef(false);

  const needsVerification = !!user && !user.emailVerified &&
    user.providerData.some((provider) => provider.providerId === "password");
  const canCreate = title.trim().length > 0 && !!user && !user.isAnonymous && !saving && !needsVerification;

  async function createRoom() {
    if (!canCreate || creating.current) return;
    const trimmed = title.trim();
    if (request.current?.title !== trimmed) {
      request.current = { title: trimmed, roomId: crypto.randomUUID() };
    }

    creating.current = true;
    setSaving(true);
    setError(false);
    try {
      const { spaceId } = await authedPost<{ spaceId: string }>("/api/parent/spaces/create", request.current);
      router.push("/parent/spaces/" + spaceId);
    } catch {
      setError(true);
      creating.current = false;
      setSaving(false);
    }
  }

  if (loading) return <p role="status" className="text-sm text-slate-600">{t("loading")}</p>;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4">
      <Link href="/parent/spaces" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("actions.back")}
      </Link>
      <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
        <header className="border-b border-emerald-100 bg-emerald-50 p-5 sm:p-7">
          <h1 className="m-0 text-2xl font-extrabold tracking-tight text-emerald-950 sm:text-3xl">{t("title")}</h1>
          <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-emerald-900">{t("subtitle")}</p>
        </header>
        <form
          className="space-y-5 p-5 sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            void createRoom();
          }}
        >
          <div>
            <label htmlFor="family-room-title" className="text-sm font-bold text-slate-900">{t("fields.title")}</label>
            <input
              id="family-room-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("fields.placeholder")}
              aria-describedby="family-room-help"
              maxLength={120}
              disabled={saving}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <p id="family-room-help" className="mb-0 mt-2 text-sm text-slate-600">{t("fields.help")}</p>
          </div>
          {needsVerification ? <p className="text-sm font-semibold text-amber-900">{t("messages.verifyBeforeCreate")}</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{t("errors.createFailed")}</p> : null}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!canCreate}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
            >
              {t(saving ? "actions.creating" : "actions.create")}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <Link href="/parent/spaces" className="text-sm font-semibold text-slate-700 hover:underline">{t("actions.cancel")}</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
