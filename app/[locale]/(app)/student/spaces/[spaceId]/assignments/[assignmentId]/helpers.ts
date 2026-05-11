import type {
    AssignmentDoc,
    Lesson,
    SubmissionStatus,
    Task,
    TtsLang,
} from "./types";

export function isPermissionDenied(e: unknown) {
    const err = e as { code?: unknown; message?: unknown };
    const code = String(err?.code ?? "").toLowerCase();
    const msg = String(err?.message ?? "").toLowerCase();
    return (
        code.includes("permission-denied") ||
        code.includes("permission_denied") ||
        msg.includes("missing or insufficient permissions") ||
        msg.includes("insufficient permissions")
    );
}

export function safeTasksArray(tasks: unknown): Task[] {
    if (Array.isArray(tasks)) return tasks as Task[];
    if (typeof tasks === "string") {
        try {
            const parsed: unknown = JSON.parse(tasks);
            return Array.isArray(parsed) ? (parsed as Task[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

export function getStableTaskId(t: Task, idx: number): string {
    if (t?.id != null && String(t.id).trim()) return String(t.id).trim();

    const orderPart = t?.order != null ? String(t.order) : "x";
    const promptPart = typeof t?.prompt === "string" ? t.prompt.trim().slice(0, 80) : "";
    if (promptPart) return `${orderPart}__${promptPart}`;

    return `${orderPart}__idx${idx}`;
}

export function toTtsLang(lang: string): TtsLang {
    const v = (lang || "").toLowerCase().trim();
    if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
    if (v === "en") return "en";
    return "no";
}

export function hasSnapshotContent(a: AssignmentDoc | null): boolean {
    if (!a) return false;
    const hasText = String(a.sourceText ?? a.text ?? "").trim().length > 0;
    const hasTasks = safeTasksArray(a.tasks).length > 0;
    const hasImage = String(a.coverImageUrl ?? "").trim().length > 0;
    const hasMathWorksheet = !!a.mathWorksheet && typeof a.mathWorksheet === "object";
    const hasFractionWorksheet = !!a.fractionWorksheet && typeof a.fractionWorksheet === "object";

    return hasText || hasTasks || hasImage || hasMathWorksheet || hasFractionWorksheet;
}

export function assignmentToLesson(a: AssignmentDoc): Lesson {
    return {
        title: a.title,
        level: a.level,
        topic: a.topic,
        language: a.language,
        sourceText: a.sourceText,
        text: a.text,
        tasks: a.tasks,
        coverImageUrl: a.coverImageUrl,
        status: a.status,
        lessonType: a.lessonType,
        taskType: a.taskType,
        readingTestConfig: a.readingTestConfig ?? null,
        mathWorksheet: a.mathWorksheet ?? null,
        fractionWorksheet: a.fractionWorksheet ?? null,
        mathType: a.mathType,
        contentType: a.contentType,
    };
}

export function normalizeStatus(s: unknown): SubmissionStatus {
    const raw = String(s ?? "").trim();
    if (!raw) return "";

    const lowered = raw.toLowerCase();
    const compact = lowered.replace(/[\s_-]+/g, "");

    if (compact === "needswork") return "needs_work";
    if (compact === "reviewed") return "reviewed";
    if (compact === "approved") return "approved";
    if (compact === "submitted") return "submitted";
    if (compact === "draft") return "draft";
    if (compact === "rejected") return "rejected";

    return lowered as SubmissionStatus;
}

export function isFinalSubmissionStatus(status: SubmissionStatus): boolean {
    const s = normalizeStatus(status);
    return s === "submitted" || s === "reviewed" || s === "approved";
}

export function formatSeconds(totalSeconds: number): string {
    const secs = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(secs / 60);
    const rest = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function stripUndefinedDeep<T>(value: T): T {
    if (value === null) return value;
    if (value === undefined) return value;

    if (Array.isArray(value)) return value.map((v) => stripUndefinedDeep(v)) as unknown as T;

    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v === undefined) continue;
            out[k] = stripUndefinedDeep(v);
        }
        return out as T;
    }

    return value;
}

export function buildSubmissionId(
    spaceId: string | undefined,
    assignmentId: string | undefined,
    currentUid: string,
    editingSubmissionId: string | null
) {
    if (editingSubmissionId) return editingSubmissionId;
    return `${spaceId}_${assignmentId}_${currentUid}`;
}