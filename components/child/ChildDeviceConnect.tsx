"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FAMILY_LINK_TOKEN, familyDeviceApi } from "@/lib/familyDevice";

export default function ChildDeviceConnect({ spaceId }: { spaceId: string }) {
    const t = useTranslations("childSpace");
    const locale = useLocale();
    const [state, setState] = useState<"loading" | "ready" | "invalid" | "error">("loading");
    const [connecting, setConnecting] = useState(false);
    const secret = useRef("");
    const request = useRef<AbortController | null>(null);

    useEffect(() => {
        function readInvite() {
            request.current?.abort();
            request.current = null;
            secret.current = window.location.hash.slice(1);
            setState(FAMILY_LINK_TOKEN.test(secret.current) ? "ready" : "invalid");
            setConnecting(false);
        }

        readInvite();
        window.addEventListener("hashchange", readInvite);
        return () => {
            window.removeEventListener("hashchange", readInvite);
            const pending = request.current;
            request.current = null;
            pending?.abort();
        };
    }, []);

    async function connect() {
        if (request.current || !FAMILY_LINK_TOKEN.test(secret.current)) return;
        const controller = new AbortController();
        request.current = controller;
        setConnecting(true);
        let connected = false;
        try {
            const response = await fetch(familyDeviceApi(spaceId) + "/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret: secret.current }),
                cache: "no-store",
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            if (response.ok) {
                connected = true;
                window.location.replace("/" + locale + "/child/spaces/" + encodeURIComponent(spaceId));
                return;
            }
            setState([400, 401, 404, 409].includes(response.status) ? "invalid" : "error");
        } catch {
            if (!controller.signal.aborted) setState("error");
        } finally {
            if (!connected && request.current === controller) {
                request.current = null;
                setConnecting(false);
            }
        }
    }

    return (
        <main className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center sm:px-10">
            <h1 className="m-0 text-3xl font-extrabold tracking-tight text-emerald-950">
                {t(state === "invalid" ? "connect.invalidTitle" : "connect.title")}
            </h1>
            <p className="mb-0 mt-3 leading-7 text-emerald-900" role="status">
                {t(state === "invalid" ? "connect.invalid" : state === "error" ? "access.connectionError" : "connect.description")}
            </p>
            {state === "ready" || state === "error" ? (
                <button type="button" onClick={connect} disabled={connecting} className="mt-6 min-h-12 w-full rounded-2xl bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-70 sm:w-auto">
                    {t(connecting ? "connect.opening" : state === "error" ? "access.retry" : "connect.open")}
                </button>
            ) : null}
        </main>
    );
}
