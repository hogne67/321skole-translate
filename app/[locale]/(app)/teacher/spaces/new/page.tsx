// app/[locale]/(app)/teacher/spaces/new/page.tsx
"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { createSpaceForTeacher } from "@/lib/spacesClient";
import { useLocale, useTranslations } from "next-intl";
import { activeTeacherSchoolId, type TeacherSpaceCreationArea } from "@/lib/teacherSpaceArea";
import { useTeacherSpaceSchool } from "@/lib/useTeacherSpaceSchool";

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
  const t = useTranslations("common");
  return (
    <AuthGate>
      <Suspense fallback={<p className="p-4 text-sm text-slate-600">{t("loading")}</p>}>
        <NewSpaceInner />
      </Suspense>
    </AuthGate>
  );
}

function NewSpaceInner() {
  const t = useTranslations("spacesNew");
  const tSpaces = useTranslations("spaces");
  const tCommon = useTranslations("common");
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const locale = useLocale();
  const requestedArea = useSearchParams().get("area");
  const schoolId = activeTeacherSchoolId(profile);
  const schoolName = useTeacherSpaceSchool(user, schoolId)?.name;
  const area: TeacherSpaceCreationArea = requestedArea === "private" || requestedArea === "school"
    ? requestedArea : schoolId ? "school" : "private";
  const areaAllowsCreation = area === "school" ? Boolean(schoolId) : profile?.schoolStatus !== "active";
  const canCreateSpace = areaAllowsCreation && Boolean(user && !user.isAnonymous &&
    (profile?.role === "teacher" || profile?.role === "admin" || profile?.roles?.admin === true));

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setErr(null);

    if (!user?.uid) return setErr(t("errors.missingUser"));
    if (!canCreateSpace) return setErr(t("errors.cannotCreate"));
    if (!title.trim()) return setErr(t("errors.missingTitle"));

    setSaving(true);
    try {
      const res = await createSpaceForTeacher({
        ownerId: user.uid,
        title: title.trim(),
        isOpen: true,
        area,
        schoolId: area === "school" ? schoolId : null,
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
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
      <Link href={`/${locale}/teacher/spaces?area=${area}`} className="text-sm text-slate-700 underline">
        {t("backToRooms")}
      </Link>
      <h1 className="m-0 text-2xl font-semibold text-slate-950">{t("title")}</h1>
      <p className="m-0 text-sm font-semibold text-slate-700">
        {area === "school" ? schoolName || tSpaces("areas.schoolRoom") : tSpaces("areas.privateRoom")}
      </p>
      {canCreateSpace ? (
        <form onSubmit={onCreate} className="space-y-3">
          <div>
            <label htmlFor="new-space-title" className="mb-1 block text-sm font-semibold text-slate-900">
              {t("fields.name.label")}
            </label>
            <input
              id="new-space-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("fields.name.placeholder")}
              maxLength={120}
              required
              className="box-border min-h-11 w-full rounded-xl border border-solid border-slate-300 bg-white px-3 py-2"
            />
          </div>
          {err ? <p role="alert" className="text-sm text-red-700">{err}</p> : null}
          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-60">
            {saving ? t("actions.creating") : t("actions.create")}
          </button>
        </form>
      ) : (
        <p role="status" className="text-sm text-slate-700">
          {area === "private" && !areaAllowsCreation ? tSpaces("areas.privateCreationHint") : t("errors.cannotCreate")}
        </p>
      )}
    </div>
  );
}
