// lib\trackEvent.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trackEvent as trackGoogleEvent } from "@/lib/analytics";

function isAlreadyExistsError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;

    const maybeError = err as { code?: unknown; message?: unknown };
    const code = typeof maybeError.code === "string" ? maybeError.code : "";
    const message = typeof maybeError.message === "string" ? maybeError.message : "";

    return code === "already-exists" || message.toLowerCase().includes("document already exists");
}

export async function trackEvent(
    event: string,
    data: Record<string, unknown> = {}
) {
    console.log("TRACK EVENT", event, data);

    try {
        // 🔹 Google
        trackGoogleEvent(event, data as Record<string, string | number | boolean | undefined>);

        // 🔹 Firestore
        await addDoc(collection(db, "analyticsEvents"), {
            event,
            path: typeof window !== "undefined" ? window.location.pathname : "",
            locale:
                typeof window !== "undefined"
                    ? document.documentElement.lang
                    : "",
            ...data,
            createdAt: serverTimestamp(),
        });
    } catch (err) {
        if (isAlreadyExistsError(err)) return;
        console.error("trackEvent error", err);
    }
}
