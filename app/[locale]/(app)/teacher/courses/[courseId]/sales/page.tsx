"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AcademyGate } from "../../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  calculateCoursePayout,
  calculateCoursePayoutReleasePolicy,
} from "@/lib/courses/commerce";
import {
  defaultCourseTaxProfile,
  type Course,
  type CourseSalesSettings,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "../CourseWorkspaceNav";
import { fetchTeacherCourse } from "../courseClient";

type ConnectStatus = {
  connected: boolean;
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
};

export default function CourseSalesPage() {
  return (
    <AcademyGate>
      <CourseSalesContent />
    </AcademyGate>
  );
}

function CourseSalesContent() {
  const locale = useLocale();
  const t = useTranslations("academy.sales");
  const router = useRouter();
  const params = useParams<{ courseId?: string }>();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const { user } = useUserProfile();
  const [course, setCourse] = useState<Course | null>(null);
  const [sales, setSales] = useState<CourseSalesSettings>({
    saleStatus: "not_for_sale",
    currency: "NOK",
    priceAmountOre: 0,
    taxProfile: defaultCourseTaxProfile(),
  });
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [connectMessage, setConnectMessage] = useState("");
  const [error, setError] = useState("");

  const payoutPreview = useMemo(() => {
    if (!course || sales.priceAmountOre <= 0) return null;
    return calculateCoursePayout({
      grossAmountOre: sales.priceAmountOre,
      numberOfSessions: course.numberOfSessions,
      numberOfWeeks: course.numberOfWeeks,
      participantHasActiveLicense: false,
    });
  }, [course, sales.priceAmountOre]);

  const payoutReleasePreview = useMemo(() => {
    if (!payoutPreview) return null;
    return calculateCoursePayoutReleasePolicy(payoutPreview.instructorAmountOre);
  }, [payoutPreview]);

  const saleReady =
    sales.saleStatus === "ready" &&
    sales.priceAmountOre > 0 &&
    sales.taxProfile.deliveryType === "live_instruction" &&
    sales.taxProfile.vatTreatment === "vat_exempt_education" &&
    connectStatus?.connected === true;

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!user || !courseId) {
        setError(t("errors.notFound"));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) {
          setCourse(loadedCourse);
          setSales(loadedCourse.sales);
        }
      } catch (err) {
        console.error("Failed to load sales page", err);
        if (!cancelled) setError(t("errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, t, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadConnectStatus() {
      if (!user) return;

      try {
        setConnectLoading(true);
        const token = await user.getIdToken();
        const res = await fetch("/api/teacher/connect/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as ConnectStatus & { error?: string };
        if (!res.ok) throw new Error(data.error || t("errors.connectStatusFailed"));
        if (!cancelled) setConnectStatus(data);
      } catch (err) {
        console.error("Failed to load Connect status", err);
        if (!cancelled) setConnectMessage(t("errors.connectStatusFailed"));
      } finally {
        if (!cancelled) setConnectLoading(false);
      }
    }

    void loadConnectStatus();

    return () => {
      cancelled = true;
    };
  }, [t, user]);

  function updateSales<K extends keyof CourseSalesSettings>(key: K, value: CourseSalesSettings[K]) {
    setSales((prev) => ({ ...prev, [key]: value }));
  }

  function formatOre(amountOre: number) {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: sales.currency || "NOK",
    }).format(amountOre / 100);
  }

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return t("errors.generic");
  }

  async function startConnectOnboarding() {
    if (!user || connectLoading) return;

    try {
      setConnectLoading(true);
      setConnectMessage("");
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/connect/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || t("errors.connectStartFailed"));
      window.location.href = data.url;
    } catch (err) {
      console.error("Failed to start Connect onboarding", err);
      setConnectMessage(getErrorMessage(err) || t("errors.connectStartFailed"));
      setConnectLoading(false);
    }
  }

  async function saveSales(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !course || saving) return;

    try {
      setSaving(true);
      setMessage("");
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${encodeURIComponent(course.id)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...course,
          sales,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save sales setup");

      const refreshed = await fetchTeacherCourse(user, course.id);
      setCourse(refreshed);
      setSales(refreshed.sales);
      setMessage(t("messages.saved"));
    } catch (err) {
      console.error("Failed to save sales setup", err);
      setError(t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm text-slate-500">{t("loading")}</div>;
  }

  if (!course) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || t("errors.notFound")}</div>;
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-5">
      <CourseWorkspaceNav
        locale={locale}
        courseId={course.id}
        title={course.title}
        status={course.status}
        active="sales"
      />

      <form onSubmit={saveSales} className="grid gap-5">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <h1 className="m-0 text-2xl font-black text-slate-950">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {t("intro")}
          </p>
        </section>

        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div> : null}

        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-black text-emerald-950">{t("payoutEstimate.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
                {t("payoutEstimate.intro")}
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-900">
              {saleReady ? t("readiness.checkoutReady") : t("readiness.notReady")}
            </span>
          </div>
          {payoutPreview ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MiniPayoutStat label={t("payoutEstimate.instructor")} value={formatOre(payoutPreview.instructorAmountOre)} />
              <MiniPayoutStat
                label={t("payoutEstimate.firstRelease")}
                value={formatOre(payoutReleasePreview?.firstReleaseAmountOre ?? 0)}
              />
              <MiniPayoutStat
                label={t("payoutEstimate.holdback")}
                value={formatOre(payoutReleasePreview?.holdbackAmountOre ?? 0)}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-4 text-sm font-semibold text-emerald-900">
              {t("payoutEstimate.noPrice")}
            </div>
          )}
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("checkout.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("checkout.intro")}
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h3 className="m-0 text-base font-extrabold text-slate-950">{t("checkout.stripeTitle")}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("checkout.stripeIntro")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className={`rounded-full border px-2.5 py-1 ${
                  connectStatus?.connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}>
                  {connectLoading
                    ? t("readiness.checking")
                    : connectStatus?.connected
                      ? t("readiness.connected")
                      : connectStatus?.accountId
                        ? t("readiness.incomplete")
                        : t("readiness.notConnected")}
                </span>
                {connectStatus?.accountId ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                    {connectStatus.accountId}
                  </span>
                ) : null}
              </div>
              {connectMessage ? <div className="mt-2 text-sm font-semibold text-amber-800">{connectMessage}</div> : null}
            </div>
            <Button
              type="button"
              variant={connectStatus?.connected ? "secondary" : "primary"}
              disabled={connectLoading}
              onClick={() => void startConnectOnboarding()}
            >
              {connectStatus?.connected
                ? t("checkout.openStripe")
                : connectStatus?.accountId
                  ? t("checkout.continueSetup")
                  : t("checkout.connectStripe")}
            </Button>
          </div>

          <div
            className={`rounded-lg border p-4 text-sm font-semibold ${
              saleReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {saleReady
              ? t("checkout.readyText")
              : t("checkout.notReadyText")}
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("price.title")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("price.saleStatus")}>
              <select
                value={sales.saleStatus}
                onChange={(event) =>
                  updateSales(
                    "saleStatus",
                    event.target.value === "ready" || event.target.value === "needs_review"
                      ? event.target.value
                      : "not_for_sale"
                  )
                }
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="not_for_sale">{t("price.notForSale")}</option>
                <option value="ready">{t("price.readyWhenConnected")}</option>
                <option value="needs_review">{t("price.needsReview")}</option>
              </select>
            </Field>
            <Field label={t("price.currency")}>
              <Input
                value={sales.currency}
                onChange={(event) => updateSales("currency", event.target.value.toUpperCase().slice(0, 3))}
                placeholder="NOK"
              />
            </Field>
            <Field label={t("price.price")}>
              <Input
                type="number"
                min="0"
                step="1"
                value={sales.priceAmountOre ? String(sales.priceAmountOre / 100) : ""}
                onChange={(event) =>
                  updateSales("priceAmountOre", Math.max(0, Math.round(Number(event.target.value || 0) * 100)))
                }
                placeholder="0"
              />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div>
              <h2 className="m-0 text-lg font-extrabold text-emerald-950">{t("tax.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
              {t("tax.intro")}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("tax.deliveryType")}>
              <select
                value={sales.taxProfile.deliveryType}
                onChange={(event) => {
                  const deliveryType =
                    event.target.value === "recorded_digital_content" ||
                    event.target.value === "mixed" ||
                    event.target.value === "needs_review"
                      ? event.target.value
                      : "live_instruction";
                  setSales((prev) => ({
                    ...prev,
                    saleStatus:
                      deliveryType === "live_instruction" && prev.saleStatus !== "needs_review"
                        ? prev.saleStatus
                        : "needs_review",
                    taxProfile: {
                      ...prev.taxProfile,
                      deliveryType,
                      vatTreatment:
                        deliveryType === "live_instruction"
                          ? "vat_exempt_education"
                          : deliveryType === "recorded_digital_content"
                            ? "vatable_digital_service"
                            : "needs_review",
                    },
                  }));
                }}
                className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="live_instruction">{t("tax.live")}</option>
                <option value="mixed">{t("tax.mixed")}</option>
                <option value="recorded_digital_content">{t("tax.recorded")}</option>
                <option value="needs_review">{t("tax.needsReview")}</option>
              </select>
            </Field>
            <Field label={t("tax.vatTreatment")}>
              <select
                value={sales.taxProfile.vatTreatment}
                onChange={(event) =>
                  setSales((prev) => ({
                    ...prev,
                    taxProfile: {
                      ...prev.taxProfile,
                      vatTreatment:
                        event.target.value === "vatable_digital_service" ||
                        event.target.value === "needs_review"
                          ? event.target.value
                          : "vat_exempt_education",
                    },
                  }))
                }
                className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <option value="vat_exempt_education">{t("tax.vatExempt")}</option>
                <option value="vatable_digital_service">{t("tax.vatableDigital")}</option>
                <option value="needs_review">{t("tax.needsReview")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("tax.vatNote")}>
            <Textarea
              value={sales.taxProfile.vatNote}
              onChange={(event) =>
                setSales((prev) => ({
                  ...prev,
                  taxProfile: { ...prev.taxProfile, vatNote: event.target.value },
                }))
              }
              rows={3}
            />
          </Field>
        </section>

        {payoutPreview ? (
          <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
            <div>
              <h2 className="m-0 text-lg font-extrabold text-slate-950">{t("payoutPreview.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("payoutPreview.intro")}
              </p>
            </div>
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
              <SummaryLine label={t("payoutPreview.gross")} value={formatOre(payoutPreview.grossAmountOre)} />
              <SummaryLine label={t("payoutPreview.paymentFee")} value={formatOre(payoutPreview.paymentFeeOre)} />
              <SummaryLine label={t("payoutPreview.dailyAi")} value={formatOre(payoutPreview.dailyAiFeeOre)} />
              <SummaryLine label={t("payoutPreview.license")} value={formatOre(payoutPreview.licenseFeeOre)} />
              <SummaryLine label={t("payoutPreview.netRevenue")} value={formatOre(payoutPreview.netRevenueOre)} />
              <SummaryLine label={t("payoutPreview.instructor")} value={formatOre(payoutPreview.instructorAmountOre)} />
              <SummaryLine label={t("payoutPreview.platformMargin")} value={formatOre(payoutPreview.platformMarginOre)} />
              <SummaryLine label={t("payoutPreview.reserve")} value={formatOre(payoutPreview.applicationFeeAmountOre)} />
              {payoutReleasePreview ? (
                <>
                  <SummaryLine label={t("payoutPreview.firstPayout")} value={formatOre(payoutReleasePreview.firstReleaseAmountOre)} />
                  <SummaryLine label={t("payoutPreview.held")} value={formatOre(payoutReleasePreview.holdbackAmountOre)} />
                </>
              ) : null}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900 md:col-span-2">
                {t("payoutPreview.holdNotice")}
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/${course.id}`)}>
            {t("actions.backToDashboard")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="font-bold text-slate-600">{label}</span>
      <span className="font-black text-slate-950">{value}</span>
    </div>
  );
}

function MiniPayoutStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-4">
      <div className="text-xs font-black uppercase tracking-wide text-emerald-700">{label}</div>
      <div className="mt-2 text-xl font-black text-emerald-950">{value}</div>
    </div>
  );
}
