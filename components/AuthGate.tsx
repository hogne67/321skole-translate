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

  return readLegacyRole(profile);
}

export default function AuthGate({
  children,
  requireRole,
  allowAnonymous = false,
}: {
  children: ReactNode;
  requireRole?: Role;
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
      p === "/post-login" ||
      p.startsWith(`/${locale}/login`) ||
      p.startsWith(`/${locale}/register`) ||
      p.startsWith(`/${locale}/onboarding`) ||
      p.startsWith(`/${locale}/post-login`);

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
      router.replace(unauthorizedUrl);
      return;
    }

    // ✅ IMPORTANT: No teacher approval gating.
  }, [
    loading,
    user,
    profile,
    requireRole,
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