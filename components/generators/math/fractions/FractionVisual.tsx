"use client";

import { getFractionVisualLayout } from "@/lib/math/fractions/visualLayout";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import type { FractionSpec, FractionVisualKind, FractionLanguage } from "@/lib/math/fractions/types";

export default function FractionVisual({
    fraction,
    shadedParts,
    visual = "bar",
    language = "nb",
    selectedParts,
    onTogglePart,
    disabled = false,
}: {
    fraction: FractionSpec;
    shadedParts?: number;
    visual?: FractionVisualKind;
    language?: FractionLanguage;
    selectedParts?: number[];
    onTogglePart?: (index: number) => void;
    disabled?: boolean;
}) {
    const total = Math.max(1, Math.floor(Number(fraction.denominator) || 1));
    const shaded = Math.max(0, Math.min(Number(shadedParts ?? fraction.numerator) || 0, total));
    const layout = getFractionVisualLayout(total, visual);
    const copy = getFractionCopy(language);
    const selected = new Set(selectedParts ?? Array.from({ length: shaded }, (_, index) => index));
    const interactive = !!onTogglePart && !disabled;
    const description = `${selected.size} ${copy.of} ${total} ${copy.shaded}`;

    return (
        <svg
            className="fraction-visual"
            data-visual={visual}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role={interactive ? "group" : "img"}
            aria-label={description}
            style={{
                width: visual === "circle" ? 176 : 240,
                maxWidth: "100%",
                height: "auto",
                aspectRatio: `${layout.width} / ${layout.height}`,
                display: "block",
                overflow: "visible",
            }}
        >
            <title>{description}</title>
            {layout.parts.map((path, index) => (
                <path
                    key={index}
                    d={path}
                    fill={selected.has(index) ? "#10b981" : "#fff"}
                    stroke="#334155"
                    strokeWidth={1.5}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive ? `${copy.part} ${index + 1} ${copy.of} ${total}` : undefined}
                    aria-pressed={interactive ? selected.has(index) : undefined}
                    onClick={interactive ? () => onTogglePart?.(index) : undefined}
                    onKeyDown={interactive ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onTogglePart?.(index);
                        }
                    } : undefined}
                    className={interactive ? "cursor-pointer transition-colors hover:fill-emerald-100 focus-visible:outline-none focus-visible:stroke-teal-700 focus-visible:[stroke-width:4]" : undefined}
                />
            ))}
        </svg>
    );
}
