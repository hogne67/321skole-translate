"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { canAccessAcademy } from "@/lib/courses/academyAccess";
import { useUserProfile } from "@/lib/useUserProfile";

export function AcademyGate({ children }: { children: ReactNode }) {
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const locale = useLocale();

  const enabled = canAccessAcademy(profile);

  useEffect(() => {
    if (loading || !profile || enabled) return;
    router.replace(`/${locale}/unauthorized`);
  }, [enabled, loading, locale, profile, router]);

  if (loading || !profile || !enabled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Laster...
      </div>
    );
  }

  return <>{children}</>;
}
