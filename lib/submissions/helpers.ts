import { Timestamp } from "firebase/firestore";
import type {
    AutoGrade,
    AutoGradeEntry,
    ReviewStatus,
    Role,
    SubmissionDoc,
    SubmissionStatus,
    Task,
} from "./types";

export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

export function readLegacyRole(
    profile: Record<string, unknown>
): Role | null {
    const roles = profile["roles"];

    if (!isRecord(roles)) return null;

    if (roles["admin"] === true) return "admin";
    if (roles["teacher"] === true) return "teacher";
    if (roles["creator"] === true) return "creator";
    if (roles["parent"] === true) return "parent";
    if (roles["student"] === true) return "student";

    return null;
}

export function readRole(profile: unknown): Role | null {
    if (!isRecord(profile)) return null;

    const r = profile["role"];

    if (
        r === "student" ||
        r === "teacher" ||
        r === "admin" ||
        r === "parent" ||
        r === "creator"
    ) {
        return r;
    }

    return readLegacyRole(profile);
}

export function getErrorInfo(err: unknown): {
    code?: string;
    message: string;
} {
    if (err instanceof Error) return { message: err.message };

    if (typeof err === "string") return { message: err };

    if (err && typeof err === "object") {
        const code =
            "code" in err ? (err as { code?: unknown }).code : undefined;

        const message =
            "message" in err
                ? (err as { message?: unknown }).message
                : undefined;

        return {
            code: typeof code === "string" ? code : undefined,
            message:
                typeof message === "string"
                    ? message
                    : JSON.stringify(err),
        };
    }

    return { message: String(err) };
}

export function formatMaybeDate(v: unknown) {
    try {
        if (!v) return "";

        const d: Date | null =
            v instanceof Date
                ? v
                : typeof (v as { toDate?: unknown })?.toDate === "function"
                    ? (v as { toDate: () => Date }).toDate()
                    : v instanceof Timestamp
                        ? v.toDate()
                        : null;

        return d ? d.toLocaleString() : "";
    } catch {
        return "";
    }
}

export function safeNumber(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function safeBoolean(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}

export function formatDuration(
    totalSeconds: number | null | undefined
): string {
    if (
        typeof totalSeconds !== "number" ||
        !Number.isFinite(totalSeconds)
    ) {
        return "—";
    }

    const secs = Math.max(0, Math.floor(totalSeconds));

    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(
            minutes
        ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(
        seconds
    ).padStart(2, "0")}`;
}

export function formatLessonLevel(
    value: string | null | undefined
): string {
    const raw = String(value ?? "").trim();

    if (!raw) return "";

    if (raw === "grade_3_4") return "3.–4. trinn";
    if (raw === "grade_5_7") return "5.–7. trinn";
    if (raw === "grade_8_10") return "8.–10. trinn";

    return raw.replace(/_/g, " ");
}

export function readTeacherFeedbackText(
    sub: SubmissionDoc
): string {
    const tf = sub.teacherFeedback;

    if (!tf || typeof tf !== "object") return "";

    const t = (tf as { text?: unknown }).text;

    return typeof t === "string" ? t : "";
}

export function readAiFeedbackText(
    sub: SubmissionDoc
): string {
    const af = sub.aiFeedback;

    if (!af || typeof af !== "object") return "";

    const t = (af as { text?: unknown }).text;

    return typeof t === "string" ? t : "";
}

export function readStatus(
    sub: SubmissionDoc
): SubmissionStatus {
    const s = sub.status;

    if (typeof s === "string" && s.trim()) {
        return s as SubmissionStatus;
    }

    return "needs_work";
}

export function readStatusDefaultNeedsWork(
    sub: SubmissionDoc
): ReviewStatus {
    const s = sub.status;

    return s === "needs_work" || s === "reviewed"
        ? s
        : "needs_work";
}

export function safeTasksArray(tasks: unknown): Task[] {
    if (Array.isArray(tasks)) return tasks as Task[];

    if (typeof tasks === "string") {
        try {
            const parsed: unknown = JSON.parse(tasks);

            return Array.isArray(parsed)
                ? (parsed as Task[])
                : [];
        } catch {
            return [];
        }
    }

    return [];
}

export function getStableTaskId(
    t: Task,
    idx: number
): string {
    if (t?.id != null && String(t.id).trim()) {
        return String(t.id).trim();
    }

    const orderPart =
        t?.order != null ? String(t.order) : "x";

    const promptPart =
        typeof t?.prompt === "string"
            ? t.prompt.trim().slice(0, 80)
            : "";

    if (promptPart) {
        return `${orderPart}__${promptPart}`;
    }

    return `${orderPart}__idx${idx}`;
}

export function renderValue(v: unknown): string {
    if (v == null) return "";

    if (typeof v === "string") {
        return v.trim();
    }

    if (
        typeof v === "number" ||
        typeof v === "boolean"
    ) {
        return String(v);
    }

    if (Array.isArray(v)) {
        const items = v
            .map((item) => renderValue(item))
            .map((item) => item.trim())
            .filter(Boolean);

        return items.join(", ");
    }

    if (typeof v === "object") {
        const obj = v as Record<string, unknown>;

        const preferredKeys = [
            "text",
            "answer",
            "value",
            "response",
            "content",
            "label",
            "studentAnswer",
        ];

        for (const key of preferredKeys) {
            const candidate = obj[key];

            if (
                typeof candidate === "string" &&
                candidate.trim()
            ) {
                return candidate.trim();
            }

            if (
                typeof candidate === "number" ||
                typeof candidate === "boolean"
            ) {
                return String(candidate);
            }
        }

        const entries = Object.entries(obj)
            .filter(([, value]) => value != null && value !== "")
            .map(([key, value]) => {
                if (typeof value === "string") {
                    return `${key}: ${value}`;
                }

                if (
                    typeof value === "number" ||
                    typeof value === "boolean"
                ) {
                    return `${key}: ${String(value)}`;
                }

                return "";
            })
            .filter(Boolean);

        if (entries.length > 0) {
            return entries.join(" · ");
        }

        return "";
    }

    return String(v);
}

export function getAutoEntry(
    auto: AutoGrade | null,
    stableId: string
): AutoGradeEntry | undefined {
    const byTask = auto?.byTask;

    if (!byTask || typeof byTask !== "object") {
        return undefined;
    }

    const v = (byTask as Record<string, unknown>)[stableId];

    if (!v || typeof v !== "object") {
        return undefined;
    }

    const e = v as Partial<AutoGradeEntry>;

    if (
        e.type !== "mcq" &&
        e.type !== "truefalse"
    ) {
        return undefined;
    }

    if (typeof e.isCorrect !== "boolean") {
        return undefined;
    }

    return e as AutoGradeEntry;
}