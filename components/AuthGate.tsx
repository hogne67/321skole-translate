// components/AuthGate.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type Role = "student" | "teacher" | "creator" | "admin" | "parent";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickTeacherStatus(profile: unknown): string {
  // Robust: støtte både top-level teacherStatus og legacy roles.teacherStatus
  if (!isRecord(profile)) return "none";

  const top = profile["teacherStatus"];
  if (typeof top === "string" && top) return top;

  const roles = profile["roles"];
  if (isRecord(roles)) {
    const nested = roles["teacherStatus"];
    if (typeof nested === "string" && nested) return nested;
  }

  return "none";
}

function hasRole(profile: unknown, role: Role): boolean {
  if (!isRecord(profile)) return false;
  const roles = profile["roles"];
  if (!isRecord(roles)) return false;
  return roles[role] === true;
}

export default function AuthGate({
  children,
  requireRole,
  requireApprovedTeacher,
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

  const nextUrl = useMemo(() => `/login?next=${encodeURIComponent(pathname || "/")}`, [pathname]);

  const [anonBootstrapping, setAnonBootstrapping] = useState(false);

  useEffect(() => {
    if (loading) return;

    // 1) Ikke innlogget
    if (!user) {
      if (!allowAnonymous) {
        router.replace(nextUrl);
        return;
      }

      // allowAnonymous: bootstrap anon (men ikke på auth-ruter)
      const p = pathname || "";
      const isAuthRoute = p.startsWith("/login") || p.startsWith("/register") || p.startsWith("/onboarding");

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

    // 2) Innlogget: hvis siden krever roller/status må vi ha profile
    const needsProfile = !!requireRole || !!requireApprovedTeacher;
    if (!needsProfile) return;

    if (!profile) return;

    // 3) Role-check først
    if (requireRole) {
      const ok = hasRole(profile, requireRole);
      if (!ok) {
        router.replace("/unauthorized");
        return;
      }
    }

    // 4) Approved teacher-check (robust teacherStatus)
    if (requireApprovedTeacher) {
      const teacherStatus = pickTeacherStatus(profile);
      const ok = teacherStatus === "approved" && hasRole(profile, "teacher");
      if (!ok) {
        router.replace("/unauthorized");
        return;
      }
    }
  }, [
    allowAnonymous,
    anonBootstrapping,
    loading,
    user,
    profile,
    requireApprovedTeacher,
    requireRole,
    router,
    nextUrl,
    pathname,
  ]);

  // Render gating
  if (loading) return null;

  // Ikke innlogget + allowAnonymous: venter på anon sign-in
  if (!user && allowAnonymous) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  // Ikke innlogget + ikke allowAnonymous: blir redirectet til login
  if (!user && !allowAnonymous) return null;

  // Hvis siden krever profile (rolle/status), men den er ikke lastet ennå, vis loader
  const needsProfile = !!requireRole || !!requireApprovedTeacher;
  if (user && needsProfile && !profile) {
    return <div style={{ padding: 16, opacity: 0.7 }}>Laster…</div>;
  }

  return <>{children}</>;
}