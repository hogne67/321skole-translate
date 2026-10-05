import { useEffect, useId, useState } from "react";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import type { FractionLanguage } from "@/lib/math/fractions/types";

type FractionInputParts = {
    numerator: string;
    denominator: string;
};

function splitFractionValue(value: string) {
    const match = value.trim().match(/^(-?\d*)\s*\/\s*(-?\d*)$/);

    if (match) {
        return {
            numerator: match[1],
            denominator: match[2],
        };
    }

    return {
        numerator: value.includes("/") ? value.split("/")[0] ?? "" : value,
        denominator: value.includes("/") ? value.split("/")[1] ?? "" : "",
    };
}

function composeFractionValue(parts: FractionInputParts) {
    const numerator = parts.numerator;
    const denominator = parts.denominator;
    const n = numerator.trim();
    const d = denominator.trim();

    if (!n && !d) return "";

    return `${n}/${d}`;
}

export default function FractionInput({
    value,
    onChange,
    disabled = false,
    label = "Svar",
    language = "nb",
    compact = false,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    label?: string;
    language?: FractionLanguage;
    compact?: boolean;
}) {
    const numeratorId = useId();
    const copy = getFractionCopy(language);
    const denominatorId = useId();
    const [parts, setParts] = useState<FractionInputParts>(() => splitFractionValue(value));

    useEffect(() => {
        setParts(splitFractionValue(value));
    }, [value]);

    function updateParts(next: FractionInputParts) {
        setParts(next);

        onChange(composeFractionValue(next));
    }

    return (
        <fieldset
            className={compact ? "fraction-calculation-answer inline-flex flex-col items-center" : "inline-flex min-w-[112px] flex-col items-center"}
            aria-label={label}
            disabled={disabled}
        >
            <label className="sr-only" htmlFor={numeratorId}>
                {copy.numerator}
            </label>
            <input
                id={numeratorId}
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
                value={parts.numerator}
                onChange={(e) => updateParts({ ...parts, numerator: e.target.value })}
                className={compact ? "fraction-calculation-input" : "h-9 w-[68px] rounded-xl border border-slate-300 bg-white px-2 text-center text-xl font-bold text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"}
            />

            <div className={compact ? "fraction-calculation-answer-line" : "my-1.5 h-0.5 w-20 rounded-full bg-slate-900"} aria-hidden="true" />

            <label className="sr-only" htmlFor={denominatorId}>
                {copy.denominator}
            </label>
            <input
                id={denominatorId}
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
                value={parts.denominator}
                onChange={(e) => updateParts({ ...parts, denominator: e.target.value })}
                className={compact ? "fraction-calculation-input" : "h-9 w-[68px] rounded-xl border border-slate-300 bg-white px-2 text-center text-xl font-bold text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"}
            />
        </fieldset>
    );
}
