"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getAuth } from "firebase/auth";

type PartnerApplication = {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  city?: string;
  country?: string;
  languages?: string[];
  currentRole?: string;
  status?: string;
  createdAt?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

async function authedFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : raw || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("no-NO");
}

export default function AdminPartnersPage() {
  const locale = useLocale();
  const [items, setItems] = useState<PartnerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await authedFetch<{ items?: PartnerApplication[] }>("/api/admin/partners/pending");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [
        item.name,
        item.email,
        item.city,
        item.country,
        item.currentRole,
        item.status,
        ...(item.languages ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  async function review(item: PartnerApplication, action: "approve" | "reject") {
    setBusyId(item.id);
    setError(null);
    setMessage(null);

    try {
      await authedFetch("/api/admin/partners/review", {
        method: "POST",
        body: JSON.stringify({ id: item.id, action }),
      });

      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage(
        action === "approve"
          ? `${item.name || item.email || item.id} er godkjent som partner.`
          : `${item.name || item.email || item.id} er avslått.`
      );
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>ADMIN</div>
          <h1 style={styles.h1}>321school Partner</h1>
        <p style={styles.lead}>Pending partnerApplications som venter på godkjenning.</p>
        </div>

        <div style={styles.actions}>
          <button onClick={load} disabled={loading || Boolean(busyId)} style={styles.secondaryButton}>
            {loading ? "Laster..." : "Oppdater"}
          </button>
          <Link href={`/${locale}/admin`} style={styles.linkButton}>
            Dashboard
          </Link>
        </div>
      </section>

      <section style={styles.toolbar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søk navn, e-post, by/sted, land, språk..."
          style={styles.input}
        />
        <div style={styles.count}>
          Viser <b>{filtered.length}</b> av <b>{items.length}</b>
        </div>
      </section>

      {error ? <section style={styles.error}>Feil: {error}</section> : null}
      {message ? <section style={styles.success}>{message}</section> : null}

      <section style={styles.list}>
        {loading ? <div style={styles.empty}>Laster partnersøknader...</div> : null}

        {!loading && filtered.length === 0 ? (
          <div style={styles.empty}>Ingen pending partnersøknader.</div>
        ) : null}

        {filtered.map((item) => {
          const disabled = Boolean(busyId);
          const isBusy = busyId === item.id;

          return (
            <article key={item.id} style={styles.card}>
              <div style={styles.cardMain}>
                <div>
                  <h2 style={styles.name}>{item.name || "(uten navn)"}</h2>
                  <div style={styles.email}>{item.email || "-"}</div>
                </div>

                <span style={styles.status}>{item.status || "pending"}</span>
              </div>

              <dl style={styles.details}>
                <div>
                  <dt>By/sted</dt>
                  <dd>{item.city || "-"}</dd>
                </div>
                <div>
                  <dt>Land</dt>
                  <dd>{item.country || "-"}</dd>
                </div>
                <div>
                  <dt>Språk</dt>
                  <dd>{item.languages?.length ? item.languages.join(", ") : "-"}</dd>
                </div>
                <div>
                  <dt>Rolle</dt>
                  <dd>{item.currentRole || "-"}</dd>
                </div>
                <div>
                  <dt>Opprettet</dt>
                  <dd>{formatDate(item.createdAt)}</dd>
                </div>
              </dl>

              <div style={styles.reviewActions}>
                <button
                  onClick={() => review(item, "approve")}
                  disabled={disabled}
                  style={{ ...styles.approveButton, opacity: disabled && !isBusy ? 0.55 : 1 }}
                >
                  {isBusy ? "Jobber..." : "Godkjenn"}
                </button>
                <button
                  onClick={() => review(item, "reject")}
                  disabled={disabled}
                  style={{ ...styles.rejectButton, opacity: disabled && !isBusy ? 0.55 : 1 }}
                >
                  {isBusy ? "Jobber..." : "Avslå"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0f766e",
  },
  h1: {
    margin: "4px 0 0",
    fontSize: 26,
    letterSpacing: 0,
  },
  lead: {
    margin: "8px 0 0",
    color: "#64748b",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  toolbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 14,
    background: "#ffffff",
  },
  input: {
    flex: "1 1 280px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 15,
  },
  count: {
    color: "#64748b",
    fontSize: 14,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
    background: "#ffffff",
  },
  cardMain: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  name: {
    margin: 0,
    fontSize: 20,
    letterSpacing: 0,
  },
  email: {
    marginTop: 4,
    color: "#64748b",
  },
  status: {
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "5px 9px",
    background: "#fffbeb",
    color: "#92400e",
    fontSize: 12,
    fontWeight: 800,
  },
  details: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    margin: "16px 0 0",
  },
  reviewActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 16,
  },
  approveButton: {
    border: "1px solid #047857",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#047857",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  rejectButton: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#b91c1c",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
  },
  linkButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    textDecoration: "none",
  },
  empty: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    color: "#64748b",
  },
  success: {
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 12,
    background: "#ecfdf5",
    color: "#047857",
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
  },
};
