// app/[locale]/(app)/producer/[id]/layout.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";

export default function ProducerDocLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const locale = useLocale();
  const { profile, loading } = useUserProfile();

  const role = useMemo(() => {
    const p = profile as
      | {
          role?: string;
          mode?: string;
          org?: { role?: string };
          roles?: {
            teacher?: boolean;
            student?: boolean;
            parent?: boolean;
            creator?: boolean;
            admin?: boolean;
          };
        }
      | null
      | undefined;

    if (!p) return "";

    if (typeof p.role === "string" && p.role.trim()) return p.role;
    if (typeof p.mode === "string" && p.mode.trim()) return p.mode;
    if (typeof p.org?.role === "string" && p.org.role.trim()) return p.org.role;

    if (p.roles?.admin) return "admin";
    if (p.roles?.creator) return "creator";
    if (p.roles?.teacher) return "teacher";
    if (p.roles?.student) return "student";
    if (p.roles?.parent) return "parent";

    return "";
  }, [profile]);

  const isAllowed =
    role === "teacher" ||
    role === "student" ||
    role === "parent" ||
    role === "creator" ||
    role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!isAllowed) {
      router.replace(`/${locale}/unauthorized`);
    }
  }, [loading, isAllowed, router, locale]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-none px-6 py-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 md:p-6">Laster…</div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAllowed) return null;

  return (
    <main className="mx-auto w-full max-w-none px-6 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 md:p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}