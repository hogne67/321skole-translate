"use client";

import type {
    FractionSpec,
    FractionVisualKind,
} from "@/lib/math/fractions/types";

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const radians = ((angle - 90) * Math.PI) / 180;

    return {
        x: cx + r * Math.cos(radians),
        y: cy + r * Math.sin(radians),
    };
}

function describeSlice(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
        "Z",
    ].join(" ");
}

function CircleFraction({
    total,
    shaded,
}: {
    total: number;
    shaded: number;
}) {
    const cx = 100;
    const cy = 100;
    const r = 88;
    const angle = 360 / total;

    return (
        <svg
            viewBox="0 0 200 200"
            width="190"
            height="190"
            role="img"
            aria-label={`${shaded} av ${total}`}
            style={{
                display: "block",
                background: "#f1f5f9",
                border: "3px solid #111827",
                borderRadius: 18,
                padding: 8,
            }}
        >
            {Array.from({ length: total }).map((_, idx) => {
                const startAngle = idx * angle;
                const endAngle = (idx + 1) * angle;
                const active = idx < shaded;

                return (
                    <path
                        key={idx}
                        d={describeSlice(cx, cy, r, startAngle, endAngle)}
                        fill={active ? "#10b981" : "#f8fafc"}
                        stroke="#111827"
                        strokeWidth="2"
                    />
                );
            })}

            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#111827"
                strokeWidth="3"
            />
        </svg>
    );
}

export default function FractionVisual({
    fraction,
    shadedParts,
    visual = "bar",
}: {
    fraction: FractionSpec;
    shadedParts?: number;
    visual?: FractionVisualKind;
}) {
    const total = Math.max(1, Number(fraction.denominator) || 1);
    const shaded = Math.max(
        0,
        Math.min(Number(shadedParts ?? fraction.numerator) || 0, total)
    );

    if (visual === "circle") {
        return <CircleFraction total={total} shaded={shaded} />;
    }

    if (visual === "rectangle") {
        return (
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(total))}, 42px)`,
                    gap: 0,
                    padding: 12,
                    border: "3px solid #111827",
                    background: "#f1f5f9",
                }}
            >
                {Array.from({ length: total }).map((_, idx) => {
                    const active = idx < shaded;

                    return (
                        <div
                            key={idx}
                            style={{
                                width: 42,
                                height: 42,
                                border: "2px solid #111827",
                                marginLeft: -2,
                                marginTop: -2,
                                background: active ? "#10b981" : "#f8fafc",
                            }}
                        />
                    );
                })}
            </div>
        );
    }

    return (
        <div
            style={{
                display: "inline-block",
                padding: 12,
                border: "3px solid #111827",
                background: "#f1f5f9",
            }}
        >
            <div style={{ display: "flex" }}>
                {Array.from({ length: total }).map((_, idx) => {
                    const active = idx < shaded;

                    return (
                        <div
                            key={idx}
                            style={{
                                width: 50,
                                height: 80,
                                border: "2px solid #111827",
                                marginLeft: idx === 0 ? 0 : -2,
                                background: active ? "#10b981" : "#f8fafc",
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}