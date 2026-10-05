import FractionVisual from "./FractionVisual";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import type { FractionLanguage, FractionVisualKind } from "@/lib/math/fractions/types";

export type FractionShadeAnswer = {
    selectedParts: number[];
};

function normalizeSelectedParts(value: unknown): number[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];

    const selectedParts = (value as { selectedParts?: unknown }).selectedParts;
    if (!Array.isArray(selectedParts)) return [];

    return Array.from(
        new Set(
            selectedParts
                .map((part) => Number(part))
                .filter((part) => Number.isInteger(part) && part >= 0)
        )
    ).sort((a, b) => a - b);
}

export function getSelectedFractionParts(value: unknown, denominator: number): number[] {
    return normalizeSelectedParts(value).filter((part) => part < denominator);
}

export default function FractionShadeInput({
    denominator,
    numerator,
    value,
    onChange,
    disabled = false,
    visual = "rectangle",
    language = "nb",
}: {
    denominator: number;
    numerator: number;
    value: unknown;
    onChange: (value: FractionShadeAnswer) => void;
    disabled?: boolean;
    visual?: FractionVisualKind;
    language?: FractionLanguage;
}) {
    const total = Math.max(1, denominator);
    const copy = getFractionCopy(language);
    const selectedParts = getSelectedFractionParts(value, total);
    const selectedSet = new Set(selectedParts);


    function togglePart(index: number) {
        if (disabled) return;

        const next = selectedSet.has(index)
            ? selectedParts.filter((part) => part !== index)
            : [...selectedParts, index];

        onChange({ selectedParts: next.sort((a, b) => a - b) });
    }

    return (
        <div className="flex min-w-0 flex-col items-center gap-3">
            <FractionVisual
                fraction={{ numerator, denominator: total }}
                visual={visual}
                language={language}
                selectedParts={selectedParts}
                onTogglePart={togglePart}
                disabled={disabled}
            />
            <div className="text-xs font-medium text-slate-600">
                {copy.marked}: {selectedParts.length} / {total}
            </div>
        </div>
    );
}
