"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAuth } from "firebase/auth";
import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";

type TicketStatus = "all" | "new" | "in_progress" | "done" | "closed";

type SupportTicket = {
  id: string;
  status?: string;
  category?: string;
  message?: string;
  name?: string;
  contact?: string;
  role?: string;
  plan?: string;
  locale?: string;
  page?: string;
  createdAt?: string;
  uid?: string;
};

const statusLabels: Record<TicketStatus, string> = {
  all: "All",
  new: "New",
  in_progress: "In progress",
  done: "Done",
  closed: "Closed",
};

const categoryLabels: Record<string, string> = {
  payment: "Payment",
  login: "Login",
  content: "Content/sharing",
  privacy: "Privacy",
  bug: "App error",
  other: "Other",
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function short(value?: string, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export default function AdminSupportPage() {
  const [status, setStatus] = useState<TicketStatus>("new");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState({ new: 0, open: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function token() {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("Missing login");
    return user.getIdToken();
  }

  async function loadTickets(nextStatus = status) {
    try {
      setLoading(true);
      setMessage("");
      const idToken = await token();
      const res = await fetch(`/api/admin/support?status=${nextStatus}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        tickets?: SupportTicket[];
        stats?: { new?: number; open?: number };
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || "Could not load support tickets");

      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setStats({
        new: data.stats?.new ?? 0,
        open: data.stats?.open ?? 0,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load support tickets");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(ticketId: string, nextStatus: Exclude<TicketStatus, "all">) {
    try {
      const idToken = await token();
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) throw new Error("Could not update support ticket");
      await loadTickets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update support ticket");
    }
  }

  useEffect(() => {
    void loadTickets(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="supportPage">
      <AdminCard className="hero">
        <div>
          <div className="eyebrow">Support</div>
          <h2>Support inbox</h2>
          <p>Incoming reports from the in-app help button. New and in-progress tickets are the operational queue.</p>
        </div>
        <div className="stats">
          <strong>{stats.new}</strong>
          <span>new</span>
          <strong>{stats.open}</strong>
          <span>open</span>
        </div>
      </AdminCard>

      <AdminSection eyebrow="Queue" title="Tickets">
        <div className="toolbar">
          <div className="filters">
            {(Object.keys(statusLabels) as TicketStatus[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={status === item ? "active" : ""}
              >
                {statusLabels[item]}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void loadTickets()} className="refresh">
            Refresh
          </button>
        </div>

        {message ? <div className="message">{message}</div> : null}
        {loading ? <div className="empty">Loading ...</div> : null}
        {!loading && tickets.length === 0 ? <div className="empty">No tickets in this view.</div> : null}

        <div className="ticketList">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="ticket">
              <div className="ticketTop">
                <div>
                  <div className="meta">
                    <span className={`pill status_${ticket.status || "new"}`}>{short(ticket.status, "new")}</span>
                    <span>{categoryLabels[ticket.category || ""] ?? short(ticket.category, "Other")}</span>
                    <span>{formatDate(ticket.createdAt)}</span>
                  </div>
                  <h3>{short(ticket.name, "Unknown user")}</h3>
                  <p className="contact">{short(ticket.contact, "No contact info")}</p>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => void updateStatus(ticket.id, "in_progress")}>
                    In progress
                  </button>
                  <button type="button" onClick={() => void updateStatus(ticket.id, "done")}>
                    Done
                  </button>
                  <button type="button" onClick={() => void updateStatus(ticket.id, "closed")}>
                    Close
                  </button>
                </div>
              </div>

              <p className="body">{short(ticket.message)}</p>

              <dl className="details">
                <div>
                  <dt>Role / plan</dt>
                  <dd>{short(ticket.role)} / {short(ticket.plan)}</dd>
                </div>
                <div>
                  <dt>Locale</dt>
                  <dd>{short(ticket.locale)}</dd>
                </div>
                <div>
                  <dt>User ID</dt>
                  <dd>{short(ticket.uid)}</dd>
                </div>
                <div>
                  <dt>Page</dt>
                  <dd>
                    {ticket.page ? (
                      <Link href={ticket.page} target="_blank">
                        {ticket.page}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </AdminSection>

      <style jsx>{`
        .supportPage {
          display: grid;
          gap: var(--admin-gap, 16px);
        }

        :global(.hero) {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 20px;
        }

        .eyebrow {
          font-size: 12px;
          font-weight: 900;
          color: var(--admin-muted, #64748b);
          text-transform: uppercase;
        }

        h2,
        h3,
        p {
          margin: 0;
        }

        h2 {
          margin-top: 4px;
          font-size: 26px;
        }

        .hero p {
          margin-top: 8px;
          color: var(--admin-muted, #64748b);
          line-height: 1.5;
        }

        .stats {
          min-width: 150px;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background: #eff6ff;
          padding: 14px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 10px;
          align-items: baseline;
        }

        .stats strong {
          font-size: 24px;
        }

        .stats span {
          color: #475569;
          font-weight: 800;
        }

        .toolbar {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        button {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #fff;
          color: #0f172a;
          padding: 8px 10px;
          font-weight: 900;
          cursor: pointer;
        }

        button.active,
        button:hover {
          border-color: #2563eb;
          background: #eff6ff;
        }

        .refresh {
          background: #0f172a;
          color: white;
          border-color: #0f172a;
        }

        .message,
        .empty {
          border: 1px solid #fed7aa;
          border-radius: 12px;
          background: #fff7ed;
          color: #9a3412;
          padding: 12px;
          font-weight: 800;
        }

        .ticketList {
          display: grid;
          gap: 12px;
        }

        .ticket {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #fff;
          padding: 14px;
        }

        .ticketTop {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .meta,
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .meta {
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
        }

        .pill {
          border-radius: 999px;
          padding: 4px 8px;
          background: #f1f5f9;
          color: #334155;
        }

        .status_new {
          background: #fef3c7;
          color: #92400e;
        }

        .status_in_progress {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .status_done,
        .status_closed {
          background: #dcfce7;
          color: #166534;
        }

        h3 {
          margin-top: 8px;
          font-size: 18px;
        }

        .contact {
          margin-top: 4px;
          color: #475569;
          font-weight: 700;
        }

        .body {
          margin-top: 12px;
          white-space: pre-wrap;
          line-height: 1.6;
          color: #0f172a;
        }

        .details {
          margin: 14px 0 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          border-top: 1px solid #e2e8f0;
          padding-top: 12px;
        }

        dt {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        dd {
          margin: 4px 0 0;
          color: #0f172a;
          word-break: break-word;
        }

        a {
          color: #2563eb;
          font-weight: 800;
        }

        @media (max-width: 720px) {
          :global(.hero),
          .ticketTop {
            display: grid;
          }
        }
      `}</style>
    </div>
  );
}
