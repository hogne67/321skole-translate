"use client";

type Props = {
    runtimeActive: boolean;
    secondsLeft: number | null;
    progressPercent: number;
    isRed: boolean;
    formatSeconds: (seconds: number) => string;
};

export default function ReadingTestTimerCard({
    runtimeActive,
    secondsLeft,
    progressPercent,
    isRed,
    formatSeconds,
}: Props) {
    return (
        <div
            style={{
                marginBottom: 12,
                border: `1px solid ${isRed ? "rgba(220,38,38,0.35)" : "rgba(37,99,235,0.25)"
                    }`,
                background: isRed ? "rgba(254,242,242,1)" : "rgba(239,246,255,1)",
                borderRadius: 16,
                padding: 14,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 10,
                }}
            >
                <div style={{ fontWeight: 900 }}>
                    {runtimeActive ? "Testen er i gang" : "Testen er startet"}
                </div>

                <div
                    style={{
                        fontWeight: 900,
                        fontSize: 18,
                        color: isRed ? "rgba(220,38,38,1)" : "rgba(30,64,175,1)",
                    }}
                >
                    {secondsLeft != null ? formatSeconds(secondsLeft) : "Fri tid"}
                </div>
            </div>

            {secondsLeft != null ? (
                <div
                    style={{
                        width: "100%",
                        height: 12,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.9)",
                        overflow: "hidden",
                        border: "1px solid rgba(0,0,0,0.08)",
                    }}
                >
                    <div
                        style={{
                            width: `${progressPercent}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: isRed ? "rgba(220,38,38,1)" : "rgba(37,99,235,1)",
                            transition: "width 1s linear, background 120ms ease",
                        }}
                    />
                </div>
            ) : null}

            <div style={{ marginTop: 8, opacity: 0.8, lineHeight: 1.45 }}>
                Når tiden er ute, blir testen sendt automatisk til læreren.
            </div>
        </div>
    );
}