// components/AuthGate.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [anonBooting, setAnonBooting] = useState(false);

  const nextUrl = useMemo(() => {
    return `/login?next=${encodeURIComponent(pathname || "/")}`;
  }, [pathname]);

  // Når vi får en user (anon eller ekte), stopp booting
  useEffect(() => {
    if (user) setAnonBooting(false);
  }, [user]);

  useEffect(() => {
    if (loading) return;

    // Ikke innlogget:
    if (!user) {
      if (allowAnonymous) {
        // Start anon-login én gang per "tom session"
        if (!anonBooting) {
          setAnonBooting(true);
          ensureAnonymousUser().catch((e) => {
            console.error("ensureAnonymousUser failed", e);
            setAnonBooting(false);
            // fallback: send til login
            router.replace(nextUrl);
          });
        }
        return;
      }

      router.replace(nextUrl);
      return;
    }

    // Teacher approval sjekk (ikke relevant for anon, men ufarlig)
    if (requireApprovedTeacher) {
      const isApproved = profile?.teacherStatus === "approved";
      if (!isApproved) {
        router.replace("/unauthorized");
        return;
      }
    }

    // Rollekrav:
    // OBS: anon har normalt ikke profile/roles -> vil feile
    if (requireRole) {
      const hasRole = !!profile?.roles?.[requireRole];
      if (!hasRole) {
        router.replace("/unauthorized");
        return;
      }
    }
  }, [
    allowAnonymous,
    anonBooting,
    loading,
    user,
    profile,
    requireApprovedTeacher,
    requireRole,
    router,
    nextUrl,
  ]);

  // Hvis useUserProfile fortsatt laster
  if (loading) return null;

  // Hvis vi forsøker anon-login, vis ingenting (evt. putt inn en liten loader senere)
  if (allowAnonymous && (!user || anonBooting)) return null;

  return <>{children}</>;
}
