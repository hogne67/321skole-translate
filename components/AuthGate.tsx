// components/AuthGate.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { useLocale } from "next-intl";

type Role = "student" | "teacher" | "admin" | "parent" | "creator";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;
  const r = profile["role"];
  return r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator"
    ? r
    : null;
}

function isApprovedTeacher(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  // Bytt denne hvis dere bruker et annet felt:
  return profile["teacherApproved"] === true;
}

export default function AuthGate({
  children,
  requireRole,
  requireApprovedTeacher = false,
  allowAnonymous = false,
}: {
  children: ReactNode;
  requireRole?: Role;
  requireApprovedTeacher?: boolean;
  allowAnonymous?: boolean;
}) {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const onboardingUrl = useMemo(() => `/${locale}/onboarding`, [locale]);
  const unauthorizedUrl = useMemo(() => `/${locale}/unauthorized`, [locale]);

  const nextUrl = useMemo(
    () => `/${locale}/login?next=${encodeURIComponent(pathname || `/${locale}/`)}`,
    [pathname, locale]
  );

  const [anonBootstrapping, setAnonBootstrapping] = useState(false);

  useEffect(() => {
    if (loading) return;

    const p = pathname || "";

    const isAuthRoute =
      p === "/login" ||
      p === "/register" ||
      p === "/onboarding" ||
      p.startsWith(`/${locale}/login`) ||
      p.startsWith(`/${locale}/register`) ||
      p.startsWith(`/${locale}/onboarding`);

    // 1) Not logged in
    if (!user) {
      if (!allowAnonymous) {
        router.replace(nextUrl);
        return;
      }

      if (isAuthRoute) return;

      if (!anonBootstrapping) {
        setAnonBootstrapping(true);
        ensureAnonymousUser()
          .catch((e: unknown) => {
            console.error("ensureAnonymousUser failed", e);
            router.replace(nextUrl);
          })
          .finally(() => setAnonBootstrapping(false));
      }
      return;
    }

    // 2) Logged in but anon
    if (user.isAnonymous) {
      // Teacher/admin/creator pages can never be anon
      if (requireRole === "teacher" || requireRole === "admin" || requireRole === "creator") {
        router.replace(nextUrl);
        return;
      }

      // Student anon is OK. No profile/onboarding required.
      return;
    }

    // 3) Logged in (not anon): must have profile
    if (!profile) return;

    const role = readRole(profile);

    // If role not set -> onboarding (avoid loop)
    if (!role) {
      if (!isAuthRoute) router.replace(onboardingUrl);
      return;
    }

    // 4) Require a specific role
    if (requireRole && role !== requireRole) {
      router.replace(unauthorizedUrl);
      return;
    }

    // 5) Require approved teacher (only meaningful if teacher access is requested)
    if (requireApprovedTeacher) {
      const teacherContext = requireRole === "teacher" || role === "teacher";
      if (teacherContext && !isApprovedTeacher(profile)) {
        router.replace(unauthorizedUrl);
        return;
      }
    }
  }, [
    loading,
    user,
    profile,
    requireRole,
    requireApprovedTeacher,
    allowAnonymous,
    anonBootstrapping,
    router,
    nextUrl,
    pathname,
    locale,
    onboardingUrl,
    unauthorizedUrl,
  ]);

  // Render gating
  if (loading) return null;

  // Not logged in + allowAnonymous: waiting for anon sign-in
  if (!user && allowAnonymous) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  // Not logged in + not allowAnonymous: redirect in effect
  if (!user && !allowAnonymous) return null;

  // Logged in anon + teacher/admin/creator required: redirect in effect
  if (user?.isAnonymous && (requireRole === "teacher" || requireRole === "admin" || requireRole === "creator"))
    return null;

  // Logged in (not anon) + requireRole needs profile loaded
  if (user && !user.isAnonymous && requireRole && !profile) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  return <>{children}</>;
}