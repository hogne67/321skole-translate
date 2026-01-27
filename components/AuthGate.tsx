//components/AuthGate.tsx
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
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (requireRole && !profile?.roles?.[requireRole]) {
      router.replace("/unauthorized");
      return;
    }

    if (requireApprovedTeacher && profile?.teacherStatus !== "approved") {
      router.replace("/teacher/apply");
      return;
    }
  }, [
    loading,
    user?.uid,
    requireRole,
    requireApprovedTeacher,
    profile?.teacherStatus,
    profile?.roles,
    router,
    pathname,
  ]);

  if (loading) return <div style={{ padding: 24 }}>Laster…</div>;
  if (!user) return null;

  if (requireRole && !profile?.roles?.[requireRole]) return null;
  if (requireApprovedTeacher && profile?.teacherStatus !== "approved") return null;

  return <>{children}</>;
}
