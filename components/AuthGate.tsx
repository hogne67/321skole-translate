// AuthGate.tsx
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

function hasRequiredRole(profile: unknown, requireRole: Role): boolean {
  if (!isRecord(profile)) return false;
  if (profile["disabled"] === true) return false;

  const role = profile["role"];
  const roles = isRecord(profile["roles"]) ? profile["roles"] : null;

  if (requireRole === "admin") {
    return roles?.["admin"] === true || role === "admin";
  }

  if (requireRole === "teacher") {
    return roles?.["teacher"] === true || role === "teacher";
  }

  if (requireRole === "creator") {
    return roles?.["creator"] === true || role === "creator";
  }

  if (requireRole === "parent") {
    return roles?.["parent"] === true || role === "parent";
  }

  if (requireRole === "student") {
    return roles?.["student"] === true || role === "student";
  }

  return false;
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
    console.log("AuthGate debug", {
      userUid: user?.uid ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      profile,
      requireRole,
      pathname,
    });
  }, [user, profile, requireRole, pathname]);

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

    if (user.isAnonymous) {
      if (
        requireRole === "teacher" ||
        requireRole === "admin" ||
        requireRole === "creator" ||
        requireRole === "parent"
      ) {
        router.replace(nextUrl);
        return;
      }
      return;
    }

    if (!profile) return;

    const hasRole = requireRole ? hasRequiredRole(profile, requireRole) : true;

    if (!requireRole) {
      return;
    }

    if (!hasRole) {
      const profileRole = isRecord(profile) ? profile["role"] : null;
      const hasAnyKnownRole =
        hasRequiredRole(profile, "student") ||
        hasRequiredRole(profile, "teacher") ||
        hasRequiredRole(profile, "admin") ||
        hasRequiredRole(profile, "parent") ||
        hasRequiredRole(profile, "creator");

      if (!profileRole && !hasAnyKnownRole) {
        if (!isAuthRoute) router.replace(onboardingUrl);
        return;
      }

      router.replace(unauthorizedUrl);
    }
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

  if (
    user?.isAnonymous &&
    (requireRole === "teacher" ||
      requireRole === "admin" ||
      requireRole === "creator" ||
      requireRole === "parent")
  ) {
    return null;
  }

  if (user && !user.isAnonymous && requireRole && !profile) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  return <>{children}</>;
}