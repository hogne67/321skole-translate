// app/[locale]/(app)/student/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Timestamp,
  type DocumentData,
} from "firebase/firestore";

import { DashboardIntro } from "@/components/DashboardIntro";
import { useLocale, useTranslations } from "next-intl";

type MyLessonRow = {
  id: string; // submissionId (uid_lessonId)
  publishedLessonId?: string;
  status?: "draft" | "submitted";

  // cached (may be missing for older submissions)
  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type PublishedMeta = {
  title?: string;
  level?: string;
  language?: string;
};

type SubmissionDoc = {
  uid?: string;
  publishedLessonId?: string;
  status?: "draft" | "submitted";
  lessonTitle?: string;
  lessonLevel?: string;
  lessonLanguage?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type PublishedLessonDoc = {
  title?: string;
  level?: string;
  language?: string;
  isActive?: boolean;
};

function isPermissionDenied(e: unknown) {
  const err = e as { code?: unknown; message?: unknown };
  const code = String(err?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("permission_denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

function tsToMs(ts?: Timestamp): number {
  if (!ts) return 0;
  return ts.toMillis();
}

function asSubmissionDoc(data: DocumentData): SubmissionDoc {
  const d = data as Partial<SubmissionDoc>;
  return {
    uid: typeof d.uid === "string" ? d.uid : undefined,
    publishedLessonId:
      typeof d.publishedLessonId === "string" ? d.publishedLessonId : undefined,
    status: d.status === "draft" || d.status === "submitted" ? d.status : undefined,
    lessonTitle: typeof d.lessonTitle === "string" ? d.lessonTitle : undefined,
    lessonLevel: typeof d.lessonLevel === "string" ? d.lessonLevel : undefined,
    lessonLanguage: typeof d.lessonLanguage === "string" ? d.lessonLanguage : undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function asPublishedLessonDoc(data: DocumentData): PublishedLessonDoc {
  const d = data as Partial<PublishedLessonDoc>;
  return {
    title: typeof d.title === "string" ? d.title : undefined,
    level: typeof d.level === "string" ? d.level : undefined,
    language: typeof d.language === "string" ? d.language : undefined,
    isActive: typeof d.isActive === "boolean" ? d.isActive : undefined,
  };
}

export default function StudentDashboard() {
  const locale = useLocale();
  const t = useTranslations("student.dashboard");
  const tCommon = useTranslations("common");

  const [items, setItems] = useState<MyLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ✅ Trengs for DashboardIntro (gjest vs innlogget)
  const [isAnon, setIsAnon] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErr("");

      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;

        // ✅ Lagre anon-status så introen kan vise riktig tekst
        setIsAnon(Boolean(user.isAnonymous));

        // 1) Hent mine submissions
        const qMine = query(collection(db, "submissions"), where("uid", "==", user.uid));
        const snap = await getDocs(qMine);
        if (!alive) return;

        let rows: MyLessonRow[] = snap.docs.map((d) => {
          const data = asSubmissionDoc(d.data());
          return {
            id: d.id,
            publishedLessonId: data.publishedLessonId,
            status: data.status,
            lessonTitle: data.lessonTitle,
            lessonLevel: data.lessonLevel,
            lessonLanguage: data.lessonLanguage,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        // 2) Fjern ødelagte submissions (mangler publishedLessonId)
        rows = rows.filter(
          (r) => typeof r.publishedLessonId === "string" && r.publishedLessonId.trim().length > 0
        );

        // 3) Sorter nyeste først
        rows.sort((a, b) => {
          const ta = tsToMs(a.updatedAt) || tsToMs(a.createdAt);
          const tb = tsToMs(b.updatedAt) || tsToMs(b.createdAt);
          return tb - ta;
        });

        // 4) Fyll inn metadata (kun for visning)
        const needMeta = rows.filter((r) => r.publishedLessonId && !r.lessonTitle);

        if (needMeta.length > 0) {
          const metas = await Promise.all(
            needMeta.map(async (r) => {
              const id = r.publishedLessonId!;
              try {
                const ps = await getDoc(doc(db, "published_lessons", id));
                if (!ps.exists()) return null;

                const data = asPublishedLessonDoc(ps.data());
                const meta: PublishedMeta = {
                  title: data.title ?? t("fallback.lessonTitle"),
                  level: data.level,
                  language: data.language,
                };

                return { id, meta };
              } catch {
                // Avpublisert / rules kan blokkere – ignorer
                return null;
              }
            })
          );

          const metaMap = new Map<string, PublishedMeta>();
          metas
            .filter((m): m is { id: string; meta: PublishedMeta } => m !== null)
            .forEach((m) => {
              metaMap.set(m.id, m.meta);
            });

          rows = rows.map((r) => {
            if (!r.lessonTitle) {
              const m = metaMap.get(r.publishedLessonId!);
              if (m) {
                return {
                  ...r,
                  lessonTitle: m.title,
                  lessonLevel: m.level,
                  lessonLanguage: m.language,
                };
              }
            }
            return r;
          });
        }

        if (!alive) return;
        setItems(rows);
      } catch (e: unknown) {
        if (!alive) return;

        if (isPermissionDenied(e)) {
          setErr(t("errors.permissionDenied"));
        } else {
          const msg = (e as { message?: unknown })?.message;
          setErr(typeof msg === "string" ? msg : t("errors.generic"));
        }
        setItems([]);
      }

      if (alive) setLoading(false);
    };

    void run();

    return () => {
      alive = false;
    };
    // ✅ Ikke bruk `t` som dependency (kan endre referanse). Locale er stabil trigger.
  }, [locale]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-3">
      <DashboardIntro userIsAnon={isAnon} />

      <hr className="my-4" />

      {err && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-sm font-extrabold">{tCommon("error")}</div>
          <div className="mt-1 text-sm">{err}</div>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm opacity-70">{tCommon("loading")}</p>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-background p-4">
          <p className="text-sm">{t("empty.title")}</p>
          <Link
            className="mt-2 inline-block text-sm font-extrabold underline"
            href={`/${locale}/321lessons`}
          >
            {t("empty.cta")}
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((l) => (
            <Link
              key={l.id}
              href={`/${locale}/student/lesson/${l.publishedLessonId}`}
              className="block rounded-2xl border bg-background p-4 no-underline"
            >
              <div className="text-base font-extrabold text-foreground">
                {l.lessonTitle || t("fallback.lessonTitle")}
              </div>

              <div className="mt-1 text-xs opacity-70">
                {l.lessonLevel ? `${t("meta.level")}: ${l.lessonLevel}` : null}
                {l.lessonLanguage ? ` • ${String(l.lessonLanguage).toUpperCase()}` : null}
                {l.status ? ` • ${t("meta.status")}: ${l.status}` : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}