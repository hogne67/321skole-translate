"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

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

  if (
    data.role === "student" ||
    data.role === "teacher" ||
    data.role === "parent"
  ) {
    return data.role;
  }

  if (
    data.mode === "student" ||
    data.mode === "teacher" ||
    data.mode === "parent"
  ) {
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
  if (role === "student") return ["basic", "plus"];
  if (role === "parent") return ["basic", "plus"];
  return [];
}

function labelForPlan(plan: BillingPlan | null | undefined): string {
  if (plan === "basic") return "Basic";
  if (plan === "plus") return "Plus";
  if (plan === "pro") return "Pro";
  return "Free";
}

function labelForStatus(status: BillingStatus | null | undefined): string {
  switch (status) {
    case "active":
      return "Aktiv";
    case "trialing":
      return "Prøveperiode";
    case "past_due":
      return "Forfalt";
    case "canceled":
      return "Avsluttet";
    case "unpaid":
      return "Ubetalt";
    case "incomplete":
      return "Ufullført";
    default:
      return "Ikke aktiv";
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("no-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function BillingPage() {
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
  const renewalText = formatDate(billing?.currentPeriodEnd ?? null);

  async function getToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Du må være logget inn.");
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
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : typeof data.raw === "string" && data.raw
            ? data.raw
            : `Feil ved checkout (${res.status})`;

        setMessage(errorMessage);
        return;
      }

      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
        return;
      }

      setMessage("Checkout svarte uten URL.");
    } catch (error) {
      console.error("Checkout failed:", error);
      setMessage(error instanceof Error ? error.message : "Noe gikk galt.");
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
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : typeof data.raw === "string" && data.raw
            ? data.raw
            : `Feil ved portal (${res.status})`;

        setMessage(errorMessage);
        return;
      }

      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
        return;
      }

      setMessage("Portal svarte uten URL.");
    } catch (error) {
      console.error("Portal failed:", error);
      setMessage(error instanceof Error ? error.message : "Noe gikk galt.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Abonnement
      </h1>

      <p style={{ color: "#475569", marginBottom: 24 }}>
        Her kan du se plan, status og administrere Stripe-abonnementet ditt.
      </p>

      {!authReady ? (
        <div style={cardStyle}>Laster innlogging ...</div>
      ) : !uid ? (
        <div style={cardStyle}>Du må være logget inn for å se abonnement.</div>
      ) : (
        <>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Nåværende status</h2>

            <div style={gridStyle}>
              <InfoItem label="Rolle" value={role ? capitalize(role) : "—"} />
              <InfoItem label="Plan" value={labelForPlan(effectivePlan)} />
              <InfoItem label="Billing-status" value={labelForStatus(status)} />
              <InfoItem label="Fornyes / utløper" value={renewalText} />
              <InfoItem
                label="Avsluttes ved periodens slutt"
                value={billing?.cancelAtPeriodEnd ? "Ja" : "Nei"}
              />
              <InfoItem
                label="Provider"
                value={billing?.provider ? String(billing.provider) : "—"}
              />
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={openPortal}
                disabled={portalLoading || !billing?.customerId}
                style={secondaryButtonStyle}
              >
                {portalLoading ? "Åpner ..." : "Administrer abonnement"}
              </button>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Oppgrader eller bytt plan</h2>

            {allowedPlans.length === 0 ? (
              <p style={{ color: "#64748b" }}>
                Fant ingen gyldige planer for denne brukeren.
              </p>
            ) : (
              <div style={planGridStyle}>
                {allowedPlans.map((plan) => {
                  const isCurrent = effectivePlan === plan;
                  return (
                    <div key={plan} style={planCardStyle}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {labelForPlan(plan)}
                      </div>

                      <div style={{ color: "#64748b", marginTop: 8 }}>
                        {plan === "basic" && "Et godt startnivå for vanlig bruk."}
                        {plan === "plus" && "Mer kapasitet og flere premium-funksjoner."}
                        {plan === "pro" && "Mest relevant for lærer med høyere behov."}
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <button
                          onClick={() => startCheckout(plan)}
                          disabled={!!checkoutLoading || isCurrent}
                          style={isCurrent ? disabledButtonStyle : primaryButtonStyle}
                        >
                          {isCurrent
                            ? "Nåværende plan"
                            : checkoutLoading === plan
                            ? "Laster ..."
                            : `Velg ${labelForPlan(plan)}`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {message ? (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                border: "1px solid #fed7aa",
                borderRadius: 14,
                background: "#fff7ed",
                color: "#9a3412",
                whiteSpace: "pre-wrap",
              }}
            >
              {message}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 20,
  background: "#ffffff",
  marginBottom: 20,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const planGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const planCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#fcfcfd",
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
  color: "#0f172a",
  fontWeight: 600,
  cursor: "pointer",
};

const disabledButtonStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#f8fafc",
  color: "#94a3b8",
  fontWeight: 600,
  cursor: "not-allowed",
};