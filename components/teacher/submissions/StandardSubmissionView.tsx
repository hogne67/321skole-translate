"use client";

import Badge from "./Badge";
import type {
    AnswersMap,
    AutoGrade,
    Task,
} from "@/lib/submissions/types";

type Props = {
    lessonTitle: string;
    lessonLevel: string;
    cover: string | null;
    sourceText: string;

    tasksOriginal: Task[];
    answersMap: AnswersMap;
    auto: AutoGrade | null;

    t: (key: string, values?: Record<string, unknown>) => string;

    getStableTaskId: (task: Task, idx: number) => string;
    getAutoEntry: (
        auto: AutoGrade | null,
        stableId: string
    ) => {
        type: "mcq" | "truefalse";
        isCorrect: boolean;
        studentAnswer: unknown;
        correctAnswer: unknown;
    } | undefined;

    renderValue: (value: unknown) => string;
};

export default function StandardSubmissionView({
    lessonTitle,
    lessonLevel,
    cover,
    sourceText,
    tasksOriginal,
    answersMap,
    auto,
    t,
    getStableTaskId,
    getAutoEntry,
    renderValue,
}: Props) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-1">
                <div className="break-words text-lg font-semibold text-slate-900">
                    {lessonTitle}
                </div>

                {lessonLevel ? (
                    <div className="text-sm text-slate-600">
                        {t("studentView.level", { v: lessonLevel })}
                    </div>
                ) : null}
            </div>

            <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
                <div
                    className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white"
                    style={{ aspectRatio: "16 / 9" }}
                >
                    {cover ? (
                        <img
                            src={cover}
                            alt={t("studentView.imageAlt")}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                            }}
                        />
                    ) : (
                        <div className="px-4 text-center text-sm text-slate-600">
                            <div className="mb-1 font-semibold text-slate-800">
                                {t("studentView.noImageTitle")}
                            </div>

                            <div>{t("studentView.noImageDesc")}</div>
                        </div>
                    )}
                </div>
            </div>

            {sourceText.trim() ? (
                <div className="rounded-xl border border-slate-300 bg-white p-4">
                    <div className="mb-2 text-xs text-slate-500">
                        {t("studentView.textTitle")}
                    </div>

                    <div className="whitespace-pre-wrap leading-7 text-slate-800">
                        {sourceText}
                    </div>
                </div>
            ) : null}

            <div>
                <div className="mb-3 text-base font-semibold text-slate-900">
                    {t("studentView.tasksTitle")}
                </div>

                {tasksOriginal.length === 0 ? (
                    <div className="text-sm text-slate-600">
                        {t("studentView.noTasks")}
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {tasksOriginal.map((task, idx) => {
                            const stableId = getStableTaskId(task, idx);

                            const type = String(task?.type ?? "open").toLowerCase();

                            const prompt = String(task?.prompt ?? "");

                            const val = answersMap[stableId];

                            const entry = getAutoEntry(auto, stableId);

                            const autoBadge =
                                entry?.isCorrect ? (
                                    <Badge
                                        text={t("auto.taskCorrect")}
                                        kind="good"
                                    />
                                ) : entry ? (
                                    <Badge
                                        text={t("auto.taskWrong")}
                                        kind="bad"
                                    />
                                ) : null;

                            return (
                                <div
                                    key={stableId}
                                    className="rounded-xl border border-slate-300 bg-white p-4"
                                >
                                    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                        <span>
                                            {t("studentView.taskN", {
                                                n: task?.order ?? idx + 1,
                                            })}
                                        </span>

                                        <span>• {type}</span>

                                        {autoBadge}
                                    </div>

                                    <div className="mb-3 whitespace-pre-wrap font-semibold leading-6 text-slate-900">
                                        {prompt}
                                    </div>

                                    <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-800">
                                        {renderValue(val) || (
                                            <span className="text-slate-500">
                                                {t("studentView.notAnswered")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
