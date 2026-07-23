"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
    btnStyle,
    pauseButtonStyle,
    playButtonStyle,
    softBlueButtonStyle,
    stopButtonStyle,
} from "./assignmentStyles";

type Props = {
    visible: boolean;
    audioActive: boolean;
    playbackRate: number;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    t: (key: string, values?: Record<string, unknown>) => string;
    formatSeconds: (seconds: number) => string;
    onDecreaseRate: () => void;
    onIncreaseRate: () => void;
    onPrevSentence: () => void;
    onNextSentence: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onReplay: () => void;
    onSeek: (value: number) => void;
    showSubmitButton: boolean;
    submitting: boolean;
    submitLabel: string;
    submitDisabled: boolean;
    onSubmit: () => void;
};

export default function StudentAssignmentAudioBar({
    visible,
    audioActive,
    playbackRate,
    isPlaying,
    currentTime,
    duration,
    t,
    formatSeconds,
    onDecreaseRate,
    onIncreaseRate,
    onPrevSentence,
    onNextSentence,
    onPause,
    onResume,
    onStop,
    onReplay,
    onSeek,
    showSubmitButton,
    submitting,
    submitLabel,
    submitDisabled,
    onSubmit,
}: Props) {
    const [isMobileView, setIsMobileView] = useState(false);

    useEffect(() => {
        const update = () => setIsMobileView(window.innerWidth < 720);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    if (!visible) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: isMobileView ? 8 : "50%",
                right: isMobileView ? 8 : undefined,
                width: isMobileView ? "auto" : "calc(100% - 24px)",
                maxWidth: 980,
                bottom: isMobileView ? 8 : 12,
                transform: isMobileView ? "none" : "translateX(-50%)",
                zIndex: 60,
                padding: isMobileView ? 8 : 10,
                borderRadius: isMobileView ? 14 : 16,
                border: "1px solid rgba(0,0,0,0.14)",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                backdropFilter: "blur(8px)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: isMobileView ? 6 : 8, flexWrap: "wrap" }}>
                <button
                    type="button"
                    disabled={!audioActive}
                    style={{
                        ...(isMobileView ? mobileAudioButtonStyle : audioButtonStyle),
                        ...softBlueButtonStyle,
                        opacity: audioActive ? 1 : 0.45,
                    }}
                    onClick={onPrevSentence}
                    title={t("tts.prev")}
                >
                    ⏮
                </button>

                <button
                    type="button"
                    disabled={!audioActive}
                    style={{
                        ...(isMobileView ? mobileAudioPrimaryButtonStyle : audioPrimaryButtonStyle),
                        ...(isPlaying ? pauseButtonStyle : playButtonStyle),
                        opacity: audioActive ? 1 : 0.45,
                    }}
                    onClick={isPlaying ? onPause : onResume}
                    title={isPlaying ? t("tts.pause") : t("tts.resume")}
                >
                    {isPlaying ? "⏸" : "▶"}
                </button>

                <button
                    type="button"
                    disabled={!audioActive}
                    style={{
                        ...(isMobileView ? mobileAudioButtonStyle : audioButtonStyle),
                        ...stopButtonStyle,
                        opacity: audioActive ? 1 : 0.45,
                    }}
                    onClick={onStop}
                    title={t("tts.stop")}
                >
                    ⏹
                </button>

                <button
                    type="button"
                    disabled={!audioActive}
                    style={{
                        ...(isMobileView ? mobileAudioButtonStyle : audioButtonStyle),
                        ...softBlueButtonStyle,
                        opacity: audioActive ? 1 : 0.45,
                    }}
                    onClick={onReplay}
                    title={t("tts.replay")}
                >
                    ↺
                </button>

                <button
                    type="button"
                    disabled={!audioActive}
                    style={{
                        ...(isMobileView ? mobileAudioButtonStyle : audioButtonStyle),
                        ...softBlueButtonStyle,
                        opacity: audioActive ? 1 : 0.45,
                    }}
                    onClick={onNextSentence}
                    title={t("tts.next")}
                >
                    ⏭
                </button>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isMobileView ? 6 : 8,
                        flex: isMobileView ? "1 1 calc(100% - 142px)" : "1 1 240px",
                        minWidth: isMobileView ? 120 : 180,
                        marginLeft: isMobileView ? 0 : 4,
                    }}
                >
                    <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>
                        {formatSeconds(currentTime)}
                    </span>

                    <input
                        type="range"
                        min={0}
                        max={Math.max(0.01, duration || 0)}
                        step={0.05}
                        value={Math.min(currentTime, duration || currentTime)}
                        onChange={(e) => onSeek(Number(e.target.value))}
                        disabled={!audioActive}
                        style={{ flex: 1, opacity: audioActive ? 1 : 0.45 }}
                    />

                    <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>
                        {formatSeconds(duration)}
                    </span>
                </div>

                <div style={speedGroupStyle}>
                    <button type="button" style={isMobileView ? mobileSpeedButtonStyle : speedButtonStyle} onClick={onDecreaseRate}>
                        −
                    </button>

                    <span style={isMobileView ? mobileSpeedValueStyle : speedValueStyle}>
                        {playbackRate.toFixed(2)}x
                    </span>

                    <button type="button" style={isMobileView ? mobileSpeedButtonStyle : speedButtonStyle} onClick={onIncreaseRate}>
                        +
                    </button>
                </div>

                {showSubmitButton ? (
                    <button
                        type="button"
                        disabled={submitDisabled}
                        onClick={onSubmit}
                        style={{
                            ...submitButtonStyle,
                            opacity: submitDisabled ? 0.6 : 1,
                            cursor: submitDisabled ? "not-allowed" : "pointer",
                            flex: isMobileView ? "1 1 0" : "0 0 auto",
                            minWidth: isMobileView ? 132 : undefined,
                        }}
                    >
                        {submitting ? t("actions.saving") : submitLabel}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

const speedGroupStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(248,250,252,0.9)",
};

const speedButtonStyle: CSSProperties = {
    ...btnStyle,
    minWidth: 32,
    minHeight: 32,
    padding: "5px 8px",
    borderRadius: 10,
    fontWeight: 800,
};

const speedValueStyle: CSSProperties = {
    fontSize: 12,
    minWidth: 44,
    textAlign: "center",
    color: "#475569",
    fontWeight: 800,
};

const audioButtonStyle: CSSProperties = {
    minWidth: 40,
    minHeight: 40,
    padding: "8px 10px",
    borderRadius: 12,
};

const mobileAudioButtonStyle: CSSProperties = {
    minWidth: 36,
    minHeight: 36,
    padding: "6px 8px",
    borderRadius: 11,
};

const audioPrimaryButtonStyle: CSSProperties = {
    minWidth: 46,
    minHeight: 40,
    padding: "8px 10px",
    borderRadius: 12,
    fontWeight: 900,
};

const mobileAudioPrimaryButtonStyle: CSSProperties = {
    minWidth: 38,
    minHeight: 36,
    padding: "6px 8px",
    borderRadius: 11,
    fontWeight: 900,
};

const mobileSpeedButtonStyle: CSSProperties = {
    ...speedButtonStyle,
    minWidth: 30,
    minHeight: 30,
    padding: "4px 7px",
};

const mobileSpeedValueStyle: CSSProperties = {
    ...speedValueStyle,
    minWidth: 40,
};

const submitButtonStyle: CSSProperties = {
    border: "1px solid rgba(22,163,74,0.35)",
    background: "rgb(22,163,74)",
    color: "white",
    borderRadius: 12,
    minHeight: 40,
    padding: "8px 14px",
    fontWeight: 900,
    fontSize: 14,
    whiteSpace: "nowrap",
};
