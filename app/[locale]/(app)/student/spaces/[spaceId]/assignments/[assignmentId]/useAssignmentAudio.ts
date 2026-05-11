"use client";

import { useEffect, useRef, useState } from "react";
import type { SentenceSeg, TtsLang } from "./types";

type Params = {
    assignmentId?: string;
    playbackRate: number;
    originalSegs: SentenceSeg[];
    translationSegs: SentenceSeg[];
    t: (key: string, values?: Record<string, unknown>) => string;
};

export function useAssignmentAudio({
    assignmentId,
    playbackRate,
    originalSegs,
    translationSegs,
    t,
}: Params) {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [ttsBusy, setTtsBusy] = useState<null | "original" | "translation">(null);
    const [ttsErr, setTtsErr] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeTextMode, setActiveTextMode] = useState<null | "original" | "translation">(null);
    const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

    function stopAudio() {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }

        setActiveSentenceIndex(null);
        setActiveTextMode(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }

    function pauseAudio() {
        const a = audioRef.current;
        if (!a) return;
        a.pause();
    }

    function resumeAudio() {
        const a = audioRef.current;
        if (!a) return;
        a.play().catch(() => { });
    }

    function seekToSentence(mode: "original" | "translation", idx: number) {
        const a = audioRef.current;
        if (!a) return;

        const segs = mode === "translation" ? translationSegs : originalSegs;
        if (!segs[idx]) return;

        const d = a.duration;
        if (!d || !Number.isFinite(d)) return;

        const target = segs[idx].startRatio * d;
        a.currentTime = Math.max(0, Math.min(d - 0.05, target));

        setActiveTextMode(mode);
        setActiveSentenceIndex(idx);

        if (a.paused) a.play().catch(() => { });
    }

    function replaySentence() {
        const a = audioRef.current;
        if (!a) return;

        if (activeTextMode && activeSentenceIndex != null) {
            seekToSentence(activeTextMode, activeSentenceIndex);
            return;
        }

        a.currentTime = Math.max(0, a.currentTime - 2.0);
        a.play().catch(() => { });
    }

    function prevSentence() {
        if (!audioRef.current || !activeTextMode) return;

        const segs = activeTextMode === "translation" ? translationSegs : originalSegs;
        if (!segs.length) return;

        const nextIdx = Math.max(0, (activeSentenceIndex ?? 0) - 1);
        seekToSentence(activeTextMode, nextIdx);
    }

    function nextSentence() {
        if (!audioRef.current || !activeTextMode) return;

        const segs = activeTextMode === "translation" ? translationSegs : originalSegs;
        if (!segs.length) return;

        const nextIdx = Math.min(segs.length - 1, (activeSentenceIndex ?? 0) + 1);
        seekToSentence(activeTextMode, nextIdx);
    }

    async function playTTS(text: string, lang: TtsLang, mode: "original" | "translation") {
        if (!assignmentId) return;

        const clean = text.trim();
        if (!clean) return;

        setTtsErr(null);
        setTtsBusy(mode);

        try {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }

            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lessonId: assignmentId,
                    lang,
                    text: clean,
                    voice: "marin",
                }),
            });

            const raw = await res.text();

            let data: unknown = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                throw new Error(`TTS API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
            }

            const d = data as { error?: unknown; url?: unknown };
            if (!res.ok) throw new Error(d?.error ? String(d.error) : `TTS error (HTTP ${res.status})`);

            const url = String(d?.url ?? "").trim();
            if (!url) throw new Error("TTS returned no url");

            const a = new Audio(url);
            a.playbackRate = playbackRate;
            audioRef.current = a;

            setActiveTextMode(mode);
            setActiveSentenceIndex(0);
            setCurrentTime(0);
            setDuration(0);

            a.addEventListener("ended", () => {
                setActiveSentenceIndex(null);
                setActiveTextMode(null);
            });

            await a.play();
        } catch (e: unknown) {
            const m = (e as { message?: unknown })?.message;
            setTtsErr(typeof m === "string" ? m : t("tts.failed"));
            setActiveSentenceIndex(null);
            setActiveTextMode(null);
        } finally {
            setTtsBusy(null);
        }
    }

    useEffect(() => {
        if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTime = () => setCurrentTime(a.currentTime || 0);
        const onMeta = () => setDuration(a.duration || 0);
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(a.duration || 0);
        };

        a.addEventListener("play", onPlay);
        a.addEventListener("pause", onPause);
        a.addEventListener("timeupdate", onTime);
        a.addEventListener("loadedmetadata", onMeta);
        a.addEventListener("ended", onEnded);

        setCurrentTime(a.currentTime || 0);
        setDuration(a.duration || 0);
        setIsPlaying(!a.paused);

        return () => {
            a.removeEventListener("play", onPlay);
            a.removeEventListener("pause", onPause);
            a.removeEventListener("timeupdate", onTime);
            a.removeEventListener("loadedmetadata", onMeta);
            a.removeEventListener("ended", onEnded);
        };
    }, [ttsBusy]);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;

        const onTime = () => {
            const d = a.duration;
            if (!d || !Number.isFinite(d)) return;

            const ratio = Math.max(0, Math.min(1, a.currentTime / d));
            const segs = activeTextMode === "translation" ? translationSegs : originalSegs;
            if (!segs.length) return;

            let idx = segs.findIndex((s) => ratio >= s.startRatio && ratio < s.endRatio);
            if (idx === -1) idx = segs.length - 1;

            setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
        };

        a.addEventListener("timeupdate", onTime);
        return () => a.removeEventListener("timeupdate", onTime);
    }, [activeTextMode, originalSegs, translationSegs]);

    return {
        audioRef,
        ttsBusy,
        ttsErr,
        setTtsBusy,
        setTtsErr,
        isPlaying,
        currentTime,
        duration,
        activeTextMode,
        activeSentenceIndex,
        stopAudio,
        pauseAudio,
        resumeAudio,
        seekToSentence,
        replaySentence,
        prevSentence,
        nextSentence,
        playTTS,
    };
}