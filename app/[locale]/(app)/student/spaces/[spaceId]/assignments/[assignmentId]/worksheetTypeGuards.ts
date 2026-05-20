import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

export function isMathWorksheet(value: unknown): value is MathWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as {
        tasks?: unknown;
        title?: unknown;
        selectedShapes?: unknown;
        showFormulas?: unknown;
    };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        (Array.isArray(v.selectedShapes) || typeof v.showFormulas === "boolean")
    );
}

export function isFractionWorksheet(value: unknown): value is FractionWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as { tasks?: unknown; title?: unknown; selectedShapes?: unknown };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        !Array.isArray(v.selectedShapes)
    );
}
