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
}: {
    denominator: number;
    numerator: number;
    value: unknown;
    onChange: (value: FractionShadeAnswer) => void;
    disabled?: boolean;
}) {
    const total = Math.max(1, denominator);
    const target = Math.max(0, Math.min(numerator, total));
    const selectedParts = getSelectedFractionParts(value, total);
    const selectedSet = new Set(selectedParts);
    const columns = Math.min(total, Math.ceil(Math.sqrt(total)));

    function togglePart(index: number) {
        if (disabled) return;

        const next = selectedSet.has(index)
            ? selectedParts.filter((part) => part !== index)
            : [...selectedParts, index];

        onChange({ selectedParts: next.sort((a, b) => a - b) });
    }

    return (
        <div className="space-y-3">
            <div
                className="inline-grid rounded-2xl border-2 border-slate-900 bg-slate-100 p-2"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(44px, 56px))` }}
                role="group"
                aria-label={`Marker ${target} av ${total} deler`}
            >
                {Array.from({ length: total }).map((_, index) => {
                    const selected = selectedSet.has(index);

                    return (
                        <button
                            key={index}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => togglePart(index)}
                            className={`h-14 min-w-11 border-2 border-slate-900 text-sm font-bold transition disabled:cursor-not-allowed ${selected
                                ? "bg-emerald-500 text-emerald-950"
                                : "bg-white text-slate-500 hover:bg-emerald-50"
                                }`}
                        >
                            <span className="sr-only">
                                Del {index + 1} av {total}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="text-sm font-medium text-slate-600">
                Markert: {selectedParts.length} / {total}
            </div>
        </div>
    );
}
