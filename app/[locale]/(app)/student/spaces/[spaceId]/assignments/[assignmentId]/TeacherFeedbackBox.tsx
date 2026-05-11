"use client";

import { SearchableSelect } from "@/components/SearchableSelect";
import { LANGUAGES } from "@/lib/languages";
import { playButtonStyle, softBlueButtonStyle } from "./assignmentStyles";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
}));

type TFn = (key: string, values?: Record<string, unknown>) => string;

type Props = {
    text: string;
    updatedAt: string | null;
    translatedText: string | null;
    targetLang: string;
    translating: boolean;
    ttsBusy: null | "teacherFeedback" | "teacherFeedbackTranslation";
    t: TFn;
    onTargetLangChange: (value: string) => void;
    onTranslate: () => void;
    onPlayOriginal: () => void;
    onPlayTranslation: () => void;
};

export default function TeacherFeedbackBox({
    text,
    updatedAt,
    translatedText,
    targetLang,
    translating,
    ttsBusy,
    t,
    onTargetLangChange,
    onTranslate,
    onPlayOriginal,
    onPlayTranslation,
}: Props) {
    const cleanText = text.trim();
    const cleanTranslated = String(translatedText ?? "").trim();

    return (
        <div
            style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(59,130,246,0.16)",
                background: "rgba(59,130,246,0.06)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <div style={{ fontWeight: 900 }}>{t("teacherFeedback.title")}</div>

                <button
                    type="button"
                    onClick={onPlayOriginal}
                    disabled={!cleanText || ttsBusy != null}
                    style={{
                        ...playButtonStyle,
                        padding: "7px 10px",
                        opacity: !cleanText || ttsBusy != null ? 0.6 : 1,
                    }}
                >
                    {ttsBusy === "teacherFeedback" ? t("tts.working") : t("tts.playOriginal")}
                </button>
            </div>

            <div style={{ whiteSpace: "pre-wrap", marginTop: 8, lineHeight: 1.55 }}>
                {cleanText}
            </div>

            {updatedAt ? (
                <div style={{ marginTop: 6, opacity: 0.7 }}>
                    {t("teacherFeedback.updatedAt", { at: updatedAt })}
                </div>
            ) : null}

            <div
                style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
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
                    onClick={onTranslate}
                    disabled={translating || !cleanText}
                    style={{
                        ...softBlueButtonStyle,
                        opacity: translating || !cleanText ? 0.6 : 1,
                    }}
                >
                    {translating ? t("translate.working") : t("translate.text")}
                </button>

                {cleanTranslated ? (
                    <button
                        type="button"
                        onClick={onPlayTranslation}
                        disabled={ttsBusy != null}
                        style={{
                            ...playButtonStyle,
                            padding: "7px 10px",
                            opacity: ttsBusy != null ? 0.6 : 1,
                        }}
                    >
                        {ttsBusy === "teacherFeedbackTranslation"
                            ? t("tts.working")
                            : t("tts.playTranslation")}
                    </button>
                ) : null}
            </div>

            {cleanTranslated ? (
                <div
                    style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(59,130,246,0.18)",
                        background: "rgba(255,255,255,0.72)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.55,
                    }}
                >
                    {cleanTranslated}
                </div>
            ) : null}
        </div>
    );
}