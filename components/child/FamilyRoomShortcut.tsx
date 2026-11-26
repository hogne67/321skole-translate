"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { childRoomHref } from "@/lib/familyDevice";

export default function FamilyRoomShortcut({ spaceId }: { spaceId: string }) {
    const locale = useLocale();
    const t = useTranslations("childSpace.shortcut");
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");
    const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
    const [notice, setNotice] = useState<"copied" | "copyManually" | null>(null);
    const copyInput = useRef<HTMLInputElement>(null);

    async function showShortcut() {
        if (open) {
            setOpen(false);
            return;
        }

        const href = getPathname({ locale, href: childRoomHref(spaceId) });
        const link = new URL(href, window.location.origin).href;
        setUrl(link);
        setOpen(true);
        setNotice(null);

        if (qr?.url !== link) {
            try {
                const { toDataURL } = await import("qrcode");
                const image = await toDataURL(link, { width: 192, margin: 4 });
                setQr({ url: link, image });
            } catch {
                // The room link is available on its own.
            }
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(url);
            setNotice("copied");
        } catch {
            copyInput.current?.focus();
            copyInput.current?.select();
            setNotice("copyManually");
        }
    }

    return (
        <div className="min-w-0">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={showShortcut}
                className="inline-flex min-h-11 items-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-50"
            >
                {t(open ? "hide" : "show")}
            </button>
            {open ? (
                <div id={panelId} className="mt-2 grid gap-3 rounded-2xl border border-emerald-200 bg-white p-3 sm:flex sm:items-center">
                    {qr?.url === url ? (
                        <Image unoptimized src={qr.image} alt={t("qrAlt")} width={144} height={144} className="shrink-0" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <p className="m-0 max-w-sm text-sm leading-6 text-slate-700">{t("description")}</p>
                        <input
                            ref={copyInput}
                            aria-label={t("link")}
                            value={url}
                            readOnly
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800"
                        />
                        <button type="button" onClick={copyLink} className="mt-2 min-h-11 rounded-xl bg-emerald-800 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-900">
                            {t("copy")}
                        </button>
                        {notice ? <p role="status" className="m-0 mt-2 text-sm text-emerald-900">{t(notice)}</p> : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
