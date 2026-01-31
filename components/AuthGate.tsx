// components/AuthGate.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";

type Role = "student" | "teacher" | "admin" | "parent";

export default function AuthGate({
  children,
  requireRole,
  requireApprovedTeacher,
}: {
  children: React.ReactNode;
  requireRole?: Role;
  requireApprovedTeacher?: boolean;
}) {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (loading) return;

    // ✅ Whitelist: aldri redirect vekk fra onboarding
    if (pathname.startsWith("/onboarding")) return;

    // Ikke innlogget -> login
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Profil ikke klar -> vent (ikke bounce til onboarding)
    if (!profile) return;

    // Ikke onboardet -> onboarding
    if (profile.onboardingComplete !== true) {
      router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Rollekrav
    if (requireRole && !profile?.roles?.[requireRole]) {
      router.replace("/unauthorized");
      return;
    }

    // Teacher approval
    if (requireApprovedTeacher && profile?.teacherStatus !== "approved") {
      router.replace("/unauthorized");
      return;
    }
  }, [loading, user, profile, router, pathname, requireRole, requireApprovedTeacher]);

  // UI states
  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  if (!user) return <p style={{ padding: 16 }}>Redirecting to login…</p>;

  // Viktig: ikke vis children før profile er klart og onboarding er ok
  if (!pathname.startsWith("/onboarding")) {
    if (!profile) return <p style={{ padding: 16 }}>Loading profile…</p>;
    if (profile.onboardingComplete !== true) return <p style={{ padding: 16 }}>Redirecting to onboarding…</p>;
  }

  return <>{children}</>;
}
