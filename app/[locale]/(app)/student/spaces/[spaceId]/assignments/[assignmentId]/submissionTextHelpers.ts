import type { SubmissionStatus } from "./types";
import { normalizeStatus } from "./helpers";

type TFn = (key: string, values?: Record<string, unknown>) => string;

export function statusLabel(s: SubmissionStatus, t: TFn): string {
    const v = normalizeStatus(s);

    if (v === "draft") return "Kladd";
    if (v === "needs_work") return t("status.needsWork");
    if (v === "reviewed" || v === "approved") return t("status.approved");
    if (v === "submitted") return t("status.submitted");

    return v;
}

export function statusDesc(s: SubmissionStatus, t: TFn): string {
    const v = normalizeStatus(s);

    if (v === "draft") {
        return "Kladd er lagret. Du kan fortsette senere og levere når du er klar.";
    }

    if (v === "needs_work") return t("statusDesc.needsWork");
    if (v === "reviewed" || v === "approved") return t("statusDesc.approved");
    if (v === "submitted") return t("statusDesc.submitted");

    return t("statusDesc.generic");
}