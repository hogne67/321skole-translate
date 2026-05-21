"use client";

import StudentAssignmentTextSection from "./StudentAssignmentTextSection";
import AssignmentTasksHeader from "./AssignmentTasksHeader";
import AssignmentTaskCard from "./AssignmentTaskCard";
import type {
    AnswersMap,
    AutoGrade,
    SentenceSeg,
    Task,
    TranslatedTask,
    TtsLang,
} from "./types";

type Props = {
    lessonLanguage?: string;
    sourceTextSafe: string;
    translatedText: string | null;

    originalSegs: SentenceSeg[];
    translationSegs: SentenceSeg[];

    targetLang: string;
    onTargetLangChange: (v: string) => void;

    translating: null | "text" | "tasks";

    ttsBusy: null | "original" | "translation";
    ttsErr: string | null;

    showTextTranslation: boolean;
    onToggleTextTranslation: () => void;

    activeTextMode: null | "original" | "translation";
    activeSentenceIndex: number | null;

    hasAudio: boolean;

    originalLangForTTS: TtsLang;
    translationLangForTTS: TtsLang;

    autoGrade: AutoGrade | null;

    t: (key: string, values?: Record<string, unknown>) => string;

    onTranslateText: () => void;

    onPlayTTS: (
        text: string,
        lang: TtsLang,
        mode: "original" | "translation"
    ) => Promise<void>;

    onSeekSentence: (
        mode: "original" | "translation",
        idx: number
    ) => void;

    tasksOriginal: Task[];
    answers: AnswersMap;

    translatedTasksMap: Map<string, TranslatedTask>;

    lock: boolean;

    getStableTaskId: (task: Task, idx: number) => string;

    isTaskTranslationVisible: (stableId: string) => boolean;

    getMcqSelectedIndex: (
        stableId: string,
        options: unknown[]
    ) => number | null;

    isTrueSelected: (
        stableId: string,
        v: boolean
    ) => boolean;

    onToggleTranslation: (stableId: string) => void;

    onAnswer: (taskId: string, value: unknown) => void;

    onTranslateTasks: () => void;

    showTaskTranslations: boolean;

    onToggleTaskTranslations: () => void;
};

export default function StandardAssignmentSection({
    lessonLanguage,
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
    autoGrade,
    t,
    onTranslateText,
    onPlayTTS,
    onSeekSentence,
    tasksOriginal,
    answers,
    translatedTasksMap,
    lock,
    getStableTaskId,
    isTaskTranslationVisible,
    getMcqSelectedIndex,
    isTrueSelected,
    onToggleTranslation,
    onAnswer,
    onTranslateTasks,
    showTaskTranslations,
    onToggleTaskTranslations,
}: Props) {
    return (
        <div style={{ display: "grid", gap: 18 }}>
            {sourceTextSafe.trim() ? (
                <StudentAssignmentTextSection
                    sourceTextSafe={sourceTextSafe}
                    translatedText={translatedText}
                    originalSegs={originalSegs}
                    translationSegs={translationSegs}
                    targetLang={targetLang}
                    onTargetLangChange={onTargetLangChange}
                    translating={translating}
                    ttsBusy={ttsBusy}
                    ttsErr={ttsErr}
                    showTextTranslation={showTextTranslation}
                    onToggleTextTranslation={onToggleTextTranslation}
                    activeTextMode={activeTextMode}
                    activeSentenceIndex={activeSentenceIndex}
                    hasAudio={hasAudio}
                    originalLangForTTS={originalLangForTTS}
                    translationLangForTTS={translationLangForTTS}
                    t={t}
                    onTranslateText={onTranslateText}
                    onPlayTTS={onPlayTTS}
                    onSeekSentence={onSeekSentence}
                />
            ) : null}

            <section>
                <AssignmentTasksHeader
                    targetLang={targetLang}
                    translating={translating}
                    tasksCount={tasksOriginal.length}
                    hasTranslatedTasks={translatedTasksMap.size > 0}
                    showTaskTranslations={showTaskTranslations}
                    t={t}
                    onTargetLangChange={onTargetLangChange}
                    onTranslateTasks={onTranslateTasks}
                    onToggleTranslations={onToggleTaskTranslations}
                />

                <div
                    style={{
                        marginTop: 10,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    {tasksOriginal.length === 0 ? (
                        <div style={{ opacity: 0.75 }}>{t("tasks.none")}</div>
                    ) : (
                        tasksOriginal.map((task, idx) => {
                            const stableId = getStableTaskId(task, idx);

                            return (
                                <AssignmentTaskCard
                                    key={stableId}
                                    task={task}
                                    language={lessonLanguage}
                                    stableId={stableId}
                                    answers={answers}
                                    translatedTask={translatedTasksMap.get(stableId)}
                                    showTranslation={isTaskTranslationVisible(stableId)}
                                    autoGrade={autoGrade}
                                    locked={lock}
                                    t={t}
                                    getMcqSelectedIndex={getMcqSelectedIndex}
                                    isTrueSelected={isTrueSelected}
                                    onToggleTranslation={onToggleTranslation}
                                    onAnswer={onAnswer}
                                />
                            );
                        })
                    )}
                </div>
            </section>
        </div>
    );
}
