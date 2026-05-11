"use client";

import { LANGUAGES } from "@/lib/languages";
import { SearchableSelect } from "@/components/SearchableSelect";
import { softBlueButtonStyle } from "./assignmentStyles";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
}));

type Props = {
    targetLang: string;

    translating: null | "text" | "tasks";

    tasksCount: number;

    hasTranslatedTasks: boolean;

    showTaskTranslations: boolean;

    t: (
        key: string,
        values?: Record<string, unknown>
    ) => string;

    onTargetLangChange: (value: string) => void;

    onTranslateTasks: () => void;

    onToggleTranslations: () => void;
};

export default function AssignmentTasksHeader({
    targetLang,
    translating,
    tasksCount,
    hasTranslatedTasks,
    showTaskTranslations,
    t,
    onTargetLangChange,
    onTranslateTasks,
    onToggleTranslations,
}: Props) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
            }}
        >
            <h2 style={{ margin: 0, fontSize: 18 }}>
                {t("tasks.title")}
            </h2>

            <div
                style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <span style={{ opacity: 0.75 }}>
                    {t("translate.targetLang")}
                </span>

                <div style={{ minWidth: 190 }}>
                    <SearchableSelect
                        label=""
                        value={targetLang}
                        options={LANGUAGE_OPTIONS}
                        onChange={onTargetLangChange}
                        placeholder={t("translate.targetLang")}
                    />
                </div>

                <button
                    type="button"
                    onClick={onTranslateTasks}
                    disabled={
                        translating === "tasks" ||
                        tasksCount === 0
                    }
                    style={{
                        ...softBlueButtonStyle,
                        opacity: translating === "tasks" ? 0.7 : 1,
                    }}
                >
                    {translating === "tasks"
                        ? t("translate.working")
                        : t("translate.tasks")}
                </button>

                {hasTranslatedTasks ? (
                    <button
                        type="button"
                        onClick={onToggleTranslations}
                        style={softBlueButtonStyle}
                    >
                        {showTaskTranslations
                            ? t("translate.hide")
                            : t("translate.show")}
                    </button>
                ) : null}
            </div>
        </div>
    );
}