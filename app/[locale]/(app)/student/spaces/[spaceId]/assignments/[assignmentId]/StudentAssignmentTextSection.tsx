"use client";

import type React from "react";
import FollowTextView from "./FollowTextView";
import type { SentenceSeg, TranslatingState, TtsLang } from "./types";
import { playButtonStyle, softBlueButtonStyle } from "./assignmentStyles";
import { segmentSentences } from "./audioHelpers";
import type { LessonTextSection, LessonTextSectionKey } from "./lessonTextSections";
import type { TextSize } from "./types";

type TFn = (key: string, values?: Record<string, unknown>) => string;

function getReadingTextStyle(textSize: TextSize): React.CSSProperties {
    if (textSize === "xlarge") {
        return { fontSize: 21, lineHeight: 1.75 };
    }
    if (textSize === "large") {
        return { fontSize: 18, lineHeight: 1.7 };
    }
    return { fontSize: 16, lineHeight: 1.6 };
}

type Props = {
    sourceTextSafe: string;
    textSize: TextSize;
    translatedText: string | null;
    lessonTextSections: LessonTextSection[];
    translatedSectionMap: Map<string, string>;
    originalSegs: SentenceSeg[];
    translationSegs: SentenceSeg[];
    activeTextSectionKey: LessonTextSectionKey | null;

    translating: TranslatingState;
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
    onTranslateSection: (key: string, text: string) => void;
    onPlayTTS: (
        text: string,
        lang: TtsLang,
        mode: "original" | "translation"
    ) => void;
    onPlaySectionTTS: (
        key: LessonTextSectionKey,
        text: string,
        lang: TtsLang,
        mode: "original" | "translation"
    ) => void;
    onSeekSentence: (mode: "original" | "translation", idx: number) => void;
};

export default function StudentAssignmentTextSection({
    sourceTextSafe,
    textSize,
    translatedText,
    lessonTextSections,
    translatedSectionMap,
    originalSegs,
    translationSegs,
    activeTextSectionKey,
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
    onTranslateSection,
    onPlayTTS,
    onPlaySectionTTS,
    onSeekSentence,
}: Props) {
    const showSectionCards = lessonTextSections.length >= 2;
    const readingTextStyle = getReadingTextStyle(textSize);

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

                    {!showSectionCards ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                            type="button"
                            onClick={() => onPlayTTS(sourceTextSafe, originalLangForTTS, "original")}
                            disabled={!sourceTextSafe.trim() || ttsBusy != null}
                            style={{
                                ...playButtonStyle,
                                opacity: !sourceTextSafe.trim() || ttsBusy != null ? 0.7 : 1,
                            }}
                            title={t("tts.playOriginal")}
                            aria-label={t("tts.playOriginal")}
                        >
                            {ttsBusy === "original" ? "…" : "🔊"}
                        </button>

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
                    ) : null}
                </div>

                {showSectionCards ? (
                    <div style={{ display: "grid", gap: 12 }}>
                        {lessonTextSections.map((section) => {
                            const translatedSection = translatedSectionMap.get(section.key) || "";
                            const sectionSegs = segmentSentences(section.text).segs;
                            const isSectionActive = activeTextSectionKey === section.key;

                            return (
                                <div
                                    key={section.key}
                                    style={{
                                        border: "1px solid rgba(0,0,0,0.10)",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "white",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                            gap: 10,
                                            flexWrap: "wrap",
                                            marginBottom: 8,
                                        }}
                                    >
                                        <h3 style={{ margin: 0, fontSize: 17 }}>{section.title}</h3>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <button
                                                type="button"
                                                onClick={() => onPlaySectionTTS(section.key, section.text, originalLangForTTS, "original")}
                                                disabled={!section.text.trim() || ttsBusy != null}
                                                style={{
                                                    ...playButtonStyle,
                                                    opacity: !section.text.trim() || ttsBusy != null ? 0.7 : 1,
                                                }}
                                                title={t("tts.playOriginal")}
                                                aria-label={t("tts.playOriginal")}
                                            >
                                                {ttsBusy === "original" && isSectionActive ? "…" : "🔊"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onTranslateSection(section.key, section.text)}
                                                disabled={translating === `section:${section.key}` || !section.text.trim()}
                                                style={{
                                                    ...softBlueButtonStyle,
                                                    opacity: translating === `section:${section.key}` ? 0.7 : 1,
                                                }}
                                            >
                                                {translating === `section:${section.key}` ? t("translate.working") : t("translate.text")}
                                            </button>
                                        </div>
                                    </div>

                                    <FollowTextView
                                        mode="original"
                                        segs={sectionSegs}
                                        fallbackText={section.text}
                                        textStyle={readingTextStyle}
                                        activeTextMode={isSectionActive ? activeTextMode : null}
                                        activeSentenceIndex={activeSentenceIndex}
                                        canSeek={hasAudio && activeTextMode === "original" && isSectionActive}
                                        noTextLabel={t("text.noText")}
                                        clickToSeekLabel={t("text.clickToSeek")}
                                        onSeek={onSeekSentence}
                                    />

                                    {translatedSection ? (
                                        <div
                                            style={{
                                                marginTop: 10,
                                                border: "1px solid rgba(59,130,246,0.18)",
                                                borderRadius: 12,
                                                padding: 10,
                                                background: "rgba(59,130,246,0.08)",
                                            }}
                                        >
                                            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
                                                {t("translate.translatedLabel")}
                                            </div>
                                            <div style={{ whiteSpace: "pre-wrap", ...readingTextStyle }}>{translatedSection}</div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : (
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
                        textStyle={readingTextStyle}
                        activeTextMode={activeTextMode}
                        activeSentenceIndex={activeSentenceIndex}
                        canSeek={hasAudio && activeTextMode === "original"}
                        noTextLabel={t("text.noText")}
                        clickToSeekLabel={t("text.clickToSeek")}
                        onSeek={onSeekSentence}
                    />
                </div>
                )}
            </section>

            {!showSectionCards && translatedText ? (
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
                                title={t("tts.playTranslation")}
                                aria-label={t("tts.playTranslation")}
                            >
                                {ttsBusy === "translation" ? "…" : "🔊"}
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
                                textStyle={readingTextStyle}
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
