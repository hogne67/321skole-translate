"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { SentenceSeg } from "./types";

type Props = {
    mode: "original" | "translation";
    segs: SentenceSeg[];
    fallbackText: string;
    textStyle?: CSSProperties;
    activeTextMode: "original" | "translation" | null;
    activeSentenceIndex: number | null;
    canSeek: boolean;
    noTextLabel: string;
    clickToSeekLabel: string;
    onSeek: (mode: "original" | "translation", idx: number) => void;
};

export default function FollowTextView({
    mode,
    segs,
    fallbackText,
    textStyle,
    activeTextMode,
    activeSentenceIndex,
    canSeek,
    noTextLabel,
    clickToSeekLabel,
    onSeek,
}: Props) {
    const activeRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        if (!activeRef.current) return;
        activeRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
        });
    }, [activeSentenceIndex, activeTextMode, mode]);

    if (!fallbackText.trim()) {
        return <span style={{ opacity: 0.6 }}>{noTextLabel}</span>;
    }

    if (!segs || segs.length === 0) {
        return <span style={{ whiteSpace: "pre-wrap", ...textStyle }}>{fallbackText}</span>;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {segs.map((s, i) => {
                const isActive = activeTextMode === mode && activeSentenceIndex === i;

                return (
                    <span
                        key={`${mode}_${i}_${s.startChar}`}
                        ref={isActive ? activeRef : undefined}
                        onClick={() => {
                            if (canSeek) onSeek(mode, i);
                        }}
                        style={{
                            cursor: canSeek ? "pointer" : "default",
                            padding: "4px 9px",
                            borderRadius: 9,
                            background: isActive
                                ? "rgba(255, 230, 120, 0.78)"
                                : "transparent",
                            boxShadow: isActive ? "0 0 0 1px rgba(234,179,8,0.16)" : "none",
                            transition: "background 120ms ease, box-shadow 120ms ease",
                            lineHeight: 1.6,
                            ...textStyle,
                        }}
                        title={canSeek ? clickToSeekLabel : undefined}
                    >
                        {s.text}
                    </span>
                );
            })}
        </div>
    );
}
