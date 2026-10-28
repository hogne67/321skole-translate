// lib/analytics.ts

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

import { discardProductEvent } from "@/lib/productAnalyticsPolicy";

// Compatibility facade. No gtag, SDK, network, persistence or replay.
export function trackEvent(eventName: string, params?: AnalyticsParams): void {
    discardProductEvent({ eventName, params });
}

export function trackSignUp(method: "email" | "google" | "feide" | "anonymous_upgrade") {
    trackEvent("sign_up", {
        method,
    });
}

export function trackCreateLesson(source: "text" | "geometry" | "reading_test" | "other") {
    trackEvent("create_lesson", {
        source,
    });
}

export function trackAiFeedback(context: "student" | "teacher" | "practice" | "geometry") {
    trackEvent("ai_feedback_requested", {
        context,
    });
}

export function trackSubmitAssignment(taskType?: string) {
    trackEvent("submit_assignment", {
        task_type: taskType,
    });
}

export function trackAssignToSpace(source: "my_content" | "library" | "geometry" | "other") {
    trackEvent("assign_to_space", {
        source,
    });
}
