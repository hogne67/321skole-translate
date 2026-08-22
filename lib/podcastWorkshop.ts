import type { StudentAudioAsset } from "@/lib/audio/studentAudio";

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
    productionSegments: Record<string, PodcastWorkshopProductionSegment>;
    selfAssessment: Record<string, boolean>;
};

export type PodcastWorkshopProductionSegment = {
    voice: StudentAudioAsset | null;
    volume: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
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

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.max(min, Math.min(max, n));
}

function readAudioAsset(value: unknown): StudentAudioAsset | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    const audioDataUrl = typeof data.audioDataUrl === "string" ? data.audioDataUrl : "";
    const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";
    if (!audioDataUrl && !storagePath) return null;
    return {
        version: 1,
        activityType: "podcast",
        audioDataUrl: audioDataUrl || undefined,
        storagePath: storagePath || undefined,
        mimeType: typeof data.mimeType === "string" ? data.mimeType : "audio/webm",
        durationSeconds: readNumber(data.durationSeconds, 0, 0, 60 * 60),
        sizeBytes: typeof data.sizeBytes === "number" && Number.isFinite(data.sizeBytes) ? data.sizeBytes : undefined,
        recordedAt: typeof data.recordedAt === "number" && Number.isFinite(data.recordedAt) ? data.recordedAt : Date.now(),
        uploadedAt: typeof data.uploadedAt === "number" && Number.isFinite(data.uploadedAt) ? data.uploadedAt : undefined,
        visibility: "teacher",
        retentionPolicy: "review_plus_30_days",
    };
}

function readProductionSegments(value: unknown): Record<string, PodcastWorkshopProductionSegment> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, PodcastWorkshopProductionSegment> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const safeKey = String(key ?? "").trim();
        if (!safeKey || !item || typeof item !== "object" || Array.isArray(item)) return;
        const data = item as Record<string, unknown>;
        out[safeKey] = {
            voice: readAudioAsset(data.voice),
            volume: readNumber(data.volume, 1, 0, 1.5),
            fadeInSeconds: readNumber(data.fadeInSeconds, 0, 0, 5),
            fadeOutSeconds: readNumber(data.fadeOutSeconds, 0, 0, 5),
        };
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
        productionSegments: {},
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
        productionSegments: {
            ...base.productionSegments,
            ...readProductionSegments(data.productionSegments),
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
