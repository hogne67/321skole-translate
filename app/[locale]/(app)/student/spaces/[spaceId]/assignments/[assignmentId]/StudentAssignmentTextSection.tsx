"use client";

import { SearchableSelect } from "@/components/SearchableSelect";
import { LANGUAGES } from "@/lib/languages";
import FollowTextView from "./FollowTextView";
import type { SentenceSeg, TtsLang } from "./types";
import { playButtonStyle, softBlueButtonStyle } from "./assignmentStyles";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
}));

type TFn = (key: string, values?: Record<string, unknown>) => string;

type Props = {
    sourceTextSafe: string;
    translatedText: string | null;
    originalSegs: SentenceSeg[];
    translationSegs: SentenceSeg[];

    targetLang: string;
    onTargetLangChange: (value: string) => void;

    translating: null | "text" | "tasks";
    ttsBusy: null | "original" | "translation";
    ttsErr: string | null;

    showTextTranslation: boolean;
    onToggleTextTranslation: () => void;

    activeTextMode: "original" | "translation" | null;
    activeSentenceIndex: number | null;
    hasAudio: boolean;

    originalLangForTTS: TtsLang;
    translationLangForTTS: TtsLang;

    t: TFn;

    onTranslateText: () => void;
    onPlayTTS: (
        text: string,
        lang: TtsLang,
        mode: "original" | "translation"
    ) => void;
    onSeekSentence: (mode: "original" | "translation", idx: number) => void;
};

export default function StudentAssignmentTextSection({
    sourceTextSafe,
    translatedText,
    originalSegs,
    translationSegs,
    targetLang,
    onTargetLangChange,
    translating,
    ttsBusy,
    ttsErr,
    showTextTranslation,
    onToggleTextTranslation,
    activeTextMode,
    activeSentenceIndex,
    hasAudio,
    originalLangForTTS,
    translationLangForTTS,
    t,
    onTranslateText,
    onPlayTTS,
    onSeekSentence,
}: Props) {
    return (
        <section style={{ display: "grid", gap: 14 }}>
            <section>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 8,
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: 18 }}>{t("text.original")}</h2>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                            type="button"
                            onClick={() => onPlayTTS(sourceTextSafe, originalLangForTTS, "original")}
                            disabled={!sourceTextSafe.trim() || ttsBusy != null}
                            style={{
                                ...playButtonStyle,
                                opacity: !sourceTextSafe.trim() || ttsBusy != null ? 0.7 : 1,
                            }}
                        >
                            {ttsBusy === "original" ? t("tts.working") : t("tts.playOriginal")}
                        </button>

                        <span style={{ opacity: 0.75 }}>{t("translate.targetLang")}</span>

                        <div style={{ minWidth: 190 }}>
                            <SearchableSelect
                                label=""
                                value={targetLang}
                                options={LANGUAGE_OPTIONS}
                                onChange={onTargetLangChange}
                                placeholder={t("translate.targetLang")}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={onTranslateText}
                            disabled={translating === "text" || !sourceTextSafe.trim()}
                            style={{
                                ...softBlueButtonStyle,
                                opacity: translating === "text" ? 0.7 : 1,
                            }}
                        >
                            {translating === "text" ? t("translate.working") : t("translate.text")}
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        border: "1px solid rgba(0,0,0,0.10)",
                        borderRadius: 12,
                        padding: 12,
                        background: "white",
                    }}
                >
                    <FollowTextView
                        mode="original"
                        segs={originalSegs}
                        fallbackText={sourceTextSafe}
                        activeTextMode={activeTextMode}
                        activeSentenceIndex={activeSentenceIndex}
                        canSeek={hasAudio && activeTextMode === "original"}
                        noTextLabel={t("text.noText")}
                        clickToSeekLabel={t("text.clickToSeek")}
                        onSeek={onSeekSentence}
                    />
                </div>
            </section>

            {translatedText ? (
                <section>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                            marginBottom: 8,
                        }}
                    >
                        <h2 style={{ margin: 0, fontSize: 18 }}>{t("text.translation")}</h2>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <button
                                type="button"
                                onClick={() =>
                                    onPlayTTS(String(translatedText ?? ""), translationLangForTTS, "translation")
                                }
                                disabled={!String(translatedText ?? "").trim() || ttsBusy != null}
                                style={{
                                    ...playButtonStyle,
                                    opacity:
                                        !String(translatedText ?? "").trim() || ttsBusy != null
                                            ? 0.7
                                            : 1,
                                }}
                            >
                                {ttsBusy === "translation"
                                    ? t("tts.working")
                                    : t("tts.playTranslation")}
                            </button>

                            <button
                                type="button"
                                onClick={onToggleTextTranslation}
                                style={softBlueButtonStyle}
                            >
                                {showTextTranslation ? t("translate.hide") : t("translate.show")}
                            </button>
                        </div>
                    </div>

                    {showTextTranslation ? (
                        <div
                            style={{
                                border: "1px solid rgba(59,130,246,0.18)",
                                borderRadius: 12,
                                padding: 12,
                                background: "rgba(59,130,246,0.08)",
                            }}
                        >
                            <FollowTextView
                                mode="translation"
                                segs={translationSegs}
                                fallbackText={String(translatedText ?? "")}
                                activeTextMode={activeTextMode}
                                activeSentenceIndex={activeSentenceIndex}
                                canSeek={hasAudio && activeTextMode === "translation"}
                                noTextLabel={t("text.noText")}
                                clickToSeekLabel={t("text.clickToSeek")}
                                onSeek={onSeekSentence}
                            />
                        </div>
                    ) : null}
                </section>
            ) : null}

            {ttsErr ? (
                <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
                    {ttsErr}
                </div>
            ) : null}
        </section>
    );
}