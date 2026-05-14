"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { getIdToken } from "firebase/auth";
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Notification = {
    id: string;
    type?: string | null;
    title?: string | null;
    body?: string | null;
    link?: string | null;
    read?: boolean;
    createdAt?: Timestamp | null;
};

function formatTime(value?: Timestamp | null) {
    if (!value) return "";

    try {
        return new Intl.DateTimeFormat("nb-NO", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(value.toDate());
    } catch {
        return "";
    }
}

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const unreadCount = useMemo(
        () => notifications.filter((item) => !item.read).length,
        [notifications]
    );

    useEffect(() => {
        let unsubSnap: (() => void) | null = null;

        const unsubAuth = auth.onAuthStateChanged((user) => {
            if (unsubSnap) {
                unsubSnap();
                unsubSnap = null;
            }

            if (!user || user.isAnonymous) {
                setNotifications([]);
                return;
            }

            const q = query(
                collection(db, "users", user.uid, "notifications"),
                orderBy("createdAt", "desc"),
                limit(20)
            );

            unsubSnap = onSnapshot(
                q,
                (snap) => {
                    setNotifications(
                        snap.docs.map((doc) => ({
                            id: doc.id,
                            ...doc.data(),
                        })) as Notification[]
                    );
                },
                (error) => {
                    if (error.code !== "permission-denied") {
                        console.warn("Notification listener failed:", error);
                    }
                    setNotifications([]);
                }
            );
        });

        return () => {
            if (unsubSnap) {
                unsubSnap();
                unsubSnap = null;
            }

            unsubAuth();
        };
    }, []);

    useEffect(() => {
        function onClick(event: MouseEvent) {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    async function markAsRead(notificationId: string) {
        const user = auth.currentUser;
        if (!user) return;

        const token = await getIdToken(user);

        await fetch("/api/notifications/read", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ notificationId }),
        });
    }

    async function markAllAsRead() {
        const user = auth.currentUser;
        if (!user) return;

        const token = await getIdToken(user);

        await fetch("/api/notifications/read-all", {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="Varsler"
            >
                <Bell className="h-5 w-5" />

                {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                ) : null}
            </button>

            {open ? (
                <div className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                            <p className="font-semibold text-slate-950">Varsler</p>
                            <p className="text-xs text-slate-500">
                                {unreadCount > 0
                                    ? `${unreadCount} ulest${unreadCount === 1 ? "" : "e"}`
                                    : "Ingen uleste varsler"}
                            </p>
                        </div>

                        {unreadCount > 0 ? (
                            <button
                                type="button"
                                onClick={() => void markAllAsRead()}
                                className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                            >
                                Marker alle lest
                            </button>
                        ) : null}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                Ingen varsler ennå.
                            </div>
                        ) : (
                            notifications.map((item) => {
                                const content = (
                                    <div
                                        className={`block border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${item.read ? "bg-white" : "bg-blue-50/60"
                                            }`}
                                    >
                                        <div className="flex gap-3">
                                            <div
                                                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? "bg-slate-300" : "bg-blue-600"
                                                    }`}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-slate-950">
                                                    {item.title || "Varsel"}
                                                </p>
                                                {item.body ? (
                                                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                                                        {item.body}
                                                    </p>
                                                ) : null}
                                                <p className="mt-2 text-xs text-slate-400">
                                                    {formatTime(item.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );

                                if (item.link) {
                                    return (
                                        <Link
                                            key={item.id}
                                            href={item.link}
                                            onClick={() => {
                                                setOpen(false);
                                                if (!item.read) void markAsRead(item.id);
                                            }}
                                        >
                                            {content}
                                        </Link>
                                    );
                                }

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                            if (!item.read) void markAsRead(item.id);
                                        }}
                                        className="w-full"
                                    >
                                        {content}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}