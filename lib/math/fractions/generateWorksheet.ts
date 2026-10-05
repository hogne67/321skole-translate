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

export type GenerateFractionWorksheetRequest = {
    language?: string;
    level?: string;
    topic?: string;
    difficulty?: string;
    taskCount?: number;
    showAnswerKey?: boolean;
    visualKinds?: string[];
    denominatorMin?: number;
    denominatorMax?: number;
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

function makeFraction(denominators: number[]) {
    const denominator = randomFrom(denominators);
    const numerator = Math.floor(Math.random() * denominator) + 1;

    return {
        numerator,
        denominator,
    };
}

export function makeWrongOptions(numerator: number, denominator: number): string[] {
    const options = [fractionText(numerator, denominator)];
    const add = (n: number, d: number) => {
        if (options.length >= 3 || n < 0 || n > d) return;
        if (n * denominator === numerator * d) return;
        if (options.some((value) => {
            const [otherN, otherD] = value.split("/").map(Number);
            return otherN * d === n * otherD;
        })) return;
        options.push(fractionText(n, d));
    };
    add(numerator + 1, denominator);
    add(numerator - 1, denominator);
    add(denominator - numerator, denominator);
    for (let n = 0; n <= denominator && options.length < 3; n += 1) add(n, denominator);
    return shuffle(options);
}

function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function balancedChoices<T>(items: T[], count: number): T[] {
    const result: T[] = [];
    while (result.length < count) result.push(...shuffle(items));
    return result.slice(0, count);
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
    denominators: number[];
    type: FractionTaskType;
    visual: FractionVisualKind;
}): FractionTask {
    const type = params.type;
    const fraction = makeFraction(params.denominators);
    const answer = fractionText(fraction.numerator, fraction.denominator);
    const visual = params.visual;

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

export function normalizeRequest(body: GenerateFractionWorksheetRequest) {
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
    const denominatorRange = normalizeDenominatorRange(body);
    const denominators = denominatorRange
        ? Array.from({ length: denominatorRange.max - denominatorRange.min + 1 }, (_, i) => denominatorRange.min + i)
        : getDenominatorPool(difficulty);

    return {
        language,
        level,
        topic,
        difficulty,
        taskCount,
        showAnswerKey,
        visualKinds,
        denominatorRange,
        denominators,
    };
}

export function generateWorksheet(params: ReturnType<typeof normalizeRequest>): FractionWorksheet {
    const types = balancedChoices(buildTaskTypes(params.topic), params.taskCount);
    const visuals = balancedChoices(params.visualKinds, params.taskCount);
    const tasks = Array.from({ length: params.taskCount }, (_, index) =>
        generateTask({
            index,
            language: params.language,
            denominators: params.denominators,
            type: types[index],
            visual: visuals[index],
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
        ...(params.denominatorRange ? { denominatorRange: params.denominatorRange } : {}),
        tasks,
    };
}


function normalizeDenominatorRange(body: GenerateFractionWorksheetRequest) {
    if (body.denominatorMin === undefined && body.denominatorMax === undefined) return null;
    const min = body.denominatorMin ?? 2;
    const max = body.denominatorMax ?? 12;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 2 || max > 12 || min > max) {
        throw new Error("INVALID_DENOMINATOR_RANGE");
    }
    return { min, max };
}
