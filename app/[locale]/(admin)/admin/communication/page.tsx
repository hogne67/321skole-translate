"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getIdToken } from "firebase/auth";
import AuthGate from "@/components/AuthGate";
import { auth } from "@/lib/firebase";

type EmailLog = {
    id: string;
    type: string | null;
    email: string | null;
    locale: string | null;
    subject: string | null;
    status: string | null;
    provider: string | null;
    error: string | null;
    createdAt: string | null;
};

type EmailLogResponse = {
    ok: boolean;
    logs?: EmailLog[];
    totals?: {
        all: number;
        sent: number;
        failed: number;
        notConfigured: number;
    };
    error?: string;
};

function formatDate(value: string | null) {
    if (!value) return "—";

    try {
        return new Intl.DateTimeFormat("nb-NO", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function statusLabel(status: string | null) {
    if (status === "sent") return "Sent";
    if (status === "failed") return "Failed";
    if (status === "not_configured") return "Not configured";
    return "Unknown";
}

function statusClass(status: string | null) {
    if (status === "sent") {
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    }

    if (status === "failed") {
        return "bg-red-50 text-red-700 ring-red-200";
    }

    if (status === "not_configured") {
        return "bg-amber-50 text-amber-700 ring-amber-200";
    }

    return "bg-slate-50 text-slate-700 ring-slate-200";
}

export default function AdminCommunicationPage() {
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [totals, setTotals] = useState({
        all: 0,
        sent: 0,
        failed: 0,
        notConfigured: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const user = auth.currentUser;

            if (!user) {
                setError("You must be signed in as an admin.");
                setLoading(false);
                return;
            }

            const token = await getIdToken(user, true);

            const res = await fetch("/api/admin/email-logs", {
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            const data = (await res.json()) as EmailLogResponse;

            if (!res.ok || !data.ok) {
                throw new Error(data.error || `Could not load email logs (${res.status})`);
            }

            setLogs(data.logs || []);
            setTotals(
                data.totals || {
                    all: 0,
                    sent: 0,
                    failed: 0,
                    notConfigured: 0,
                }
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    const lastError = useMemo(
        () => logs.find((log) => log.status === "failed" || log.status === "not_configured"),
        [logs]
    );

    return (
        <AuthGate requireRole="admin">
            <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
                <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">Admin</p>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                            Communication
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            This first version shows the email log for system messages. It is
                            meant as an overview, not a campaign tool.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => void loadLogs()}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                    >
                        Refresh
                    </button>
                </div>

                {error ? (
                    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Total</p>
                        <p className="mt-2 text-3xl font-bold text-slate-950">{totals.all}</p>
                    </div>

                    <div className="rounded-2xl border bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Sent</p>
                        <p className="mt-2 text-3xl font-bold text-emerald-700">
                            {totals.sent}
                        </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Failed</p>
                        <p className="mt-2 text-3xl font-bold text-red-700">
                            {totals.failed}
                        </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Not configured</p>
                        <p className="mt-2 text-3xl font-bold text-amber-700">
                            {totals.notConfigured}
                        </p>
                    </div>
                </section>

                <section className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-950">Status</h2>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-700">
                                Active email provider
                            </p>
                            <p className="mt-1 text-sm text-slate-500">Resend</p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-700">
                                Active email type
                            </p>
                            <p className="mt-1 text-sm text-slate-500">Welcome</p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-700">Latest error</p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                                {lastError?.error || "No errors in the latest log"}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-white shadow-sm">
                    <div className="border-b p-5">
                        <h2 className="text-lg font-semibold text-slate-950">Email log</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Showing the latest 100 registered email attempts.
                        </p>
                    </div>

                    {loading ? (
                        <div className="p-5 text-sm text-slate-500">Loading...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-5 text-sm text-slate-500">
                            No emails have been logged yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Time
                                        </th>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Type
                                        </th>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Email
                                        </th>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Language
                                        </th>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Status
                                        </th>
                                        <th className="px-5 py-3 text-left font-semibold text-slate-600">
                                            Error
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="align-top">
                                            <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                                                {formatDate(log.createdAt)}
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                                                {log.type || "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                                                {log.email || "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                                                {log.locale || "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass(
                                                        log.status
                                                    )}`}
                                                >
                                                    {statusLabel(log.status)}
                                                </span>
                                            </td>
                                            <td className="max-w-md px-5 py-4 text-slate-500">
                                                {log.error || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </AuthGate>
    );
}
