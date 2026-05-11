import type { SubmissionStatus } from "./types";
import { normalizeStatus } from "./helpers";

export function hasToDate(v: unknown): v is { toDate: () => Date } {
    return (
        typeof v === "object" &&
        v !== null &&
        "toDate" in v &&
        typeof (v as { toDate?: unknown }).toDate === "function"
    );
}

export function toDateString(v: unknown) {
    try {
        if (!v) return null;

        if (hasToDate(v)) {
            const d = v.toDate();
            return d.toLocaleString();
        }

        if (v instanceof Date) return v.toLocaleString();
        if (typeof v === "number") return new Date(v).toLocaleString();

        if (typeof v === "string") {
            const d = new Date(v);
            if (!isNaN(d.getTime())) return d.toLocaleString();
        }
    } catch {
        // ignore
    }

    return null;
}

export function statusTheme(s: SubmissionStatus): { border: string; bg: string } {
    const v = normalizeStatus(s);

    if (v === "needs_work") {
        return {
            border: "rgba(245,158,11,0.45)",
            bg: "rgba(245,158,11,0.10)",
        };
    }

    if (v === "reviewed" || v === "approved") {
        return {
            border: "rgba(46,204,113,0.45)",
            bg: "rgba(46,204,113,0.10)",
        };
    }

    if (v === "draft") {
        return {
            border: "rgba(99,102,241,0.45)",
            bg: "rgba(99,102,241,0.08)",
        };
    }

    return {
        border: "rgba(0,0,0,0.14)",
        bg: "rgba(0,0,0,0.02)",
    };
}