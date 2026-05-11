"use client";

export default function Badge({
    text,
    kind = "neutral",
    title,
}: {
    text: string;
    kind?: "neutral" | "good" | "bad" | "warn";
    title?: string;
}) {
    const styles =
        kind === "good"
            ? {
                bg: "rgba(16,185,129,0.16)",
                bd: "rgba(16,185,129,0.45)",
                tx: "rgba(5,150,105,1)",
            }
            : kind === "bad"
                ? {
                    bg: "rgba(231,76,60,0.14)",
                    bd: "rgba(231,76,60,0.40)",
                    tx: "rgba(180,40,30,1)",
                }
                : kind === "warn"
                    ? {
                        bg: "rgba(245,158,11,0.16)",
                        bd: "rgba(245,158,11,0.45)",
                        tx: "rgba(180,83,9,1)",
                    }
                    : {
                        bg: "rgba(0,0,0,0.04)",
                        bd: "rgba(0,0,0,0.14)",
                        tx: "rgba(0,0,0,0.75)",
                    };

    return (
        <span
            title={title}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${styles.bd}`,
                background: styles.bg,
                color: styles.tx,
                fontWeight: 900,
                fontSize: 12,
                whiteSpace: "nowrap",
            }}
        >
            {text}
        </span>
    );
}