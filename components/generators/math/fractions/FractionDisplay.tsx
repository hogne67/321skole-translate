import type { FractionSpec } from "@/lib/math/fractions/types";

function parseFractionText(value: string): FractionSpec | null {
    const match = value.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);

    if (!match) return null;

    const numerator = Number(match[1]);
    const denominator = Number(match[2]);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;

    return { numerator, denominator };
}

export default function FractionDisplay({
    fraction,
    value,
    size = "md",
    className = "",
}: {
    fraction?: FractionSpec;
    value?: string;
    size?: "sm" | "md" | "lg";
    className?: string;
}) {
    const parsed = fraction ?? (value ? parseFractionText(value) : null);

    if (!parsed) {
        return <span className={className}>{value}</span>;
    }

    const sizeClass =
        size === "lg"
            ? "text-3xl"
            : size === "sm"
                ? "text-base"
                : "text-xl";

    return (
        <span
            className={`inline-flex min-w-[2.4em] flex-col items-center align-middle font-bold leading-none text-slate-950 ${sizeClass} ${className}`}
            aria-label={`${parsed.numerator}/${parsed.denominator}`}
        >
            <span className="px-1">{parsed.numerator}</span>
            <span className="my-0.5 h-0.5 w-full rounded-full bg-current" aria-hidden="true" />
            <span className="px-1">{parsed.denominator}</span>
        </span>
    );
}
