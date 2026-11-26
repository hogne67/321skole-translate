"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CHILD_PREVIEW_PARAM, familyDeviceApi, type FamilyRoomData } from "@/lib/familyDevice";
import { useUserProfile } from "@/lib/useUserProfile";

type ChildAccess = { mode: "device"; room: FamilyRoomData; refreshRoom: () => void } | { mode: "parent"; user: User };
const ChildAccessContext = createContext<ChildAccess | null>(null);

export function useChildRoomAccess() {
    const access = useContext(ChildAccessContext);
    if (!access) throw new Error("Child room access is required.");
    return access;
}

export default function ChildRoomAccess({ children, spaceId }: { children: ReactNode; spaceId: string }) {
    const { user, profile, loading } = useUserProfile();
    const locale = useLocale();
    const t = useTranslations("childSpace");
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const preview = searchParams.get(CHILD_PREVIEW_PARAM) === "parent";
    const view = searchParams.get("view");
    const [device, setDevice] = useState<FamilyRoomData | "missing" | "error" | null>(null);
    const [retry, setRetry] = useState(0);
    const refreshRoom = useCallback(() => setRetry((value) => value + 1), []);

    useEffect(() => {
        if (preview) return;
        let controller: AbortController | null = null;
        async function checkDevice() {
            controller?.abort();
            const request = new AbortController();
            controller = request;
            try {
                const res = await fetch(familyDeviceApi(spaceId), { cache: "no-store", signal: request.signal });
                const access: FamilyRoomData | "missing" | "error" = res.ok
                    ? await res.json()
                    : res.status === 401 || res.status === 404 ? "missing" : "error";
                if (!request.signal.aborted) {
                    setDevice((current) => access === "error" && current && typeof current === "object" ? current : access);
                }
            } catch {
                if (!request.signal.aborted) setDevice((current) => current && typeof current === "object" ? current : "error");
            }
        }
        void checkDevice();
        window.addEventListener("focus", checkDevice);
        return () => {
            controller?.abort();
            window.removeEventListener("focus", checkDevice);
        };
    }, [spaceId, pathname, preview, view, retry]);

    if (!preview && device && typeof device === "object") {
        return <ChildAccessContext.Provider value={{ mode: "device", room: device, refreshRoom }}>{children}</ChildAccessContext.Provider>;
    }

    if ((!preview && device === null) || loading) return <p role="status" className="text-sm text-slate-600">{t("startPage.opening")}</p>;

    if (user && !user.isAnonymous && profile?.role === "parent" && profile.disabled !== true) {
        return <ChildAccessContext.Provider key={user.uid} value={{ mode: "parent", user }}>{children}</ChildAccessContext.Provider>;
    }

    const next = "/" + locale + "/parent/spaces/" + encodeURIComponent(spaceId);
    return (
        <section className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8">
            <h1 className="m-0 text-2xl font-extrabold text-emerald-950">{t("access.title")}</h1>
            <p className="mt-3 text-base leading-7 text-emerald-900">
                {t(device === "error" && !preview ? "access.connectionError" : "access.description")}
            </p>
            {device === "error" && !preview ? (
                <button type="button" onClick={refreshRoom} className="min-h-11 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white">
                    {t("access.retry")}
                </button>
            ) : (
                <Link href={{ pathname: "/login", query: { next } }} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-emerald-800 underline">
                    {t("access.parentSignIn")}
                </Link>
            )}
        </section>
    );
}
