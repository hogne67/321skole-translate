"use client";

import {
    btnStyle,
    pauseButtonStyle,
    playButtonStyle,
    softBlueButtonStyle,
    stopButtonStyle,
} from "./assignmentStyles";

type Props = {
    visible: boolean;
    label: string;
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
};

export default function StudentAssignmentAudioBar({
    visible,
    label,
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
}: Props) {
    if (!visible) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: 12,
                right: 12,
                bottom: 12,
                zIndex: 60,
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.14)",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                backdropFilter: "blur(8px)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 8,
                }}
            >
                <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>
                    {t("tts.title")}: {label}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button type="button" style={btnStyle} onClick={onDecreaseRate}>
                        −
                    </button>

                    <span style={{ fontSize: 12, minWidth: 44, textAlign: "center", opacity: 0.8 }}>
                        {playbackRate.toFixed(2)}x
                    </span>

                    <button type="button" style={btnStyle} onClick={onIncreaseRate}>
                        +
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ ...softBlueButtonStyle, minWidth: 44 }} onClick={onPrevSentence} title={t("tts.prev")}>
                    ⏮
                </button>

                <button
                    type="button"
                    style={{ ...(isPlaying ? pauseButtonStyle : playButtonStyle), minWidth: 52, fontWeight: 900 }}
                    onClick={isPlaying ? onPause : onResume}
                    title={isPlaying ? t("tts.pause") : t("tts.resume")}
                >
                    {isPlaying ? "⏸" : "▶"}
                </button>

                <button type="button" style={{ ...stopButtonStyle, minWidth: 44 }} onClick={onStop} title={t("tts.stop")}>
                    ⏹
                </button>

                <button type="button" style={{ ...softBlueButtonStyle, minWidth: 44 }} onClick={onReplay} title={t("tts.replay")}>
                    ↺
                </button>

                <button type="button" style={{ ...softBlueButtonStyle, minWidth: 44 }} onClick={onNextSentence} title={t("tts.next")}>
                    ⏭
                </button>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: "1 1 280px",
                        minWidth: 220,
                        marginLeft: 4,
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
                        style={{ flex: 1 }}
                    />

                    <span style={{ fontSize: 12, opacity: 0.75, width: 40 }}>
                        {formatSeconds(duration)}
                    </span>
                </div>
            </div>
        </div>
    );
}