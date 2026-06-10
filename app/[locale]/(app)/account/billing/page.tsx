"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLocale, useTranslations } from "next-intl";

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
};

type CheckoutPlan = "basic" | "plus" | "pro";

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

  const [uid, setUid] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserDocData | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<CheckoutPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState("");

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
      return;
    }

    const ref = doc(db, "users", uid);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.data() as UserDocData | undefined;
      setUserData(data ?? null);
    });

    return () => unsubscribe();
  }, [uid]);

  const role = useMemo(() => resolveRole(userData), [userData]);
  const allowedPlans = useMemo(() => allowedPlansForRole(role), [role]);

  const effectivePlan = userData?.plan ?? "free";
  const billing = userData?.billing ?? null;
  const status = billing?.status ?? "inactive";
  const statusTone = getStatusTone(status);

  function labelForPlan(plan: BillingPlan | null | undefined) {
    return t(`plans.${plan ?? "free"}`);
  }

  function descriptionForPlan(plan: CheckoutPlan) {
    if (plan === "pro" && (role === "student" || role === "parent")) {
      return t("plans.proDescriptionStudentParent");
    }

    return t(`plans.${plan}Description`);
  }

  function priceForPlan(plan: CheckoutPlan) {
    if (plan === "pro" && (role === "student" || role === "parent")) {
      return t("prices.proStudentParent");
    }

    return t(`prices.${plan}`);
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
        body: JSON.stringify({ plan }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        setMessage(t("errors.checkoutFailed", { status: res.status }));
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
    if (status === "active" || status === "trialing") {
      return t("statusBox.active");
    }

    if (status === "past_due" || status === "unpaid" || status === "incomplete") {
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
                <p style={sectionLeadStyle}>{getStatusMessage()}</p>
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
                value={role ? capitalize(role) : t("common.empty")}
              />
              <InfoItem label={t("fields.plan")} value={labelForPlan(effectivePlan)} />
              <InfoItem
                label={t("fields.billingStatus")}
                value={labelForStatus(status)}
              />
              <InfoItem label={t("fields.renewsOrEnds")} value={renewalText} />
            </div>

            <div style={actionsRowStyle}>
              <button
                onClick={openPortal}
                disabled={portalLoading || !billing?.customerId}
                style={{
                  ...secondaryButtonStyle,
                  opacity: !billing?.customerId ? 0.55 : 1,
                  cursor: !billing?.customerId ? "not-allowed" : "pointer",
                }}
              >
                {portalLoading ? t("buttons.opening") : t("buttons.manageSubscription")}
              </button>
            </div>
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

const sectionLeadStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.5,
  margin: "6px 0 0",
  maxWidth: 620,
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
  minHeight: 178,
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
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
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
