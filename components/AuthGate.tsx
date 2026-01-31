// components/AuthGate.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { ensureAnonymousUser } from "@/lib/anonAuth";

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

  // ✅ Public/QR-sider som skal fungere uten manuell innlogging
  const allowAnon = pathname.startsWith("/lesson");

  useEffect(() => {
    if (loading) return;

    // ✅ Whitelist: aldri redirect vekk fra onboarding
    if (pathname.startsWith("/onboarding")) return;

    // Ikke innlogget
    if (!user) {
      // ✅ På public/QR-sider: lag anon-bruker automatisk
      if (allowAnon) {
        ensureAnonymousUser().catch(console.error);
        return;
      }

      // ellers -> login
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Profil ikke klar -> vent
    if (!profile) return;

    // ✅ På public/QR-sider: ikke tving onboarding
    if (!allowAnon && profile.onboardingComplete !== true) {
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
  }, [
    loading,
    user,
    profile,
    router,
    pathname,
    requireRole,
    requireApprovedTeacher,
    allowAnon,
  ]);

  // UI states
  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  // Hvis vi er på public/QR-side og ikke har user enda, viser vi “lager anon…”
  if (!user && allowAnon) return <p style={{ padding: 16 }}>Starter…</p>;

  if (!user) return <p style={{ padding: 16 }}>Redirecting to login…</p>;

  // Viktig: ikke vis children før profile er klart.
  // Men på public/QR-sider trenger vi ikke vente på onboarding.
  if (!pathname.startsWith("/onboarding")) {
    if (!profile) return <p style={{ padding: 16 }}>Loading profile…</p>;
    if (!allowAnon && profile.onboardingComplete !== true)
      return <p style={{ padding: 16 }}>Redirecting to onboarding…</p>;
  }

  return <>{children}</>;
}
