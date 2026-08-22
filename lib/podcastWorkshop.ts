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
    podcastName: string;
    participants: string;
    interviewees: string;
    ideaQuestionNotes: Record<string, string>;
    notes: string;
    customSegments: PodcastWorkshopSegment[];
    segmentPlans: Record<string, string>;
    segmentScripts: Record<string, string>;
    productionSegments: Record<string, PodcastWorkshopProductionSegment>;
    productionMix: PodcastWorkshopProductionMix;
    selfAssessment: Record<string, boolean>;
};

export type PodcastSoundId =
    | ""
    | "intro_warm"
    | "intro_bright"
    | "intro_news"
    | "transition_ding"
    | "transition_soft"
    | "transition_clap"
    | "effect_success"
    | "effect_wow"
    | "outro_soft"
    | "outro_bright";

export type PodcastWorkshopProductionMix = {
    introSoundId: PodcastSoundId;
    transitionSoundId: PodcastSoundId;
    transitionSoundIds: Record<string, PodcastSoundId>;
    outroSoundId: PodcastSoundId;
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
    fields: Record<string, PodcastWorkshopRoomFeedback>;
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

function readSegments(value: unknown): PodcastWorkshopSegment[] {
    const rawSegments = Array.isArray(value) ? value : [];
    return rawSegments
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

function readSoundId(value: unknown): PodcastSoundId {
    const raw = String(value ?? "").trim();
    if (
        raw === "intro_warm" ||
        raw === "intro_bright" ||
        raw === "intro_news" ||
        raw === "transition_ding" ||
        raw === "transition_soft" ||
        raw === "transition_clap" ||
        raw === "effect_success" ||
        raw === "effect_wow" ||
        raw === "outro_soft" ||
        raw === "outro_bright"
    ) {
        return raw;
    }
    return "";
}

function readProductionMix(value: unknown): PodcastWorkshopProductionMix {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { introSoundId: "", transitionSoundId: "", transitionSoundIds: {}, outroSoundId: "" };
    }
    const data = value as Record<string, unknown>;
    const transitionSoundIds: Record<string, PodcastSoundId> = {};
    if (data.transitionSoundIds && typeof data.transitionSoundIds === "object" && !Array.isArray(data.transitionSoundIds)) {
        Object.entries(data.transitionSoundIds as Record<string, unknown>).forEach(([key, item]) => {
            const safeKey = String(key ?? "").trim();
            if (!safeKey) return;
            transitionSoundIds[safeKey] = readSoundId(item);
        });
    }

    return {
        introSoundId: readSoundId(data.introSoundId),
        transitionSoundId: readSoundId(data.transitionSoundId),
        transitionSoundIds,
        outroSoundId: readSoundId(data.outroSoundId),
    };
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

    const segments = readSegments(data.segments);

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
        podcastName: "",
        participants: "",
        interviewees: "",
        ideaQuestionNotes: {},
        notes: "",
        customSegments: [],
        segmentPlans: {},
        segmentScripts: {},
        productionSegments: {},
        productionMix: { introSoundId: "", transitionSoundId: "", transitionSoundIds: {}, outroSoundId: "" },
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
        podcastName: String(data.podcastName ?? ""),
        participants: String(data.participants ?? ""),
        interviewees: String(data.interviewees ?? ""),
        ideaQuestionNotes: {
            ...base.ideaQuestionNotes,
            ...readStringMap(data.ideaQuestionNotes),
        },
        notes: String(data.notes ?? ""),
        customSegments: readSegments(data.customSegments),
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
        productionMix: readProductionMix(data.productionMix),
        selfAssessment: {
            ...base.selfAssessment,
            ...readBoolMap(data.selfAssessment),
        },
    };
}

export function getPodcastWorkshopSegments(
    config: PodcastWorkshopConfig,
    submission?: PodcastWorkshopSubmission | null
): PodcastWorkshopSegment[] {
    const customSegments = submission?.customSegments ?? [];
    if (customSegments.length === 0) return config.segments;

    const outroIndex = config.segments.findIndex((segment) => {
        const title = segment.title.trim().toLowerCase();
        return title === "avslutning" || title === "outro";
    });

    if (outroIndex < 0) return [...config.segments, ...customSegments];
    return [
        ...config.segments.slice(0, outroIndex),
        ...customSegments,
        ...config.segments.slice(outroIndex),
    ];
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
        fields: {},
    };
}

function readFeedbackMap(value: unknown): Record<string, PodcastWorkshopRoomFeedback> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, PodcastWorkshopRoomFeedback> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const safeKey = String(key ?? "").trim();
        if (!safeKey || !item || typeof item !== "object" || Array.isArray(item)) return;
        const data = item as Record<string, unknown>;
        const rawStatus = String(data.status ?? "").trim();
        out[safeKey] = {
            text: String(data.text ?? ""),
            status:
                rawStatus === "approved" || rawStatus === "needs_work"
                    ? rawStatus
                    : "",
        };
    });
    return out;
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

    return {
        version: 1,
        rooms,
        fields: readFeedbackMap(data.fields),
    };
}
