export type LessonTextSectionKey =
    | "text"
    | "focus"
    | "words"
    | "sentences"
    | "highfreq_text_1"
    | "highfreq_text_2"
    | "highfreq_text_3"
    | "highfreq_text_4"
    | "highfreq_text_5"
    | "highfreq_explanation"
    | "highfreq_examples";

export type LessonTextSection = {
    key: LessonTextSectionKey;
    title: string;
    text: string;
};

function normalizeHeading(value: string) {
    return value
        .trim()
        .replace(/[:：]+$/g, "")
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

const SOUND_TRAINING_HEADING_KEYS: Record<string, "focus" | "words" | "sentences"> = {
    forklaring: "focus",
    explanation: "focus",
    explicacao: "focus",
    "ord og lydtrening": "words",
    "words and sound training": "words",
    "palavras e treino de som": "words",
    "setninger med lyden": "sentences",
    "sentences with the sound": "sentences",
    "frases com o som": "sentences",
};

function getSoundTrainingTitles(language?: string): Record<"text" | "focus" | "words" | "sentences", string> {
    const lang = String(language || "").trim().toLocaleLowerCase();
    if (lang === "en") {
        return {
            text: "Text",
            focus: "Today we work with the sound",
            words: "Words",
            sentences: "Sentences",
        };
    }
    if (lang === "pt" || lang === "pt-br") {
        return {
            text: "Texto",
            focus: "Hoje trabalhamos com o som",
            words: "Palavras",
            sentences: "Frases",
        };
    }
    return {
        text: "Tekst",
        focus: "I dag jobber vi med lyden",
        words: "Ord",
        sentences: "Setninger",
    };
}

function splitSoundTrainingSections(text: string, language?: string): LessonTextSection[] {
    const clean = text.trim();
    if (!clean) return [];

    const titles = getSoundTrainingTitles(language);
    const sections: LessonTextSection[] = [];
    let current: LessonTextSection = { key: "text", title: titles.text, text: "" };

    for (const rawLine of clean.split(/\r?\n/g)) {
        const headingKey = SOUND_TRAINING_HEADING_KEYS[normalizeHeading(rawLine)];
        if (headingKey) {
            if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
            current = { key: headingKey, title: titles[headingKey], text: "" };
            continue;
        }
        current.text = current.text ? `${current.text}\n${rawLine}` : rawLine;
    }

    if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });

    return sections.some((section) => section.key === "words" || section.key === "sentences")
        ? sections
        : [];
}

const HIGH_FREQUENCY_HEADING_KEYS: Record<string, "highfreq_explanation" | "highfreq_examples"> = {
    forklaring: "highfreq_explanation",
    explanation: "highfreq_explanation",
    explicacao: "highfreq_explanation",
    eksempelsetninger: "highfreq_examples",
    "example sentences": "highfreq_examples",
    "frases de exemplo": "highfreq_examples",
};

function getHighFrequencyTitles(language?: string) {
    const lang = String(language || "").trim().toLocaleLowerCase();
    if (lang === "en") return { text: "Text", explanation: "Explanation", examples: "Example sentences" };
    if (lang === "pt" || lang === "pt-br") return { text: "Texto", explanation: "Explicação", examples: "Frases de exemplo" };
    return { text: "Tekst", explanation: "Forklaring", examples: "Eksempelsetninger" };
}

function highFrequencyTextKey(index: number): LessonTextSectionKey {
    return `highfreq_text_${Math.min(Math.max(index, 1), 5)}` as LessonTextSectionKey;
}

function splitHighFrequencySections(text: string, language?: string): LessonTextSection[] {
    const clean = text.trim();
    if (!clean) return [];

    const titles = getHighFrequencyTitles(language);
    const sections: LessonTextSection[] = [];
    let current: LessonTextSection = { key: "highfreq_text_1", title: titles.text, text: "" };

    for (const rawLine of clean.split(/\r?\n/g)) {
        const headingKey = HIGH_FREQUENCY_HEADING_KEYS[normalizeHeading(rawLine)];
        if (headingKey) {
            if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
            current = {
                key: headingKey,
                title: headingKey === "highfreq_explanation" ? titles.explanation : titles.examples,
                text: "",
            };
            continue;
        }
        current.text = current.text ? `${current.text}\n${rawLine}` : rawLine;
    }

    if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
    if (!sections.some((section) => section.key === "highfreq_explanation" || section.key === "highfreq_examples")) return [];

    const mainSections: LessonTextSection[] = [];
    const restSections: LessonTextSection[] = [];
    for (const section of sections) {
        if (section.key !== "highfreq_text_1") {
            restSections.push(section);
            continue;
        }

        const parts = section.text
            .split(/\n\s*\n/g)
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, 5);

        if (parts.length <= 1) {
            mainSections.push(section);
            continue;
        }

        parts.forEach((part, index) => {
            mainSections.push({
                key: highFrequencyTextKey(index + 1),
                title: `${titles.text} ${index + 1}`,
                text: part,
            });
        });
    }

    return [...mainSections, ...restSections];
}

export function splitLessonTextSections(text: string, language?: string): LessonTextSection[] {
    const soundTrainingSections = splitSoundTrainingSections(text, language);
    if (soundTrainingSections.length) return soundTrainingSections;
    return splitHighFrequencySections(text, language);
}
