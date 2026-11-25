export type AssignmentDoc = {
    title?: string;
    description?: string;
    instructions?: string;
    text?: string;
    sourceText?: string;
    tasks?: unknown;
    coverImageUrl?: string;
    imageUrl?: string;
    sourceType?: string;
    sourceId?: string;
    language?: string;
    [k: string]: unknown;
};

export type Task = {
    id?: string;
    order?: number;
    type?: string;
    prompt?: string;
    question?: string;
    text?: string;
    sentence?: string;
    options?: unknown;
    choices?: unknown;
    alternatives?: unknown;
    answer?: unknown;
    correctAnswer?: unknown;
    isTrue?: unknown;
};

export type ChildSelfReport = {
    readSilently?: boolean;
    readAloud?: boolean;
    completedTasks?: boolean;
    feltEasy?: boolean;
    feltHard?: boolean;
    comment?: string;
};

export type SubmissionDoc = {
    answers?: Record<string, string | boolean>;
    childSelfReport?: ChildSelfReport;
    status?: string;
    aiFeedback?: string | null;
    auto?: {
        score?: number;
        maxScore?: number;
        correctCount?: number;
        totalAutoGraded?: number;
        byTask?: Record<string, { correct?: boolean }>;
    };
};

export type ParentReviewDoc = {
    uid?: string;
    comment?: string;
    stars?: number;
    updatedAt?: unknown;
};

export function safeString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isDelivered(status: unknown): boolean {
    const value = safeString(status)?.toLowerCase();
    return value === "submitted" || value === "reviewed" || value === "approved";
}

export function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
    return `${spaceId}_${assignmentId}_${uid}`;
}

export function safeTasksArray(tasks: unknown): Task[] {
    if (Array.isArray(tasks)) return tasks.filter(isRecord);

    if (typeof tasks === "string") {
        try {
            const parsed: unknown = JSON.parse(tasks);
            return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
        } catch {
            return [];
        }
    }

    return [];
}

export function sortTasksByOrder(a: Task, b: Task) {
    const ao = typeof a.order === "number" ? a.order : 999;
    const bo = typeof b.order === "number" ? b.order : 999;
    return ao - bo;
}

export function getStableTaskId(t: Task, idx: number): string {
    if (t.id != null && String(t.id).trim()) return String(t.id).trim();

    const orderPart = t.order != null ? String(t.order) : "x";
    const prompt =
        safeString(t.prompt) ??
        safeString(t.question) ??
        safeString(t.text) ??
        safeString(t.sentence) ??
        "";

    if (prompt) return `${orderPart}__${prompt.slice(0, 80)}`;
    return `${orderPart}__idx${idx}`;
}

export function taskPrompt(t: Task): string {
    return (
        safeString(t.prompt) ??
        safeString(t.question) ??
        safeString(t.text) ??
        safeString(t.sentence) ??
        ""
    );
}

export function taskType(t: Task): "mcq" | "truefalse" | "open" {
    const raw = (safeString(t.type) ?? "open").toLowerCase();

    if (raw === "mcq" || raw === "multiplechoice" || raw === "multiple_choice") return "mcq";
    if (raw === "truefalse" || raw === "true_false" || raw === "boolean") return "truefalse";

    return "open";
}

export function taskOptions(t: Task): string[] {
    const raw = Array.isArray(t.options)
        ? t.options
        : Array.isArray(t.choices)
            ? t.choices
            : Array.isArray(t.alternatives)
                ? t.alternatives
                : [];

    return raw
        .map((v) => {
            if (typeof v === "string") return v.trim();

            if (isRecord(v)) {
                return (
                    safeString(v.text) ??
                    safeString(v.label) ??
                    safeString(v.value) ??
                    safeString(v.title) ??
                    ""
                );
            }

            return "";
        })
        .filter(Boolean);
}

function normalizeAnswerString(v: unknown): string {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return v.trim().toLowerCase();
    return "";
}

export function evaluateAnswers(tasks: Task[], answers: Record<string, string | boolean>) {
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;

    const results: Array<[string, { correct?: boolean }]> = [];

    tasks.forEach((t, idx) => {
        const stableId = getStableTaskId(t, idx);
        const type = taskType(t);
        const answer = Object.hasOwn(answers, stableId) ? answers[stableId] : undefined;

        if (type === "open") {
            results.push([stableId, {}]);
            return;
        }

        maxScore += 1;

        const expectedRaw =
            typeof t.correctAnswer !== "undefined"
                ? t.correctAnswer
                : typeof t.answer !== "undefined"
                    ? t.answer
                    : typeof t.isTrue !== "undefined"
                        ? t.isTrue
                        : null;

        let correct = false;

        if (type === "truefalse") {
            const expected =
                typeof expectedRaw === "boolean"
                    ? expectedRaw
                    : normalizeAnswerString(expectedRaw) === "true";

            const actual =
                typeof answer === "boolean"
                    ? answer
                    : normalizeAnswerString(answer) === "true";

            correct = expected === actual;
        } else {
            const expected = normalizeAnswerString(expectedRaw);
            const actual = normalizeAnswerString(answer);
            correct = !!expected && expected === actual;
        }

        results.push([stableId, { correct }]);

        if (correct) {
            score += 1;
            correctCount += 1;
        }
    });

    return {
        score,
        maxScore,
        correctCount,
        totalAutoGraded: maxScore,
        byTask: Object.fromEntries(results),
    };
}

export function firstLongText(d: AssignmentDoc): string {
    return (
        safeString(d.sourceText) ??
        safeString(d.text) ??
        safeString(d.description) ??
        safeString(d.instructions) ??
        ""
    );
}
