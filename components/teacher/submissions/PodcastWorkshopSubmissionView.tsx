"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
    PodcastWorkshopConfig,
    PodcastWorkshopFeedback,
    PodcastWorkshopRoomFeedback,
    PodcastWorkshopRoomKey,
    PodcastWorkshopSubmission,
} from "@/lib/podcastWorkshop";
import { getPodcastWorkshopSegments } from "@/lib/podcastWorkshop";
import { getSoundDuration, playPodcastSound } from "@/lib/podcastSoundLibrary";

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
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
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

function formatDuration(totalSeconds: number) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getVoiceSegments(config: PodcastWorkshopConfig, submission: PodcastWorkshopSubmission) {
    return getPodcastWorkshopSegments(config, submission).filter((segment) => {
        const voice = submission.productionSegments[segment.id]?.voice;
        return !!voice?.audioDataUrl;
    });
}

function getPodcastDuration(config: PodcastWorkshopConfig, submission: PodcastWorkshopSubmission) {
    const voicedSegments = getVoiceSegments(config, submission);
    if (voicedSegments.length === 0) return 0;
    const segments = getPodcastWorkshopSegments(config, submission);
    const voiceSeconds = voicedSegments.reduce((sum, segment) => {
        return sum + (submission.productionSegments[segment.id]?.voice?.durationSeconds ?? 0);
    }, 0);
    const transitionSeconds = segments.reduce((sum, segment, index) => {
        const voice = submission.productionSegments[segment.id]?.voice;
        const hasNextVoice = segments.slice(index + 1).some((nextSegment) => {
            return !!submission.productionSegments[nextSegment.id]?.voice?.audioDataUrl;
        });
        if (!voice?.audioDataUrl || !hasNextVoice) return sum;
        return sum + getSoundDuration(getTransitionSoundId(submission, segment.id));
    }, 0);
    return voiceSeconds
        + getSoundDuration(submission.productionMix.introSoundId)
        + getSoundDuration(submission.productionMix.outroSoundId)
        + transitionSeconds;
}

function getSegmentEyebrow(title: string, index: number, t: Props["t"]) {
    const normalized = title.trim().toLowerCase();
    if (normalized === "intro" || normalized === "avslutning") return title;
    return t("podcastWorkshop.sequencePart", { n: index + 1 });
}

function getTransitionSoundId(submission: PodcastWorkshopSubmission, segmentId: string) {
    return submission.productionMix.transitionSoundIds?.[segmentId] ?? submission.productionMix.transitionSoundId ?? "";
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
    onFieldFeedbackChange,
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
                <div className="min-w-0">
                    {renderRoom({
                        room: activeRoom,
                        config,
                        submission,
                        feedback,
                        canOperate,
                        saving,
                        onFieldFeedbackChange,
                        onSaveFeedback,
                        t,
                    })}
                </div>

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

function PodcastFullPlayback({
    config,
    submission,
    t,
}: {
    config: PodcastWorkshopConfig;
    submission: PodcastWorkshopSubmission;
    t: Props["t"];
}) {
    const [playing, setPlaying] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const playerRef = useRef<HTMLAudioElement | null>(null);
    const cancelledRef = useRef(false);
    const segments = getPodcastWorkshopSegments(config, submission);
    const segmentsWithAudio = getVoiceSegments(config, submission);
    const totalSeconds = getPodcastDuration(config, submission);
    const progressPercent = totalSeconds > 0 ? Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100)) : 0;

    useEffect(() => {
        return () => {
            playerRef.current?.pause();
            playerRef.current = null;
        };
    }, []);

    function stopPlayback() {
        cancelledRef.current = true;
        playerRef.current?.pause();
        playerRef.current = null;
        setPlaying(false);
        setElapsedSeconds(0);
    }

    async function playAudioUrl(url: string, offsetSeconds: number) {
        return new Promise<void>((resolve) => {
            const audio = new Audio(url);
            playerRef.current = audio;
            audio.ontimeupdate = () => {
                setElapsedSeconds(Math.min(totalSeconds, offsetSeconds + audio.currentTime));
            };
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            void audio.play();
        });
    }

    async function playWholePodcast() {
        if (playing) {
            stopPlayback();
            return;
        }

        if (segmentsWithAudio.length === 0) return;

        cancelledRef.current = false;
        setPlaying(true);
        setElapsedSeconds(0);

        await playPodcastSound(submission.productionMix.introSoundId);
        let elapsed = getSoundDuration(submission.productionMix.introSoundId);
        setElapsedSeconds(Math.min(totalSeconds, elapsed));

        for (let index = 0; index < segments.length; index += 1) {
            if (cancelledRef.current) break;
            const segment = segments[index];
            const voice = submission.productionSegments[segment.id]?.voice ?? null;
            const url = voice?.audioDataUrl;
            if (url) {
                await playAudioUrl(url, elapsed);
                elapsed += voice.durationSeconds;
                setElapsedSeconds(Math.min(totalSeconds, elapsed));
            }

            const hasNextVoice = segments.slice(index + 1).some((nextSegment) => {
                return !!submission.productionSegments[nextSegment.id]?.voice?.audioDataUrl;
            });
            if (!cancelledRef.current && hasNextVoice) {
                const transitionSoundId = getTransitionSoundId(submission, segment.id);
                await playPodcastSound(transitionSoundId);
                elapsed += getSoundDuration(transitionSoundId);
                setElapsedSeconds(Math.min(totalSeconds, elapsed));
            }
        }

        if (!cancelledRef.current) {
            await playPodcastSound(submission.productionMix.outroSoundId);
            elapsed += getSoundDuration(submission.productionMix.outroSoundId);
            setElapsedSeconds(Math.min(totalSeconds, elapsed));
        }
        if (!cancelledRef.current) {
            setPlaying(false);
            window.setTimeout(() => setElapsedSeconds(0), 700);
        }
    }

    return (
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-black uppercase tracking-wide text-teal-800">
                        {t("podcastWorkshop.fullPodcast")}
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-950">
                        {t("podcastWorkshop.readyToReview")}
                    </div>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-sm font-black tabular-nums text-teal-800">
                    {formatDuration(totalSeconds)}
                </div>
            </div>

            <button
                type="button"
                onClick={playWholePodcast}
                disabled={segmentsWithAudio.length === 0}
                className="mt-3 w-full rounded-xl border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
                {playing ? t("podcastWorkshop.stopFullPodcast") : t("podcastWorkshop.playFullPodcast")}
            </button>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                    className="h-full rounded-full bg-teal-700 transition-[width] duration-150"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
            <div className="mt-2 flex justify-between gap-3 text-xs font-black tabular-nums text-slate-600">
                <span>{formatDuration(elapsedSeconds)}</span>
                <span>{formatDuration(totalSeconds)}</span>
            </div>
        </div>
    );
}

function renderRoom({
    room,
    config,
    submission,
    feedback,
    canOperate,
    saving,
    onFieldFeedbackChange,
    onSaveFeedback,
    t,
}: {
    room: PodcastWorkshopRoomKey;
    config: PodcastWorkshopConfig;
    submission: PodcastWorkshopSubmission;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    const segments = getPodcastWorkshopSegments(config, submission);

    if (room === "ideas") {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-950">
                    {t("podcastWorkshop.ideasTitle")}
                </h3>
                <div className="grid gap-3">
                    <InfoBlock
                        fieldKey="ideas.podcastName"
                        label={t("podcastWorkshop.podcastNameLabel")}
                        value={submission.podcastName}
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    <InfoBlock
                        fieldKey="ideas.participants"
                        label={t("podcastWorkshop.participantsLabel")}
                        value={submission.participants}
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    <InfoBlock
                        fieldKey="ideas.interviewees"
                        label={t("podcastWorkshop.intervieweesLabel")}
                        value={submission.interviewees}
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    <InfoBlock
                        fieldKey="ideas.ideas"
                        label={t("podcastWorkshop.ideasLabel")}
                        value={submission.ideas}
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    {config.guidingQuestions.length > 0 ? (
                        <div className="grid gap-3">
                            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                                {t("podcastWorkshop.questionsTitle")}
                            </div>
                            {config.guidingQuestions.map((question, index) => (
                                <InfoBlock
                                    key={question}
                                    fieldKey={`ideas.question.${index}`}
                                    label={question}
                                    value={submission.ideaQuestionNotes?.[question] ?? ""}
                                    feedback={feedback}
                                    canOperate={canOperate}
                                    saving={saving}
                                    onFieldFeedbackChange={onFieldFeedbackChange}
                                    onSaveFeedback={onSaveFeedback}
                                    t={t}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
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
                    fieldPrefix="plan"
                    segments={segments}
                    feedback={feedback}
                    canOperate={canOperate}
                    saving={saving}
                    t={t}
                    getText={(segmentId) => submission.segmentPlans[segmentId] ?? ""}
                    onFieldFeedbackChange={onFieldFeedbackChange}
                    onSaveFeedback={onSaveFeedback}
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
                    fieldPrefix="script"
                    segments={segments}
                    feedback={feedback}
                    canOperate={canOperate}
                    saving={saving}
                    t={t}
                    getText={(segmentId) => submission.segmentScripts[segmentId] ?? ""}
                    onFieldFeedbackChange={onFieldFeedbackChange}
                    onSaveFeedback={onSaveFeedback}
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
                    {segments.map((segment, index) => {
                        const voice = submission.productionSegments[segment.id]?.voice ?? null;
                        return (
                            <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                                    {getSegmentEyebrow(segment.title, index, t)}
                                </div>
                                <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                                {voice?.audioDataUrl ? (
                                    <audio controls src={voice.audioDataUrl} className="w-full" />
                                ) : (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                                        {t("podcastWorkshop.noAudio")}
                                    </div>
                                )}
                                <FieldFeedbackBox
                                    fieldKey={`production.${segment.id}`}
                                    feedback={feedback}
                                    canOperate={canOperate}
                                    saving={saving}
                                    onFieldFeedbackChange={onFieldFeedbackChange}
                                    onSaveFeedback={onSaveFeedback}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>
            </section>
        );
    }

    return (
        <FinalReview
            config={config}
            submission={submission}
            feedback={feedback}
            canOperate={canOperate}
            saving={saving}
            onFieldFeedbackChange={onFieldFeedbackChange}
            onSaveFeedback={onSaveFeedback}
            t={t}
        />
    );
}

function FinalReview({
    config,
    submission,
    feedback,
    canOperate,
    saving,
    onFieldFeedbackChange,
    onSaveFeedback,
    t,
}: {
    config: PodcastWorkshopConfig;
    submission: PodcastWorkshopSubmission;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    const readyCount = getVoiceSegments(config, submission).length;
    const missingCount = getPodcastWorkshopSegments(config, submission).length - readyCount;

    return (
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
                <h3 className="mb-1 text-base font-black text-slate-950">
                    {t("podcastWorkshop.finalRoomTitle")}
                </h3>
                <div className="text-sm font-semibold text-slate-600">
                    {t("podcastWorkshop.finalReviewHint")}
                </div>
            </div>

            <PodcastFullPlayback config={config} submission={submission} t={t} />

            <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                    {t("podcastWorkshop.productionReady")}: {readyCount}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    {t("podcastWorkshop.productionMissing")}: {missingCount}
                </span>
            </div>

            <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("podcastWorkshop.studentNotes")}
                </div>
                {textBlock(submission.notes, t)}
                <FieldFeedbackBox
                    fieldKey="final.notes"
                    feedback={feedback}
                    canOperate={canOperate}
                    saving={saving}
                    onFieldFeedbackChange={onFieldFeedbackChange}
                    onSaveFeedback={onSaveFeedback}
                    t={t}
                />
            </div>

            {config.criteria.length > 0 ? (
                <div className="grid gap-2">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {t("podcastWorkshop.finalChecklist")}
                    </div>
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
                                <FieldFeedbackBox
                                    fieldKey={`final.criterion.${index}`}
                                    feedback={feedback}
                                    canOperate={canOperate}
                                    saving={saving}
                                    onFieldFeedbackChange={onFieldFeedbackChange}
                                    onSaveFeedback={onSaveFeedback}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

function SegmentList({
    fieldPrefix,
    segments,
    feedback,
    canOperate,
    saving,
    t,
    getText,
    onFieldFeedbackChange,
    onSaveFeedback,
}: {
    fieldPrefix: string;
    segments: PodcastWorkshopConfig["segments"];
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    t: Props["t"];
    getText: (segmentId: string) => string;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
}) {
    return (
        <div className="grid gap-3">
            {segments.map((segment, index) => (
                <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                        {getSegmentEyebrow(segment.title, index, t)}
                    </div>
                    <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                    {textBlock(getText(segment.id), t)}
                    <FieldFeedbackBox
                        fieldKey={`${fieldPrefix}.${segment.id}`}
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                </div>
            ))}
        </div>
    );
}

function InfoBlock({
    fieldKey,
    label,
    value,
    feedback,
    canOperate,
    saving,
    onFieldFeedbackChange,
    onSaveFeedback,
    t,
}: {
    fieldKey: string;
    label: string;
    value: string;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                {label}
            </div>
            {textBlock(value, t)}
            <FieldFeedbackBox
                fieldKey={fieldKey}
                feedback={feedback}
                canOperate={canOperate}
                saving={saving}
                onFieldFeedbackChange={onFieldFeedbackChange}
                onSaveFeedback={onSaveFeedback}
                t={t}
            />
        </div>
    );
}

function FieldFeedbackBox({
    fieldKey,
    feedback,
    canOperate,
    saving,
    onFieldFeedbackChange,
    onSaveFeedback,
    t,
}: {
    fieldKey: string;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    const fieldFeedback = feedback.fields?.[fieldKey] ?? { text: "", status: "" };

    function patch(next: Partial<PodcastWorkshopRoomFeedback>) {
        onFieldFeedbackChange(fieldKey, {
            ...fieldFeedback,
            ...next,
        });
    }

    return (
        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 p-3">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-violet-800">
                {t("podcastWorkshop.feedbackForField")}
            </div>
            <textarea
                value={fieldFeedback.text}
                onChange={(event) => patch({ text: event.target.value })}
                placeholder={t("podcastWorkshop.fieldFeedbackPlaceholder")}
                disabled={!canOperate}
                rows={3}
                className="box-border w-full resize-y rounded-xl border border-violet-200 bg-white p-3 text-sm leading-6 text-slate-900 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!canOperate}
                    onClick={() => patch({ status: "approved" })}
                    className={`rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-60 ${fieldFeedback.status === "approved"
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : "border-emerald-200 bg-white text-emerald-800"
                        }`}
                >
                    {t("podcastWorkshop.approved")}
                </button>
                <button
                    type="button"
                    disabled={!canOperate}
                    onClick={() => patch({ status: "needs_work" })}
                    className={`rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-60 ${fieldFeedback.status === "needs_work"
                        ? "border-amber-400 bg-amber-400 text-slate-950"
                        : "border-amber-200 bg-white text-amber-800"
                        }`}
                >
                    {t("podcastWorkshop.needsWork")}
                </button>
                <button
                    type="button"
                    disabled={!canOperate || saving}
                    onClick={onSaveFeedback}
                    className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-60"
                >
                    {saving ? t("podcastWorkshop.saving") : t("podcastWorkshop.saveFieldFeedback")}
                </button>
            </div>
        </div>
    );
}
