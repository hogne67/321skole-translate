// app/[locale]/post-login/page.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type Role2 = "student" | "teacher";

function normalizeRole(raw: unknown): Role2 | null {
  const r = String(raw ?? "").toLowerCase();

  if (r === "teacher") return "teacher";
  if (r === "student") return "student";

  // gamle roller -> teacher
  if (r === "admin" || r === "creator" || r === "content" || r === "review" || r === "reviewer")
    return "teacher";

  // parent -> student
  if (r === "parent") return "student";

  return null;
}

function normalizeNext(raw: string | null, locale: string): string | null {
  if (!raw) return null;

  let next = raw;
  try {
    next = decodeURIComponent(raw);
  } catch {
    // ignore
  }

  if (!next.startsWith("/") || next.startsWith("//")) return null;

  const [pathPart, queryPart] = next.split("?", 2);
  const path = (pathPart || "").replace(/\/+$/, "");
  const rebuilt = queryPart ? `${path}?${queryPart}` : path;

  const blocked = new Set([
    `/${locale}/login`,
    `/${locale}/register`,
    `/${locale}/onboarding`,
    `/${locale}/post-login`,
    "/login",
    "/register",
    "/onboarding",
    "/post-login",
    "/",
    `/${locale}`,
  ]);
  if (blocked.has(path)) return null;

  const withLocale = /^\/(en|no|pt)(\/|$)/.test(path) ? rebuilt : `/${locale}${rebuilt}`;

  const mapped =
    withLocale.startsWith(`/${locale}/content`) ? `/${locale}/teacher` :
    withLocale.startsWith(`/${locale}/review`) ? `/${locale}/teacher` :
    withLocale.startsWith(`/${locale}/users`) ? `/${locale}/teacher` :
    withLocale.startsWith(`/${locale}/321lessons`) ? `/${locale}/teacher` :
    withLocale;

  const allowed = mapped.startsWith(`/${locale}/teacher`) || mapped.startsWith(`/${locale}/student`);
  return allowed ? mapped : null;
}

function nextMatchesRole(next: string, role: Role2, locale: string): boolean {
  if (role === "teacher") return next.startsWith(`/${locale}/teacher`);
  return next.startsWith(`/${locale}/student`);
}

export default function PostLoginPage() {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const sp = useSearchParams();
  const locale = useLocale();

  const next = useMemo(() => normalizeNext(sp.get("next"), locale), [sp, locale]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/${locale}/login`);
      return;
    }

    if (user.isAnonymous) {
      const target = `/${locale}/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      router.replace(`/${locale}/login?next=${encodeURIComponent(target)}`);
      return;
    }

    if (!profile) return;

    const onboardingComplete = profile.onboardingComplete === true;
    const role2 = normalizeRole(profile.role);

    if (!role2 || !onboardingComplete) {
      const url = `/${locale}/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      router.replace(url);
      return;
    }

    // auto-migrate gammel rolle -> ny 2-rolle (uten teacherStatus!)
    if (profile.role !== role2 || profile.onboardingComplete !== true) {
      (async () => {
        try {
          const ref = doc(requireDb(db), "users", user.uid);
          await setDoc(
            ref,
            { role: role2, onboardingComplete: true, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch {
          // ignore
        }
      })();
    }

    // kun bruk next hvis den matcher rollen
    if (next && nextMatchesRole(next, role2, locale)) {
      router.replace(next);
      return;
    }

    const home = role2 === "teacher" ? `/${locale}/teacher` : `/${locale}/student`;
    router.replace(home);
  }, [loading, user, profile, router, locale, next]);

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, opacity: 0.8 }}>
      Redirecting…
    </main>
  );
}