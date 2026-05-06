// lib\trackEvent.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trackEvent as trackGoogleEvent } from "@/lib/analytics";

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
        console.error("trackEvent error", err);
    }
}