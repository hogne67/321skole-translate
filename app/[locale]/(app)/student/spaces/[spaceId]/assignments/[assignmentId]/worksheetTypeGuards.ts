import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

export function isMathWorksheet(value: unknown): value is MathWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as { tasks?: unknown; title?: unknown };
    return Array.isArray(v.tasks) && typeof v.title === "string";
}

export function isFractionWorksheet(value: unknown): value is FractionWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as { tasks?: unknown; title?: unknown };
    return Array.isArray(v.tasks) && typeof v.title === "string";
}