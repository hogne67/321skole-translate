import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { FeatureKey } from "@/lib/featureAccess";

export async function logUsageEvent(input: {
    feature: FeatureKey;
    contentId?: string;
    contentType?: string;
    source?: string;
    path?: string;
}) {
    const user = auth.currentUser;
    if (!user) return;

    const token = await getIdToken(user);

    await fetch("/api/usage/log", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
    });
}