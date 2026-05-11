"use client";

import type { SentenceSeg } from "./types";

type Props = {
    mode: "original" | "translation";
    segs: SentenceSeg[];
    fallbackText: string;
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
    activeTextMode,
    activeSentenceIndex,
    canSeek,
    noTextLabel,
    clickToSeekLabel,
    onSeek,
}: Props) {
    if (!fallbackText.trim()) {
        return <span style={{ opacity: 0.6 }}>{noTextLabel}</span>;
    }

    if (!segs || segs.length === 0) {
        return <span style={{ whiteSpace: "pre-wrap" }}>{fallbackText}</span>;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {segs.map((s, i) => {
                const isActive = activeTextMode === mode && activeSentenceIndex === i;

                return (
                    <span
                        key={`${mode}_${i}_${s.startChar}`}
                        onClick={() => {
                            if (canSeek) onSeek(mode, i);
                        }}
                        style={{
                            cursor: canSeek ? "pointer" : "default",
                            padding: "4px 8px",
                            borderRadius: 8,
                            background: isActive
                                ? "rgba(255, 230, 120, 0.65)"
                                : "transparent",
                            transition: "background 120ms ease",
                            lineHeight: 1.6,
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