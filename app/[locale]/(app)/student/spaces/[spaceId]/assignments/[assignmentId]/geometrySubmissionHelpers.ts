import type { GeometryAnswersByTaskId } from "@/lib/math/geometry/submissionTypes";

export function toFiniteNumberOrNull(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;

    if (typeof v === "string") {
        const trimmed = v.trim();
        if (!trimmed) return null;

        const normalized = trimmed
            .replace(",", ".")
            .replace(/\s*(cm|m|mm|kvadratcentimeter|cm2|cm²|m2|m²)\s*$/i, "")
            .trim();

        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) return parsed;
    }

    return null;
}

export function normalizeGeometryAnswersByTaskId(raw: unknown): GeometryAnswersByTaskId {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const input = raw as Record<string, unknown>;
    const out: GeometryAnswersByTaskId = {};

    for (const [taskId, value] of Object.entries(input)) {
        const row =
            value && typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};

        const shapeName =
            typeof row.shapeName === "string" && row.shapeName.length > 0
                ? row.shapeName
                : undefined;

        out[taskId] = {
            taskId,
            shapeName,
            perimeterValue: toFiniteNumberOrNull(
                row.perimeterText ?? row.perimeterValue
            ),
            areaValue: toFiniteNumberOrNull(
                row.areaText ?? row.areaValue
            ),
            updatedAt: row.updatedAt,
        };
    }

    return out;
}