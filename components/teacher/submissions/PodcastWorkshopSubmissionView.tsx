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
import { getPodcastSound, getSoundDuration, playPodcastSound } from "@/lib/podcastSoundLibrary";
import { resolveStudentAudioForPlayback } from "@/lib/audio/studentAudio";
import { auth } from "@/lib/firebase";
import type { StudentAudioAsset } from "@/lib/audio/studentAudio";

type TeacherAudioUrlMode = "inline" | "download";

type TeacherAudioUrlResponse = {
    url: string;
    expiresAt?: number;
    filename?: string;
};

type PodcastExportClip = {
    url?: string;
    asset?: StudentAudioAsset;
    label: string;
};

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
        <div className="whitespace-pre-wrap rounded-xl bg-white p-3 leading-7 text-slate-800">
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
        return !!(voice?.audioDataUrl || voice?.storagePath);
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
            const nextVoice = submission.productionSegments[nextSegment.id]?.voice;
            return !!(nextVoice?.audioDataUrl || nextVoice?.storagePath);
        });
        if (!(voice?.audioDataUrl || voice?.storagePath) || !hasNextVoice) return sum;
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

function supportKeyForSegment(segmentId: string) {
    return `segment:${segmentId}`;
}

function getSupportWords(config: PodcastWorkshopConfig, sectionId: string, fallbackId?: string) {
    const words = config.supportWordsBySection?.[sectionId] ?? (fallbackId ? config.supportWordsBySection?.[fallbackId] : undefined);
    return words && words.length > 0 ? words : [];
}

function getTransitionSoundId(submission: PodcastWorkshopSubmission, segmentId: string) {
    return submission.productionMix.transitionSoundIds?.[segmentId] ?? submission.productionMix.transitionSoundId ?? "";
}

function browserAudioContext() {
    const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AudioContextClass ? new AudioContextClass() : null;
}

function audioBufferToWav(buffer: AudioBuffer) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, value: string) {
        for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index));
        }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
    let offset = 44;
    for (let sample = 0; sample < buffer.length; sample += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const value = Math.max(-1, Math.min(1, channelData[channel][sample] ?? 0));
            view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
            offset += bytesPerSample;
        }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function decodeAudioClip(context: AudioContext, url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("audio-fetch-failed");
    const data = await response.arrayBuffer();
    return await context.decodeAudioData(data.slice(0));
}

async function fetchTeacherAudioBytes(asset: StudentAudioAsset) {
    if (!asset.storagePath) throw new Error("missing-storage-path");

    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("missing-token");

    const response = await fetch("/api/teacher/audio-url", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath: asset.storagePath, mode: "bytes" }),
    });

    if (!response.ok) throw new Error("audio-bytes-fetch-failed");
    return await response.arrayBuffer();
}

async function decodePodcastExportClip(context: AudioContext, clip: PodcastExportClip) {
    if (clip.asset) {
        const data = clip.asset.audioDataUrl && clip.asset.audioDataUrl.startsWith("data:")
            ? await (await fetch(clip.asset.audioDataUrl)).arrayBuffer()
            : await fetchTeacherAudioBytes(clip.asset);
        return await context.decodeAudioData(data.slice(0));
    }

    if (!clip.url) throw new Error("missing-clip-url");
    return await decodeAudioClip(context, clip.url);
}

async function renderPodcastWav(clips: PodcastExportClip[]) {
    const context = browserAudioContext();
    if (!context) throw new Error("audio-context-unavailable");

    try {
        const decoded = await Promise.all(clips.map((clip) => decodePodcastExportClip(context, clip)));
        const sampleRate = context.sampleRate;
        const channels = Math.min(2, Math.max(1, ...decoded.map((buffer) => buffer.numberOfChannels)));
        const totalLength = decoded.reduce((sum, buffer) => {
            return sum + Math.ceil(buffer.duration * sampleRate);
        }, 0);
        const offline = new OfflineAudioContext(channels, Math.max(1, totalLength), sampleRate);
        let cursor = 0;

        decoded.forEach((buffer) => {
            const source = offline.createBufferSource();
            source.buffer = buffer;
            source.connect(offline.destination);
            source.start(cursor / sampleRate);
            cursor += Math.ceil(buffer.duration * sampleRate);
        });

        const rendered = await offline.startRendering();
        return audioBufferToWav(rendered);
    } finally {
        void context.close();
    }
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function requestTeacherAudioUrl(
    asset: StudentAudioAsset,
    mode: TeacherAudioUrlMode = "inline"
): Promise<TeacherAudioUrlResponse | null> {
    if (!asset.storagePath) return null;

    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;

    const res = await fetch("/api/teacher/audio-url", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath: asset.storagePath, mode }),
    });

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as {
        url?: unknown;
        expiresAt?: unknown;
        filename?: unknown;
    } | null;
    const url = typeof data?.url === "string" ? data.url : "";
    if (!url) return null;

    return {
        url,
        expiresAt: typeof data?.expiresAt === "number" ? data.expiresAt : undefined,
        filename: typeof data?.filename === "string" ? data.filename : undefined,
    };
}

async function resolveTeacherAudioForPlayback(
    asset: StudentAudioAsset | null
): Promise<StudentAudioAsset | null> {
    if (!asset) return null;

    const direct = await resolveStudentAudioForPlayback(asset).catch(() => asset);
    if (direct?.audioDataUrl || !asset.storagePath) return direct;

    const signed = await requestTeacherAudioUrl(asset, "inline");
    return signed?.url ? { ...asset, audioDataUrl: signed.url } : direct;
}

async function resolvePodcastSubmissionAudio(
    submission: PodcastWorkshopSubmission
): Promise<PodcastWorkshopSubmission> {
    const productionSegments = { ...submission.productionSegments };
    const entries = await Promise.all(
        Object.entries(submission.productionSegments).map(async ([segmentId, segment]) => {
            const voice = await resolveTeacherAudioForPlayback(segment.voice).catch(() => segment.voice);
            return [
                segmentId,
                {
                    ...segment,
                    voice,
                },
            ] as const;
        })
    );

    entries.forEach(([segmentId, segment]) => {
        productionSegments[segmentId] = segment;
    });

    return {
        ...submission,
        productionSegments,
    };
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
    const [playbackSubmission, setPlaybackSubmission] = useState(submission);

    useEffect(() => {
        let alive = true;

        void resolvePodcastSubmissionAudio(submission).then((next) => {
            if (alive) setPlaybackSubmission(next);
        });

        return () => {
            alive = false;
        };
    }, [submission]);

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

            <div className="grid gap-3">
                <RoomFeedbackBox
                    room={activeRoom}
                    feedback={feedback}
                    canOperate={canOperate}
                    saving={saving}
                    saveMsg={saveMsg}
                    onFeedbackChange={onFeedbackChange}
                    onSaveFeedback={onSaveFeedback}
                    t={t}
                />
                {renderRoom({
                    room: activeRoom,
                    config,
                    submission: playbackSubmission,
                    feedback,
                    canOperate,
                    saving,
                    onFieldFeedbackChange,
                    onSaveFeedback,
                    t,
                })}
            </div>
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
    const [exporting, setExporting] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [exportMessage, setExportMessage] = useState<string | null>(null);
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

    async function playAudioUrl(url: string, offsetSeconds: number, durationSeconds: number) {
        return new Promise<boolean>((resolve) => {
            let settled = false;
            const audio = new Audio(url);
            audio.preload = "auto";
            playerRef.current = audio;

            const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };

            audio.ontimeupdate = () => {
                setElapsedSeconds(Math.min(totalSeconds, offsetSeconds + audio.currentTime));
            };
            audio.onended = () => finish(true);
            audio.onerror = () => finish(false);
            audio.onabort = () => finish(false);

            audio.play()
                .then(() => undefined)
                .catch(() => finish(false));

            window.setTimeout(() => {
                if (!settled && !cancelledRef.current) {
                    finish(true);
                }
            }, Math.max(4000, (durationSeconds + 8) * 1000));
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
        setPlaybackError(null);

        await playPodcastSound(submission.productionMix.introSoundId);
        let elapsed = getSoundDuration(submission.productionMix.introSoundId);
        setElapsedSeconds(Math.min(totalSeconds, elapsed));

        for (let index = 0; index < segments.length; index += 1) {
            if (cancelledRef.current) break;
            const segment = segments[index];
            const voice = submission.productionSegments[segment.id]?.voice ?? null;
            const playableVoice = await resolveTeacherAudioForPlayback(voice).catch(() => voice);
            const url = playableVoice?.audioDataUrl;
            if (url && playableVoice) {
                const played = await playAudioUrl(url, elapsed, playableVoice.durationSeconds);
                if (!played && !cancelledRef.current) {
                    setPlaybackError("Kunne ikke spille av ett av elevopptakene.");
                    break;
                }
                elapsed += playableVoice.durationSeconds;
                setElapsedSeconds(Math.min(totalSeconds, elapsed));
            } else if (voice?.storagePath && !cancelledRef.current) {
                setPlaybackError("Fant lydopptak, men kunne ikke hente avspillingslenke.");
                break;
            }

            const hasNextVoice = segments.slice(index + 1).some((nextSegment) => {
                const nextVoice = submission.productionSegments[nextSegment.id]?.voice;
                return !!(nextVoice?.audioDataUrl || nextVoice?.storagePath);
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

    async function buildExportClips(): Promise<PodcastExportClip[]> {
        const clips: PodcastExportClip[] = [];
        const intro = getPodcastSound(submission.productionMix.introSoundId);
        if (intro) {
            clips.push({ url: intro.src, label: "intro" });
        }

        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            const voice = submission.productionSegments[segment.id]?.voice ?? null;
            const playableVoice = await resolveTeacherAudioForPlayback(voice).catch(() => voice);
            if (playableVoice?.audioDataUrl) {
                clips.push({
                    asset: playableVoice,
                    label: segment.title || `del-${index + 1}`,
                });
            }

            const hasNextVoice = segments.slice(index + 1).some((nextSegment) => {
                const nextVoice = submission.productionSegments[nextSegment.id]?.voice;
                return !!(nextVoice?.audioDataUrl || nextVoice?.storagePath);
            });
            if ((playableVoice?.audioDataUrl || voice?.storagePath) && hasNextVoice) {
                const transition = getPodcastSound(getTransitionSoundId(submission, segment.id));
                if (transition) {
                    clips.push({ url: transition.src, label: "overgang" });
                }
            }
        }

        const outro = getPodcastSound(submission.productionMix.outroSoundId);
        if (outro) {
            clips.push({ url: outro.src, label: "outro" });
        }

        return clips;
    }

    async function exportWholePodcast() {
        if (exporting || segmentsWithAudio.length === 0) return;

        setExporting(true);
        setExportMessage("Lager lydfil...");
        setPlaybackError(null);

        try {
            const clips = await buildExportClips();
            if (clips.length === 0) throw new Error("no-clips");
            const wav = await renderPodcastWav(clips);
            downloadBlob(wav, `321skole-podcast-${Date.now()}.wav`);
            setExportMessage("Podcasten er lastet ned som WAV og lagret på din enhet. Den kan brukes i PowerPoint.");
        } catch {
            setExportMessage("Kunne ikke lage eksportfil akkurat nå.");
        } finally {
            setExporting(false);
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
            <button
                type="button"
                onClick={() => void exportWholePodcast()}
                disabled={segmentsWithAudio.length === 0 || exporting}
                className="mt-2 w-full rounded-xl border border-teal-700 bg-white px-3 py-2 text-sm font-black text-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {exporting ? "Lager lydfil..." : "Last ned hele podcasten"}
            </button>
            <div className="mt-2 rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600">
                Eksporten lastes ned som WAV-fil og lagres på din personlige enhet. Den kan inneholde personopplysninger, så bruk og del kun innenfor undervisningsformålet.
            </div>
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
            {playbackError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                    {playbackError}
                </div>
            ) : null}
            {exportMessage ? (
                <div className="mt-3 rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs font-bold text-teal-900">
                    {exportMessage}
                </div>
            ) : null}
        </div>
    );
}

function TeacherAudioExportControls({
    asset,
    label,
}: {
    asset: StudentAudioAsset | null;
    label: string;
}) {
    const [busy, setBusy] = useState<"copy" | "download" | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    if (!asset?.storagePath) return null;

    async function copyLink() {
        if (!asset?.storagePath) return;
        setBusy("copy");
        setMessage(null);
        try {
            const signed = await requestTeacherAudioUrl(asset, "inline");
            if (!signed?.url) throw new Error("missing-url");
            await navigator.clipboard.writeText(signed.url);
            setMessage("Lenke kopiert. Den virker i ca. 15 minutter.");
        } catch {
            setMessage("Kunne ikke kopiere lenke akkurat nå.");
        } finally {
            setBusy(null);
        }
    }

    async function downloadAudio() {
        if (!asset?.storagePath) return;
        setBusy("download");
        setMessage(null);
        try {
            const signed = await requestTeacherAudioUrl(asset, "download");
            if (!signed?.url) throw new Error("missing-url");
            const anchor = document.createElement("a");
            anchor.href = signed.url;
            anchor.download = signed.filename || `${label}.webm`;
            anchor.rel = "noopener";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setMessage("Nedlasting startet.");
        } catch {
            setMessage("Kunne ikke starte nedlasting akkurat nå.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-bold leading-5 text-slate-600">
                Lydfilen kan inneholde personopplysninger. Bruk og del kun innenfor undervisningsformålet.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void copyLink()}
                    disabled={busy !== null}
                    className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-900 disabled:opacity-60"
                >
                    {busy === "copy" ? "Kopierer..." : "Kopier midlertidig lenke"}
                </button>
                <button
                    type="button"
                    onClick={() => void downloadAudio()}
                    disabled={busy !== null}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 disabled:opacity-60"
                >
                    {busy === "download" ? "Starter..." : "Last ned lyd"}
                </button>
            </div>
            {message ? (
                <div className="mt-2 text-xs font-bold text-slate-700">
                    {message}
                </div>
            ) : null}
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
                        supportWords={getSupportWords(config, "podcastName")}
                        tone="warm"
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
                        supportWords={getSupportWords(config, "ideas")}
                        tone="green"
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
                        supportWords={getSupportWords(config, "participants")}
                        tone="warm"
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    <InfoBlock
                        fieldKey="ideas.importantPoints"
                        label={t("podcastWorkshop.importantPointsLabel")}
                        value={submission.importantPoints}
                        supportWords={getSupportWords(config, "importantPoints")}
                        tone="green"
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
                    <InfoBlock
                        fieldKey="ideas.listenerTakeaway"
                        label={t("podcastWorkshop.listenerTakeawayLabel")}
                        value={submission.listenerTakeaway}
                        supportWords={getSupportWords(config, "listenerTakeaway")}
                        tone="warm"
                        feedback={feedback}
                        canOperate={canOperate}
                        saving={saving}
                        onFieldFeedbackChange={onFieldFeedbackChange}
                        onSaveFeedback={onSaveFeedback}
                        t={t}
                    />
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
                    getSupportWords={(segmentId) => getSupportWords(config, supportKeyForSegment(segmentId), "segment")}
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
                    getSupportWords={(segmentId) => getSupportWords(config, supportKeyForSegment(segmentId), "segment")}
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
                            <div key={segment.id} className={`podcastTeacherFieldRow ${index % 2 === 0 ? "isWarm" : "isGreen"}`}>
                                <div className="min-w-0">
                                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                                        {getSegmentEyebrow(segment.title, index, t)}
                                    </div>
                                    <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                                    {voice?.audioDataUrl ? (
                                        <>
                                            <audio controls src={voice.audioDataUrl} className="w-full" />
                                            <TeacherAudioExportControls
                                                asset={voice}
                                                label={`321skole-${segment.id}`}
                                            />
                                        </>
                                    ) : voice?.storagePath ? (
                                        <>
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                                                {t("podcastWorkshop.readyToReview")}
                                            </div>
                                            <TeacherAudioExportControls
                                                asset={voice}
                                                label={`321skole-${segment.id}`}
                                            />
                                        </>
                                    ) : (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                                            {t("podcastWorkshop.noAudio")}
                                        </div>
                                    )}
                                </div>
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
                <TeacherFieldRowStyle />
            </section>
        );
    }

    return (
        <FinalReview
            config={config}
            submission={submission}
            t={t}
        />
    );
}

function FinalReview({
    config,
    submission,
    t,
}: {
    config: PodcastWorkshopConfig;
    submission: PodcastWorkshopSubmission;
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

            <div className="podcastTeacherFinalReview">
                <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                        {t("podcastWorkshop.studentNotes")}
                    </div>
                    {textBlock(submission.notes, t)}
                </div>

                {config.criteria.length > 0 ? (
                    <div>
                        <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                            {t("podcastWorkshop.finalChecklist")}
                        </div>
                        <div className="grid gap-2">
                            {config.criteria.map((criterion, index) => {
                                const checked = submission.selfAssessment[`criterion_${index}`] === true;
                                return (
                                    <div
                                        key={criterion}
                                        className={`rounded-xl bg-white px-3 py-2 text-sm font-bold ${checked ? "text-emerald-950" : "text-slate-600"}`}
                                    >
                                        {checked ? t("podcastWorkshop.checked") : t("podcastWorkshop.notChecked")} · {criterion}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>

            <style jsx>{`
                .podcastTeacherFinalReview {
                    display: grid;
                    gap: 14px;
                    border-radius: 16px;
                    background: rgba(236, 253, 245, 0.72);
                    padding: 14px;
                }
            `}</style>
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
    getSupportWords,
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
    getSupportWords: (segmentId: string) => string[];
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
}) {
    return (
        <div className="grid gap-3">
            {segments.map((segment, index) => (
                <div key={segment.id} className={`podcastTeacherFieldRow ${index % 2 === 0 ? "isWarm" : "isGreen"}`}>
                    <div className="min-w-0">
                        <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                            {getSegmentEyebrow(segment.title, index, t)}
                        </div>
                        <div className="mb-2 font-black text-slate-950">{segment.title}</div>
                        {textBlock(getText(segment.id), t)}
                        <SupportWords words={getSupportWords(segment.id)} t={t} />
                    </div>
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
            <TeacherFieldRowStyle />
        </div>
    );
}

function InfoBlock({
    fieldKey,
    label,
    value,
    supportWords,
    tone = "green",
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
    supportWords?: string[];
    tone?: "green" | "warm";
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    onFieldFeedbackChange: (fieldKey: string, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    return (
        <div className={`podcastTeacherFieldRow ${tone === "warm" ? "isWarm" : "isGreen"}`}>
            <div className="min-w-0">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                    {label}
                </div>
                {textBlock(value, t)}
                <SupportWords words={supportWords ?? []} t={t} />
            </div>
            <FieldFeedbackBox
                fieldKey={fieldKey}
                feedback={feedback}
                canOperate={canOperate}
                saving={saving}
                onFieldFeedbackChange={onFieldFeedbackChange}
                onSaveFeedback={onSaveFeedback}
                t={t}
            />
            <TeacherFieldRowStyle />
        </div>
    );
}

function SupportWords({ words, t }: { words: string[]; t: Props["t"] }) {
    const cleanWords = words.map((word) => word.trim()).filter(Boolean);
    if (cleanWords.length === 0) return null;

    return (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-emerald-800">
                {t("podcastWorkshop.supportWords")}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {cleanWords.map((word) => (
                    <span key={word} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-emerald-800">
                        {word}
                    </span>
                ))}
            </div>
        </div>
    );
}

function TeacherFieldRowStyle() {
    return (
        <style jsx global>{`
            .podcastTeacherFieldRow {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
                gap: 18px;
                align-items: start;
                border-radius: 16px;
                background: rgba(236, 253, 245, 0.72);
                padding: 14px;
                min-height: 170px;
            }

            .podcastTeacherFieldRow.isWarm {
                background: rgba(255, 251, 235, 0.70);
            }

            .podcastTeacherFieldRow.isGreen {
                background: rgba(236, 253, 245, 0.72);
            }

            @media (max-width: 850px) {
                .podcastTeacherFieldRow {
                    grid-template-columns: 1fr;
                }
            }
        `}</style>
    );
}

function RoomFeedbackBox({
    room,
    feedback,
    canOperate,
    saving,
    saveMsg,
    onFeedbackChange,
    onSaveFeedback,
    t,
}: {
    room: PodcastWorkshopRoomKey;
    feedback: PodcastWorkshopFeedback;
    canOperate: boolean;
    saving: boolean;
    saveMsg: string | null;
    onFeedbackChange: (room: PodcastWorkshopRoomKey, next: PodcastWorkshopRoomFeedback) => void;
    onSaveFeedback: () => void;
    t: Props["t"];
}) {
    const roomFeedback = feedback.rooms[room] ?? { text: "", status: "" };

    function patch(next: Partial<PodcastWorkshopRoomFeedback>) {
        onFeedbackChange(room, {
            ...roomFeedback,
            ...next,
        });
    }

    return (
        <section className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-violet-800">
                {t("podcastWorkshop.feedbackForRoom")}
            </div>
            <textarea
                value={roomFeedback.text}
                onChange={(event) => patch({ text: event.target.value })}
                placeholder={t("podcastWorkshop.feedbackPlaceholder")}
                disabled={!canOperate}
                rows={8}
                className="box-border w-full resize-y rounded-xl border border-violet-200 bg-white p-3 text-sm leading-6 text-slate-900 disabled:opacity-60"
            />

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!canOperate}
                    onClick={() => patch({ status: "approved" })}
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
                    onClick={() => patch({ status: "needs_work" })}
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
        </section>
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
        <div className="rounded-2xl bg-violet-50 p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-violet-800">
                {t("podcastWorkshop.feedbackForField")}
            </div>
            <textarea
                value={fieldFeedback.text}
                onChange={(event) => patch({ text: event.target.value })}
                placeholder={t("podcastWorkshop.fieldFeedbackPlaceholder")}
                disabled={!canOperate}
                rows={5}
                className="box-border w-full resize-y rounded-xl border border-violet-200 bg-white p-3 text-sm leading-6 text-slate-900 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!canOperate}
                    onClick={() => patch({ status: "approved" })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-black disabled:opacity-60 ${fieldFeedback.status === "approved"
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
                    className={`rounded-full border px-3 py-1.5 text-xs font-black disabled:opacity-60 ${fieldFeedback.status === "needs_work"
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
                    className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-black text-violet-800 disabled:opacity-60"
                >
                    {saving ? t("podcastWorkshop.saving") : t("podcastWorkshop.saveFieldFeedback")}
                </button>
            </div>
        </div>
    );
}
