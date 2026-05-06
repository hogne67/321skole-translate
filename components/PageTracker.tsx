"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/trackEvent";

export default function PageTracker() {
    const pathname = usePathname();

    useEffect(() => {
        trackEvent("page_view", {
            path: pathname,
        });
    }, [pathname]);

    return null;
}