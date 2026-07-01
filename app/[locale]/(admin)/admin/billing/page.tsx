"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";

type AcademyOrder = {
  id: string;
  courseId: string;
  courseTitle: string;
  ownerUid: string;
  buyerUid: string;
  buyerEmail: string;
  status: string;
  payoutStatus: string;
  payoutTransferMode: string;
  currency: string;
  grossAmountOre: number;
  instructorAmountOre: number;
  applicationFeeAmountOre: number;
  firstReleaseAmountOre: number;
  holdbackAmountOre: number;
  complaintWindowHours: number;
  adminNote: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  createdAt: string | null;
  paidAt: string | null;
  updatedAt: string | null;
  payoutUpdatedAt: string | null;
};

type OrderAction =
  | "hold"
  | "mark_disputed"
  | "mark_refund_pending"
  | "mark_refunded"
  | "mark_partially_released"
  | "mark_released";

const ORDER_ACTIONS: Array<{ value: OrderAction; label: string }> = [
  { value: "hold", label: "Hold payout" },
  { value: "mark_disputed", label: "Mark disputed" },
  { value: "mark_refund_pending", label: "Mark refund pending" },
  { value: "mark_refunded", label: "Mark refunded" },
  { value: "mark_partially_released", label: "Mark 75% released" },
  { value: "mark_released", label: "Mark fully released" },
];

export default function AdminBillingPage() {
  const [uid, setUid] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [result, setResult] = useState<string>("");
  const [orders, setOrders] = useState<AcademyOrder[]>([]);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const [actionByOrder, setActionByOrder] = useState<Record<string, OrderAction>>({});
  const [noteByOrder, setNoteByOrder] = useState<Record<string, string>>({});
  const [savingOrderId, setSavingOrderId] = useState("");

  const getToken = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }, []);

  async function runResync() {
    try {
      setLoading(true);
      setResult("");

      const token = await getToken();

      const res = await fetch("/api/admin/billing/resync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: uid || undefined,
          customerId: customerId || undefined,
        }),
      });

      const data = await res.json();

      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  const loadAcademyOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      setOrderError("");
      const token = await getToken();
      const res = await fetch("/api/admin/academy/orders?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        orders?: AcademyOrder[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load academy orders");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Could not load academy orders");
    } finally {
      setOrdersLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadAcademyOrders();
  }, [loadAcademyOrders]);

  async function updateOrder(order: AcademyOrder) {
    const action = actionByOrder[order.id] || "hold";
    const note = noteByOrder[order.id] || "";

    try {
      setSavingOrderId(order.id);
      setOrderMessage("");
      setOrderError("");
      const token = await getToken();
      const res = await fetch(`/api/admin/academy/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update order");
      setOrderMessage("Academy order updated.");
      await loadAcademyOrders();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Could not update order");
    } finally {
      setSavingOrderId("");
    }
  }

  const heldOrders = orders.filter((order) => order.payoutStatus === "held");
  const paidOrders = orders.filter((order) =>
    ["paid", "paid_held"].includes(order.status)
  );
  const currency = orders[0]?.currency || "NOK";
  const heldTotal = heldOrders.reduce((sum, order) => sum + order.instructorAmountOre, 0);
  const firstReleaseTotal = heldOrders.reduce(
    (sum, order) => sum + (order.firstReleaseAmountOre || Math.round(order.instructorAmountOre * 0.75)),
    0
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="m-0 text-2xl font-black text-slate-950">Billing</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Admin controls for subscriptions and 321Academy course payments.
        </p>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-950">321Academy payments</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Manual safety control before we connect automatic Stripe transfers and refunds.
            </p>
          </div>
          <button type="button" onClick={() => void loadAcademyOrders()} style={secondaryButtonStyle}>
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Paid orders" value={String(paidOrders.length)} />
          <Stat label="Held payouts" value={String(heldOrders.length)} />
          <Stat label="Held amount" value={formatMoney(heldTotal, currency)} />
          <Stat label="75% release estimate" value={formatMoney(firstReleaseTotal, currency)} />
        </div>

        {orderError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            {orderError}
          </div>
        ) : null}
        {orderMessage ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            {orderMessage}
          </div>
        ) : null}

        {ordersLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Loading academy payments...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No academy orders yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Course / buyer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Amounts</th>
                  <th className="px-4 py-3">Admin action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-950">{order.courseTitle || "Untitled course"}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-600">{order.buyerEmail || "Unknown buyer"}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Order {order.id} · {formatDate(order.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge label={formatStatus(order.status)} tone={statusTone(order.status)} />
                      <div className="mt-2">
                        <StatusBadge label={`Payout: ${formatStatus(order.payoutStatus || "-")}`} tone={payoutTone(order.payoutStatus)} />
                      </div>
                      {order.payoutTransferMode ? (
                        <div className="mt-2 text-xs font-semibold text-slate-500">
                          {order.payoutTransferMode}
                        </div>
                      ) : null}
                      {order.adminNote ? (
                        <div className="mt-2 max-w-xs whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                          {order.adminNote}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-800">
                      <AmountLine label="Gross" value={formatMoney(order.grossAmountOre, order.currency)} />
                      <AmountLine label="Instructor" value={formatMoney(order.instructorAmountOre, order.currency)} />
                      <AmountLine label="75% release" value={formatMoney(order.firstReleaseAmountOre, order.currency)} />
                      <AmountLine label="Holdback" value={formatMoney(order.holdbackAmountOre, order.currency)} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="grid min-w-64 gap-2">
                        <select
                          value={actionByOrder[order.id] || "hold"}
                          onChange={(event) =>
                            setActionByOrder((prev) => ({
                              ...prev,
                              [order.id]: event.target.value as OrderAction,
                            }))
                          }
                          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
                        >
                          {ORDER_ACTIONS.map((action) => (
                            <option key={action.value} value={action.value}>
                              {action.label}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={noteByOrder[order.id] || ""}
                          onChange={(event) =>
                            setNoteByOrder((prev) => ({
                              ...prev,
                              [order.id]: event.target.value,
                            }))
                          }
                          placeholder="Admin note"
                          rows={2}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          maxLength={1000}
                        />
                        <button
                          type="button"
                          disabled={savingOrderId === order.id}
                          onClick={() => void updateOrder(order)}
                          style={buttonStyle}
                        >
                          {savingOrderId === order.id ? "Saving..." : "Update order"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="m-0 text-xl font-black text-slate-950">Subscription billing resync</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Use this when a Stripe subscription payment has completed but the app has not updated.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            placeholder="UID (optional)"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Customer ID (optional)"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={inputStyle}
          />

          <button onClick={runResync} disabled={loading} style={buttonStyle}>
            {loading ? "Running..." : "Resync"}
          </button>
        </div>

        {result ? (
          <pre
            style={{
              padding: 12,
              background: "#0f172a",
              color: "#e2e8f0",
              borderRadius: 12,
              overflow: "auto",
              fontSize: 13,
            }}
          >
            {result}
          </pre>
        ) : null}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function AmountLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "slate" | "emerald" | "amber" | "rose" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>
      {label}
    </span>
  );
}

function statusTone(status: string): "slate" | "emerald" | "amber" | "rose" {
  if (status === "paid" || status === "paid_held") return "emerald";
  if (status === "failed" || status === "refunded") return "rose";
  if (status === "refund_pending" || status === "checkout_created") return "amber";
  return "slate";
}

function payoutTone(status: string): "slate" | "emerald" | "amber" | "rose" {
  if (status === "released" || status === "partially_released") return "emerald";
  if (status === "disputed" || status === "refunded") return "rose";
  if (status === "held" || status === "refund_pending") return "amber";
  return "slate";
}

function formatStatus(value: string) {
  return value ? value.replaceAll("_", " ") : "-";
}

function formatMoney(amountOre: number, currency: string) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: currency || "NOK",
    maximumFractionDigits: amountOre % 100 === 0 ? 0 : 2,
  }).format((amountOre || 0) / 100);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#0f766e",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};
