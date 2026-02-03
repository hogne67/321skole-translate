// components/AuthGate.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserProfile } from "@/lib/useUserProfile";
import { ensureAnonymousUser } from "@/lib/anonAuth";

type Role = "student" | "teacher" | "creator" | "admin" | "parent";

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

  const nextUrl = useMemo(
    () => `/login?next=${encodeURIComponent(pathname || "/")}`,
    [pathname]
  );

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
      const isAuthRoute =
        p.startsWith("/login") || p.startsWith("/register") || p.startsWith("/onboarding");

      if (isAuthRoute) return;

      if (!anonBootstrapping) {
        setAnonBootstrapping(true);
        ensureAnonymousUser()
          .catch((e) => {
            console.error("ensureAnonymousUser failed", e);
            router.replace(nextUrl);
          })
          .finally(() => setAnonBootstrapping(false));
      }
      return;
    }

    // 2) Anonym + allowAnonymous: slipp gjennom uten profile/roles
    if (user.isAnonymous && allowAnonymous) return;

    // 3) Innlogget (ikke-anon): vi trenger profile før vi kan sjekke roller/teacherStatus
    if (!profile) return;

    // Teacher approval (kun når krevd)
    if (requireApprovedTeacher) {
      const roles = profile?.roles as any; // "any" for å være kompatibel med deres UserProfile-type
      const ok = profile?.teacherStatus === "approved" && roles?.teacher === true;
      if (!ok) {
        router.replace("/unauthorized");
        return;
      }
    }

    // Role check
    if (requireRole) {
      const roles = profile?.roles as any;
      const hasRole = roles?.[requireRole] === true;
      if (!hasRole) {
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
  if (!user && allowAnonymous) return null;

  // Innlogget anon + allowAnonymous
  if (user?.isAnonymous && allowAnonymous) return <>{children}</>;

  // Innlogget (ikke-anon), men profile ikke lastet ennå
  if (user && !user.isAnonymous && !profile) return null;

  return <>{children}</>;
}
