"use client";

type ReviewStatus = "reviewed" | "needs_work";

export default function StatusToggle({
    value,
    onChange,
    disabled,
    t,
}: {
    value: ReviewStatus;
    onChange: (v: ReviewStatus) => void;
    disabled?: boolean;
    t: (k: string) => string;
}) {
    const options: Array<{ value: ReviewStatus; label: string; activeClass: string; inactiveClass: string }> = [
        {
            value: "needs_work",
            label: t("status.needsWork"),
            activeClass: "border-amber-400 bg-amber-100 text-amber-950 shadow-sm ring-2 ring-amber-200",
            inactiveClass: "border-slate-200 bg-white text-slate-500 hover:bg-amber-50",
        },
        {
            value: "reviewed",
            label: t("status.approved"),
            activeClass: "border-green-500 bg-green-100 text-green-950 shadow-sm ring-2 ring-green-200",
            inactiveClass: "border-slate-200 bg-white text-slate-500 hover:bg-green-50",
        },
    ];

    return (
        <div className="grid min-w-0 gap-2">
            <div className="text-sm font-semibold text-slate-700">
                {t("feedback.statusLabel")}
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {options.map((option) => {
                    const active = value === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange(option.value)}
                            disabled={disabled}
                            aria-pressed={active}
                            className={[
                                "min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60",
                                active ? option.activeClass : option.inactiveClass,
                            ].join(" ")}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
