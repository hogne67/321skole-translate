"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import Image from "next/image";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { FAMILY_DEVICE_DAYS, FAMILY_DEVICE_LIMIT, FAMILY_DEVICE_NAME_MAX_LENGTH, FAMILY_INVITE_MINUTES, type FamilyDeviceStatus } from "@/lib/familyDevice";
import FamilyRoomShortcut from "./FamilyRoomShortcut";

type Action = "invite" | "cancel" | "revoke" | "rename";
type Invitation = { url: string; qr: string | null; expiresAt: number };

export default function FamilyDeviceAccessPanel({ spaceId, user }: { spaceId: string; user: User }) {
    const t = useTranslations("parentSpaceDetail.childAccess");
    const locale = useLocale();
    const format = useFormatter();
    const [status, setStatus] = useState<FamilyDeviceStatus | null>(null);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const [inviteNameDraft, setInviteNameDraft] = useState<string | null>(null);
    const [busy, setBusy] = useState<Action | null>(null);
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [notice, setNotice] = useState<"copied" | "copyManually" | "failed" | "limit" | "revoked" | "cancelled" | "renamed" | "renameFailed" | "deviceUnavailable" | null>(null);
    const busyRef = useRef(false);
    const request = useRef<AbortController | null>(null);
    const linkInput = useRef<HTMLInputElement>(null);
    const path = "/api/parent/spaces/" + encodeURIComponent(spaceId) + "/child-access";

    const refresh = useCallback(async () => {
        if (busyRef.current) return;
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        try {
            const token = await user.getIdToken();
            const response = await fetch(path, {
                headers: { Authorization: "Bearer " + token },
                cache: "no-store",
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("Could not load family devices.");
            const next: FamilyDeviceStatus = await response.json();
            if (!controller.signal.aborted) {
                setStatus(next);
                setInvitation((current) => current?.expiresAt === next.inviteExpiresAt ? current : null);
                setEditing((current) => current && next.devices.some((device) => device.id === current.id) ? current : null);
            }
        } catch {
            if (!controller.signal.aborted) setNotice("failed");
        }
    }, [path, user]);

    useEffect(() => {
        void refresh();
        window.addEventListener("focus", refresh);
        return () => {
            request.current?.abort();
            window.removeEventListener("focus", refresh);
        };
    }, [refresh]);

    const pending = status?.inviteExpiresAt != null;
    useEffect(() => {
        if (!pending) return;
        const interval = window.setInterval(() => {
            if (!document.hidden) void refresh();
        }, 8000);
        return () => window.clearInterval(interval);
    }, [pending, refresh]);

    async function change(action: Action, deviceId?: string, name?: string) {
        if (busyRef.current) return;
        request.current?.abort();
        busyRef.current = true;
        setBusy(action);
        setNotice(null);
        try {
            const token = await user.getIdToken();
            const response = await fetch(path, {
                method: "POST",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ action, deviceId, name }),
                cache: "no-store",
            });
            if (!response.ok) {
                if (action === "rename" && response.status === 404) {
                    setEditing(null);
                    setStatus((current) => current ? { ...current, devices: current.devices.filter((device) => device.id !== deviceId) } : current);
                    setNotice("deviceUnavailable");
                } else {
                    setNotice(action === "rename" ? "renameFailed" : response.status === 409 ? "limit" : "failed");
                }
                return;
            }
            const next: FamilyDeviceStatus & { secret?: string } = await response.json();
            setStatus(next);
            if (next.secret && next.inviteExpiresAt) {
                setInviteNameDraft(null);
                const url = new URL(`/${locale}/child/connect/${encodeURIComponent(spaceId)}#${next.secret}`, window.location.origin).href;
                const newInvitation = { url, qr: null, expiresAt: next.inviteExpiresAt };
                setInvitation(newInvitation);
                try {
                    const { toDataURL } = await import("qrcode");
                    const qr = await toDataURL(url, { width: 200, margin: 3 });
                    setInvitation((current) => current?.url === url ? { ...current, qr } : current);
                } catch {
                    // The link can still be shared.
                }
            } else {
                setInvitation((current) => current?.expiresAt === next.inviteExpiresAt ? current : null);
                setEditing((current) => current?.id === deviceId ? null : current);
                setNotice(action === "rename" ? "renamed" : action === "revoke" ? "revoked" : "cancelled");
            }
        } catch {
            setNotice(action === "rename" ? "renameFailed" : "failed");
        } finally {
            busyRef.current = false;
            setBusy(null);
        }
    }

    async function copyLink() {
        if (!invitation) return;
        try {
            await navigator.clipboard.writeText(invitation.url);
            setNotice("copied");
        } catch {
            linkInput.current?.focus();
            linkInput.current?.select();
            setNotice("copyManually");
        }
    }

    const date = (value: number) => format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
    const button = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-65";
    const nameInputClass = "mt-2 min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900";

    return (
        <section className="min-w-0 rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5" aria-labelledby="child-device-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="child-device-title" className="m-0 text-lg font-bold text-emerald-950">{t("title")}</h2>
                    <p className="mb-0 mt-1 max-w-2xl text-sm leading-6 text-slate-700">{t("description")}</p>
                </div>
                <button
                    type="button"
                    disabled={!!busy || (status?.devices.length ?? 0) >= FAMILY_DEVICE_LIMIT}
                    aria-expanded={inviteNameDraft !== null}
                    aria-controls={inviteNameDraft !== null ? "child-device-setup" : undefined}
                    onClick={() => {
                        setInviteNameDraft((current) => current === null ? status?.inviteName ?? "" : null);
                        setNotice(null);
                    }}
                    className={button + " bg-emerald-800 text-white hover:bg-emerald-900"}
                >
                    {t(pending ? "replace" : "create")}
                </button>
            </div>

            {inviteNameDraft !== null ? (
                <form
                    id="child-device-setup"
                    className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void change("invite", undefined, inviteNameDraft);
                    }}
                >
                    <div className="max-w-md">
                        <label htmlFor="child-device-setup-name" className="block text-sm font-bold text-emerald-950">
                            {t("optionalDeviceName")}
                        </label>
                        <input
                            id="child-device-setup-name"
                            aria-describedby="child-device-setup-hint"
                            value={inviteNameDraft}
                            onChange={(event) => setInviteNameDraft(event.target.value)}
                            placeholder={t("deviceNameExample")}
                            maxLength={FAMILY_DEVICE_NAME_MAX_LENGTH}
                            disabled={!!busy}
                            autoFocus
                            className={nameInputClass}
                        />
                        <p id="child-device-setup-hint" className="mb-0 mt-1 text-xs leading-5 text-slate-700">{t("deviceNameHint")}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="submit" disabled={!!busy} className={button + " bg-emerald-800 text-white hover:bg-emerald-900"}>
                            {t(busy === "invite" ? "creating" : "createLink")}
                        </button>
                        <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                                setInviteNameDraft(null);
                                setNotice(null);
                            }}
                            className={button + " border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"}
                        >
                            {t("cancelEdit")}
                        </button>
                    </div>
                </form>
            ) : pending ? (
                <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-emerald-50 p-4 sm:flex-row sm:items-center">
                    {invitation?.qr ? (
                        <Image unoptimized src={invitation.qr} alt={t("qrAlt")} width={156} height={156} className="shrink-0 rounded-xl" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                        {status?.inviteName ? (
                            <p className="m-0 mb-1 break-words text-base font-bold text-emerald-950">
                                {t("linkForDevice", { name: status.inviteName })}
                            </p>
                        ) : null}
                        <p className="m-0 text-sm font-semibold leading-6 text-emerald-950">
                            {invitation ? t("share", { minutes: FAMILY_INVITE_MINUTES }) : t("pending")}
                        </p>
                        {invitation ? (
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input
                                    ref={linkInput}
                                    aria-label={t("link")}
                                    readOnly
                                    value={invitation.url}
                                    className="w-full min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white p-2.5 text-sm text-slate-800"
                                />
                                <button type="button" onClick={copyLink} className={button + " shrink-0 border border-emerald-300 bg-white text-emerald-950"}>
                                    {t("copy")}
                                </button>
                            </div>
                        ) : null}
                        <button type="button" disabled={!!busy} onClick={() => void change("cancel")} className="mt-1 min-h-10 text-sm font-semibold text-emerald-900 underline">
                            {t("cancel")}
                        </button>
                    </div>
                </div>
            ) : null}

            {status && status.devices.length > 0 ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                    <h3 className="m-0 text-sm font-bold text-slate-900">{t("devices")}</h3>
                    <ul className="m-0 mt-2 list-none divide-y divide-slate-100 p-0">
                        {status.devices.map((device, index) => {
                            const defaultName = t("device", { number: index + 1 });
                            const name = device.name ?? defaultName;
                            const draft = editing?.id === device.id ? editing : null;
                            return (
                                <li key={device.id} className="min-w-0 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0 text-sm text-slate-700">
                                            <p className="m-0 break-words font-bold text-slate-900">{name}</p>
                                            <p className="m-0 mt-0.5">{t("connected", { date: date(device.createdAt) })} · {t("expires", { date: date(device.expiresAt) })}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {draft ? null : (
                                                <button
                                                    type="button"
                                                    aria-label={t("renameDevice", { name })}
                                                    disabled={!!busy}
                                                    onClick={() => {
                                                        setEditing({ id: device.id, name: device.name ?? "" });
                                                        setNotice(null);
                                                    }}
                                                    className={button + " border border-emerald-200 text-emerald-900 hover:bg-emerald-50"}
                                                >
                                                    {t("rename")}
                                                </button>
                                            )}
                                            <button type="button" aria-label={t("revokeDevice", { name })} disabled={!!busy} onClick={() => void change("revoke", device.id)} className={button + " border border-slate-200 text-slate-800 hover:bg-slate-50"}>
                                                {t("revoke")}
                                            </button>
                                        </div>
                                    </div>
                                    {draft ? (
                                        <form
                                            className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:p-4"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void change("rename", device.id, draft.name);
                                            }}
                                        >
                                            <label htmlFor={"device-name-" + device.id} className="block text-sm font-bold text-emerald-950">{t("deviceName")}</label>
                                            <input
                                                id={"device-name-" + device.id}
                                                aria-describedby={"device-name-hint-" + device.id}
                                                value={draft.name}
                                                onChange={(event) => setEditing({ id: device.id, name: event.target.value })}
                                                placeholder={defaultName}
                                                maxLength={FAMILY_DEVICE_NAME_MAX_LENGTH}
                                                autoFocus
                                                disabled={!!busy}
                                                className={nameInputClass}
                                            />
                                            <p id={"device-name-hint-" + device.id} className="mb-0 mt-1 text-xs leading-5 text-slate-700">{t("deviceNameHint")}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button type="submit" disabled={!!busy} className={button + " bg-emerald-800 text-white hover:bg-emerald-900"}>
                                                    {t(busy === "rename" ? "savingName" : "saveName")}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!!busy}
                                                    onClick={() => {
                                                        setEditing(null);
                                                        setNotice(null);
                                                    }}
                                                    className={button + " border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"}
                                                >
                                                    {t("cancelEdit")}
                                                </button>
                                            </div>
                                        </form>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-2">
                        <FamilyRoomShortcut spaceId={spaceId} />
                    </div>
                </div>
            ) : null}
            <p className="mb-0 mt-3 text-xs leading-5 text-slate-600">{t("duration", { days: FAMILY_DEVICE_DAYS })}</p>
            {notice ? (
                <p role="status" className="mb-0 mt-2 text-sm font-semibold text-slate-800">{t(notice)}</p>
            ) : null}
        </section>
    );
}
