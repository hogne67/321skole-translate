"use client";

import React from "react";
import FullscreenImage from "@/components/FullscreenImage";
import type { AutoGrade } from "./types";

export function Badge({
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

export function AutoGradeBadge({
    auto,
    labelAuto,
    labelDetails,
}: {
    auto: AutoGrade | null;
    labelAuto: string;
    labelDetails: (s: string) => string;
}) {
    if (!auto) return null;

    const pct = auto.percentAuto;

    const main = `${labelAuto}: ${auto.correctAuto}/${auto.totalAuto}${pct != null ? ` (${pct}%)` : ""
        }`;

    const kind =
        pct == null
            ? "neutral"
            : pct >= 80
                ? "good"
                : pct >= 50
                    ? "warn"
                    : "bad";

    const detailsRaw =
        `Riktig: ${auto.correctAuto} · ` +
        `Feil: ${auto.wrongAuto} · ` +
        `Ikke besvart: ${auto.unansweredAuto}`;

    return (
        <Badge
            text={main}
            kind={kind}
            title={labelDetails(detailsRaw)}
        />
    );
}

export function StatusToggleButton({
    active,
    label,
    kind,
    title,
}: {
    active: boolean;
    label: string;
    kind: "warn" | "good";
    title: string;
}) {
    const activeBg =
        kind === "good"
            ? "rgba(46,204,113,0.18)"
            : "rgba(245,158,11,0.18)";

    const activeBorder =
        kind === "good"
            ? "rgba(46,204,113,0.60)"
            : "rgba(245,158,11,0.60)";

    const activeText =
        kind === "good"
            ? "rgba(5,150,105,1)"
            : "rgba(180,83,9,1)";

    return (
        <span
            title={title}
            aria-pressed={active}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 40,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${active ? activeBorder : "rgba(0,0,0,0.14)"
                    }`,
                background: active ? activeBg : "white",
                color: active ? activeText : "rgba(0,0,0,0.75)",
                fontWeight: active ? 900 : 700,
                opacity: 1,
                whiteSpace: "nowrap",
            }}
        >
            {label}
        </span>
    );
}

export function SmartImage({
    src,
    alt,
    fit = "cover",
}: {
    src: string;
    alt: string;
    fit?: "cover" | "contain";
}) {
    return <FullscreenImage src={src} alt={alt} fit={fit} sizes="(max-width: 920px) 100vw, 920px" />;
}
