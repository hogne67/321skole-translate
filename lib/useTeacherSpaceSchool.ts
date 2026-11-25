"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useTeacherSpaceSchool(user: User | null, schoolId: string | null) {
  const [school, setSchool] = useState<{ uid: string; id: string; name: string; allowPupilCodeAccess: boolean } | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous || !schoolId) return;
    const controller = new AbortController();
    async function load(current: User, id: string) {
      const token = await current.getIdToken();
      if (controller.signal.aborted || auth.currentUser !== current) return;
      const response = await fetch("/api/teacher/spaces/school", {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      const result = response.ok ? await response.json() : null;
      if (controller.signal.aborted || auth.currentUser !== current) return;
      setSchool(result?.school?.id === id && typeof result.school.name === "string"
        ? { uid: current.uid, id, name: result.school.name, allowPupilCodeAccess: result.school.allowPupilCodeAccess !== false }
        : null);
    }
    void load(user, schoolId).catch(() => {});
    return () => controller.abort();
  }, [user, schoolId]);

  return school && school.uid === user?.uid && school.id === schoolId ? school : null;
}
