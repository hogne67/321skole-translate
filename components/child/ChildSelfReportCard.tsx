// components/child/ChildSelfReportCard.tsx
"use client";

export type ChildSelfReport = {
    readSilently?: boolean;
    readAloud?: boolean;
    completedTasks?: boolean;
    feltEasy?: boolean;
    feltHard?: boolean;
    comment?: string;
};

type Props = {
    value: ChildSelfReport;
    onChange: (next: ChildSelfReport) => void;
    disabled?: boolean;
    t?: (key: string, values?: Record<string, unknown>) => string;
};

export default function ChildSelfReportCard({
    value,
    onChange,
    disabled = false,
    t,
}: Props) {
    const tx = (key: string, fallback: string) => {
        try {
            return t ? t(key) : fallback;
        } catch {
            return fallback;
        }
    };

    function toggle(key: keyof ChildSelfReport) {
        onChange({
            ...value,
            [key]: !value[key],
        });
    }

    return (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="text-base font-bold text-emerald-950">
                {tx("childSelfReport.title", "Før du leverer")}
            </div>

            <div className="mt-2 text-sm text-emerald-900">
                {tx(
                    "childSelfReport.intro",
                    "Kryss av det du har gjort. Dette hjelper den voksne å gi deg bedre tilbakemelding."
                )}
            </div>

            <div className="mt-4 grid gap-2">
                {[
                    ["readSilently", tx("childSelfReport.readSilently", "Jeg har lest teksten stille.")],
                    ["readAloud", tx("childSelfReport.readAloud", "Jeg har lest teksten høyt.")],
                    ["completedTasks", tx("childSelfReport.completedTasks", "Jeg har gjort alle oppgavene.")],
                    ["feltEasy", tx("childSelfReport.feltEasy", "Dette var lett.")],
                    ["feltHard", tx("childSelfReport.feltHard", "Dette var vanskelig.")],
                ].map(([key, label]) => (
                    <label
                        key={key}
                        className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                    >
                        <input
                            type="checkbox"
                            disabled={disabled}
                            checked={Boolean(value[key as keyof ChildSelfReport])}
                            onChange={() => toggle(key as keyof ChildSelfReport)}
                        />
                        {label}
                    </label>
                ))}
            </div>

            <label className="mt-4 block text-sm font-semibold text-emerald-950">
                {tx("childSelfReport.comment", "Vil du skrive noe til den voksne?")}
            </label>

            <textarea
                disabled={disabled}
                value={value.comment ?? ""}
                onChange={(e) => onChange({ ...value, comment: e.target.value })}
                placeholder={tx("childSelfReport.commentPlaceholder", "Skriv her hvis du vil...")}
                className="mt-2 min-h-24 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-100"
            />
        </section>
    );
}