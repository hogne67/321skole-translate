"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function SchoolWelcome({ schoolName, activeTeacherCount, pendingTeacherInviteCount, teacherSeatLimit, seatsRemaining }: {
  schoolName?: string; activeTeacherCount: number; pendingTeacherInviteCount: number; teacherSeatLimit: number; seatsRemaining: number;
}) {
  const t = useTranslations("schoolAdmin");
  const locale = useLocale();
  return <>
              <section className="schoolWelcome">
                <div className="schoolEyebrow">{t("welcome.eyebrow")}</div>
                <h1>{t(activeTeacherCount === 0 ? "welcome.newTitle" : "welcome.returnTitle", { school: schoolName || t("overview.titleFallback") })}</h1>
                <p>{t(activeTeacherCount === 0 ? "welcome.newIntro" : "welcome.returnIntro")}</p>
                <div className="schoolActions">
                  <Link className="schoolPrimaryAction" href={`/${locale}/school/teachers#invite`}>{t(pendingTeacherInviteCount > 0 ? "welcome.inviteMore" : "welcome.inviteFirst")} <span aria-hidden="true">→</span></Link>
                  <Link className="schoolTextAction" href={`/${locale}/school/teachers`}>{t("overview.viewTeachers")}</Link>
                </div>
                <div className="schoolSeatSummary">
                  <span>{t("overview.seatUsage", { used: activeTeacherCount, limit: teacherSeatLimit })}</span>
                  {pendingTeacherInviteCount > 0 ? <Link className="schoolTextAction" style={{ padding: 0 }} href={`/${locale}/school/teachers#invitations`}>{t("overview.pendingSeatUsage", { count: pendingTeacherInviteCount })}</Link> : null}
                </div>
              </section>
              <section className="schoolGettingStarted">
                <h2>{t(activeTeacherCount === 0 ? "welcome.stepsTitle" : "welcome.dailyTitle")}</h2>
                <p>{t("welcome.stepsIntro")}</p>
                <ol className="schoolSteps">
                  {([ ["invite", "teachers#invite"], ["follow", "teachers#invitations"], ["rooms", "spaces"] ] as const).map(([step, path], index) => (
                    <li key={step}>
                      <span className="schoolStepNumber" aria-hidden="true">{index + 1}</span>
                      <h3>{t(`welcome.${step}Title`)}</h3>
                      <p>{t(`welcome.${step}Text`)}</p>
                      <Link href={`/${locale}/school/${path}`}>{t(`welcome.${step}Link`)}</Link>
                    </li>
                  ))}
                </ol>
              </section>
              <div className="schoolQuickGrid">
                <section className="schoolQuickCard">
                  <h2>{t("welcome.capacityTitle")}</h2>
                  <p>{t("welcome.capacityText", { count: seatsRemaining })}</p>
                  <Link className="schoolTextAction" href={`/${locale}/school/license`}>{t("welcome.licenseLink")}</Link>
                </section>
                <section className="schoolQuickCard">
                  <h2>{t("welcome.statisticsTitle")}</h2>
                  <p>{t("welcome.statisticsText")}</p>
                  <Link className="schoolTextAction" href={`/${locale}/school/statistics`}>{t("welcome.statisticsLink")}</Link>
                </section>
              </div>

</>;
}
