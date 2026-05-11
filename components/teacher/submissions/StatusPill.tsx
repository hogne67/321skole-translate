"use client";

type SubmissionStatus =
    | "reviewed"
    | "needs_work"
    | "draft"
    | "submitted"
    | "approved"
    | string;

export default function StatusPill({
    status,
    t,
}: {
    status: SubmissionStatus;
    t: (k: string) => string;
}) {
    const s = String(status || "").toLowerCase();

    const isDraft = s === "draft";
    const isApproved = s === "reviewed" || s === "approved";
    const isNeeds = s === "needs_work";
    const isSubmitted = s === "submitted";

    const bg = isDraft
        ? "rgba(99,102,241,0.12)"
        : isApproved
            ? "rgba(16,185,129,0.16)"
            : isNeeds
                ? "rgba(245,158,11,0.18)"
                : isSubmitted
                    ? "rgba(0,0,0,0.06)"
                    : "rgba(0,0,0,0.06)";

    const bd = isDraft
        ? "rgba(99,102,241,0.40)"
        : isApproved
            ? "rgba(16,185,129,0.45)"
            : isNeeds
                ? "rgba(245,158,11,0.55)"
                : "rgba(0,0,0,0.16)";

    const tx = isDraft
        ? "rgba(67,56,202,1)"
        : isApproved
            ? "rgba(5,150,105,1)"
            : isNeeds
                ? "rgba(180,83,9,1)"
                : "rgba(0,0,0,0.70)";

    const label = isDraft
        ? t("status.draft")
        : isApproved
            ? t("status.approved")
            : isNeeds
                ? t("status.needsWork")
                : isSubmitted
                    ? t("status.submitted")
                    : t("status.submitted");

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${bd}`,
                background: bg,
                color: tx,
                fontWeight: 800,
                fontSize: 12,
            }}
        >
            {label}
        </span>
    );
}