"use client";

import { useMemo, useState } from "react";

import type {
    PodcastWorkshopConfig,
    PodcastWorkshopFeedback,
    PodcastWorkshopRoomFeedback,
    PodcastWorkshopRoomKey,
    PodcastWorkshopSubmission,
} from "@/lib/podcastWorkshop";

type Props = {
    title: string;
    level: string;
    config: PodcastWorkshopConfig;
    submission: PodcastWorkshopSubmission;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    saveMsg: string | null;
    onFeedbackChange: (room: PodcastWorkshopRoomKey, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: (key: string, values?: Record<string, unknown>) => string;
};

function emptyText(t: Props["t"]) {
    return <span className="text-slate-500">{t("podcastWorkshop.empty")}</span>;
}

function textBlock(value: string, t: Props["t"]) {
    const text = value.trim();
    return (
        <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 leading-7 text-slate-800">
            {text ? text : emptyText(t)}
        </div>
    );
}

export default function PodcastWorkshopSubmissionView({
    title,
    level,
    config,
    submission,
    feedback,
    canOperate,
    saving,
    saveMsg,
    onFeedbackChange,
    onSaveFeedback,
    t,
}: Props) {
    const [activeRoom, setActiveRoom] = useState<PodcastWorkshopRoomKey>("ideas");

    const rooms = useMemo(
        () => [
            { key: "ideas" as const, label: t("podcastWorkshop.ideasTitle") },
            { key: "plan" as const, label: t("podcastWorkshop.planTitle") },
            {
                key: "script" as const,
                label: config.scriptMode === "script"
                    ? t("podcastWorkshop.scriptTitle")
                    : t("podcastWorkshop.bulletsTitle"),
            },
            { key: "production" as const, label: t("podcastWorkshop.productionTitle") },
            { key: "final" as const, label: t("podcastWorkshop.finalRoomTitle") },
        ],
        [config.scriptMode, t]
    );

    const roomFeedback = feedback.rooms[activeRoom] ?? { text: "", status: "" };

    function patchRoom(next: Partial<PodcastWorkshopRoomFeedback>) {
        onFeedbackChange(activeRoom, {
            ...roomFeedback,
            ...next,
        });
    }

    return (
        <div className="grid gap-4">
            <div className="grid gap-1">
                <div className="break-words text-lg font-semibold text-slate-900">
                    {title}
                </div>
                {level ? (
                    <div className="text-sm text-slate-600">
                        {t("studentView.level", { v: level })}
                    </div>
                ) : null}
            </div>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-800">
                    {t("podcastWorkshop.assignmentTitle")}
                </div>
                <div className="whitespace-pre-wrap leading-7 text-slate-900">
                    {config.assignmentText || t("podcastWorkshop.noAssignmentText")}
                </div>
            </section>

            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
                {rooms.map((room) => {
                    const active = room.key === activeRoom;
                    const roomStatus = feedback.rooms[room.key]?.status ?? "";
                    return (
                        <button
                            key={room.key}
                            type="button"
                            onClick={() => setActiveRoom(room.key)}
                            className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-black ${active
                                ? "border-emerald-500 bg-emerald-600 text-white"
                                : roomStatus === "needs_work"
                                    ? "border-amber-300 bg-amber-50 text-amber-950"
                                    : roomStatus === "approved"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                                        : "border-slate-200 bg-white text-slate-900"
                                }`}
                        >
                            {room.label}
                        </button>
                    );
                })}
            </nav>

            <div className="podcastTeacherGrid">
                <div className="min-w-0">{renderRoom(activeRoom, config, submission, t)}</div>

                <aside className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50 p-4">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-violet-800">
                        {t("podcastWorkshop.feedbackForRoom")}
                    </div>
                    <textarea
                        value={roomFeedback.text}
                        onChange={(event) => patchRoom({ text: event.target.value })}
                        placeholder={t("podcastWorkshop.feedbackPlaceholder")}
                        disabled={!canOperate}
                        rows={9}
                        className="box-border w-full resize-y rounded-xl border border-violet-200 bg-white p-3 text-sm leading-6 text-slate-900 disabled:opacity-60"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={!canOperate}
                            onClick={() => patchRoom({ status: "approved" })}
                            className={`rounded-xl border px-3 py-2 text-sm font-black disabled:opacity-60 ${roomFeedback.status === "approved"
                                ? "border-emerald-500 bg-emerald-600 text-white"
                                : "border-emerald-200 bg-white text-emerald-800"
                                }`}
                        >
                            {t("podcastWorkshop.approved")}
                        </button>
                        <button
                            type="button"
                            disabled={!canOperate}
                            onClick={() => patchRoom({ status: "needs_work" })}
                            className={`rounded-xl border px-3 py-2 text-sm font-black disabled:opacity-60 ${roomFeedback.status === "needs_work"
                                ? "border-amber-400 bg-amber-400 text-slate-950"
                                : "border-amber-200 bg-white text-amber-800"
                                }`}
                        >
                            {t("podcastWorkshop.needsWork")}
                        </button>
                    </div>

                    <button
                        type="button"
                        disabled={!canOperate || saving}
                        onClick={onSaveFeedback}
                        className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-black text-violet-800 disabled:opacity-60"
                    >
                        {saving ? t("podcastWorkshop.saving") : t("podcastWorkshop.saveFeedback")}
                    </button>

                    {saveMsg ? (
                        <div className="mt-2 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-violet-900">
                            {saveMsg}
                        </div>
                    ) : null}
                </aside>
            </div>

            <style jsx>{`
                .podcastTeacherGrid {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(250px, 320px);
                    gap: 14px;
                    align-items: start;
                }

                @media (max-width: 900px) {
                    .podcastTeacherGrid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}

function renderRoom(
    room: PodcastWorkshopRoomKey,
    config: PodcastWorkshopConfig,
    submission: PodcastWorkshopSubmission,
    t: Props["t"]
) {
    if (room === "ideas") {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-950">
                    {t("podcastWorkshop.ideasTitle")}
                </h3>
                {textBlock(submission.ideas, t)}
            </section>
        );
    }

    if (room === "plan") {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-950">
                    {t("podcastWorkshop.planTitle")}
                </h3>
                <SegmentList
                    config={config}
                    t={t}
                    getText={(segmentId) => submission.segmentPlans[segmentId] ?? ""}
                />
            </section>
        );
    }

    if (room === "script") {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-950">
                    {config.scriptMode === "script"
                        ? t("podcastWorkshop.scriptTitle")
                        : t("podcastWorkshop.bulletsTitle")}
                </h3>
                <SegmentList
                    config={config}
                    t={t}
                    getText={(segmentId) => submission.segmentScripts[segmentId] ?? ""}
                />
            </section>
        );
    }

    if (room === "production") {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-950">
                    {t("podcastWorkshop.productionTitle")}
                </h3>
                <div className="grid gap-3">
                    {config.segments.map((segment, index) => {
                        const voice = submission.productionSegments[segment.id]?.voice ?? null;
                        return (
                            <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                                    {t("podcastWorkshop.part", { n: index + 1 })}
                                </div>
                                <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                                {voice?.audioDataUrl ? (
                                    <audio controls src={voice.audioDataUrl} className="w-full" />
                                ) : (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                                        {t("podcastWorkshop.noAudio")}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-black text-slate-950">
                {t("podcastWorkshop.finalRoomTitle")}
            </h3>
            {textBlock(submission.notes, t)}

            {config.criteria.length > 0 ? (
                <div className="mt-4 grid gap-2">
                    {config.criteria.map((criterion, index) => {
                        const checked = submission.selfAssessment[`criterion_${index}`] === true;
                        return (
                            <div
                                key={criterion}
                                className={`rounded-xl border px-3 py-2 text-sm font-bold ${checked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                    }`}
                            >
                                {checked ? t("podcastWorkshop.checked") : t("podcastWorkshop.notChecked")} · {criterion}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

function SegmentList({
    config,
    t,
    getText,
}: {
    config: PodcastWorkshopConfig;
    t: Props["t"];
    getText: (segmentId: string) => string;
}) {
    return (
        <div className="grid gap-3">
            {config.segments.map((segment, index) => (
                <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                        {t("podcastWorkshop.part", { n: index + 1 })}
                    </div>
                    <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                    {textBlock(getText(segment.id), t)}
                </div>
            ))}
        </div>
    );
}
