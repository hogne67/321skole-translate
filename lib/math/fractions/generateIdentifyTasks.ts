// lib/math/fractions/generateIdentifyTasks.ts

import type { FractionTask } from "./types";

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateIdentifyTasks(
    count: number
): FractionTask[] {
    return Array.from({ length: count }).map((_, index) => {
        const denominator = randomInt(2, 8);
        const numerator = randomInt(1, denominator - 1);

        return {
            id: `identify-${index}`,

            type: "write_fraction",

            prompt: "Hva viser figuren?",

            visual: "bar",

            fraction: {
                numerator,
                denominator,
            },

            shadedParts: numerator,

            answer: `${numerator}/${denominator}`,

            expected: {
                numerator,
                denominator,
                answerText: `${numerator}/${denominator}`,
            },
        };
    });
}