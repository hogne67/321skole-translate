export type PodcastWorkshopSegment = {
    id: string;
    title: string;
    hint: string;
};

export type PodcastWorkshopConfig = {
    version: 1;
    assignmentText: string;
    subject: string;
    targetDurationSeconds: number;
    scriptMode: "bullet_points" | "script";
    aiSupport: "coach" | "off";
    criteria: string[];
    vocabulary: string[];
    guidingQuestions: string[];
    segments: PodcastWorkshopSegment[];
};

export type PodcastWorkshopSubmission = {
    version: 1;
    ideas: string;
    notes: string;
    segmentPlans: Record<string, string>;
    segmentScripts: Record<string, string>;
    selfAssessment: Record<string, boolean>;
};

export type PodcastWorkshopRoomKey = "ideas" | "plan" | "script" | "production" | "final";

export type PodcastWorkshopRoomFeedback = {
    text: string;
    status: "approved" | "needs_work" | "";
};

export type PodcastWorkshopFeedback = {
    version: 1;
    rooms: Record<PodcastWorkshopRoomKey, PodcastWorkshopRoomFeedback>;
};

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
}

function readStringMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const safeKey = String(key ?? "").trim();
        if (!safeKey) return;
        out[safeKey] = String(item ?? "");
    });
    return out;
}

function readBoolMap(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, boolean> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const safeKey = String(key ?? "").trim();
        if (!safeKey) return;
        out[safeKey] = item === true;
    });
    return out;
}

export function isPodcastWorkshopType(value: unknown): boolean {
    return String(value ?? "").trim().toLowerCase() === "podcast_workshop";
}

export function readPodcastWorkshopConfig(
    value: unknown,
    fallbackText = ""
): PodcastWorkshopConfig | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;

    const rawSegments = Array.isArray(data.segments) ? data.segments : [];
    const segments = rawSegments
        .map((item, index): PodcastWorkshopSegment | null => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const segment = item as Record<string, unknown>;
            const title = String(segment.title ?? "").trim();
            if (!title) return null;
            const id = String(segment.id ?? `segment_${index + 1}`).trim() || `segment_${index + 1}`;
            return {
                id,
                title,
                hint: String(segment.hint ?? "").trim(),
            };
        })
        .filter((item): item is PodcastWorkshopSegment => !!item);

    if (segments.length === 0) return null;

    const targetDurationSeconds =
        typeof data.targetDurationSeconds === "number" && Number.isFinite(data.targetDurationSeconds)
            ? Math.max(60, Math.floor(data.targetDurationSeconds))
            : 180;

    const scriptMode = data.scriptMode === "script" ? "script" : "bullet_points";
    const aiSupport = data.aiSupport === "off" ? "off" : "coach";

    return {
        version: 1,
        assignmentText: String(data.assignmentText ?? fallbackText ?? "").trim(),
        subject: String(data.subject ?? "").trim(),
        targetDurationSeconds,
        scriptMode,
        aiSupport,
        criteria: readStringArray(data.criteria),
        vocabulary: readStringArray(data.vocabulary),
        guidingQuestions: readStringArray(data.guidingQuestions),
        segments,
    };
}

export function createPodcastWorkshopSubmission(
    config: PodcastWorkshopConfig | null
): PodcastWorkshopSubmission {
    const selfAssessment: Record<string, boolean> = {};
    (config?.criteria ?? []).forEach((_criterion, index) => {
        selfAssessment[`criterion_${index}`] = false;
    });

    return {
        version: 1,
        ideas: "",
        notes: "",
        segmentPlans: {},
        segmentScripts: {},
        selfAssessment,
    };
}

export function readPodcastWorkshopSubmission(
    value: unknown,
    config: PodcastWorkshopConfig | null
): PodcastWorkshopSubmission {
    const base = createPodcastWorkshopSubmission(config);
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;

    const data = value as Record<string, unknown>;
    return {
        version: 1,
        ideas: String(data.ideas ?? ""),
        notes: String(data.notes ?? ""),
        segmentPlans: {
            ...base.segmentPlans,
            ...readStringMap(data.segmentPlans),
        },
        segmentScripts: {
            ...base.segmentScripts,
            ...readStringMap(data.segmentScripts),
        },
        selfAssessment: {
            ...base.selfAssessment,
            ...readBoolMap(data.selfAssessment),
        },
    };
}

export function createPodcastWorkshopFeedback(): PodcastWorkshopFeedback {
    return {
        version: 1,
        rooms: {
            ideas: { text: "", status: "" },
            plan: { text: "", status: "" },
            script: { text: "", status: "" },
            production: { text: "", status: "" },
            final: { text: "", status: "" },
        },
    };
}

export function readPodcastWorkshopFeedback(value: unknown): PodcastWorkshopFeedback {
    const base = createPodcastWorkshopFeedback();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;

    const data = value as Record<string, unknown>;
    const roomsRaw =
        data.rooms && typeof data.rooms === "object" && !Array.isArray(data.rooms)
            ? (data.rooms as Record<string, unknown>)
            : {};

    const rooms = { ...base.rooms };
    (Object.keys(rooms) as PodcastWorkshopRoomKey[]).forEach((key) => {
        const roomRaw = roomsRaw[key];
        if (!roomRaw || typeof roomRaw !== "object" || Array.isArray(roomRaw)) return;
        const room = roomRaw as Record<string, unknown>;
        const rawStatus = String(room.status ?? "").trim();
        rooms[key] = {
            text: String(room.text ?? ""),
            status:
                rawStatus === "approved" || rawStatus === "needs_work"
                    ? rawStatus
                    : "",
        };
    });

    return { version: 1, rooms };
}
