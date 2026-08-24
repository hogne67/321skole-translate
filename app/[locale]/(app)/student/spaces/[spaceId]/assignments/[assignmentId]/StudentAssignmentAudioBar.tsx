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
    showDraftButton: boolean;
    draftSaving: boolean;
    draftDisabled: boolean;
    onSaveDraft: () => void;
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
    showDraftButton,
    draftSaving,
    draftDisabled,
    onSaveDraft,
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
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 60,
                padding: isMobileView ? "10px 12px calc(10px + env(safe-area-inset-bottom))" : "10px 12px",
                borderTop: "1px solid rgba(0,0,0,0.10)",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 -10px 30px rgba(15,23,42,0.10)",
                backdropFilter: "blur(8px)",
            }}
        >
            <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobileView ? 6 : 8, flexWrap: "wrap" }}>
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
                        flex: isMobileView ? "1 1 100%" : "1 1 240px",
                        minWidth: isMobileView ? "100%" : 180,
                        marginLeft: isMobileView ? 0 : 4,
                        order: isMobileView ? 3 : 0,
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
                        style={{ flex: 1, height: isMobileView ? 4 : undefined, opacity: audioActive ? 1 : 0.45 }}
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

                {showDraftButton || showSubmitButton ? (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                showDraftButton && showSubmitButton
                                    ? isMobileView
                                        ? "minmax(0, 0.44fr) minmax(0, 0.56fr)"
                                        : "auto auto"
                                    : "1fr",
                            gap: 8,
                            flex: isMobileView ? "1 1 100%" : "0 0 auto",
                            width: isMobileView ? "100%" : undefined,
                            minWidth: isMobileView ? "100%" : undefined,
                            order: isMobileView ? 4 : 0,
                            marginTop: isMobileView ? 2 : 0,
                        }}
                    >
                        {showDraftButton ? (
                            <button
                                type="button"
                                disabled={draftDisabled}
                                onClick={onSaveDraft}
                                title="Lagrer uten å sende til lærer"
                                style={{
                                    ...draftButtonStyle,
                                    opacity: draftDisabled ? 0.6 : 1,
                                    cursor: draftDisabled ? "not-allowed" : "pointer",
                                    width: "100%",
                                    minWidth: 0,
                                }}
                            >
                                {draftSaving ? "Lagrer kladd..." : "Lagre kladd"}
                            </button>
                        ) : null}

                        {showSubmitButton ? (
                            <button
                                type="button"
                                disabled={submitDisabled}
                                onClick={onSubmit}
                                style={{
                                    ...submitButtonStyle,
                                    opacity: submitDisabled ? 0.6 : 1,
                                    cursor: submitDisabled ? "not-allowed" : "pointer",
                                    width: "100%",
                                    minWidth: 0,
                                }}
                            >
                                {submitting ? t("actions.saving") : submitLabel}
                            </button>
                        ) : null}
                    </div>
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
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "white",
    borderRadius: 12,
    minHeight: 40,
    padding: "8px 14px",
    fontWeight: 900,
    fontSize: 14,
    whiteSpace: "nowrap",
};

const draftButtonStyle: CSSProperties = {
    border: "1px solid rgba(15,23,42,0.18)",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: 12,
    minHeight: 40,
    padding: "8px 12px",
    fontWeight: 900,
    fontSize: 14,
    lineHeight: 1.15,
    whiteSpace: "normal",
};
