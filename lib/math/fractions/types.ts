// lib/math/fractions/types.ts

export type FractionLanguage = "nb" | "en" | "pt";

export type FractionLevel =
    | "grade_2_4"
    | "grade_5_7"
    | "grade_8_10";

export type FractionDifficulty =
    | "easy"
    | "medium"
    | "hard";

export type FractionTopic =
    | "part_of_whole"
    | "write_fraction"
    | "choose_fraction"
    | "mixed";

export type FractionVisualKind =
    | "bar"
    | "circle"
    | "rectangle";

export type FractionTaskType =
    | "shade_fraction"
    | "write_fraction"
    | "choose_fraction";

export type FractionSpec = {
    numerator: number;
    denominator: number;
};

export type FractionTask = {
    id: string;

    type: FractionTaskType;

    prompt: string;

    visual: FractionVisualKind;

    fraction: FractionSpec;

    // Hvor mange felt som er fargelagt
    shadedParts?: number;

    // Alternativer for multiple choice
    options?: string[];

    answer: string;

    explanation?: string;

    hint?: string;

    expected?: {
        numerator?: number;
        denominator?: number;
        answerText?: string;
    };
};

export type FractionWorksheet = {
    version?: number;

    title: string;

    language: FractionLanguage;

    level: FractionLevel;

    topic: FractionTopic;

    difficulty: FractionDifficulty;

    instructions: string;

    showAnswerKey: boolean;

    showHints?: boolean;

    tasks: FractionTask[];
};
