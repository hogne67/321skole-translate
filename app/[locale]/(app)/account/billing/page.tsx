"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLocale, useTranslations } from "next-intl";
import { getEffectivePlan, type PlanKey } from "@/lib/featureAccess";

type BillingPlan = "free" | "basic" | "plus" | "pro";
type BillingRole = "student" | "teacher" | "parent";
type BillingStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

type BillingData = {
  provider?: string | null;
  roleProduct?: BillingRole | null;
  plan?: BillingPlan | null;
  status?: BillingStatus | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type UserDocData = {
  role?: BillingRole;
  mode?: BillingRole;
  plan?: BillingPlan;
  billing?: BillingData;
  roles?: Record<string, boolean>;
  org?: { role?: BillingRole };
  partnerAccess?: boolean;
  partnerStatus?: string | null;
  schoolId?: string | null;
  schoolRole?: string | null;
  schoolStatus?: string | null;
};

type CheckoutPlan = "basic" | "plus" | "pro";

type BillingPrice = {
  plan: CheckoutPlan;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  active: boolean;
};

type CheckoutMarket = "no" | "br" | "uk";

function resolveRole(data: UserDocData | null): BillingRole | null {
  if (!data) return null;

  if (data.role === "student" || data.role === "teacher" || data.role === "parent") {
    return data.role;
  }

  if (data.mode === "student" || data.mode === "teacher" || data.mode === "parent") {
    return data.mode;
  }

  if (
    data.org?.role === "student" ||
    data.org?.role === "teacher" ||
    data.org?.role === "parent"
  ) {
    return data.org.role;
  }

  if (data.roles?.teacher) return "teacher";
  if (data.roles?.parent) return "parent";
  if (data.roles?.student) return "student";

  return null;
}

function allowedPlansForRole(role: BillingRole | null): CheckoutPlan[] {
  if (role === "teacher") return ["basic", "plus", "pro"];
  if (role === "student") return ["pro"];
  if (role === "parent") return ["pro"];
  return [];
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isActiveSubscription(status: BillingStatus | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

function hasPaymentIssue(status: BillingStatus | null | undefined): boolean {
  return status === "past_due" || status === "unpaid" || status === "incomplete";
}

function shouldUseStripePrice(locale: string, currency: string | null | undefined): boolean {
  const normalizedCurrency = String(currency ?? "").toLowerCase();

  if (locale === "pt") return normalizedCurrency === "brl";

  return Boolean(normalizedCurrency);
}

function marketFromLocale(locale: string): CheckoutMarket {
  if (locale === "pt") return "br";
  if (locale === "en") return "uk";
  return "no";
}

function checkoutLocaleFromLocale(locale: string): string {
  if (locale === "pt") return "pt-BR";
  if (locale === "nb") return "nb";
  return "en-GB";
}

function getStatusTone(status: BillingStatus | null | undefined): {
  background: string;
  border: string;
  color: string;
} {
  switch (status) {
    case "active":
      return {
        background: "#ecfdf5",
        border: "#a7f3d0",
        color: "#047857",
      };
    case "trialing":
      return {
        background: "#eff6ff",
        border: "#bfdbfe",
        color: "#1d4ed8",
      };
    case "past_due":
    case "unpaid":
    case "incomplete":
      return {
        background: "#fff7ed",
        border: "#fdba74",
        color: "#c2410c",
      };
    case "canceled":
    case "inactive":
    default:
      return {
        background: "#f8fafc",
        border: "#cbd5e1",
        color: "#475569",
      };
  }
}

export default function BillingPage() {
  const t = useTranslations("accountBilling");
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [uid, setUid] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserDocData | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<CheckoutPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stripePrices, setStripePrices] = useState<BillingPrice[]>([]);
  const [checkoutSyncAttempted, setCheckoutSyncAttempted] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) {
      setUserData(null);
      setStripePrices([]);
      return;
    }

    const ref = doc(db, "users", uid);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.data() as UserDocData | undefined;
      setUserData(data ?? null);
    });

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      if (!uid) {
        setStripePrices([]);
        return;
      }

      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/billing/prices?market=${marketFromLocale(locale)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = (await res.json().catch(() => ({}))) as {
          prices?: BillingPrice[];
        };

        if (!cancelled && res.ok && Array.isArray(data.prices)) {
          setStripePrices(data.prices.filter((price) => price.active));
        }
      } catch {
        if (!cancelled) setStripePrices([]);
      }
    }

    void loadPrices();

    return () => {
      cancelled = true;
    };
  }, [uid, locale]);

  useEffect(() => {
    async function syncCheckoutReturn() {
      if (!uid || checkoutSyncAttempted) return;

      const checkout = searchParams.get("checkout");
      const sessionId = searchParams.get("session_id");
      if (checkout !== "success" || !sessionId) return;

      try {
        setCheckoutSyncAttempted(true);
        setMessage(t("statusBox.syncingCheckout"));

        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) throw new Error("Missing login");

        const token = await user.getIdToken();
        const response = await fetch("/api/billing/sync-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) throw new Error("Checkout sync failed");
        setMessage(t("statusBox.checkoutSynced"));
      } catch {
        setMessage(t("errors.checkoutSyncFailed"));
      }
    }

    void syncCheckoutReturn();
  }, [checkoutSyncAttempted, searchParams, t, uid]);

  const role = useMemo(() => resolveRole(userData), [userData]);
  const allowedPlans = useMemo(() => allowedPlansForRole(role), [role]);

  const billing = userData?.billing ?? null;
  const status = billing?.status ?? "inactive";
  const statusTone = getStatusTone(status);
  const hasActivePaidSubscription = isActiveSubscription(status);
  const hasActivePartnerAccess =
    userData?.partnerAccess === true && userData?.partnerStatus === "active";
  const hasActiveSchoolAccess = Boolean(
    userData?.schoolId &&
      userData?.schoolStatus === "active" &&
      (userData?.schoolRole === "school_teacher" || userData?.schoolRole === "school_admin")
  );
  const isAdmin = userData?.roles?.admin === true;
  const effectivePlan: PlanKey = getEffectivePlan({
    plan: userData?.plan ?? null,
    billing,
    partnerAccess: userData?.partnerAccess ?? null,
    partnerStatus: userData?.partnerStatus ?? null,
    schoolId: userData?.schoolId ?? null,
    schoolRole: userData?.schoolRole ?? null,
    schoolStatus: userData?.schoolStatus ?? null,
  });

  function labelForPlan(plan: BillingPlan | null | undefined) {
    return t(`plans.${plan ?? "free"}`);
  }

  function labelForRole(roleValue: BillingRole | null) {
    if (!roleValue) return t("common.empty");
    return t(`roles.${roleValue}`);
  }

  function descriptionForPlan(plan: CheckoutPlan) {
    if (plan === "pro" && (role === "student" || role === "parent")) {
      return t("plans.proDescriptionStudentParent");
    }

    return t(`plans.${plan}Description`);
  }

  function priceForPlan(plan: CheckoutPlan) {
    const stripePrice = stripePrices.find((price) => price.plan === plan);
    if (
      stripePrice?.currency &&
      typeof stripePrice.unitAmount === "number" &&
      shouldUseStripePrice(locale, stripePrice.currency)
    ) {
      const amount = stripePrice.unitAmount / 100;
      const formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: stripePrice.currency.toUpperCase(),
      }).format(amount);

      return `${formatted} / ${intervalLabel(stripePrice.interval)}`;
    }

    if (plan === "pro" && (role === "student" || role === "parent")) {
      return t("prices.proStudentParent");
    }

    return t(`prices.${plan}`);
  }

  function intervalLabel(interval: string | null) {
    if (interval === "year") {
      if (locale === "pt") return "ano";
      if (locale === "nb") return "år";
      return "yr";
    }

    if (locale === "pt") return "mês";
    if (locale === "nb") return "mnd";
    return "mo";
  }

  function labelForStatus(statusValue: BillingStatus | null | undefined) {
    return t(`statuses.${statusValue ?? "inactive"}`);
  }

  function formatDate(iso?: string | null) {
    if (!iso) return t("common.empty");

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t("common.empty");

    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  const renewalText = formatDate(billing?.currentPeriodEnd ?? null);

  function accessHeadline() {
    if (hasPaymentIssue(status)) return t("access.headlines.paymentIssue");
    if (hasActivePartnerAccess) return t("access.headlines.partner");
    if (hasActiveSchoolAccess) return t("access.headlines.school");
    if (hasActivePaidSubscription) {
      return t("access.headlines.paid", { plan: labelForPlan(billing?.plan ?? effectivePlan) });
    }
    return t("access.headlines.free", { plan: labelForPlan(effectivePlan) });
  }

  function accessLead() {
    if (hasPaymentIssue(status)) return t("access.leads.paymentIssue");
    if (hasActivePartnerAccess) return t("access.leads.partner");
    if (hasActiveSchoolAccess) return t("access.leads.school");
    if (hasActivePaidSubscription) return t("access.leads.paid");
    return t("access.leads.free");
  }

  function planHighlights(plan: CheckoutPlan): string[] {
    if (role === "teacher") {
      const values = {
        basic: { students: 30, spaces: 10, feedback: 100, generators: 30 },
        plus: { students: 100, spaces: 30, feedback: 300, generators: 100 },
        pro: { students: 300, spaces: 100, feedback: 1000, generators: 500 },
      }[plan];

      return [
        t("highlights.students", { count: values.students }),
        t("highlights.spaces", { count: values.spaces }),
        t("highlights.aiFeedback", { count: values.feedback }),
        t("highlights.premiumGenerators", { count: values.generators }),
      ];
    }

    const studentParentValues = { feedback: 100, prints: 20, generators: 30, images: 30 };
    return [
      t("highlights.aiFeedback", { count: studentParentValues.feedback }),
      t("highlights.pdfPrints", { count: studentParentValues.prints }),
      t("highlights.premiumGenerators", { count: studentParentValues.generators }),
      t("highlights.aiImages", { count: studentParentValues.images }),
    ];
  }

  async function getToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      throw new Error(t("errors.mustBeSignedIn"));
    }

    return user.getIdToken();
  }

  async function startCheckout(plan: CheckoutPlan) {
    try {
      setCheckoutLoading(plan);
      setMessage("");

      const token = await getToken();

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan,
          market: marketFromLocale(locale),
          locale: checkoutLocaleFromLocale(locale),
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const serverError = typeof data.error === "string" ? data.error : null;
        const errorCode = typeof data.errorCode === "string" ? data.errorCode : null;

        if (errorCode === "missingPrice" || errorCode === "wrongCurrency") {
          setMessage(t("errors.missingPrice"));
          return;
        }

        setMessage(
          serverError
            ? `${t("errors.checkoutFailed", { status: res.status })}: ${serverError}`
            : t("errors.checkoutFailed", { status: res.status })
        );
        return;
      }

      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
        return;
      }

      setMessage(t("errors.checkoutMissingUrl"));
    } catch (error) {
      console.error("Checkout failed:", error);
      setMessage(error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function openPortal() {
    try {
      setPortalLoading(true);
      setMessage("");

      const token = await getToken();

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        setMessage(t("errors.portalFailed", { status: res.status }));
        return;
      }

      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
        return;
      }

      setMessage(t("errors.portalMissingUrl"));
    } catch (error) {
      console.error("Portal failed:", error);
      setMessage(error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      setPortalLoading(false);
    }
  }

  function getStatusMessage() {
    if (hasActivePaidSubscription) {
      return t("statusBox.active");
    }

    if (hasPaymentIssue(status)) {
      return t("statusBox.paymentIssue");
    }

    return t("statusBox.inactive");
  }

  return (
    <main style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>{t("eyebrow")}</div>
          <h1 style={titleStyle}>{t("title")}</h1>
          <p style={subtitleStyle}>{t("subtitle")}</p>
        </div>
      </div>

      {!authReady ? (
        <div style={cardStyle}>{t("loadingAuth")}</div>
      ) : !uid ? (
        <div style={cardStyle}>{t("mustBeSignedIn")}</div>
      ) : (
        <>
          <section style={statusCardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>{t("currentStatus")}</h2>
                <p style={accessHeadlineStyle}>{accessHeadline()}</p>
                <p style={sectionLeadStyle}>{accessLead()}</p>
              </div>

              <span
                style={{
                  ...statusPillStyle,
                  background: statusTone.background,
                  border: `1px solid ${statusTone.border}`,
                  color: statusTone.color,
                }}
              >
                {labelForStatus(status)}
              </span>
            </div>

            <div style={summaryGridStyle}>
              <InfoItem
                label={t("fields.role")}
                value={labelForRole(role)}
              />
              <InfoItem label={t("fields.plan")} value={labelForPlan(effectivePlan)} />
              <InfoItem
                label={t("fields.billingStatus")}
                value={labelForStatus(status)}
              />
              <InfoItem label={t("fields.renewsOrEnds")} value={renewalText} />
            </div>

            <p style={statusNoteStyle}>{getStatusMessage()}</p>

            {billing?.customerId ? (
              <div style={actionsRowStyle}>
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  style={secondaryButtonStyle}
                >
                  {portalLoading ? t("buttons.opening") : t("buttons.manageSubscription")}
                </button>
              </div>
            ) : null}
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>{t("upgradeSection")}</h2>
                <p style={sectionLeadStyle}>
                  {role === "teacher"
                    ? t("upgradeLead.teacher")
                    : t("upgradeLead.studentParent")}
                </p>
              </div>

              <Link href={`/${locale}/pricing`} style={pricingLinkStyle}>
                {t("buttons.fullComparison")}
              </Link>
            </div>

            {allowedPlans.length === 0 ? (
              <p style={{ color: "#64748b" }}>{t("noPlansForUser")}</p>
            ) : (
              <div style={planGridStyle}>
                {allowedPlans.map((plan) => {
                  const isCurrent = effectivePlan === plan;

                  return (
                    <div
                      key={plan}
                      style={{
                        ...planCardStyle,
                        borderColor: isCurrent ? "#0f766e" : "#dbe3ea",
                        background: isCurrent ? "#f0fdfa" : "#ffffff",
                      }}
                    >
                      <div style={planCardTopStyle}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800 }}>
                            {labelForPlan(plan)}
                          </div>
                          <div style={planPriceStyle}>{priceForPlan(plan)}</div>
                        </div>

                        {isCurrent ? (
                          <span style={currentBadgeStyle}>{t("buttons.currentPlan")}</span>
                        ) : null}
                      </div>

                      <div style={planDescriptionStyle}>
                        {descriptionForPlan(plan)}
                      </div>

                      <ul style={highlightListStyle}>
                        {planHighlights(plan).map((highlight) => (
                          <li key={highlight} style={highlightItemStyle}>
                            <span aria-hidden="true" style={highlightDotStyle} />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>

                      <div style={{ marginTop: 16 }}>
                        <button
                          onClick={() => startCheckout(plan)}
                          disabled={!!checkoutLoading || isCurrent}
                          style={isCurrent ? disabledButtonStyle : primaryButtonStyle}
                        >
                          {isCurrent
                            ? t("buttons.currentPlan")
                            : checkoutLoading === plan
                              ? t("buttons.loading")
                              : t("buttons.choosePlan", { plan: labelForPlan(plan) })}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {isAdmin ? (
            <details style={detailsStyle}>
              <summary style={detailsSummaryStyle}>{t("technicalSection")}</summary>

              <div style={gridStyle}>
                <InfoItem
                  label={t("fields.subscriptionPlan")}
                  value={labelForPlan(billing?.plan ?? "free")}
                />
                <InfoItem
                  label={t("fields.cancelAtPeriodEnd")}
                  value={billing?.cancelAtPeriodEnd ? t("common.yes") : t("common.no")}
                />
                <InfoItem
                  label={t("fields.provider")}
                  value={billing?.provider ? String(billing.provider) : t("common.empty")}
                />
                <InfoItem
                  label={t("fields.roleProduct")}
                  value={billing?.roleProduct ? capitalize(String(billing.roleProduct)) : t("common.empty")}
                />
                <InfoItem
                  label={t("fields.customerId")}
                  value={billing?.customerId || t("common.empty")}
                />
                <InfoItem
                  label={t("fields.subscriptionId")}
                  value={billing?.subscriptionId || t("common.empty")}
                />
                <InfoItem
                  label={t("fields.priceId")}
                  value={billing?.priceId || t("common.empty")}
                />
              </div>
            </details>
          ) : null}

          {message ? <div style={messageStyle}>{message}</div> : null}
        </>
      )}
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItemStyle}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 22,
  background: "#ffffff",
  marginBottom: 18,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
};

const pageStyle: React.CSSProperties = {
  padding: "24px 14px 36px",
  maxWidth: 980,
  margin: "0 auto",
};

const heroStyle: React.CSSProperties = {
  marginBottom: 18,
  padding: "8px 2px 10px",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f766e",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 30,
  lineHeight: 1.15,
  fontWeight: 800,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#475569",
  margin: "8px 0 0",
  maxWidth: 660,
  lineHeight: 1.55,
};

const statusCardStyle: React.CSSProperties = {
  ...cardStyle,
  borderColor: "#cbd5e1",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
  marginBottom: 18,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  margin: 0,
};

const accessHeadlineStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.3,
};

const sectionLeadStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.5,
  margin: "6px 0 0",
  maxWidth: 620,
};

const statusNoteStyle: React.CSSProperties = {
  margin: "14px 0 0",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#f8fafc",
  color: "#475569",
  padding: "12px 14px",
  fontSize: 14,
  lineHeight: 1.45,
};

const statusPillStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const planGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const planCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 18,
  minHeight: 262,
  display: "flex",
  flexDirection: "column",
};

const planCardTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const planPriceStyle: React.CSSProperties = {
  color: "#0f766e",
  fontWeight: 800,
  marginTop: 4,
};

const planDescriptionStyle: React.CSSProperties = {
  color: "#64748b",
  marginTop: 12,
  lineHeight: 1.5,
};

const highlightListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "14px 0 0",
  display: "grid",
  gap: 8,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.35,
};

const highlightItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
};

const highlightDotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  marginTop: 6,
  borderRadius: 999,
  background: "#0f766e",
  flex: "0 0 auto",
};

const currentBadgeStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 12,
  fontWeight: 800,
  color: "#0f766e",
  background: "#ccfbf1",
};

const infoItemStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: "auto",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const pricingLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

const actionsRowStyle: React.CSSProperties = {
  marginTop: 18,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const disabledButtonStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#f8fafc",
  color: "#94a3b8",
  fontWeight: 700,
  marginTop: "auto",
};

const messageStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #fed7aa",
  borderRadius: 14,
  background: "#fff7ed",
  color: "#9a3412",
};

const detailsStyle: React.CSSProperties = {
  ...cardStyle,
  overflow: "hidden",
};

const detailsSummaryStyle: React.CSSProperties = {
  marginBottom: 14,
  cursor: "pointer",
  fontWeight: 800,
};
