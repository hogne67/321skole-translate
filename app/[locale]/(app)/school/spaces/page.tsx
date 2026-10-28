"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import SchoolNav from "@/components/school/SchoolNav";
import { useUserProfile } from "@/lib/useUserProfile";
import { canAccessSchoolAdmin } from "@/lib/schools/access";

export default function SchoolSpacesPage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [result, setResult] = useState<{ count?: number; error?: string }>({});
  const schoolId = profile?.schoolId ?? "";
  const allowed = canAccessSchoolAdmin(profile);
  useEffect(() => {
    if (loading || !user || user.isAnonymous || !allowed) return;
    const controller = new AbortController();
    const signedInUser = user;
    async function load() {
      setResult({});
      try {
        const token = await signedInUser.getIdToken();
        const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/spaces`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !data.ok) throw new Error(t("spaces.errorTitle"));
        setResult({ count: data.totalSpaceCount });
      } catch {
        if (!controller.signal.aborted) setResult({ error: t("spaces.errorTitle") });
      }
    }
    void load();
    return () => controller.abort();
  }, [allowed, loading, schoolId, t, user]);
  if (loading) return <main className="p-6">{t("access.loading")}</main>;
  if (!user || user.isAnonymous || !allowed) return <main className="p-6"><h1>{t("access.title")}</h1><p>{t("access.text")}</p></main>;
  return <main className="mx-auto max-w-5xl px-4 py-8">
    <SchoolNav locale={locale} active="spaces" />
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h1 className="text-2xl font-semibold">{t("aggregate.spaces")}</h1>
      <p className="mt-3 text-slate-600">{t("aggregate.spacesDescription")}</p>
      {result.error ? <p role="alert" className="mt-3 text-red-700">{result.error}</p> :
        <p className="mt-3 text-3xl font-semibold">{result.count ?? t("spaces.loading")}</p>}
      <Link className="mt-4 inline-block underline" href={`/${locale}/teacher/spaces`}>{t("aggregate.myTeachingSpaces")}</Link>
    </section>
  </main>;
}
