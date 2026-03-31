// app/[locale]/post-login/page.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type AppRole = "student" | "teacher" | "parent";

function normalizeRole(raw: unknown): AppRole | null {
  const r = String(raw ?? "").toLowerCase();

  if (r === "teacher") return "teacher";
  if (r === "student") return "student";
  if (r === "parent") return "parent";

  if (
    r === "admin" ||
    r === "creator" ||
    r === "content" ||
    r === "review" ||
    r === "reviewer"
  ) {
    return "teacher";
  }

  return null;
}

function homeForRole(role: AppRole, locale: string): string {
  if (role === "teacher") return `/${locale}/teacher`;
  if (role === "parent") return `/${locale}/parent`;
  return `/${locale}/student`;
}

function normalizeNext(raw: string | null, locale: string): string | null {
  if (!raw) return null;

  let next = raw;
  try {
    next = decodeURIComponent(raw);
  } catch {
    // ignore bad encoding
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
    withLocale.startsWith(`/${locale}/content`)
      ? `/${locale}/teacher`
      : withLocale.startsWith(`/${locale}/review`)
        ? `/${locale}/teacher`
        : withLocale.startsWith(`/${locale}/users`)
          ? `/${locale}/teacher`
          : withLocale.startsWith(`/${locale}/321lessons`)
            ? `/${locale}/teacher`
            : withLocale;

  const allowed =
    mapped.startsWith(`/${locale}/teacher`) ||
    mapped.startsWith(`/${locale}/student`) ||
    mapped.startsWith(`/${locale}/parent`);

  return allowed ? mapped : null;
}

function nextMatchesRole(next: string, role: AppRole, locale: string): boolean {
  if (role === "teacher") return next.startsWith(`/${locale}/teacher`);
  if (role === "parent") return next.startsWith(`/${locale}/parent`);
  return next.startsWith(`/${locale}/student`);
}

export default function PostLoginPage() {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();
  const sp = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("postLogin");

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
    const role = normalizeRole(profile.role);

    if (!role || !onboardingComplete) {
      const url = `/${locale}/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      router.replace(url);
      return;
    }

    if (profile.role !== role || profile.onboardingComplete !== true) {
      (async () => {
        try {
          const ref = doc(requireDb(db), "users", user.uid);
          await setDoc(
            ref,
            {
              role,
              onboardingComplete: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // ignore
        }
      })();
    }

    if (next && nextMatchesRole(next, role, locale)) {
      router.replace(next);
      return;
    }

    router.replace(homeForRole(role, locale));
  }, [loading, user, profile, router, locale, next]);

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, opacity: 0.8 }}>
      {t("redirecting")}
    </main>
  );
}