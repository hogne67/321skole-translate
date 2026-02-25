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

function readLegacyRole(profile: Record<string, unknown>): Role | null {
  const roles = profile["roles"];
  if (!isRecord(roles)) return null;

  // priority order
  if (roles["admin"] === true) return "admin";
  if (roles["teacher"] === true) return "teacher";
  if (roles["creator"] === true) return "creator";
  if (roles["parent"] === true) return "parent";
  if (roles["student"] === true) return "student";
  return null;
}

function readRole(profile: unknown): Role | null {
  if (!isRecord(profile)) return null;

  const r = profile["role"];
  if (r === "student" || r === "teacher" || r === "admin" || r === "parent" || r === "creator") return r;

  // fallback to legacy
  return readLegacyRole(profile);
}

function isApprovedTeacher(profile: unknown): boolean {
  if (!isRecord(profile)) return false;

  // New boolean (if you ever use it)
  if (profile["teacherApproved"] === true) return true;

  // Status on top-level (your debug page shows status: approved)
  if (profile["teacherStatus"] === "approved") return true;

  // Legacy status inside roles
  const roles = profile["roles"];
  if (isRecord(roles) && roles["teacherStatus"] === "approved") return true;

  // Legacy role flag
  if (isRecord(roles) && roles["teacher"] === true) return true;

  return false;
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
      // Special-case: teacher pages should also allow approved-teacher legacy users
      if (requireRole === "teacher" && isApprovedTeacher(profile)) return;

      router.replace(unauthorizedUrl);
      return;
    }

    // 5) Require approved teacher
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

  if (loading) return null;

  if (!user && allowAnonymous) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  if (!user && !allowAnonymous) return null;

  if (user?.isAnonymous && (requireRole === "teacher" || requireRole === "admin" || requireRole === "creator"))
    return null;

  if (user && !user.isAnonymous && requireRole && !profile) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  return <>{children}</>;
}