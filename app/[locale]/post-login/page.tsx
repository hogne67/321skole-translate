// app/[locale]/post-login/page.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { recordUserLogin } from "@/lib/userProfile";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { listMySpaceIds } from "@/lib/spaceMembership";
import { readGuestRole, saveGuestRole } from "@/lib/guestRole";
import { readLastStudentSpaceId } from "@/lib/studentLastSpace";

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

function isOpenAppPath(path: string, locale: string): boolean {
  return (
    path === `/${locale}/321lessons` ||
    path.startsWith(`/${locale}/lesson/`) ||
    path === `/${locale}/join` ||
    path.startsWith(`/${locale}/join?`)
  );
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

  const withLocale = /^\/(en|nb|no|pt)(\/|$)/.test(path) ? rebuilt : `/${locale}${rebuilt}`;

  const mapped =
    withLocale.startsWith(`/${locale}/content`)
      ? `/${locale}/teacher`
      : withLocale.startsWith(`/${locale}/review`)
        ? `/${locale}/teacher`
        : withLocale.startsWith(`/${locale}/users`)
          ? `/${locale}/teacher`
          : withLocale;

  const allowed =
    mapped.startsWith(`/${locale}/teacher`) ||
    mapped.startsWith(`/${locale}/student`) ||
    mapped.startsWith(`/${locale}/parent`) ||
    isOpenAppPath(path, locale);

  return allowed ? mapped : null;
}

function nextMatchesRole(next: string, role: AppRole, locale: string): boolean {
  if (isOpenAppPath(next, locale)) return true;
  if (role === "teacher") return next.startsWith(`/${locale}/teacher`);
  if (role === "parent") return next.startsWith(`/${locale}/parent`);
  return next.startsWith(`/${locale}/student`);
}

function isGuestPreviewPath(next: string, role: "teacher" | "parent", locale: string): boolean {
  const clean = next.replace(/\/+$/, "");

  if (role === "teacher") {
    return (
      clean === `/${locale}/teacher` ||
      clean === `/${locale}/teacher/spaces` ||
      clean === `/${locale}/teacher/board` ||
      clean === `/${locale}/teacher/writing`
    );
  }

  return clean === `/${locale}/parent` || clean === `/${locale}/parent/spaces`;
}

export default function PostLoginPage() {
  const { user, profile, loading } = useUserProfile();
  const loginRecordedRef = useRef(false);
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
      if (next && isGuestPreviewPath(next, "teacher", locale)) {
        saveGuestRole("teacher");
        router.replace(next);
        return;
      }

      if (next && isGuestPreviewPath(next, "parent", locale)) {
        saveGuestRole("parent");
        router.replace(next);
        return;
      }

      if (next && nextMatchesRole(next, "student", locale)) {
        saveGuestRole("student");
        router.replace(next);
        return;
      }

      const guestRole = readGuestRole();
      if (guestRole === "teacher" || guestRole === "parent") {
        router.replace(`/${locale}/${guestRole}`);
        return;
      }

      const rememberedSpaceId = readLastStudentSpaceId();
      if (rememberedSpaceId) {
        router.replace(`/${locale}/student/spaces/${rememberedSpaceId}`);
        return;
      }

      let cancelled = false;

      (async () => {
        try {
          const ids = await listMySpaceIds(requireDb(db), user.uid);
          if (cancelled) return;
          router.replace(ids[0] ? `/${locale}/student/spaces/${ids[0]}` : `/${locale}/student`);
        } catch {
          if (!cancelled) router.replace(`/${locale}/student`);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (!profile) return;

    if (!loginRecordedRef.current) {
      loginRecordedRef.current = true;
      recordUserLogin(user).catch((err) => {
        console.warn("record login failed", err);
      });
    }

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
