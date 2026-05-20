import { NextResponse } from "next/server";
import type {
    FractionDifficulty,
    FractionLanguage,
    FractionLevel,
    FractionTask,
    FractionTaskType,
    FractionTopic,
    FractionVisualKind,
    FractionWorksheet,
} from "@/lib/math/fractions/types";

export const runtime = "nodejs";

type GenerateFractionWorksheetRequest = {
    language?: string;
    level?: string;
    topic?: string;
    difficulty?: string;
    taskCount?: number;
    showAnswerKey?: boolean;
    visualKinds?: string[];
};

const ALL_VISUALS: FractionVisualKind[] = ["bar", "rectangle", "circle"];

function isLanguage(value: unknown): value is FractionLanguage {
    return value === "nb" || value === "en" || value === "pt";
}

function isLevel(value: unknown): value is FractionLevel {
    return (
        value === "grade_2_4" ||
        value === "grade_5_7" ||
        value === "grade_8_10"
    );
}

function isDifficulty(value: unknown): value is FractionDifficulty {
    return value === "easy" || value === "medium" || value === "hard";
}

function isTopic(value: unknown): value is FractionTopic {
    return (
        value === "part_of_whole" ||
        value === "write_fraction" ||
        value === "choose_fraction" ||
        value === "mixed"
    );
}

function isVisualKind(value: unknown): value is FractionVisualKind {
    return value === "bar" || value === "rectangle" || value === "circle";
}

function normalizeLanguage(value: unknown): FractionLanguage {
    if (value === "no") return "nb";
    return isLanguage(value) ? value : "nb";
}

function clampTaskCount(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 6;
    return Math.max(3, Math.min(12, Math.round(value)));
}

function normalizeVisualKinds(value: unknown): FractionVisualKind[] {
    if (!Array.isArray(value)) return ALL_VISUALS;

    const filtered = value.filter(isVisualKind);
    return filtered.length > 0 ? Array.from(new Set(filtered)) : ALL_VISUALS;
}

function randomFrom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function makeId(index: number): string {
    return `${index + 1}`;
}

function fractionText(numerator: number, denominator: number): string {
    return `${numerator}/${denominator}`;
}

function getTitle(language: FractionLanguage, topic: FractionTopic): string {
    const titles: Record<FractionLanguage, Record<FractionTopic, string>> = {
        nb: {
            part_of_whole: "Brøk – del av helhet",
            write_fraction: "Brøk – skriv brøken",
            choose_fraction: "Brøk – velg riktig brøk",
            mixed: "Brøk – del av helhet",
        },
        en: {
            part_of_whole: "Fractions – parts of a whole",
            write_fraction: "Fractions – write the fraction",
            choose_fraction: "Fractions – choose the correct fraction",
            mixed: "Fractions – parts of a whole",
        },
        pt: {
            part_of_whole: "Frações – partes de um todo",
            write_fraction: "Frações – escreve a fração",
            choose_fraction: "Frações – escolhe a fração correta",
            mixed: "Frações – partes de um todo",
        },
    };

    return titles[language][topic];
}

function getInstructions(language: FractionLanguage): string {
    if (language === "nb") {
        return "Se på figuren og svar på oppgavene.";
    }

    if (language === "pt") {
        return "Observa a figura e responde às tarefas.";
    }

    return "Look at the figure and answer the questions.";
}

function getDenominatorPool(difficulty: FractionDifficulty): number[] {
    if (difficulty === "easy") return [2, 3, 4, 5];
    if (difficulty === "medium") return [2, 3, 4, 5, 6, 7, 8];
    return [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
}

function makeFraction(difficulty: FractionDifficulty) {
    const denominator = randomFrom(getDenominatorPool(difficulty));
    const numerator = Math.floor(Math.random() * denominator) + 1;

    return {
        numerator,
        denominator,
    };
}

function makeWrongOptions(
    numerator: number,
    denominator: number
): string[] {
    const correct = fractionText(numerator, denominator);
    const options = new Set<string>([correct]);

    if (numerator + 1 <= denominator) {
        options.add(fractionText(numerator + 1, denominator));
    }

    if (numerator - 1 >= 1) {
        options.add(fractionText(numerator - 1, denominator));
    }

    if (denominator > 2) {
        options.add(fractionText(numerator, denominator - 1));
    }

    options.add(fractionText(denominator - numerator, denominator));

    for (let n = 1; n <= denominator && options.size < 3; n += 1) {
        options.add(fractionText(n, denominator));
    }

    const nearbyDenominators = [
        denominator + 1,
        denominator + 2,
        Math.max(2, denominator - 1),
    ];

    for (const d of nearbyDenominators) {
        for (let n = 1; n <= d && options.size < 3; n += 1) {
            options.add(fractionText(Math.min(n, d), d));
        }
    }

    return Array.from(options)
        .slice(0, 3)
        .sort(() => Math.random() - 0.5);
}

function promptForTask(
    language: FractionLanguage,
    type: FractionTaskType,
    answer: string
): string {
    if (language === "nb") {
        if (type === "shade_fraction") return `Fargelegg ${answer} av figuren.`;
        if (type === "choose_fraction") return "Hvilken brøk viser figuren?";
        return "Skriv brøken som er fargelagt.";
    }

    if (language === "pt") {
        if (type === "shade_fraction") return `Pinta ${answer} da figura.`;
        if (type === "choose_fraction") return "Que fração mostra a figura?";
        return "Escreve a fração que está pintada.";
    }

    if (type === "shade_fraction") return `Shade ${answer} of the figure.`;
    if (type === "choose_fraction") return "Which fraction does the figure show?";
    return "Write the fraction that is shaded.";
}

function hintForTask(language: FractionLanguage, type: FractionTaskType): string {
    if (language === "nb") {
        if (type === "shade_fraction") {
            return "Nevneren forteller hvor mange like deler figuren har. Telleren forteller hvor mange deler du skal fargelegge.";
        }
        return "Tell hvor mange deler som er fargelagt, og hvor mange deler figuren har totalt.";
    }

    if (language === "pt") {
        if (type === "shade_fraction") {
            return "O denominador mostra quantas partes iguais há. O numerador mostra quantas partes deves pintar.";
        }
        return "Conta quantas partes estão pintadas e quantas partes há no total.";
    }

    if (type === "shade_fraction") {
        return "The denominator tells how many equal parts there are. The numerator tells how many parts to shade.";
    }

    return "Count how many parts are shaded and how many parts there are in total.";
}

function explanationForTask(
    language: FractionLanguage,
    numerator: number,
    denominator: number
): string {
    const answer = fractionText(numerator, denominator);

    if (language === "nb") {
        return `${numerator} av ${denominator} like deler er fargelagt. Derfor er brøken ${answer}.`;
    }

    if (language === "pt") {
        return `${numerator} de ${denominator} partes iguais estão pintadas. Por isso, a fração é ${answer}.`;
    }

    return `${numerator} out of ${denominator} equal parts are shaded. The fraction is ${answer}.`;
}

function buildTaskTypes(topic: FractionTopic): FractionTaskType[] {
    if (topic === "part_of_whole") {
        return ["shade_fraction"];
    }

    if (topic === "write_fraction") {
        return ["write_fraction"];
    }

    if (topic === "choose_fraction") {
        return ["choose_fraction"];
    }

    return ["shade_fraction", "write_fraction", "choose_fraction"];
}

function generateTask(params: {
    index: number;
    language: FractionLanguage;
    difficulty: FractionDifficulty;
    topic: FractionTopic;
    visualKinds: FractionVisualKind[];
}): FractionTask {
    const type = randomFrom(buildTaskTypes(params.topic));
    const fraction = makeFraction(params.difficulty);
    const answer = fractionText(fraction.numerator, fraction.denominator);
    const visual = randomFrom(params.visualKinds);

    return {
        id: makeId(params.index),
        type,
        prompt: promptForTask(params.language, type, answer),
        visual,
        fraction,
        shadedParts: type === "shade_fraction" ? 0 : fraction.numerator,
        options:
            type === "choose_fraction"
                ? makeWrongOptions(fraction.numerator, fraction.denominator)
                : undefined,
        answer,
        hint: hintForTask(params.language, type),
        explanation: explanationForTask(
            params.language,
            fraction.numerator,
            fraction.denominator
        ),
        expected: {
            numerator: fraction.numerator,
            denominator: fraction.denominator,
            answerText: answer,
        },
    };
}

function normalizeRequest(body: GenerateFractionWorksheetRequest) {
    const language = normalizeLanguage(body.language);

    const level: FractionLevel = isLevel(body.level)
        ? body.level
        : "grade_2_4";

    const topic: FractionTopic = isTopic(body.topic)
        ? body.topic
        : "mixed";

    const difficulty: FractionDifficulty = isDifficulty(body.difficulty)
        ? body.difficulty
        : "easy";

    const taskCount = clampTaskCount(body.taskCount);

    const showAnswerKey =
        typeof body.showAnswerKey === "boolean" ? body.showAnswerKey : false;

    const visualKinds = normalizeVisualKinds(body.visualKinds);

    return {
        language,
        level,
        topic,
        difficulty,
        taskCount,
        showAnswerKey,
        visualKinds,
    };
}

function generateWorksheet(params: ReturnType<typeof normalizeRequest>): FractionWorksheet {
    const tasks = Array.from({ length: params.taskCount }, (_, index) =>
        generateTask({
            index,
            language: params.language,
            difficulty: params.difficulty,
            topic: params.topic,
            visualKinds: params.visualKinds,
        })
    );

    return {
        version: 1,
        title: getTitle(params.language, params.topic),
        language: params.language,
        level: params.level,
        topic: params.topic,
        difficulty: params.difficulty,
        instructions: getInstructions(params.language),
        showAnswerKey: params.showAnswerKey,
        tasks,
    };
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GenerateFractionWorksheetRequest;
        const params = normalizeRequest(body);
        const worksheet = generateWorksheet(params);

        return NextResponse.json({
            ok: true,
            worksheet,
        });
    } catch (error) {
        console.error("generate-fraction-worksheet failed:", error);

        const message =
            error instanceof Error
                ? error.message
                : "Failed to generate fraction worksheet";

        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status: 500 }
        );
    }
}
