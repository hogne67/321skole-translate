import { discardProductEvent } from "@/lib/productAnalyticsPolicy";

// Keep the asynchronous contract used by existing teaching and login flows.
// No Firebase import: discarded events never initialize a product collector.
export async function trackEvent(event: string, data: Record<string, unknown> = {}): Promise<void> {
    discardProductEvent({ event, data });
}
