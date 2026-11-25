"use client";

import { MessageCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ParentFollowUpData } from "@/lib/parentFeedback";

export default function ParentFollowUp({
  data,
  retry,
}: {
  data: ParentFollowUpData | "error" | null;
  retry: () => void;
}) {
  const t = useTranslations("dashboardPage.followUp");
  const format = useFormatter();
  if (data && data !== "error" && data.roomCount === 0) return null;

  return (
    <section aria-labelledby="parent-follow-up" className="mb-4 rounded-3xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6">
      <h2 id="parent-follow-up" className="m-0 flex items-center gap-3 text-xl font-bold text-amber-950">
        <MessageCircle size={22} aria-hidden="true" />
        {t("title")}
      </h2>
      {data === "error" ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          <p role="status" className="m-0 text-sm text-slate-700">{t("failed")}</p>
          <button type="button" onClick={retry} className="min-h-11 text-sm font-semibold text-amber-950 underline underline-offset-4">
            {t("retry")}
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="mb-0 mt-2 text-sm text-slate-700">{t("loading")}</p>
      ) : data.pending.length === 0 ? (
        <p className="mb-0 mt-2 text-sm text-slate-700">{t("empty")}</p>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-2 p-0">
          {data.pending.map(({ spaceId, spaceTitle, assignmentId, title, submittedAt }) => {
            const assignmentTitle = title ?? t("assignment");
            const roomTitle = spaceTitle ?? t("room");
            return (
              <li key={spaceId + "/" + assignmentId} className="flex min-w-0 flex-col gap-2 rounded-xl border border-amber-100 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <h3 className="m-0 break-words text-base font-bold text-slate-950">{assignmentTitle}</h3>
                  <p className="mb-0 mt-0.5 break-words text-sm text-slate-600">
                    {roomTitle}
                    {submittedAt > 0 ? " · " + t("submitted", {
                      date: format.dateTime(new Date(submittedAt), { dateStyle: "medium", timeStyle: "short" }),
                    }) : ""}
                  </p>
                </div>
                <Link
                  href={`/parent/spaces/${encodeURIComponent(spaceId)}/assignments/${encodeURIComponent(assignmentId)}#parent-review`}
                  aria-label={t("respondTo", { assignment: assignmentTitle, room: roomTitle })}
                  className="inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950 no-underline hover:bg-amber-200 sm:shrink-0 sm:self-center"
                >
                  {t("respond")}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
