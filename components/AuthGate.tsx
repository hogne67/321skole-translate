// components/AuthGate.tsx
"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type Role = "student" | "teacher" | "admin" | "parent";

export default function AuthGate({
  children,
  requireRole,
  requireApprovedTeacher,
  allowAnonymous = false,
}: {
  children: React.ReactNode;
  requireRole?: Role;
  requireApprovedTeacher?: boolean;
  allowAnonymous?: boolean;
}) {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();

  const nextUrl = useMemo(() => `/login?next=${encodeURIComponent(pathname || "/")}`, [pathname]);

  useEffect(() => {
    if (loading) return;

    // Ikke innlogget:
    // - allowAnonymous -> opprett anon session
    // - ellers -> login
    if (!user) {
      if (allowAnonymous) {
        ensureAnonymousUser().catch((e) => {
          console.error("ensureAnonymousUser failed", e);
          router.replace(nextUrl);
        });
        return;
      }

      router.replace(nextUrl);
      return;
    }

    // ✅ Anonym + allowAnonymous: slipp igjennom (ingen roles/profile)
    if (user.isAnonymous && allowAnonymous) return;

    // Teacher approval (kun for ekte brukere)
    if (requireApprovedTeacher) {
      if (profile?.teacherStatus !== "approved") {
        router.replace("/unauthorized");
        return;
      }
    }

    // Role check (kun for ekte brukere)
    if (requireRole) {
      const hasRole = !!profile?.roles?.[requireRole];
      if (!hasRole) {
        router.replace("/unauthorized");
        return;
      }
    }
  }, [allowAnonymous, loading, user, profile, requireApprovedTeacher, requireRole, router, nextUrl]);

  if (loading) return null;

  // allowAnonymous + ikke-user: vi er i ferd med å signInAnonymously()
  if (!user && allowAnonymous) return null;

  return <>{children}</>;
}
